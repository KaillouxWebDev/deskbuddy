/** Les minuteurs vivent côté serveur : ils survivent à un rechargement de la page et pourront piloter un buzzer. */
export function startTimers(store) {
  let seq = 1;
  store.set('timers', []);

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
    store.set('timers', [...store.get('timers'), timer]);
  });

  store.register('timer:cancel', ({ id }) => {
    store.set('timers', store.get('timers').filter((t) => t.id !== id));
  });

  setInterval(() => {
    const now = Date.now();
    let changed = false;
    const list = store.get('timers').map((t) => {
      if (t.done || t.endAt > now) return t;
      changed = true;
      store.event({ kind: 'timer:done', id: t.id });
      store.toast('warn', 'MINUTEUR TERMINÉ', t.label);
      return { ...t, done: true };
    });
    if (changed) store.set('timers', list);
  }, 250);
}
