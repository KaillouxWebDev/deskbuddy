import fs from 'node:fs';
import { writeJson, writeAtomic, DEBUG } from '../lib/fsx.js';
import path from 'node:path';

/*
 * Stock de filament.
 * - Identification automatique : chaque bobine Bambu a une puce RFID lue par l'AMS (identifiant unique,
 *   matière, couleur, poids nominal). Dès qu'elle passe dans l'AMS, elle est ajoutée à l'inventaire.
 * - Quantité restante : l'AMS lite n'estime pas le restant (il annonce toujours 100 %). On tient donc
 *   notre propre compte : niveau de départ indiqué une fois (plein, ¾, ½, ¼), puis on retire le poids
 *   calculé par le slicer à chaque impression. Un recalage manuel reste possible à tout moment.
 */

const LOW_PCT = 15;
const DEBUG_MAX_LINES = 300;

const COLOR_NAMES = [
  ['Noir', [20, 20, 20]],
  ['Blanc', [245, 245, 245]],
  ['Gris', [140, 140, 140]],
  ['Gris clair', [200, 200, 200]],
  ['Gris foncé', [70, 70, 70]],
  ['Rouge', [200, 30, 40]],
  ['Bordeaux', [110, 20, 40]],
  ['Orange', [240, 120, 30]],
  ['Jaune', [245, 210, 30]],
  ['Jaune pâle', [247, 217, 89]],
  ['Beige', [225, 200, 160]],
  ['Marron', [110, 70, 40]],
  ['Vert', [40, 150, 70]],
  ['Vert clair', [140, 210, 90]],
  ['Vert foncé', [20, 80, 40]],
  ['Turquoise', [40, 190, 180]],
  ['Bleu clair', [110, 180, 240]],
  ['Bleu', [30, 80, 200]],
  ['Bleu marine', [20, 35, 90]],
  ['Violet', [120, 60, 170]],
  ['Rose', [240, 130, 180]],
  ['Magenta', [210, 40, 140]],
  ['Doré', [200, 160, 60]],
  ['Argent', [170, 175, 180]]
];

