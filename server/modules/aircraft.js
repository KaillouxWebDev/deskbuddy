import { airlineFor } from './airlines.js';
import { routeFor } from './routes.js';

const NM_KM = 1.852;

// Catégorie ADS-B A7 = giravion. Elle manque parfois : on complète avec les types OACI d'hélicoptères courants.
const HELI_TYPES = new Set([
  'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'H160', 'AS50', 'AS55', 'AS65', 'AS32', 'AS3B', 'AS35',
  'A109', 'A119', 'A139', 'A169', 'A189', 'AW09', 'R22', 'R44', 'R66', 'B06', 'B407', 'B429', 'B412', 'BK17',
  'S76', 'S92', 'NH90', 'TIGR', 'PUMA', 'GAZL', 'ALO2', 'ALO3', 'EXPL', 'MD52', 'MD60', 'H269', 'CABR'
]);
const RADIUS_NM = 60; // ~110 km : couvre la portée max du radar (100 km)
const toRad = (d) => (d * Math.PI) / 180;

function geo(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { dist, bearing };
}

function normalize(a, lat0, lon0) {
  const { dist, bearing } = geo(lat0, lon0, a.lat, a.lon);
  const callsign = (a.flight || '').trim();
  const onGround = a.alt_baro === 'ground';
  const alt = onGround ? 0 : Number.isFinite(a.alt_baro) ? a.alt_baro : Number.isFinite(a.alt_geom) ? a.alt_geom : null;
  const route = routeFor(callsign);
  return {
    id: a.hex,
    callsign: callsign || (a.r || a.hex || '').toUpperCase(),
    reg: a.r || null,
    type: a.t || null,
    kind: a.category === 'A7' || HELI_TYPES.has(a.t) ? 'heli' : 'plane',
    airline: route?.airline || airlineFor(callsign, a.r),
    route: route ? { from: route.from, to: route.to } : null,
    alt,
    onGround,
    speed: Number.isFinite(a.gs) ? Math.round(a.gs * NM_KM) : null,
    track: a.track ?? a.calc_track ?? a.true_heading ?? null,
    vs: a.baro_rate ?? a.geom_rate ?? null,
    dist: Math.round(dist * 10) / 10,
    bearing: Math.round(bearing),
    squawk: a.squawk || null,
    emergency: a.emergency && a.emergency !== 'none' ? a.emergency : null
  };
}

/*
 * Sources ADS-B publiques, au même format (readsb / ADSBexchange v2), essayées dans l'ordre :
 * - adsb.fi : 1 requête/s, sans plafond journalier, usage personnel non commercial (à citer).
 * - adsb.lol : secours uniquement, plafonné à 500 requêtes par jour et par IP.
 * Une source qui répond 429 (trop de requêtes) est mise en pause, en respectant Retry-After si fourni.
 */
const SOURCES = [
  { name: 'adsb.fi', url: (lat, lon) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${RADIUS_NM}`, pauseUntil: 0 },
  { name: 'adsb.lol', url: (lat, lon) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${RADIUS_NM}`, pauseUntil: 0 }
];
const STALE_MS = 60_000; // on garde les derniers avions affichés une minute avant de signaler un problème

async function fetchFrom(source, lat, lon) {
  const res = await fetch(source.url(lat, lon), {
    headers: { 'user-agent': 'deskbuddy (dashboard de bureau personnel)' },
    signal: AbortSignal.timeout(10_000)
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after'));
    source.pauseUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? retry * 1000 : 10 * 60_000);
    throw new Error('HTTP 429');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.ac || json.aircraft || [];
}

export function startAircraft(store, { lat, lon, pollMs }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('aircraft', { list: [], updatedAt: null, error: 'Position inconnue : règle-la dans les réglages' });
    return;
  }
  store.set('aircraft', { list: [], updatedAt: null, error: null, source: null, pollMs });

  let busy = false;
  const tick = async () => {
    // Écran en veille : personne ne regarde, on n'interroge pas (on reprend dès le réveil).
    if (busy || store.get('screen')?.asleep) return;
    busy = true;
    const errors = [];
    try {
      for (const source of SOURCES) {
        if (source.pauseUntil > Date.now()) {
          errors.push(`${source.name} en pause`);
          continue;
        }
        try {
          const raw = await fetchFrom(source, lat, lon);
          const list = raw
            .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
            .map((a) => normalize(a, lat, lon))
            .sort((a, b) => a.dist - b.dist);
          if (!store.alive) return; // position changée entre-temps
          store.set('aircraft', { list, updatedAt: Date.now(), error: null, source: source.name, pollMs });
          return;
        } catch (err) {
          errors.push(`${source.name} : ${err.message}`);
        }
      }
      const last = store.get('aircraft');
      if (!last.updatedAt || Date.now() - last.updatedAt > STALE_MS) {
        store.update('aircraft', { error: `Sources injoignables (${errors.join(', ')})` });
      }
    } finally {
      busy = false;
    }
  };

  tick();
  store.every(tick, pollMs);
  // Rafraîchissement immédiat au réveil de l'écran.
  store.on('patch', (key, value) => {
    if (key === 'screen' && !value.asleep) tick();
  });
}
