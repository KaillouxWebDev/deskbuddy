import fs from 'node:fs';
import { periodic } from '../lib/task.js';
import { writeJson } from '../lib/fsx.js';
import path from 'node:path';
import zlib from 'node:zlib';

/*
 * Météo locale :
 * - prévisions et conditions actuelles : Open-Meteo (gratuit, sans clé)
 * - qualité de l'air et pollens : Open-Meteo Air Quality (modèle européen CAMS)
 * - vigilances : MeteoAlarm (EUMETNET), qui republie les vigilances de Météo-France
 * - villes repères pour la carte : GeoNames (villes de plus de 15 000 habitants, CC-BY)
 */

// GeoNames donne parfois le nom anglais des villes étrangères proches.
const FR_NAMES = { Geneva: 'Genève', Basel: 'Bâle', Zurich: 'Zurich', Turin: 'Turin', Milan: 'Milan', Lucerne: 'Lucerne' };

const UA = { 'user-agent': 'deskbuddy (dashboard de bureau personnel)' };
const LEVELS = { Yellow: 'jaune', Orange: 'orange', Red: 'rouge' };
const EVENTS = [
  [/thunder/i, 'Orages'],
  [/wind/i, 'Vent violent'],
  [/rain|flood/i, 'Pluie-inondation'],
  [/snow|ice/i, 'Neige-verglas'],
  [/high-temperature|heat/i, 'Canicule'],
  [/low-temperature|cold/i, 'Grand froid'],
  [/avalanche/i, 'Avalanches'],
  [/coastal|wave/i, 'Vagues-submersion'],
  [/fog/i, 'Brouillard'],
  [/fire/i, 'Feux de forêt']
];

const getJson = async (url) => {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const toRad = (d) => (d * Math.PI) / 180;
function distKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* ---------- Prévisions ---------- */
async function forecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
    forecast_days: '4',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset',
    wind_speed_unit: 'kmh'
  });
  const j = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  const now = Date.now();
  const offset = (j.utc_offset_seconds || 0) * 1000;
  const toMs = (local) => Date.parse(`${local}Z`) - offset; // heures locales renvoyées sans fuseau
  const hourly = j.hourly.time
    .map((t, i) => ({
      at: toMs(t),
      temp: j.hourly.temperature_2m[i],
      pop: j.hourly.precipitation_probability[i],
      rain: j.hourly.precipitation[i],
      code: j.hourly.weather_code[i],
      day: j.hourly.is_day[i] === 1
    }))
    .filter((h) => h.at > now - 3600_000)
    .slice(0, 12);
  const daily = j.daily.time.map((t, i) => ({
    date: t,
    code: j.daily.weather_code[i],
    max: j.daily.temperature_2m_max[i],
    min: j.daily.temperature_2m_min[i],
    rain: j.daily.precipitation_sum[i],
    pop: j.daily.precipitation_probability_max[i],
    sunrise: toMs(j.daily.sunrise[i]),
    sunset: toMs(j.daily.sunset[i])
  }));
  const c = j.current;
  return {
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      code: c.weather_code,
      day: c.is_day === 1,
      wind: c.wind_speed_10m,
      gusts: c.wind_gusts_10m,
      windDir: c.wind_direction_10m,
      rain: c.precipitation
    },
    nextHourRain: hourly.find((h) => h.at > now)?.rain ?? null,
    hourly,
    daily
  };
}

