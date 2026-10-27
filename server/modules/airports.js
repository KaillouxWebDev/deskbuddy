import fs from 'node:fs';
import { periodic } from '../lib/task.js';
import { writeJson } from '../lib/fsx.js';
import path from 'node:path';

/*
 * Aéroports proches et leurs fréquences radio, depuis OurAirports (données libres, mises à jour par la communauté).
 * À recouper avec les cartes VAC officielles du SIA : une fréquence peut changer avant que la base soit corrigée.
 * Le téléchargement (~14 Mo) n'est fait qu'une fois par semaine, une version compacte (aéroports avec fréquences, monde entier) est gardée dans /data :
 * changer de position ne retélécharge rien.
 */

const BASE = 'https://davidmegginson.github.io/ourairports-data';
const MAX_KM = 80;
const MAX_AIRPORTS = 10;
const TTL = 7 * 24 * 3600_000;
const TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);
const ORDER = ['ATIS', 'DEL', 'GND', 'TWR', 'AFIS', 'A/A', 'APP', 'A/D', 'DEP', 'INFO', 'CTAF'];

function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function rows(csv) {
  const lines = csv.split('\n');
  const head = parseLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((l) => {
    const cells = parseLine(l.replace(/\r$/, ''));
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

function distKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const y = Math.sin(r(lon2 - lon1)) * Math.cos(r(lat2));
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function download(name) {
  const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${name} : HTTP ${res.status}`);
  return res.text();
}

/** Base mondiale compacte : aéroports ayant au moins une fréquence VHF aviation (~1 Mo au lieu de 14). */
async function buildAll() {
  const all = new Map();
  for (const a of rows(await download('airports.csv'))) {
    if (!TYPES.has(a.type)) continue;
    all.set(a.ident, {
      icao: a.icao_code || a.gps_code || a.ident,
      iata: a.iata_code || null,
      name: a.name,
      city: a.municipality || null,
      lat: Number(a.latitude_deg),
      lon: Number(a.longitude_deg),
      freqs: []
    });
  }
  for (const f of rows(await download('airport-frequencies.csv'))) {
    const ap = all.get(f.airport_ident);
    const mhz = Number(f.frequency_mhz);
    if (!ap || !Number.isFinite(mhz) || mhz < 108 || mhz > 137) continue; // bande aviation VHF uniquement
    ap.freqs.push({ type: (f.type || '').toUpperCase(), label: f.description || f.type, mhz });
  }
  return [...all.values()].filter((a) => a.freqs.length && Number.isFinite(a.lat) && Number.isFinite(a.lon));
}

function nearby(all, lat, lon) {
  const rank = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
  return all
    .map((a) => ({ ...a, dist: Math.round(distKm(lat, lon, a.lat, a.lon) * 10) / 10 }))
    .filter((a) => a.dist <= MAX_KM)
    .map((a) => ({
      ...a,
      bearing: Math.round(bearing(lat, lon, a.lat, a.lon)),
      freqs: [...a.freqs].sort((x, y) => rank(x.type) - rank(y.type) || x.mhz - y.mhz)
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_AIRPORTS);
}

export function startAirports(store, { lat, lon, dataDir }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('airports', { list: [], error: 'Position inconnue' });
    return;
  }
  const file = path.join(dataDir, 'airports-all.json');
  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* pas encore de cache */
  }
  if (cached) store.set('airports', { list: nearby(cached.list, lat, lon), updatedAt: cached.at, error: null });
  else store.set('airports', { list: [], updatedAt: null, error: null, loading: true });

  const refresh = async () => {
    if (cached && Date.now() - cached.at < TTL) return; // base encore fraîche
    const list = await buildAll();
    const at = Date.now();
    writeJson(file, { at, list });
    cached = { at, list };
    store.update('airports', { list: nearby(list, lat, lon), updatedAt: at, loading: false });
    console.log(`[airports] base mise à jour : ${list.length} aéroports avec fréquences`);
  };
  // Vérifiée chaque jour, retéléchargée chaque semaine ; nouvel essai rapide en cas d'échec.
  periodic(store, { key: 'airports', name: 'db', everyMs: 24 * 3600_000, tag: 'airports', run: refresh });
}
