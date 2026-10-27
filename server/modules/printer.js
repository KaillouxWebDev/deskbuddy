import mqtt from 'mqtt';
import { createSpools } from './spools.js';

/*
 * Bambu Lab A1 en LECTURE SEULE via son broker MQTT local (port 8883, TLS auto-signé).
 * Identifiants : utilisateur "bblp", mot de passe = code d'accès LAN affiché sur l'écran de l'imprimante.
 * L'imprimante n'envoie que des deltas : on fusionne tout dans "raw" puis on dérive un état propre.
 */

const SPEED = { 1: 'Silencieux', 2: 'Standard', 3: 'Sport', 4: 'Ludicrous' };
const ACTIVE = ['RUNNING', 'PREPARE', 'PAUSE', 'SLICING'];

const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const hex8 = (n) => (Number(n) >>> 0).toString(16).toUpperCase().padStart(8, '0');

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

function trays(raw) {
  const units = raw.ams?.ams || [];
  const list = units.flatMap((u, ui) =>
    (u.tray || []).map((t) => {
      // Identifiant unique de la bobine (puce RFID Bambu) ; des zéros = pas de puce lue.
      const id = [t.tray_uuid, t.tag_uid].find((v) => v && !/^0+$/.test(String(v)));
      const remain = num(t.remain);
      return {
        slot: ui * 4 + Number(t.id) + 1,
        type: t.tray_type || null,
        material: t.tray_sub_brands || t.tray_type || null,
        color: t.tray_color ? `#${String(t.tray_color).slice(0, 6)}` : null,
        uuid: id ? String(id) : null,
        remain: remain !== null && remain >= 0 ? remain : null,
        weightG: num(t.tray_weight),
        raw: t
      };
    })
  );
  const now = num(raw.ams?.tray_now);
  return { trays: list, activeSlot: now !== null && now < 254 ? now + 1 : now === 254 ? 'ext' : null };
}

export function derive(raw) {
  const hms = (raw.hms || []).map((h) => {
    const a = hex8(h.attr);
    const c = hex8(h.code);
    return `${a.slice(0, 4)}_${a.slice(4)}_${c.slice(0, 4)}_${c.slice(4)}`;
  });
  const err = num(raw.print_error) || 0;
  const codes = [...(err ? [`${hex8(err).slice(0, 4)}_${hex8(err).slice(4)}`] : []), ...hms];
  return {
    state: raw.gcode_state || 'IDLE',
    percent: num(raw.mc_percent),
    remainingMin: num(raw.mc_remaining_time),
    layer: num(raw.layer_num),
    totalLayers: num(raw.total_layer_num),
    file: raw.subtask_name || null,
    nozzle: num(raw.nozzle_temper),
    nozzleTarget: num(raw.nozzle_target_temper),
    bed: num(raw.bed_temper),
    bedTarget: num(raw.bed_target_temper),
    fan: raw.cooling_fan_speed !== undefined ? Math.round((Number(raw.cooling_fan_speed) / 15) * 100) : null,
    speed: SPEED[raw.spd_lvl] || null,
    wifi: raw.wifi_signal || null,
    external: raw.vt_tray ? { type: raw.vt_tray.tray_type || null, color: raw.vt_tray.tray_color ? `#${String(raw.vt_tray.tray_color).slice(0, 6)}` : null } : null,
    ...trays(raw),
    codes
  };
}