function colorName(hex) {
  if (!hex) return 'Inconnue';
  const v = parseInt(hex.slice(1, 7), 16);
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  let best = COLOR_NAMES[0];
  let bestD = Infinity;
  for (const c of COLOR_NAMES) {
    const d = 2 * (rgb[0] - c[1][0]) ** 2 + 4 * (rgb[1] - c[1][1]) ** 2 + 3 * (rgb[2] - c[1][2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best[0];
}

export function createSpools(store, { dataDir }) {
  const file = path.join(dataDir, 'spools.json');
  const debugFile = path.join(dataDir, 'ams-debug.jsonl');
  let spools = {};
  try {
    spools = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* premier démarrage */
  }
  // Migration v0.5 → v0.6 : l'ancien « remain » venait de l'AMS et n'est pas fiable sur l'AMS lite.
  for (const s of Object.values(spools)) {
    if (!s.tracked) Object.assign(s, { tracked: true, grams: s.weightG || 1000, needsLevel: true, lowNotified: false });
  }
  const lastRaw = new Map();

  const view = (s) => ({ ...s, pct: s.weightG ? Math.max(0, Math.min(100, Math.round((s.grams / s.weightG) * 100))) : null });

  let saveTimer;
  const publish = () => {
    const list = Object.values(spools)
      .map(view)
      .sort((a, b) => a.archived - b.archived || (a.slot ?? 99) - (b.slot ?? 99) || b.grams - a.grams);
    store.set('spools', list);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        writeJson(file, spools, true);
      } catch (err) {
        console.error('[spools] écriture impossible', err.message);
      }
    }, 1000);
  };

  const debug = (slot, raw) => {
    if (!DEBUG) return; // journal brut de l'AMS : seulement avec DEBUG=1
    const key = JSON.stringify(raw);
    if (lastRaw.get(slot) === key) return;
    lastRaw.set(slot, key);
    try {
      let lines = [];
      try {
        lines = fs.readFileSync(debugFile, 'utf8').split('\n').filter(Boolean);
      } catch {
        /* nouveau fichier */
      }
      lines.push(JSON.stringify({ at: new Date().toISOString(), slot, raw }));
      writeAtomic(debugFile, `${lines.slice(-DEBUG_MAX_LINES).join('\n')}\n`);
    } catch {
      /* journal facultatif */
    }
  };

  const checkLow = (s) => {
    const pct = s.weightG ? (s.grams / s.weightG) * 100 : 100;
    if (!s.needsLevel && pct <= LOW_PCT && !s.lowNotified) {
      s.lowNotified = true;
      store.toast('warn', 'BOBINE PRESQUE VIDE', `${s.material} ${s.colorName.toLowerCase()} · ~${Math.round(s.grams)} g`, { sticky: true });
    }
    if (pct > LOW_PCT + 10) s.lowNotified = false;
  };

  /** Appelé à chaque message de l'imprimante avec le contenu des emplacements de l'AMS. */
  const observe = (trays) => {
    let changed = false;
    const seen = new Set();
    for (const t of trays) {
      if (t.raw) debug(t.slot, t.raw);
      if (!t.uuid) continue;
      seen.add(t.uuid);
      const prev = spools[t.uuid];
      if (!prev) {
        const weightG = t.weightG || 1000;
        spools[t.uuid] = {
          uuid: t.uuid,
          tracked: true,
          material: t.material || t.type || '?',
          type: t.type || null,
          color: t.color || null,
          colorName: colorName(t.color),
          weightG,
          grams: weightG, // supposée pleine tant que tu n'as pas indiqué son niveau
          needsLevel: true,
          slot: t.slot,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          archived: false,
          lowNotified: false
        };
        store.toast('info', 'NOUVELLE BOBINE', `${spools[t.uuid].material} ${spools[t.uuid].colorName.toLowerCase()} · indique son niveau dans STOCK`);
        changed = true;
        continue;
      }
      if (prev.slot !== t.slot || prev.archived) {
        prev.slot = t.slot;
        prev.archived = false;
        changed = true;
      }
      prev.lastSeen = Date.now();
    }
    if (trays.length) {
      for (const s of Object.values(spools)) {
        if (s.slot !== null && !seen.has(s.uuid)) {
          s.slot = null;
          changed = true;
        }
      }
    }
    if (changed) publish();
  };

  /** Bobine chargée correspondant à un filament du slicer (même couleur et même matière de préférence). */
  const match = (filament) => {
    const loaded = Object.values(spools).filter((s) => s.slot !== null);
    const sameColor = (s) => s.color && filament.color && s.color.toUpperCase() === filament.color.toUpperCase();
    const sameType = (s) => !filament.type || (s.type || '').toUpperCase() === filament.type.toUpperCase();
    return (
      loaded.find((s) => sameColor(s) && sameType(s)) ||
      loaded.find(sameColor) ||
      (loaded.filter(sameType).length === 1 ? loaded.find(sameType) : null) ||
      null
    );
  };

  /** Bobine actuellement chargée dans un emplacement de l'AMS. */
  const bySlot = (slot) => Object.values(spools).find((s) => s.slot === slot) || null;

  /** Retire du stock le filament consommé ; renvoie le détail pour le journal.
   *  pick : choisit la bobine d'un filament (par défaut, comparaison de couleur). */
  const consume = (filaments, fraction, pick = match) => {
    const done = [];
    for (const f of filaments) {
      const g = Math.round(f.usedG * fraction * 10) / 10;
      if (!g) continue;
      const s = pick(f);
      if (s) {
        s.grams = Math.max(0, s.grams - g);
        checkLow(s);
      }
      done.push({
        grams: g,
        spool: s ? `${s.material} ${s.colorName.toLowerCase()}` : `${f.type || '?'} ${f.color || ''} (bobine non reconnue)`,
        material: s ? s.material : f.type || null,
        colorName: s ? s.colorName : null,
        color: s ? s.color : f.color || null,
        known: Boolean(s)
      });
    }
    publish();
    return done;
  };

  store.register('spool:level', ({ uuid, fraction }) => {
    const s = spools[uuid];
    const f = Number(fraction);
    if (!s || !(f >= 0 && f <= 1)) return;
    s.grams = Math.round(s.weightG * f);
    s.needsLevel = false;
    s.lowNotified = false;
    checkLow(s);
    publish();
  });
  store.register('spool:grams', ({ uuid, grams }) => {
    const s = spools[uuid];
    const g = Number(grams);
    if (!s || !Number.isFinite(g)) return;
    s.grams = Math.max(0, Math.min(s.weightG * 1.2, Math.round(g)));
    s.needsLevel = false;
    s.lowNotified = false;
    checkLow(s);
    publish();
  });
  store.register('spool:archive', ({ uuid, archived }) => {
    if (!spools[uuid]) return;
    spools[uuid].archived = Boolean(archived);
    publish();
  });

  publish();
  return { observe, match, bySlot, consume };
}
