import { startLink } from './printerLink.js';
import fs from 'node:fs';
import { writeJson } from '../lib/fsx.js';
import path from 'node:path';
import { createSpools } from './spools.js';
import { fetchPrintInfo } from './printfile.js';

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
        idx: t.tray_info_idx || null, // référence du filament Bambu (ex. GFA01 = PLA Matte)
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
    gcodeFile: raw.gcode_file || null,
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

const euros = (v) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function startPrinter(store, { host, serial, accessCode, mock, dataDir }) {
  const spools = createSpools(store, { dataDir });
  const historyFile = path.join(dataDir, 'prints.json');
  let job = null; // impression en cours : début, infos du slicer, estimation

  const prices = () => {
    const s = store.get('settings') || {};
    return { perG: (s.filamentPriceKg ?? 10) / 1000, kwh: s.kwhPrice ?? 0.1871, watts: s.printerWatts ?? 100 };
  };

  // Adresse et code d'accès ACTUELS de l'imprimante (réglables à l'écran depuis la v0.13.2 : le .env peut être périmé).
  let link = null;
  const creds = () => (link ? link.config() : { host, accessCode });

  /** Lecture du fichier d'impression sur l'imprimante (FTPS) : poids par filament et durée prévus par le slicer. */
  const readInfo = (d, strict = false) =>
    mock
      ? Promise.resolve({ file: d.file, predictionS: 5400, filaments: [{ id: 1, type: 'PLA', color: '#F7D959', usedG: 42.5, usedM: 14.2 }] }) // couleur volontairement ≠ bobine chargée
      : fetchPrintInfo({ ...creds(), subtask: d.file, gcodeFile: d.gcodeFile, dataDir, strict }).catch((err) => {
          console.error('[printer] fichier d\'impression :', err.message);
          return null;
        });

  /** Ce que le slicer a calculé pour l'impression en cours. En cas d'échec (imprimante occupée, FTP lent),
   *  nouvel essai après 1, 3 puis 10 min tant que l'impression continue. */
  const RETRY_MIN = [1, 3, 10];
  const loadInfo = async (j, d, attempt = 0) => {
    const info = await readInfo(d);
    if (job !== j) return; // impression déjà terminée entre-temps (la fin s'occupe alors de relire le fichier)
    if (!info) {
      j.infoError = true;
      store.update('printer', { job: publicJob(j) });
      if (attempt < RETRY_MIN.length) j.retry = setTimeout(() => job === j && loadInfo(j, d, attempt + 1), RETRY_MIN[attempt] * 60_000);
      return;
    }
    j.info = info;
    j.infoError = false;
    const p = prices();
    const grams = info.filaments.reduce((sum, f) => sum + f.usedG, 0);
    const elec = ((info.predictionS || 0) / 3600) * (p.watts / 1000) * p.kwh;
    j.estimate = { grams: Math.round(grams), cost: grams * p.perG + elec };
    checkStock(j);
    store.update('printer', { job: publicJob(j) });
  };

  /*
   * Quelle bobine sert vraiment ? La couleur du fichier ne suffit pas : Bambu Studio laisse imprimer un
   * fichier préparé en jaune avec la bobine blanche. Pour un fichier mono-filament, on se fie donc à
   * l'emplacement de l'AMS que l'imprimante utilise (tray_now) ; la couleur ne sert qu'en multicolore.
   */
  const pickFor = (j) => (f) => {
    const slots = [...(j.slots || [])];
    if (j.info?.filaments.length === 1 && slots.length === 1) {
      const s = spools.bySlot(slots[0]);
      if (s) return s;
    }
    return spools.match(f);
  };

  /** Assez de filament sur les bobines utilisées ? Vérifié dès qu'on connaît le fichier ET la bobine. */
  const checkStock = (j) => {
    if (j.checked || !j.info) return;
    const single = j.info.filaments.length === 1;
    if (single && !j.slots.size) return; // on attend que l'imprimante charge le filament
    j.checked = true;
    const pick = pickFor(j);
    for (const f of j.info.filaments) {
      const s = pick(f);
      if (s && !s.needsLevel && s.grams < f.usedG) {
        store.toast('warn', 'FILAMENT INSUFFISANT', `${s.material} ${s.colorName.toLowerCase()} : ~${Math.round(s.grams)} g restants, ${Math.round(f.usedG)} g nécessaires`, { sticky: true });
      }
    }
  };

  const publicJob = (j) => {
    if (!j) return null;
    const spool = j.info?.filaments.length === 1 ? pickFor(j)(j.info.filaments[0]) : null;
    return { start: j.start, estimate: j.estimate || null, infoError: Boolean(j.infoError), spool: spool ? spool.colorName : null };
  };

  /*
   * Historique des impressions (data/prints.json, 100 dernières ; les 10 dernières sont envoyées à l'écran).
   * Chaque entrée : nom du modèle, début, durée, statut, poids et filaments utilisés, coût filament + électricité.
   */
  const readHistory = () => {
    try {
      const h = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      return Array.isArray(h) ? h : [];
    } catch {
      return [];
    }
  };
  // Noms de couleur recalculés à l'affichage : les anciennes entrées profitent aussi des noms officiels.
  const publishHistory = (hist = readHistory()) =>
    store.set(
      'printHistory',
      hist.slice(0, 10).map((e) => ({
        ...e,
        filaments: (e.filaments || []).map((f) => (f.known && f.color ? { ...f, colorName: spools.colorName(f.idx, f.material, f.color) } : f))
      }))
    );

  /** Consommation réelle d'une impression : décompte du stock et détail pour l'historique. */
  const usage = (j, fraction, hours) => {
    const p = prices();
    const elec = hours * (p.watts / 1000) * p.kwh;
    if (!j.info) return { grams: null, filaments: [], filamentCost: null, elecCost: elec, cost: elec };
    const used = spools.consume(j.info.filaments, fraction, pickFor(j));
    const grams = used.reduce((sum, u) => sum + u.grams, 0);
    log(`Consommé ${Math.round(grams)} g (${used.map((u) => u.spool).join(', ')}) · coût ~${euros(grams * p.perG + elec)}`, 'info');
    return {
      grams: Math.round(grams * 10) / 10,
      filaments: used.map((u) => ({ label: u.spool, material: u.material, idx: u.idx, colorName: u.colorName, color: u.color, grams: u.grams, known: u.known })),
      filamentCost: grams * p.perG,
      elecCost: elec,
      cost: grams * p.perG + elec
    };
  };

  const saveHistory = (fn) => {
    try {
      const hist = fn(readHistory());
      writeJson(historyFile, hist.slice(0, 100), true);
      publishHistory(hist);
    } catch (err) {
      console.error('[printer] historique :', err.message);
    }
  };

  /*
   * Rattrapage : une impression enregistrée sans consommation (fichier illisible à ce moment-là) est relue
   * plus tard sur l'imprimante (après 2, 10 puis 30 min, et au démarrage du dashboard pour les 7 derniers jours).
   * Le stock est alors décompté et l'historique complété avec les prix actuels.
   */
  const CATCHUP_MIN = [2, 10, 30];
  const catchUp = async (at, attempt = 0) => {
    const entry = readHistory().find((e) => e.at === at);
    if (!entry || entry.grams != null) return;
    const info = await readInfo({ file: entry.file || entry.name, gcodeFile: entry.gcodeFile || null }, true);
    if (!info) {
      if (attempt < CATCHUP_MIN.length) setTimeout(() => catchUp(at, attempt + 1), CATCHUP_MIN[attempt] * 60_000);
      return;
    }
    const fresh = readHistory().find((e) => e.at === at);
    if (!fresh || fresh.grams != null) return; // complété entre-temps
    const u = usage({ info, slots: fresh.slots || [] }, fresh.fraction ?? 1, (fresh.durationMin || 0) / 60);
    saveHistory((hist) => hist.map((e) => (e.at === at ? { ...e, ...u, recovered: Date.now() } : e)));
    store.toast('info', 'CONSOMMATION RETROUVÉE', `${fresh.name} · ${Math.round(u.grams)} g · ${euros(u.cost)}, stock mis à jour`);
  };

  /** Fin d'impression (terminée, ou annulée au prorata de l'avancement) : décompte du stock et coût réel. */
  const finishJob = async (fraction) => {
    const j = job;
    job = null;
    if (!j) return null;
    clearTimeout(j.retry);
    const hours = (Date.now() - j.start) / 3600_000;
    // Fichier pas encore lu : dernier essai maintenant (l'imprimante est libre en fin d'impression).
    if (!j.info && j.d) j.info = await readInfo(j.d);
    if (!j.info) log('Consommation pas encore connue : nouvel essai de lecture du fichier dans 2 min', 'info');
    const u = usage(j, fraction, hours);
    const at = Date.now();
    saveHistory((hist) => [
      {
        at,
        start: j.start,
        durationMin: Math.round(hours * 60),
        name: (j.name || j.info?.file || 'Sans nom').replace(/(\.gcode)?\.3mf$/i, ''),
        file: j.d?.file || null,
        gcodeFile: j.d?.gcodeFile || null,
        slots: [...j.slots],
        status: fraction >= 1 ? 'terminée' : 'annulée',
        fraction,
        ...u
      },
      ...hist
    ]);
    if (u.grams == null) setTimeout(() => catchUp(at), CATCHUP_MIN[0] * 60_000);
    return u.grams == null ? null : { grams: Math.round(u.grams), cost: u.cost };
  };

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

    // Début de suivi : à chaque nouvelle impression (ou au redémarrage du dashboard pendant une impression).
    if (!job && ACTIVE.includes(d.state)) {
      job = { start: Date.now(), slots: new Set(), name: d.file || null, d: { file: d.file, gcodeFile: d.gcodeFile } };
      loadInfo(job, d);
    }
    // Emplacements de l'AMS réellement utilisés pendant l'impression (hors chauffe et purge de fin).
    if (job && d.state === 'RUNNING' && typeof d.activeSlot === 'number' && !job.slots.has(d.activeSlot)) {
      job.slots.add(d.activeSlot);
      log(`Filament utilisé : AMS ${d.activeSlot}`);
      checkStock(job);
    }

    if (prev && prev.state !== d.state) {
      if (d.state === 'FINISH') {
        log(`Impression terminée : ${d.file || 'sans nom'}`, 'success');
        const file = d.file || '';
        finishJob(1).then((res) => store.toast('success', 'IMPRESSION TERMINÉE', `${file}${res ? ` · ${res.grams} g · ${euros(res.cost)}` : ''}`, { sticky: true }));
      } else if (job && (d.state === 'FAILED' || d.state === 'IDLE') && ACTIVE.includes(prev.state)) {
        // Impression annulée : on décompte au prorata de l'avancement.
        finishJob((prev.percent || 0) / 100);
      }
      if (d.state === 'FINISH') {
        /* déjà traité */
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
    store.update('printer', { ...d, alert, journal: [...journal], job: publicJob(job) });
  };

  publishHistory();
  spools.onColors(() => publishHistory());

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

  // Impressions récentes restées sans consommation : on retente une fois l'imprimante joignable.
  setTimeout(() => {
    for (const e of readHistory()) if (e.grams == null && Date.now() - e.at < 7 * 86_400_000) catchUp(e.at, 1);
  }, 90_000);

  if (mock) return startMock(store, handle);

  store.set('printer', { configured: true, connected: false, journal: [] });
  // Connexion, réglages modifiables à l'écran, recherche sur le réseau et chien de garde : voir printerLink.js
  link = startLink(store, {
    dataDir,
    env: { host, serial, accessCode },
    deepMerge,
    onReport: (raw, lastMsgAt) => handle({ ...derive(raw), configured: true, connected: true, lastMsgAt })
  });
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
