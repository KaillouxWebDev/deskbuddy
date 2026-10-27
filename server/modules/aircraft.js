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

export function startAircraft(store, { lat, lon, pollMs }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('aircraft', { list: [], updatedAt: null, error: 'Renseigne HOME_LAT et HOME_LON dans le fichier .env' });
    return;
  }
  store.set('aircraft', { list: [], updatedAt: null, error: null });

  const tick = async () => {
    try {
      const res = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/${RADIUS_NM}`, {
        headers: { 'user-agent': 'deskbuddy/0.1 (dashboard de bureau)' },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = (json.ac || [])
        .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
        .map((a) => normalize(a, lat, lon))
        .sort((a, b) => a.dist - b.dist);
      store.set('aircraft', { list, updatedAt: Date.now(), error: null });
    } catch (err) {
      store.update('aircraft', { error: `adsb.lol injoignable (${err.message})` });
    }
  };

  tick();
  setInterval(tick, pollMs);
}
