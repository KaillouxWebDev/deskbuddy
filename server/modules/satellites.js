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
    fullName: 'Station spatiale internationale',
    operator: 'NASA, Roscosmos, ESA, JAXA, ASC',
    launched: 1998,
    kind: 'Station habitée',
    role: 'Laboratoire en orbite occupé en permanence par un équipage de 3 à 7 personnes.',
    forYou:
      "Contacts radio ARISS entre astronautes et écoles en phonie FM, images SSTV lors d'événements annoncés, relais APRS et répéteur FM. Visible à l'œil nu au crépuscule : c'est le point le plus brillant qui traverse le ciel sans clignoter.",
    gear: 'Portatif VHF/UHF et antenne d\'origine pour écouter la phonie ; antenne directive pour le répéteur.',
    freqs: [
      { label: 'Voix FM', down: 145.8 },
      { label: 'APRS / packet', down: 145.825 },
      { label: 'Répéteur FM', down: 437.8, up: '145.990 (67 Hz)' }
    ]
  },
  {
    id: 27607,
    name: 'SO-50',
    fullName: 'SaudiSat-1C',
    operator: 'Arabie saoudite (KACST), radioamateurs',
    launched: 2002,
    kind: 'Satellite radioamateur',
    role: 'Répéteur FM simple : il retransmet en UHF ce qu\'il reçoit en VHF.',
    forYou:
      "Le satellite idéal pour débuter : un portatif bi-bande suffit. Il faut d'abord envoyer une tonalité de 74,4 Hz pour armer son minuteur, puis parler avec la tonalité 67 Hz.",
    gear: 'Portatif bi-bande + antenne directive légère (type Arrow) tenue à la main.',
    freqs: [{ label: 'Répéteur FM', down: 436.795, up: '145.850 (67 Hz)' }]
  },
  {
    id: 43678,
    name: 'PO-101',
    fullName: 'Diwata-2',
    operator: 'Philippines (programme STAMINA4Space)',
    launched: 2018,
    kind: 'Microsatellite d\'observation + radioamateur',
    role: 'Satellite d\'observation de la Terre qui embarque un répéteur FM radioamateur.',
    forYou: "Le répéteur n'est allumé que sur des créneaux annoncés à l'avance par l'opérateur : vérifier le planning avant d'écouter.",
    gear: 'Portatif bi-bande, antenne directive conseillée.',
    freqs: [{ label: 'Répéteur FM (sur programme)', down: 145.9, up: '437.500 (141,3 Hz)' }]
  },
  {
    id: 44909,
    name: 'RS-44',
    fullName: 'DOSAAF-85',
    operator: 'Russie, radioamateurs',
    launched: 2019,
    kind: 'Satellite radioamateur',
    role: 'Transpondeur linéaire en orbite haute (~1 200 km) : longs passages et très grande zone de couverture.',
    forYou: "Le meilleur pour des contacts lointains en BLU ou en CW, jusqu'à plusieurs milliers de kilomètres. Pas de FM : il faut un poste tous modes.",
    gear: 'Poste tous modes (BLU/CW) VHF/UHF, idéalement deux, et antennes directives.',
    freqs: [
      { label: 'Balise CW', down: 435.605 },
      { label: 'Transpondeur SSB/CW', range: '435.610–435.670', up: '145.935–145.995' }
    ]
  },
  {
    id: 24278,
    name: 'FO-29',
    fullName: 'Fuji-OSCAR 29 (JAS-2)',
    operator: 'Japon (JARL)',
    launched: 1996,
    kind: 'Satellite radioamateur',
    role: 'Transpondeur linéaire historique, toujours en service par intermittence.',
    forYou: "Ses batteries sont usées : il fonctionne surtout quand il est au soleil. Un passage affiché ne garantit pas qu'il émet.",
    gear: 'Poste tous modes (BLU/CW) et antennes directives.',
    freqs: [{ label: 'Transpondeur SSB/CW (intermittent)', range: '435.800–435.900', up: '145.900–146.000' }]
  },
  {
    id: 57166,
    name: 'METEOR M2-3',
    fullName: 'Meteor-M n°2-3',
    operator: 'Russie (Roscosmos / Roshydromet)',
    launched: 2023,
    kind: 'Satellite météo',
    role: 'Satellite météorologique en orbite polaire : il photographie la Terre en visible et en infrarouge.',
    forYou:
      "Il diffuse ses images en continu en numérique (LRPT). Avec un récepteur SDR, une antenne adaptée et le logiciel SatDump, tu récupères toi-même une vraie image satellite de la région à chaque passage.",
    gear: 'Clé SDR + antenne QFH ou dipôle en V (facile à fabriquer) + SatDump.',
    freqs: [{ label: 'Images LRPT', down: 137.9 }]
  },
  {
    id: 59051,
    name: 'METEOR M2-4',
    fullName: 'Meteor-M n°2-4',
    operator: 'Russie (Roscosmos / Roshydromet)',
    launched: 2024,
    kind: 'Satellite météo',
    role: 'Jumeau du M2-3, même mission d\'imagerie météo en orbite polaire.',
    forYou: 'Même réception que le M2-3 ; la fréquence peut changer selon la programmation de l\'opérateur.',
    gear: 'Clé SDR + antenne QFH ou dipôle en V + SatDump.',
    freqs: [{ label: 'Images LRPT (selon programmation)', down: 137.9 }]
  }
];

