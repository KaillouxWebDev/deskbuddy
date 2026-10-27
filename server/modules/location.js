import fs from 'node:fs';
import path from 'node:path';

/*
 * Position du dashboard, modifiable depuis l'écran (vacances, sortie en extérieur...).
 * - Position « maison » : HOME_LAT / HOME_LON / WEATHER_AREA du fichier .env.
 * - Position courante : data/location.json, choisie au pavé numérique.
 * Un géocodage inverse (Nominatim, OpenStreetMap) donne le nom du lieu, le département et le pays,
 * utilisés pour les vigilances MeteoAlarm. Une seule requête par changement de position.
 */

const UA = { 'user-agent': 'deskbuddy/0.7 (dashboard perso ; github.com/KaillouxWebDev/deskbuddy)' };

// Flux MeteoAlarm par pays (code ISO → nom du flux).
const FEEDS = {
  fr: 'france', es: 'spain', it: 'italy', de: 'germany', ch: 'switzerland', be: 'belgium', nl: 'netherlands',
  at: 'austria', pt: 'portugal', gb: 'united-kingdom', ie: 'ireland', lu: 'luxembourg', gr: 'greece',
  hr: 'croatia', si: 'slovenia', cz: 'czechia', sk: 'slovakia', pl: 'poland', hu: 'hungary', ro: 'romania',
  bg: 'bulgaria', dk: 'denmark', se: 'sweden', no: 'norway', fi: 'finland', ee: 'estonia', lv: 'latvia',
  lt: 'lithuania', is: 'iceland', mt: 'malta', cy: 'cyprus', rs: 'serbia', me: 'montenegro',
  mk: 'republic-of-north-macedonia', ba: 'bosnia-herzegovina', md: 'moldova', il: 'israel'
};

const round = (v) => Math.round(v * 1000) / 1000;

async function reverse(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&addressdetails=1`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  const a = j.address || {};
  const cc = (a.country_code || '').toLowerCase();
  return {
    label: a.city || a.town || a.village || a.municipality || a.county || a.state || j.name || null,
    area: cc === 'fr' ? a.state_district || a.county || null : a.county || a.state || null,
    alertAreas: [a.county, a.state_district, a.state, a.province, a.region].filter(Boolean),
    country: a.country || null,
    feed: FEEDS[cc] || null
  };
}

/**
 * onChange(loc) est appelé au démarrage puis à chaque changement :
 * loc = { lat, lon, label, area, alertAreas, feed, country, isHome }
 */
export function startLocation(store, { home, homeArea, dataDir, onChange }) {
  const file = path.join(dataDir, 'location.json');
  const homeOk = Number.isFinite(home.lat) && Number.isFinite(home.lon);
  const homeLoc = homeOk
    ? { lat: home.lat, lon: home.lon, label: 'Maison', area: homeArea, alertAreas: [homeArea], feed: 'france', country: null }
    : null;

  let loc = null;
  try {
    loc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* jamais déplacé : on est à la maison */
  }
  if (!loc || !Number.isFinite(loc.lat)) loc = homeLoc;

  const isHome = (l) => Boolean(homeLoc && l && round(l.lat) === round(homeLoc.lat) && round(l.lon) === round(homeLoc.lon));
  const publish = () => {
    store.set('home', loc ? { lat: loc.lat, lon: loc.lon, label: loc.label, area: loc.area, country: loc.country, isHome: isHome(loc), pending: Boolean(loc.pending), canGoHome: Boolean(homeLoc) } : null);
  };
  const apply = (next) => {
    loc = next;
    try {
      if (isHome(loc)) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, JSON.stringify(loc, null, 2));
    } catch (err) {
      console.error('[location] écriture impossible', err.message);
    }
    publish();
    onChange(loc ? { ...loc, isHome: isHome(loc) } : null);
  };

  /** Nom du lieu et zone de vigilance ; sans réseau, on réessaiera plus tard. */
  const geocode = async (l) => {
    try {
      const info = await reverse(l.lat, l.lon);
      if (loc !== l) return; // position changée entre-temps
      const next = { ...l, ...info, label: info.label || l.label, pending: false };
      const areasChanged = JSON.stringify(next.alertAreas) !== JSON.stringify(l.alertAreas) || next.feed !== l.feed;
      if (areasChanged) apply(next);
      else {
        loc = next;
        fs.writeFileSync(file, JSON.stringify(loc, null, 2));
        publish();
      }
    } catch (err) {
      console.error('[location] géocodage :', err.message);
    }
  };

  store.register('location:set', ({ lat, lon }) => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      store.toast('warn', 'POSITION INVALIDE', 'Latitude entre -90 et 90, longitude entre -180 et 180');
      return;
    }
    const l = { lat: round(la), lon: round(lo) };
    if (isHome(l)) {
      apply(homeLoc);
      store.toast('info', 'POSITION', 'Retour à la maison');
      return;
    }
    // On repart tout de suite (avions, satellites...) ; le nom du lieu arrive dès que Nominatim répond.
    const next = { ...l, label: `${l.lat.toFixed(3)}, ${l.lon.toFixed(3)}`, area: null, alertAreas: [], feed: null, country: null, pending: true };
    apply(next);
    store.toast('info', 'NOUVELLE POSITION', `${next.label} · radar, météo et satellites recalculés`);
    geocode(next);
  });

  store.register('location:home', () => {
    if (!homeLoc) return;
    apply(homeLoc);
    store.toast('info', 'POSITION', 'Retour à la maison');
  });

  publish();
  onChange(loc ? { ...loc, isHome: isHome(loc) } : null);
  if (loc?.pending) geocode(loc);
  // Géocodage en attente (pas de réseau au moment du changement) : on réessaie régulièrement.
  setInterval(() => loc?.pending && geocode(loc), 5 * 60_000);
}
