import { periodic } from '../lib/task.js';
/*
 * Météo de l'espace et lancements :
 * - conditions solaires et propagation HF : flux XML de N0NBH (hamqsl.com), utilisé par les « HamClock »
 * - prochains lancements : Launch Library 2 (The Space Devs), offre gratuite limitée à 15 requêtes/heure
 */

const UA = { 'user-agent': 'deskbuddy (dashboard de bureau personnel)' };
const BAND_FR = { Good: 'bonne', Fair: 'moyenne', Poor: 'mauvaise' };

async function solar() {
  const res = await fetch('https://www.hamqsl.com/solarxml.php', { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const tag = (name) => (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1]?.trim() ?? null;
  const num = (name) => {
    const v = Number(tag(name));
    return Number.isFinite(v) ? v : null;
  };
  const bands = {};
  for (const m of xml.matchAll(/<band name="([^"]+)" time="(day|night)">([^<]+)<\/band>/g)) {
    bands[m[1]] = { ...(bands[m[1]] || {}), [m[2]]: BAND_FR[m[3].trim()] || m[3].trim() };
  }
  const vhf = [...xml.matchAll(/<phenomenon name="([^"]+)" location="([^"]+)">([^<]+)<\/phenomenon>/g)]
    .filter((m) => ['northern_hemi', 'europe', 'europe_6m'].includes(m[2]))
    .map((m) => ({ name: m[1] === 'vhf-aurora' ? 'Aurore (VHF)' : m[2] === 'europe_6m' ? 'E-sporadique 6 m' : 'E-sporadique 2 m', open: !/closed/i.test(m[3]) }));
  return {
    updated: tag('updated'),
    sfi: num('solarflux'),
    sunspots: num('sunspots'),
    a: num('aindex'),
    k: num('kindex'),
    xray: tag('xray'),
    solarWind: num('solarwind'),
    bz: num('magneticfield'),
    geomag: tag('geomagfield'),
    noise: tag('signalnoise'),
    bands: Object.entries(bands).map(([name, v]) => ({ name, day: v.day, night: v.night })),
    vhf
  };
}

async function launches() {
  const res = await fetch('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6&hide_recent_previous=true', {
    headers: UA,
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    rocket: r.rocket?.configuration?.name || r.name.split('|')[0].trim(),
    mission: r.mission?.name || r.name.split('|')[1]?.trim() || null,
    description: r.mission?.description || null,
    orbit: r.mission?.orbit?.abbrev || null,
    provider: r.launch_service_provider?.name || null,
    pad: r.pad?.location?.name || r.pad?.name || null,
    net: Date.parse(r.net),
    status: r.status?.abbrev || null,
    statusName: r.status?.name || null
  }));
}

export function startSpace(store) {
  store.set('space', {});
  const task = (name, fn) =>
    periodic(store, { key: 'space', name, everyMs: 60 * 60_000, tag: 'space', run: async () => store.update('space', { [name]: { ...(await fn()), at: Date.now() } }) });
  task('solar', solar);
  task('launches', async () => ({ list: await launches() }));
}
