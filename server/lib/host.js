import net from 'node:net';

/*
 * Client du service hôte (scripts/hostd.py, lancé en root par systemd sur le Pi).
 * Le conteneur n'a plus aucun privilège : pour toucher au rétroéclairage, au Wi-Fi ou au fuseau horaire,
 * il demande au service hôte, qui n'accepte qu'une courte liste de commandes vérifiées.
 */

const SOCKET = process.env.HOSTD_SOCKET || '/run/deskbuddy/hostd.sock';

export function host(cmd, args = {}, timeoutMs = 50_000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET);
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('service hôte : pas de réponse'));
    }, timeoutMs);
    sock.on('connect', () => sock.write(`${JSON.stringify({ cmd, args })}\n`));
    sock.on('data', (d) => {
      buf += d;
      if (!buf.includes('\n')) return;
      clearTimeout(timer);
      sock.end();
      try {
        const res = JSON.parse(buf.slice(0, buf.indexOf('\n')));
        if (res.ok) resolve(res.data);
        else reject(new Error(res.error || 'erreur du service hôte'));
      } catch {
        reject(new Error('service hôte : réponse illisible'));
      }
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(err.code === 'ENOENT' || err.code === 'ECONNREFUSED' ? 'service hôte absent (relance scripts/install-pi.sh)' : err.message));
    });
  });
}