/* ---------- Air et pollens ---------- */
async function airQuality(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
  });
  const c = (await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`)).current;
  return {
    aqi: c.european_aqi,
    pm25: c.pm2_5,
    pm10: c.pm10,
    o3: c.ozone,
    no2: c.nitrogen_dioxide,
    pollens: [
      { name: 'Graminées', value: c.grass_pollen },
      { name: 'Bouleau', value: c.birch_pollen },
      { name: 'Aulne', value: c.alder_pollen },
      { name: 'Ambroisie', value: c.ragweed_pollen },
      { name: 'Armoise', value: c.mugwort_pollen },
      { name: 'Olivier', value: c.olive_pollen }
    ]
  };
}

/* ---------- Vigilances (MeteoAlarm, flux Atom France) ---------- */
/** Le point est-il dans le polygone CAP « lat,lon lat,lon ... » ? (lancer de rayon) */
function inPolygon(poly, lat, lon) {
  const pts = poly.trim().split(/\s+/).map((p) => p.split(',').map(Number));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i];
    const [yj, xj] = pts[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Vigilances qui concernent ta position : par nom de zone, ou par contour quand le flux le fournit. */
export async function warnings(feed, areas, lat, lon) {
  const res = await fetch(`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${feed}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const tag = (e, name) => (e.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`)) || [])[1]?.trim() || '';
  const now = Date.now();
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const wanted = new Set(areas.map(norm));
  return xml
    .split('<entry>')
    .slice(1)
    .map((e) => {
      const title = tag(e, 'title');
      const color = (title.match(/^(Yellow|Orange|Red)/) || [])[1];
      const event = tag(e, 'cap:event');
      return {
        id: tag(e, 'cap:identifier'),
        area: tag(e, 'cap:areaDesc'),
        here: [...e.matchAll(/<cap:polygon>([^<]*)<\/cap:polygon>/g)].some((m) => inPolygon(m[1], lat, lon)),
        level: LEVELS[color] || null,
        type: (EVENTS.find(([re]) => re.test(event)) || [null, event])[1],
        onset: Date.parse(tag(e, 'cap:onset')) || null,
        expires: Date.parse(tag(e, 'cap:expires')) || null
      };
    })
    .filter((w) => w.level && (wanted.has(norm(w.area)) || w.here) && (!w.expires || w.expires > now))
    .sort((a, b) => ['jaune', 'orange', 'rouge'].indexOf(b.level) - ['jaune', 'orange', 'rouge'].indexOf(a.level));
}

/* ---------- Villes repères (GeoNames, cache 30 jours) ---------- */
function unzipFirst(buf) {
  // Lecture minimale d'un zip à un seul fichier via le répertoire central.
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const data = buf.subarray(localOffset + 30 + nameLen + extraLen, localOffset + 30 + nameLen + extraLen + compSize);
  return method === 8 ? zlib.inflateRawSync(data) : data;
}

/** Toutes les villes de plus de 30 000 habitants du monde, gardées en local (~500 Ko) : changer de position ne retélécharge rien. */
async function allTowns(dataDir) {
  const file = path.join(dataDir, 'towns-all.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - cached.at < 90 * 86400_000) return cached.towns;
  } catch {
    /* pas de cache */
  }
  const res = await fetch('https://download.geonames.org/export/dump/cities15000.zip', { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`GeoNames HTTP ${res.status}`);
  const txt = unzipFirst(Buffer.from(await res.arrayBuffer())).toString('utf8');
  const towns = [];
  for (const line of txt.split('\n')) {
    const f = line.split('\t');
    if (f.length < 15 || Number(f[14]) < 30000) continue;
    towns.push([FR_NAMES[f[1]] || f[1], Number(f[4]), Number(f[5]), Number(f[14])]);
  }
  writeJson(file, { at: Date.now(), towns });
  return towns;
}

async function loadTowns(lat, lon, dataDir) {
  const near = [];
  for (const [name, tlat, tlon, pop] of await allTowns(dataDir)) {
    const d = distKm(lat, lon, tlat, tlon);
    if (d <= 220) near.push({ name, pop, dist: Math.round(d * 10) / 10, bearing: Math.round(bearing(lat, lon, tlat, tlon)), lat: tlat, lon: tlon });
  }
  // Les plus peuplées d'abord, en évitant les étiquettes trop serrées (banlieue proche).
  near.sort((a, b) => b.pop - a.pop);
  const towns = [];
  for (const t of near) {
    if (towns.every((k) => distKm(k.lat, k.lon, t.lat, t.lon) > Math.max(8, t.dist * 0.18))) towns.push(t);
    if (towns.length >= 40) break;
  }
  return towns;
}

/**
 * area : nom affiché (département) ; alertAreas : noms de zones MeteoAlarm acceptés ; feed : pays du flux
 * (france, spain, italy...). Sans feed, pas de vigilances (pays non couvert).
 */
export function startWeather(store, { lat, lon, area, alertAreas = [area], feed = 'france', dataDir }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    store.set('weather', { error: 'Position inconnue' });
    return;
  }
  store.set('weather', { area, warnings: [], alertsAvailable: Boolean(feed) });
  const notified = new Set();

  const task = (name, everyMs, run) => periodic(store, { key: 'weather', name, everyMs, run, tag: 'weather' });
  const tz = () => store.get('home')?.tz || process.env.TZ || 'Europe/Paris';

  task('forecast', 15 * 60_000, async () => store.update('weather', { forecast: { ...(await forecast(lat, lon)), at: Date.now() } }));
  task('air', 30 * 60_000, async () => store.update('weather', { air: { ...(await airQuality(lat, lon)), at: Date.now() } }));
  task('warnings', 10 * 60_000, async () => {
    if (!feed) return;
    const list = await warnings(feed, alertAreas.filter(Boolean), lat, lon);
    store.update('weather', { warnings: list, warningsAt: Date.now() });
    // Une notif par vigilance (zone + phénomène + niveau), pas à chaque réémission du bulletin.
    // Jaune : notif simple. Orange et rouge : notif qui reste affichée jusqu'à ce que tu la fermes.
    for (const w of list) {
      const key = `${w.area}|${w.type}|${w.level}`;
      if (notified.has(key)) continue;
      notified.add(key);
      const until = w.expires ? ` · jusqu'à ${new Date(w.expires).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz() })}` : '';
      store.toast(w.level === 'jaune' ? 'info' : 'warn', `VIGILANCE ${w.level.toUpperCase()}`, `${w.type} · ${w.area}${until}`, { sticky: w.level !== 'jaune' });
    }
    // Vigilance terminée : on l'oublie, pour être prévenu si elle revient plus tard.
    const current = new Set(list.map((w) => `${w.area}|${w.type}|${w.level}`));
    for (const k of notified) if (!current.has(k)) notified.delete(k);
  });
  task('towns', 24 * 3600_000, async () => store.set('towns', await loadTowns(lat, lon, dataDir)));
}
