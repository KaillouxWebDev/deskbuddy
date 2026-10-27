import fs from 'node:fs';
import path from 'node:path';
import { degreesToRadians, ecfToLookAngles, eciToEcf, gstime, propagate, radiansToDegrees, twoline2satrec } from 'satellite.js';

/*
 * Passages des satellites au-dessus de chez toi, calculés localement à partir des orbites (TLE) publiées par Celestrak.
 * Fréquences en MHz. Elles bougent rarement, mais un satellite peut changer de mode ou tomber en panne :
 * vérifier le statut sur amsat.org/status avant une session d'écoute.
 */
export const SATELLITES = [
  {
    id: 25544,
    name: 'ISS',
    freqs: [
      { label: 'Voix FM', down: 145.8 },
      { label: 'APRS / packet', down: 145.825 },
      { label: 'Répéteur FM', down: 437.8, up: '145.990 (67 Hz)' }
    ]
  },
  { id: 27607, name: 'SO-50', freqs: [{ label: 'Répéteur FM', down: 436.795, up: '145.850 (67 Hz)' }] },
  { id: 43678, name: 'PO-101', freqs: [{ label: 'Répéteur FM (sur programme)', down: 145.9, up: '437.500 (141,3 Hz)' }] },
  {
    id: 44909,
    name: 'RS-44',
    freqs: [
      { label: 'Balise CW', down: 435.605 },
      { label: 'Transpondeur SSB/CW', range: '435.610–435.670', up: '145.935–145.995' }
    ]
  },
  { id: 24278, name: 'FO-29', freqs: [{ label: 'Transpondeur SSB/CW (intermittent)', range: '435.800–435.900', up: '145.900–146.000' }] },
  { id: 57166, name: 'METEOR M2-3', freqs: [{ label: 'Images LRPT', down: 137.9 }] },
  { id: 59051, name: 'METEOR M2-4', freqs: [{ label: 'Images LRPT (selon programmation)', down: 137.9 }] }
];

const C_KMS = 299_792.458;
const TLE_TTL = 12 * 3600_000;
const HORIZON_H = 24;
const STEP_S = 30;
const MIN_PASS_EL = 5; // passages trop rasants ignorés
const NOTIFY_EL = 20; // notif « passage dans 2 min » au-dessus de cette élévation max
const NOTIFY_BEFORE_S = 120;

