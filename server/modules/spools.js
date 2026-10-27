import fs from 'node:fs';
import path from 'node:path';

/*
 * Stock de filament, alimenté automatiquement par l'AMS : chaque bobine Bambu a une puce RFID
 * avec un identifiant unique. Dès qu'elle passe dans l'AMS, on l'ajoute (ou on la met à jour) avec
 * sa matière, sa couleur, son poids nominal et le pourcentage restant estimé par l'imprimante.
 * Hors de l'AMS, la bobine garde sa dernière valeur connue.
 */

const LOW_PCT = 15;
const DEBUG_MAX_LINES = 300;

// Noms de couleur approximatifs, pour afficher « Bleu » plutôt que #1F4FD1.
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
    // distance pondérée (l'œil est plus sensible au vert)
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
  const lastRaw = new Map();

  let saveTimer;
  const publish = () => {
    const list = Object.values(spools).sort(
      (a, b) => (a.archived - b.archived) || ((a.slot ?? 99) - (b.slot ?? 99)) || ((b.remain ?? -1) - (a.remain ?? -1))
    );
    store.set('spools', list);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(file, JSON.stringify(spools, null, 2));
      } catch (err) {
        console.error('[spools] écriture impossible', err.message);
      }
    }, 1000);
  };

  /** Journal de ce que l'AMS envoie réellement, pour vérifier les champs sur ta machine. */
  const debug = (slot, raw) => {
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
      fs.writeFileSync(debugFile, `${lines.slice(-DEBUG_MAX_LINES).join('\n')}\n`);
    } catch {
      /* journal facultatif */
    }
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
      const remain = t.remain ?? prev?.remain ?? null;
      const weightG = t.weightG || prev?.weightG || null;
      const next = {
        uuid: t.uuid,
        material: t.material || prev?.material || t.type || '?',
        type: t.type || prev?.type || null,
        color: t.color || prev?.color || null,
        colorName: colorName(t.color || prev?.color),
        weightG,
        remain,
        grams: remain !== null && weightG ? Math.round((weightG * remain) / 100) : null,
        slot: t.slot,
        firstSeen: prev?.firstSeen || Date.now(),
        lastSeen: Date.now(),
        archived: prev?.archived && remain > 0 ? prev.archived : false,
        lowNotified: prev?.lowNotified || false
      };
      if (remain !== null && remain <= LOW_PCT && !next.lowNotified) {
        next.lowNotified = true;
        store.toast('warn', 'BOBINE PRESQUE VIDE', `${next.material} ${next.colorName.toLowerCase()} · ~${next.grams ?? '?'} g`, { sticky: true });
      }
      if (remain !== null && remain > LOW_PCT + 10) next.lowNotified = false;
      const before = prev && JSON.stringify({ ...prev, lastSeen: 0 });
      const after = JSON.stringify({ ...next, lastSeen: 0 });
      spools[t.uuid] = next;
      if (before !== after) changed = true;
    }
    // Bobines sorties de l'AMS : on garde tout, sauf l'emplacement.
    for (const s of Object.values(spools)) {
      if (s.slot !== null && !seen.has(s.uuid) && trays.length) {
        s.slot = null;
        changed = true;
      }
    }
    if (changed) publish();
  };

  store.register('spool:archive', ({ uuid, archived }) => {
    if (!spools[uuid]) return;
    spools[uuid].archived = Boolean(archived);
    publish();
  });
  store.register('spool:forget', ({ uuid }) => {
    if (!spools[uuid] || spools[uuid].slot !== null) return;
    delete spools[uuid];
    publish();
  });

  publish();
  return { observe };
}
