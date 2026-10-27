/*
 * Départ / arrivée d'un vol à partir de son indicatif, via adsbdb.com (gratuit, sans clé).
 * Ces bases s'appuient sur les horaires des compagnies : fiables pour les lignes régulières,
 * parfois fausses pour les vols affrétés ou les indicatifs réutilisés.
 * On interroge chaque indicatif une seule fois (cache), avec un débit limité.
 */

const HIT_TTL = 12 * 3600_000;
const MISS_TTL = 3 * 3600_000;
const SPACING_MS = 400;

const cache = new Map(); // callsign -> { route|null, at }
const queue = [];
let running = false;

const airport = (a) =>
  a ? { icao: a.icao_code || null, iata: a.iata_code || null, name: a.name || null, city: a.municipality || null } : null;

async function fetchRoute(callsign) {
  const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
    headers: { 'user-agent': 'deskbuddy/0.1 (dashboard de bureau)' },
    signal: AbortSignal.timeout(10_000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const fr = json?.response?.flightroute;
  if (!fr) return null;
  return { from: airport(fr.origin), to: airport(fr.destination), airline: fr.airline?.name || null };
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const callsign = queue.shift();
    try {
      cache.set(callsign, { route: await fetchRoute(callsign), at: Date.now() });
    } catch {
      cache.set(callsign, { route: null, at: Date.now() - MISS_TTL + 10 * 60_000 }); // réessai dans 10 min
    }
    await new Promise((r) => setTimeout(r, SPACING_MS));
  }
  running = false;
}

/** Renvoie la route connue (ou null) et programme sa recherche si besoin. Ne bloque jamais. */
export function routeFor(callsign) {
  if (!callsign || !/^[A-Z]{3}\d[A-Z0-9]*$/.test(callsign)) return null; // vols commerciaux uniquement
  const hit = cache.get(callsign);
  const fresh = hit && Date.now() - hit.at < (hit.route ? HIT_TTL : MISS_TTL);
  if (!fresh && !queue.includes(callsign)) {
    queue.push(callsign);
    drain();
  }
  return hit?.route || null;
}
