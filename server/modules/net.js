/*
 * Internet joignable ? Sert au voyant de la barre du haut et à relancer les sources en échec
 * dès que la connexion revient (voir lib/task.js). Requête minuscule toutes les 20 s
 * (toutes les 5 s tant qu'on est hors ligne, pour réagir vite).
 */

const PROBES = process.env.NET_PROBES ? process.env.NET_PROBES.split(',') : ['https://cloudflare.com/cdn-cgi/trace', 'https://www.google.com/generate_204'];

async function probe() {
  for (const url of PROBES) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return true;
    } catch {
      /* sonde suivante */
    }
  }
  return false;
}

export function startNet(store) {
  store.set('net', { online: true, since: Date.now() });
  const tick = async () => {
    const online = await probe();
    if (online !== store.get('net').online) {
      store.set('net', { online, since: Date.now() });
      console.log(`[net] Internet ${online ? 'revenu' : 'perdu'}`);
    }
    setTimeout(tick, online ? 20_000 : 5_000);
  };
  tick();
}
