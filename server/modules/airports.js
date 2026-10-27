import fs from 'node:fs';
import path from 'node:path';

/*
 * Aéroports proches et leurs fréquences radio, depuis OurAirports (données libres, mises à jour par la communauté).
 * À recouper avec les cartes VAC officielles du SIA : une fréquence peut changer avant que la base soit corrigée.
 * Le téléchargement (~14 Mo) n'est fait qu'une fois par semaine, le résultat filtré est mis en cache dans /data.
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

async function build(lat, lon) {
  const airportsCsv = await download('airports.csv');
  const near = new Map();
  for (const a of rows(airportsCsv)) {
    if (!TYPES.has(a.type)) continue;
    const alat = Number(a.latitude_deg);
    const alon = Number(a.longitude_deg);
    const d = distKm(lat, lon, alat, alon);
    if (d <= MAX_KM) {
      near.set(a.ident, {
        icao: a.icao_code || a.gps_code || a.ident,
        iata: a.iata_code || null,
        name: a.name,
        city: a.municipality || null,
        lat: alat,
        lon: alon,
        dist: Math.round(d * 10) / 10,
        bearing: Math.round(bearing(lat, lon, alat, alon)),
        freqs: []
      });
    }
  }

  const freqCsv = await download('airport-frequencies.csv');
  for (const f of rows(freqCsv)) {
    const ap = near.get(f.airport_ident);
    const mhz = Number(f.frequency_mhz);
    if (!ap || !Number.isFinite(mhz) || mhz < 108 || mhz > 137) continue; // bande aviation VHF uniquement
    ap.freqs.push({ type: (f.type || '').toUpperCase(), label: f.description || f.type, mhz });
  }

  const rank = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
  return [...near.values()]
    .filter((a) => a.freqs.length)
    .map((a) => ({ ...a, freqs: a.freqs.sort((x, y) => rank(x.type) - rank(y.type) || x.mhz - y.mhz) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_AIRPORTS);
}

export function startAirports(store, { lat, lon, dataDir }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('airports', { list: [], error: 'Coordonnées HOME_LAT / HOME_LON manquantes' });
    return;
  }
  const file = path.join(dataDir, 'airports-near.json');
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;

  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* pas encore de cache */
  }
  if (cached?.key === key) store.set('airports', { list: cached.list, updatedAt: cached.at, error: null });
  else store.set('airports', { list: [], updatedAt: null, error: null, loading: true });

  const refresh = async () => {
    try {
      const list = await build(lat, lon);
      const at = Date.now();
      fs.writeFileSync(file, JSON.stringify({ key, at, list }));
      store.set('airports', { list, updatedAt: at, error: null });
      console.log(`[airports] ${list.length} aéroports avec fréquences dans un rayon de ${MAX_KM} km`);
    } catch (err) {
      console.error('[airports]', err.message);
      store.update('airports', { error: `Base des fréquences injoignable (${err.message})`, loading: false });
    }
  };

  if (!cached || cached.key !== key || Date.now() - cached.at > TTL) refresh();
  setInterval(refresh, TTL);
}
