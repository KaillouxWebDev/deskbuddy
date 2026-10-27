/*
 * Tâche périodique qui va chercher des données en ligne, avec la même politique partout :
 * - exécution immédiate, puis toutes les everyMs ;
 * - en cas d'échec, nouvel essai après 1, 2, 5 puis 10 min (sans dépasser le cycle normal) ;
 * - au retour d'Internet, relance immédiate de ce qui avait échoué ;
 * - état publié dans store[key] : `${name}Error`, `${name}RetryAt` (heure du prochain essai).
 * Les dernières données reçues restent affichées pendant ce temps.
 */

const RETRY_MIN = [1, 2, 5, 10];

export function periodic(store, { key, name, everyMs, run, tag = key }) {
  let failures = 0;
  let retryTimer = null;

  const exec = async () => {
    clearTimeout(retryTimer);
    try {
      await run();
      failures = 0;
      if (store.alive !== false) store.update(key, { [`${name}Error`]: null, [`${name}RetryAt`]: null });
    } catch (err) {
      if (store.alive === false) return;
      failures++;
      const delay = Math.min(RETRY_MIN[Math.min(failures, RETRY_MIN.length) - 1] * 60_000, everyMs);
      console.error(`[${tag}] ${name} : ${err.message} (nouvel essai dans ${Math.round(delay / 60_000)} min)`);
      retryTimer = setTimeout(() => store.alive !== false && exec(), delay);
      store.update(key, { [`${name}Error`]: err.message, [`${name}RetryAt`]: Date.now() + delay });
    }
  };

  exec();
  const every = store.every ? store.every.bind(store) : (fn, ms) => setInterval(fn, ms);
  every(exec, everyMs);

  // Retour d'Internet (Wi-Fi reconnecté, partage de connexion activé...) : on n'attend pas.
  let online = store.get('net')?.online ?? true;
  store.on('patch', (k, v) => {
    if (k !== 'net') return;
    const now = Boolean(v?.online);
    if (now && !online && failures > 0) exec();
    online = now;
  });

  return exec;
}
