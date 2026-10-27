import path from 'node:path';
import { readJson, writeJson } from '../lib/fsx.js';

/*
 * Les minuteurs vivent côté serveur et sont enregistrés dans data/timers.json : ils survivent à un
 * rechargement de la page, à une mise à jour (qui redémarre le conteneur) et à un redémarrage du Pi.
 * Un minuteur arrivé à échéance pendant l'arrêt sonne au redémarrage.
 */
export function startTimers(store, { dataDir }) {
  const file = path.join(dataDir, 'timers.json');
  const saved = readJson(file, []);
  const list = Array.isArray(saved) ? saved.filter((t) => t && Number.isFinite(t.endAt) && Number.isFinite(t.id)) : [];
  let seq = Math.max(0, ...list.map((t) => t.id)) + 1;

  const save = (timers) => {
    store.set('timers', timers);
    try {
      writeJson(file, timers);
    } catch (err) {
      console.error('[timers] écriture impossible', err.message);
    }
  };
  store.set('timers', list);

  store.register('timer:add', ({ minutes, label }) => {
    const m = Number(minutes);
    if (!(m > 0 && m <= 24 * 60)) throw new Error('Durée de minuteur invalide');
    const timer = {
      id: seq++,
      label: String(label || `Minuteur · ${m} min`).slice(0, 40),
      totalMs: m * 60_000,
      endAt: Date.now() + m * 60_000,
      done: false
    };
    save([...store.get('timers'), timer]);
  });

  store.register('timer:cancel', ({ id }) => {
    save(store.get('timers').filter((t) => t.id !== id));
  });

  setInterval(() => {
    const now = Date.now();
    let changed = false;
    const timers = store.get('timers').map((t) => {
      if (t.done || t.endAt > now) return t;
      changed = true;
      const late = now - t.endAt > 5_000;
      store.event({ kind: 'timer:done', id: t.id });
      store.toast('warn', 'MINUTEUR TERMINÉ', late ? `${t.label} · pendant le redémarrage du dashboard` : t.label, { sticky: true });
      return { ...t, done: true };
    });
    if (changed) save(timers);
  }, 250);
}