async function fetchTle(id) {
  const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=TLE`, {
    headers: { 'user-agent': 'deskbuddy/0.3 (dashboard de bureau)' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lines = (await res.text()).split('\n').map((l) => l.trim()).filter(Boolean);
  const l1 = lines.find((l) => l.startsWith('1 '));
  const l2 = lines.find((l) => l.startsWith('2 '));
  if (!l1 || !l2) throw new Error(`TLE introuvable pour ${id}`);
  return { l1, l2 };
}

export function startSatellites(store, { lat, lon, altM = 200, dataDir }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('satPasses', { passes: [], error: 'Coordonnées HOME_LAT / HOME_LON manquantes' });
    return;
  }
  const observer = { latitude: degreesToRadians(lat), longitude: degreesToRadians(lon), height: altM / 1000 };
  const file = path.join(dataDir, 'tle.json');
  let cache = { at: 0, tles: {} };
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* premier démarrage */
  }
  let recs = new Map();
  const notified = new Set();

  const buildRecs = () => {
    recs = new Map();
    for (const s of SATELLITES) {
      const t = cache.tles[s.id];
      if (t) recs.set(s.id, twoline2satrec(t.l1, t.l2));
    }
  };

  const look = (rec, date) => {
    const pv = propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const la = ecfToLookAngles(observer, eciToEcf(pv.position, gstime(date)));
    return { az: (radiansToDegrees(la.azimuth) + 360) % 360, el: radiansToDegrees(la.elevation), range: la.rangeSat };
  };

  /** Affine l'instant où l'élévation passe 0° entre t0 (dessous) et t1 (dessus), ou l'inverse. */
  const refine = (rec, t0, t1) => {
    let a = t0;
    let b = t1;
    const above = (t) => (look(rec, new Date(t))?.el ?? -90) > 0;
    const aAbove = above(a);
    for (let i = 0; i < 12; i++) {
      const m = (a + b) / 2;
      if (above(m) === aAbove) a = m;
      else b = m;
    }
    return Math.round((a + b) / 2);
  };

  const computePasses = () => {
    const now = Date.now();
    const passes = [];
    for (const s of SATELLITES) {
      const rec = recs.get(s.id);
      if (!rec) continue;
      let cur = null;
      let prevT = now - STEP_S * 1000;
      let prevEl = look(rec, new Date(prevT))?.el ?? -90;
      for (let t = now; t <= now + HORIZON_H * 3600_000; t += STEP_S * 1000) {
        const p = look(rec, new Date(t));
        if (!p) break;
        if (p.el > 0 && !cur) {
          const aos = prevEl > 0 ? t : refine(rec, prevT, t); // déjà en vue au démarrage du calcul
          cur = { satId: s.id, name: s.name, aos, aosAz: look(rec, new Date(aos)).az, maxEl: p.el, maxAt: t, path: [] };
        }
        if (cur) {
          cur.path.push([Math.round(p.az * 10) / 10, Math.round(Math.max(0, p.el) * 10) / 10]);
          if (p.el > cur.maxEl) {
            cur.maxEl = p.el;
            cur.maxAt = t;
          }
          if (p.el <= 0) {
            cur.los = refine(rec, prevT, t);
            cur.losAz = look(rec, new Date(cur.los)).az;
            cur.maxEl = Math.round(cur.maxEl);
            if (cur.maxEl >= MIN_PASS_EL) passes.push(cur);
            cur = null;
          }
        }
        prevT = t;
        prevEl = p.el;
      }
    }
    passes.sort((a, b) => a.aos - b.aos);
    store.set('satPasses', { passes, updatedAt: now, tleAt: cache.at || null, error: store.get('satPasses')?.error || null });
  };

  const live = () => {
    const now = new Date();
    const later = new Date(now.getTime() + 1000);
    const sats = SATELLITES.map((s) => {
      const rec = recs.get(s.id);
      const p = rec && look(rec, now);
      if (!p) return { id: s.id, name: s.name, freqs: s.freqs, available: false };
      const p2 = look(rec, later);
      const rangeRate = p2 ? p2.range - p.range : 0; // km/s, positif = s'éloigne
      const factor = 1 - rangeRate / C_KMS;
      return {
        id: s.id,
        name: s.name,
        available: true,
        az: Math.round(p.az * 10) / 10,
        el: Math.round(p.el * 10) / 10,
        visible: p.el > 0,
        rangeKm: Math.round(p.range),
        freqs: s.freqs.map((f) => (f.down ? { ...f, live: Math.round(f.down * factor * 1e4) / 1e4 } : f))
      };
    });
    store.set('satLive', { sats, at: now.getTime() });

    // Notification 2 minutes avant un beau passage.
    for (const pass of store.get('satPasses')?.passes || []) {
      const key = `${pass.satId}-${pass.aos}`;
      const dt = (pass.aos - now.getTime()) / 1000;
      if (pass.maxEl >= NOTIFY_EL && dt > 0 && dt <= NOTIFY_BEFORE_S && !notified.has(key)) {
        notified.add(key);
        const main = SATELLITES.find((s) => s.id === pass.satId)?.freqs.find((f) => f.down);
        store.toast('info', `${pass.name} DANS 2 MIN`, `max ${pass.maxEl}°${main ? ` · ${main.down.toFixed(3)} MHz` : ''}`);
      }
    }
  };

  const refreshTle = async () => {
    const next = { at: Date.now(), tles: { ...cache.tles } };
    let errors = 0;
    for (const s of SATELLITES) {
      try {
        next.tles[s.id] = await fetchTle(s.id);
      } catch (err) {
        errors++;
        console.error(`[satellites] ${s.name} : ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 500)); // on reste poli avec Celestrak
    }
    if (errors < SATELLITES.length) {
      cache = next;
      fs.writeFileSync(file, JSON.stringify(cache));
      buildRecs();
      computePasses();
      store.update('satPasses', { error: null });
    } else {
      store.update('satPasses', { error: 'Celestrak injoignable, orbites en cache utilisées' });
    }
  };

  buildRecs();
  if (recs.size) computePasses();
  else store.set('satPasses', { passes: [], loading: true });
  if (Date.now() - (cache.at || 0) > TLE_TTL) refreshTle();

  setInterval(live, 2_000);
  setInterval(computePasses, 10 * 60_000);
  setInterval(() => Date.now() - cache.at > TLE_TTL && refreshTle(), 3600_000);
  live();
}
