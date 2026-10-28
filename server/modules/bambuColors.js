import path from 'node:path';
import { readJson, writeJson } from '../lib/fsx.js';

/*
 * Noms officiels des couleurs Bambu (« Jaune citron », « Anthracite »...), en français.
 * Source : le fichier de couleurs publié par Bambu Lab dans Bambu Studio. On le télécharge sur le Pi
 * (et on le garde 30 jours) plutôt que de le recopier dans le dépôt.
 * Recherche, du plus précis au plus large : référence du filament (puce RFID, ex. GFA01) + couleur,
 * puis gamme (ex. « PLA Matte ») + couleur, puis couleur seule. À défaut, un nom approximatif.
 */

const URL = 'https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/filaments_color_codes.json';
const TTL = 30 * 86400_000;

// Repli : couleur génériques la plus proche (quand la bobine n'est pas dans le catalogue Bambu).
const GENERIC = [
  ['Noir', [20, 20, 20]], ['Blanc', [245, 245, 245]], ['Gris', [140, 140, 140]], ['Gris clair', [200, 200, 200]],
  ['Gris foncé', [70, 70, 70]], ['Rouge', [200, 30, 40]], ['Bordeaux', [110, 20, 40]], ['Orange', [240, 120, 30]],
  ['Jaune', [245, 210, 30]], ['Beige', [225, 200, 160]], ['Marron', [110, 70, 40]], ['Vert', [40, 150, 70]],
  ['Vert clair', [140, 210, 90]], ['Vert foncé', [20, 80, 40]], ['Turquoise', [40, 190, 180]], ['Bleu clair', [110, 180, 240]],
  ['Bleu', [30, 80, 200]], ['Bleu marine', [20, 35, 90]], ['Violet', [120, 60, 170]], ['Rose', [240, 130, 180]],
  ['Magenta', [210, 40, 140]], ['Doré', [200, 160, 60]], ['Argent', [170, 175, 180]]
];

function generic(hex) {
  if (!hex) return 'Inconnue';
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  let best = GENERIC[0];
  let bestD = Infinity;
  for (const c of GENERIC) {
    const d = 2 * (rgb[0] - c[1][0]) ** 2 + 4 * (rgb[1] - c[1][1]) ** 2 + 3 * (rgb[2] - c[1][2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best[0];
}

const norm = (hex) => (hex || '').replace('#', '').slice(0, 6).toUpperCase();

export function createColorNames(dataDir) {
  const file = path.join(dataDir, 'bambu-colors.json');
  let index = null; // clé -> nom français
  const listeners = [];

  const build = (data) => {
    const map = new Map();
    for (const c of data) {
      const name = c.fila_color_name?.fr || c.fila_color_name?.en;
      const hex = norm(c.fila_color?.[0]);
      if (!name || !hex) continue;
      if (c.fila_id) map.set(`${c.fila_id}|${hex}`, name);
      if (c.fila_type) map.set(`${c.fila_type.toUpperCase()}|${hex}`, name);
      if (!map.has(`|${hex}`)) map.set(`|${hex}`, name);
    }
    index = map;
    console.log(`[couleurs] ${data.length} couleurs Bambu chargées`);
    listeners.forEach((fn) => fn());
  };

  const cached = readJson(file);
  if (cached?.data?.length) build(cached.data);

  const refresh = async () => {
    if (cached && Date.now() - cached.at < TTL && index) return;
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()).data;
      if (!Array.isArray(data) || !data.length) throw new Error('fichier vide');
      writeJson(file, { at: Date.now(), data });
      build(data);
    } catch (err) {
      console.error(`[couleurs] catalogue Bambu indisponible (${err.message}), noms approximatifs en attendant`);
      setTimeout(refresh, 30 * 60_000);
    }
  };
  refresh();

  return {
    /** Nom de la couleur d'une bobine : idx = référence RFID (tray_info_idx), material = gamme, hex = couleur. */
    name(idx, material, hex) {
      const h = norm(hex);
      if (index && h) {
        const found = (idx && index.get(`${idx}|${h}`)) || (material && index.get(`${material.toUpperCase()}|${h}`)) || index.get(`|${h}`);
        if (found) return found;
      }
      return generic(hex);
    },
    /** Appelé quand le catalogue est (re)chargé : pour renommer les bobines déjà connues. */
    onLoad(fn) {
      listeners.push(fn);
    }
  };
}