export function startPrinter(store, { host, serial, accessCode, mock, dataDir }) {
  const spools = createSpools(store, { dataDir });
  const journal = [];
  const log = (text, level = 'info') => {
    journal.unshift({ at: Date.now(), text, level });
    journal.length = Math.min(journal.length, 20);
  };

  let prev = null;
  let alert = null;

  const handle = (d) => {
    const alertKey = d.codes.length ? d.codes.join(',') : null;

    if (alertKey && alertKey !== alert?.key) {
      const paused = d.state === 'PAUSE' || d.state === 'FAILED';
      alert = { key: alertKey, codes: d.codes, since: Date.now(), paused, acked: false, snoozeUntil: 0 };
      log(`Alerte ${d.codes.join(', ')}${paused ? ' (impression en pause)' : ''}`, 'error');
      store.event({ kind: 'printer:alert' });
    } else if (!alertKey && alert) {
      alert = null;
      log('Alerte résolue', 'success');
      store.toast('success', 'ALERTE RÉSOLUE', 'L\'imprimante est repartie', { sticky: true });
    } else if (alert) {
      alert = { ...alert, paused: d.state === 'PAUSE' || d.state === 'FAILED' };
    }

    if (prev && prev.state !== d.state) {
      if (d.state === 'FINISH') {
        log(`Impression terminée : ${d.file || 'sans nom'}`, 'success');
        store.toast('success', 'IMPRESSION TERMINÉE', d.file || '', { sticky: true });
      } else if (d.state === 'RUNNING' && !ACTIVE.includes(prev.state)) {
        log(`Début impression : ${d.file || 'sans nom'}`);
      } else if (d.state === 'FAILED') {
        log('Impression en échec', 'error');
      } else if (d.state === 'PAUSE' && !alert) {
        log('Impression en pause');
      }
    }
    spools.observe(d.trays || []);
    d.trays = (d.trays || []).map(({ raw, ...t }) => t); // le brut ne sert qu'au journal de debug
    prev = d;
    store.update('printer', { ...d, alert, journal: [...journal] });
  };

  store.register('printer:ack', () => {
    if (alert) {
      alert = { ...alert, acked: true };
      store.update('printer', { alert });
    }
  });
  store.register('printer:snooze', ({ minutes = 5 }) => {
    if (alert) {
      alert = { ...alert, snoozeUntil: Date.now() + Number(minutes) * 60_000 };
      store.update('printer', { alert });
    }
  });

  if (mock) return startMock(store, handle);

  if (!host || !serial || !accessCode) {
    store.set('printer', { configured: false });
    return;
  }

  store.set('printer', { configured: true, connected: false, journal: [] });
  const raw = {};
  const client = mqtt.connect(`mqtts://${host}:8883`, {
    username: 'bblp',
    password: accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
    clientId: `deskbuddy-${Math.random().toString(16).slice(2, 8)}`
  });

  const pushAll = () =>
    client.publish(`device/${serial}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));

  client.on('connect', () => {
    store.update('printer', { configured: true, connected: true, error: null });
    client.subscribe(`device/${serial}/report`);
    pushAll();
  });
  client.on('close', () => store.update('printer', { connected: false }));
  client.on('error', (err) => store.update('printer', { error: err.message }));
  client.on('message', (_topic, buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (!msg.print) return;
    deepMerge(raw, msg.print);
    handle({ ...derive(raw), configured: true, connected: true });
  });

  // Resynchronisation complète toutes les 10 min (sans abuser : l'imprimante n'aime pas les pushall répétés).
  setInterval(() => client.connected && pushAll(), 10 * 60_000);
}

/* ---------- Mode démo : MOCK_PRINTER=1 (tester l'UI sans imprimante) ---------- */
function startMock(store, handle) {
  store.set('printer', { configured: true, connected: true, mock: true, journal: [] });
  const raw = {
    gcode_state: 'RUNNING',
    subtask_name: 'support_casque.3mf',
    mc_percent: 30,
    mc_remaining_time: 95,
    layer_num: 66,
    total_layer_num: 220,
    nozzle_temper: 220,
    nozzle_target_temper: 220,
    bed_temper: 65,
    bed_target_temper: 65,
    cooling_fan_speed: '12',
    spd_lvl: 2,
    wifi_signal: '-52dBm',
    print_error: 0,
    hms: [],
    ams: {
      tray_now: '2',
      ams: [
        {
          id: '0',
          tray: [
            { id: '0', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_color: '1B1B1BFF', tray_uuid: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', tray_weight: '1000', remain: 72 },
            { id: '1', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_color: 'F2F2F2FF', tray_uuid: 'B1B2C3D4E5F60718293A4B5C6D7E8F90', tray_weight: '1000', remain: 38 },
            { id: '2', tray_type: 'PLA', tray_sub_brands: 'PLA Matte', tray_color: '2F8F4EFF', tray_uuid: 'C1B2C3D4E5F60718293A4B5C6D7E8F90', tray_weight: '1000', remain: 12 },
            { id: '3', tray_type: 'PETG', tray_sub_brands: 'PETG HF', tray_color: '8A8F95FF', tray_uuid: 'D1B2C3D4E5F60718293A4B5C6D7E8F90', tray_weight: '1000', remain: 91 }
          ]
        }
      ]
    }
  };
  let pauseTicks = 0;
  const step = () => {
    if (raw.gcode_state === 'RUNNING') {
      raw.mc_percent = Math.min(100, raw.mc_percent + 1);
      const active = raw.ams.ams[0].tray[Number(raw.ams.tray_now)];
      if (raw.mc_percent % 4 === 0 && active.remain > 0) active.remain -= 1; // la bobine active se vide doucement
      raw.mc_remaining_time = Math.max(0, Math.round((100 - raw.mc_percent) * 1.4));
      raw.layer_num = Math.round((raw.mc_percent / 100) * raw.total_layer_num);
      if (raw.mc_percent === 45) {
        raw.gcode_state = 'PAUSE';
        raw.print_error = 0x07008011; // code fictif pour la démo
        pauseTicks = 8;
      }
      if (raw.mc_percent >= 100) raw.gcode_state = 'FINISH';
    } else if (raw.gcode_state === 'PAUSE' && --pauseTicks <= 0) {
      raw.print_error = 0;
      raw.gcode_state = 'RUNNING';
      raw.mc_percent += 1;
    } else if (raw.gcode_state === 'FINISH') {
      Object.assign(raw, { gcode_state: 'RUNNING', mc_percent: 0, layer_num: 0 });
    }
    raw.nozzle_temper = 219 + Math.round(Math.random() * 2);
    handle({ ...derive(raw), configured: true, connected: true, mock: true });
  };
  step();
  setInterval(step, 3_000);
}