const C_KMS = 299_792.458;
const TLE_TTL = 12 * 3600_000;
const HORIZON_H = 24;
const STEP_S = 30;
const MIN_PASS_EL = 5; // passages trop rasants ignorés
const NOTIFY_EL = 20; // notif « passage dans 2 min » au-dessus de cette élévation max
const NOTIFY_BEFORE_S = 120;
const VISIBLE_MIN_EL = 10; // en dessous, l'ISS se perd dans la brume et les obstacles
const DARK_SUN_EL = -6; // fin du crépuscule civil : le ciel est assez sombre
const ISS_ID = 25544;
const EARTH_R = 6378.137;
const AU_KM = 149_597_870.7;

/** Position approchée du Soleil (repère inertiel, km), suffisante pour savoir si un satellite est éclairé. */
function sunEci(date) {
  const n = date.getTime() / 86400_000 + 2440587.5 - 2451545.0;
  const L = degreesToRadians((280.46 + 0.9856474 * n) % 360);
  const g = degreesToRadians((357.528 + 0.9856003 * n) % 360);
  const lambda = L + degreesToRadians(1.915) * Math.sin(g) + degreesToRadians(0.02) * Math.sin(2 * g);
  const eps = degreesToRadians(23.439 - 0.0000004 * n);
  const r = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU_KM;
  return { x: r * Math.cos(lambda), y: r * Math.cos(eps) * Math.sin(lambda), z: r * Math.sin(eps) * Math.sin(lambda) };
}

/** Le satellite est-il hors de l'ombre de la Terre (modèle d'ombre cylindrique) ? */
function sunlit(pos, sun) {
  const sl = Math.hypot(sun.x, sun.y, sun.z);
  const ux = sun.x / sl;
  const uy = sun.y / sl;
  const uz = sun.z / sl;
  const along = pos.x * ux + pos.y * uy + pos.z * uz;
  if (along > 0) return true; // côté jour
  const perp = Math.hypot(pos.x - along * ux, pos.y - along * uy, pos.z - along * uz);
  return perp > EARTH_R;
}

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
    // Fiche descriptive + orbite déduite du TLE (envoyée une fois, pas à chaque rafraîchissement).
    store.set(
      'satCatalog',
      SATELLITES.map((s) => {
        const rec = recs.get(s.id);
        let orbit = null;
        if (rec) {
          const periodMin = (2 * Math.PI) / rec.no; // no : mouvement moyen en rad/min
          const a = Math.cbrt(398600.4418 * ((periodMin * 60) / (2 * Math.PI)) ** 2);
          orbit = {
            periodMin: Math.round(periodMin * 10) / 10,
            inclination: Math.round(radiansToDegrees(rec.inclo) * 10) / 10,
            perigeeKm: Math.round(a * (1 - rec.ecco) - 6378.137),
            apogeeKm: Math.round(a * (1 + rec.ecco) - 6378.137)
          };
        }
        return { ...s, orbit };
      })
    );
  };

  const look = (rec, date) => {
    const pv = propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const la = ecfToLookAngles(observer, eciToEcf(pv.position, gstime(date)));
    return { az: (radiansToDegrees(la.azimuth) + 360) % 360, el: radiansToDegrees(la.elevation), range: la.rangeSat, eci: pv.position };
  };

  /** Élévation du Soleil vue de chez toi, en degrés. */
  const sunElevation = (date, sun) =>
    radiansToDegrees(ecfToLookAngles(observer, eciToEcf(sun, gstime(date))).elevation);

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
          // Visible à l'œil nu : assez haut, éclairé par le Soleil, et ton ciel est sombre.
          if (p.el >= VISIBLE_MIN_EL) {
            const date = new Date(t);
            const sun = sunEci(date);
            if (sunlit(p.eci, sun) && sunElevation(date, sun) < DARK_SUN_EL) {
              if (!cur.visible) {
                cur.visible = true;
                cur.visStart = t;
                cur.visStartAz = Math.round(p.az);
              }
              cur.visEnd = t;
            }
          }
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
      // Lever : le satellite est à portée de ta radio, jusqu'à quelle heure.
      const akey = `aos-${key}`;
      if (pass.maxEl >= NOTIFY_EL && now.getTime() >= pass.aos && now.getTime() < pass.aos + 60_000 && !notified.has(akey)) {
        notified.add(akey);
        const main = SATELLITES.find((s) => s.id === pass.satId)?.freqs.find((f) => f.down);
        const end = new Date(pass.los).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Europe/Paris' });
        store.toast('success', `${pass.name} EN VUE`, `jusqu'à ${end} · max ${pass.maxEl}°${main ? ` · ${main.down.toFixed(3)} MHz` : ''}`);
      }
      // ISS visible à l'œil nu : prévenir 5 minutes avant, avec la direction où regarder.
      const vkey = `vis-${key}`;
      const vdt = ((pass.visStart || 0) - now.getTime()) / 1000;
      if (pass.satId === ISS_ID && pass.visible && pass.maxEl >= NOTIFY_EL && vdt > 0 && vdt <= 300 && !notified.has(vkey)) {
        notified.add(vkey);
        const dirs = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
        store.toast('info', 'ISS VISIBLE À L\'ŒIL NU', `dans 5 min · apparaît au ${dirs[Math.round(pass.visStartAz / 45) % 8]} · max ${pass.maxEl}°`, { sticky: true });
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

  store.every(live, 2_000);
  store.every(computePasses, 10 * 60_000);
  store.every(() => Date.now() - cache.at > TLE_TTL && refreshTle(), 3600_000);
  live();
}
