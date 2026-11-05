import mqtt from 'mqtt';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { writeJson, readJson } from '../lib/fsx.js';

/*
 * Liaison avec l'imprimante (MQTT local, port 8883) et sa configuration.
 * - Réglages modifiables à l'écran (data/printer.json), le .env ne sert plus que de valeur de départ.
 * - Recherche sur le réseau : on sonde le port 8883 des machines du réseau local ; le certificat TLS
 *   d'une imprimante Bambu porte son numéro de série, ce qui l'identifie sans aucun identifiant.
 * - Si l'imprimante change d'adresse IP (box redémarrée), on la retrouve toute seule grâce à son numéro de série.
 * - Chien de garde : l'A1 peut garder la connexion ouverte sans plus rien envoyer ; après 2 min de silence on
 *   redemande l'état, et sans réponse 20 s plus tard on rouvre une connexion neuve.
 * Le code d'accès n'est jamais renvoyé à l'écran.
 */

const IP_RX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const SERIAL_RX = /^[A-Z0-9]{8,20}$/;
const CODE_RX = /^[A-Za-z0-9]{6,12}$/;

const pushAllMsg = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });

/** Adresses à sonder : le /24 de chaque interface réseau (Wi-Fi, Ethernet). */
function lanHosts() {
  const hosts = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('172.17.') || i.address.startsWith('169.254.')) continue;
      const base = i.address.split('.').slice(0, 3).join('.');
      for (let n = 1; n < 255; n++) if (`${base}.${n}` !== i.address) hosts.add(`${base}.${n}`);
    }
  }
  return [...hosts];
}

const portOpen = (host, port, ms = 700) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });

/** Numéro de série lu dans le certificat TLS de l'imprimante (null si ce n'est pas une Bambu). */
const certSerial = (host) =>
  new Promise((resolve) => {
    const s = tls.connect({ host, port: 8883, rejectUnauthorized: false, timeout: 3000 }, () => {
      const cn = s.getPeerCertificate()?.subject?.CN || null;
      s.destroy();
      resolve(cn && SERIAL_RX.test(cn) ? cn : null);
    });
    s.on('error', () => resolve(null));
    s.on('timeout', () => {
      s.destroy();
      resolve(null);
    });
  });

/** Imprimantes Bambu trouvées sur le réseau local : [{ host, serial }]. Environ 5 à 10 s. */
export async function discover() {
  const hosts = lanHosts();
  const open = [];
  for (let i = 0; i < hosts.length; i += 48) {
    const batch = hosts.slice(i, i + 48);
    const res = await Promise.all(batch.map((h) => portOpen(h, 8883)));
    batch.forEach((h, k) => res[k] && open.push(h));
  }
  const found = [];
  for (const host of open) found.push({ host, serial: await certSerial(host) });
  return found.filter((f) => f.serial);
}

/** Essai de connexion complet : adresse, code d'accès, puis réception d'un état de l'imprimante. */
export function probe({ host, serial, accessCode }, ms = 9000) {
  return new Promise((resolve) => {
    const c = mqtt.connect(`mqtts://${host}:8883`, { username: 'bblp', password: accessCode, rejectUnauthorized: false, reconnectPeriod: 0, connectTimeout: 6000, clientId: `deskbuddy-test-${Math.random().toString(16).slice(2, 8)}` });
    let settled = false;
    const end = (ok, msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c.end(true);
      resolve({ ok, msg });
    };
    const timer = setTimeout(() => end(false, c.connected ? `connectée, mais aucun état reçu pour le numéro ${serial} : vérifie le numéro de série` : "aucune réponse de l'imprimante"), ms);
    c.on('connect', () => {
      c.subscribe(`device/${serial}/report`);
      c.publish(`device/${serial}/request`, pushAllMsg);
    });
    c.on('message', () => end(true, 'imprimante connectée'));
    c.on('error', (err) => end(false, explain(err)));
  });
}

export function explain(err) {
  const m = err?.message || String(err);
  if (/ECONNREFUSED/.test(m)) return "rien n'écoute à cette adresse (imprimante éteinte, ou mauvaise IP)";
  if (/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|connack timeout|timeout/i.test(m)) return "aucune machine ne répond à cette adresse";
  if (/not authorized|bad user|code 5|code 4/i.test(m)) return "code d'accès refusé";
  return m;
}

/**
 * Connexion permanente à l'imprimante. onReport(raw, lastMsgAt) reçoit l'état fusionné à chaque message.
 * Renvoie { config, setConfig, resync }.
 */
export function startLink(store, { dataDir, env, onReport, deepMerge }) {
  const file = path.join(dataDir, 'printer.json');
  let cfg = { host: env.host || '', serial: env.serial || '', accessCode: env.accessCode || '', ...(readJson(file, {}) || {}) };
  let client = null;
  let timers = [];
  let raw = {};
  let lastMsgAt = 0;
  let connectedAt = 0;
  let probeAt = 0;
  let wasConnected = false;
  let lastErr = null;
  let failingSince = 0;
  let lastHunt = 0;

  const publicCfg = () => ({
    host: cfg.host,
    serial: cfg.serial,
    codeSet: Boolean(cfg.accessCode),
    codeHint: cfg.accessCode ? `••••${cfg.accessCode.slice(-2)}` : null
  });
  const save = () => {
    try {
      writeJson(file, cfg);
    } catch (err) {
      console.error('[printer] réglages non enregistrés :', err.message);
    }
  };

  const stop = () => {
    timers.forEach(clearInterval);
    timers = [];
    if (client) {
      client.removeAllListeners();
      client.on('error', () => {});
      client.end(true);
      client = null;
    }
  };

  const reconnect = (why) => {
    console.warn(`[printer] ${why} : reconnexion à l'imprimante`);
    store.update('printer', { connected: false });
    client?.stream?.destroy(); // provoque « close », puis la reconnexion automatique (5 s)
  };
  const resync = () => {
    if (!client) return;
    if (!client.connected) return reconnect('resynchronisation demandée hors connexion');
    probeAt = Date.now();
    client.publish(`device/${cfg.serial}/request`, pushAllMsg);
  };

  // Adresse IP changée (box redémarrée...) : on cherche l'imprimante par son numéro de série, au plus toutes les 10 min.
  const hunt = async () => {
    if (Date.now() - lastHunt < 10 * 60_000 || !cfg.serial) return;
    lastHunt = Date.now();
    const found = (await discover()).find((f) => f.serial === cfg.serial);
    if (found && found.host !== cfg.host) {
      console.warn(`[printer] imprimante retrouvée à une nouvelle adresse : ${found.host} (avant : ${cfg.host})`);
      store.toast('info', 'IMPRIMANTE RETROUVÉE', `Nouvelle adresse ${found.host} (avant ${cfg.host}), enregistrée`);
      cfg = { ...cfg, host: found.host };
      save();
      connect();
    }
  };

  function connect() {
    stop();
    raw = {};
    lastErr = null;
    failingSince = 0;
    if (!cfg.host || !cfg.serial || !cfg.accessCode) {
      store.set('printer', { configured: false, link: publicCfg() });
      return;
    }
    store.update('printer', { configured: true, connected: false, error: null, link: publicCfg() });
    client = mqtt.connect(`mqtts://${cfg.host}:8883`, {
      username: 'bblp',
      password: cfg.accessCode,
      rejectUnauthorized: false,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
      clientId: `deskbuddy-${Math.random().toString(16).slice(2, 8)}`
    });
    client.on('connect', () => {
      if (!wasConnected) console.warn(`[printer] connectée à l'imprimante (${cfg.host})`);
      wasConnected = true;
      connectedAt = Date.now();
      probeAt = 0;
      failingSince = 0;
      store.update('printer', { configured: true, connected: true, error: null });
      client.subscribe(`device/${cfg.serial}/report`);
      client.publish(`device/${cfg.serial}/request`, pushAllMsg);
    });
    client.on('close', () => {
      if (wasConnected) console.warn("[printer] connexion à l'imprimante perdue");
      wasConnected = false;
      store.update('printer', { connected: false });
    });
    client.on('error', (err) => {
      const msg = explain(err);
      if (msg !== lastErr) console.error(`[printer] ${cfg.host} : ${msg}`); // une imprimante éteinte répète la même erreur toutes les 5 s
      lastErr = msg;
      if (!failingSince) failingSince = Date.now();
      store.update('printer', { error: msg });
      // Pas de réponse depuis plus d'une minute : l'imprimante a peut-être changé d'adresse.
      if (Date.now() - failingSince > 60_000 && !/code d'accès/.test(msg)) hunt().catch(() => {});
    });
    client.on('message', (_topic, buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      if (!msg.print) return;
      lastMsgAt = Date.now();
      probeAt = 0;
      lastErr = null;
      deepMerge(raw, msg.print);
      onReport(raw, lastMsgAt);
    });
    timers.push(
      setInterval(() => {
        if (!client?.connected) return;
        const now = Date.now();
        if (probeAt && now - probeAt > 20_000) return reconnect("pas de réponse à la demande d'état");
        if (!probeAt && now - Math.max(lastMsgAt, connectedAt) > 120_000) resync();
      }, 10_000),
      // Resynchronisation complète toutes les 10 min (sans abuser : l'imprimante n'aime pas les pushall répétés).
      setInterval(() => client?.connected && resync(), 10 * 60_000)
    );
  }

  /* ---------- actions de l'écran ---------- */
  store.register('printer:resync', () => resync());
  store.register('printer:discover', async () => {
    store.update('printerSetup', { scanning: true, found: null, test: null });
    try {
      store.update('printerSetup', { scanning: false, found: await discover() });
    } catch (err) {
      store.update('printerSetup', { scanning: false, found: [], test: { ok: false, msg: err.message } });
    }
  });
  store.register('printer:configure', async (p) => {
    const next = {
      host: typeof p.host === 'string' ? p.host.trim() : cfg.host,
      serial: typeof p.serial === 'string' ? p.serial.trim().toUpperCase() : cfg.serial,
      accessCode: typeof p.accessCode === 'string' && p.accessCode ? p.accessCode.trim() : cfg.accessCode
    };
    if (!IP_RX.test(next.host)) return store.update('printerSetup', { test: { ok: false, msg: 'adresse IP invalide (ex. 192.168.1.42)' } });
    if (!SERIAL_RX.test(next.serial)) return store.update('printerSetup', { test: { ok: false, msg: 'numéro de série invalide (lettres et chiffres)' } });
    if (!CODE_RX.test(next.accessCode || '')) return store.update('printerSetup', { test: { ok: false, msg: "code d'accès invalide (8 caractères en général)" } });
    store.update('printerSetup', { testing: true, test: null });
    const res = await probe(next);
    store.update('printerSetup', { testing: false, test: res });
    if (!res.ok) return;
    cfg = next;
    save();
    console.warn(`[printer] réglages enregistrés depuis l'écran (${cfg.host})`);
    connect();
  });

  store.set('printerSetup', { scanning: false, testing: false, found: null, test: null });
  connect();
  return { resync, config: () => ({ host: cfg.host, accessCode: cfg.accessCode }) };
}
