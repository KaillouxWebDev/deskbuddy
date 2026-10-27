import { execFile } from 'node:child_process';

/*
 * Wi-Fi du Pi via NetworkManager (nmcli), pour emmener le dashboard ailleurs (vacances, partage de connexion
 * du téléphone). Le conteneur exécute le nmcli de l'hôte en entrant dans ses espaces de noms (nsenter sur le
 * PID 1) : il faut "pid: host" dans docker-compose.yml, en plus du mode privilégié déjà présent.
 */

const IFACE = 'wlan0';

function nmcli(args, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    execFile('nsenter', ['-t', '1', '-m', '-u', '-n', '-i', '--', 'nmcli', ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().replace(/^Error: /, '')));
      else resolve(stdout);
    });
  });
}

/** Lignes du mode terse de nmcli : champs séparés par ":", avec "\:" pour un deux-points littéral. */
const terse = (out) =>
  out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/(?<!\\):/).map((f) => f.replace(/\\:/g, ':').replace(/\\\\/g, '\\')));

export function startWifi(store) {
  let busy = false;
  store.set('wifi', { available: null, networks: [], saved: [], current: null, scanning: false, connecting: null });

  const status = async () => {
    try {
      const [dev, conns] = await Promise.all([
        nmcli(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']),
        nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show'])
      ]);
      const wl = terse(dev).find(([d, type]) => d === IFACE || type === 'wifi');
      const saved = terse(conns).filter(([, t]) => t === '802-11-wireless').map(([n]) => n);
      store.update('wifi', { available: Boolean(wl), current: wl && wl[2] === 'connected' ? wl[3] : null, saved, error: null });
    } catch (err) {
      store.update('wifi', { available: false, error: err.message });
    }
  };

  const scan = async () => {
    if (busy) return;
    busy = true;
    store.update('wifi', { scanning: true });
    try {
      const out = await nmcli(['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes'], 30_000);
      const best = new Map();
      for (const [inUse, ssid, signal, security] of terse(out)) {
        if (!ssid || !ssid.trim()) continue; // réseau masqué
        const n = { ssid, signal: Number(signal) || 0, secure: Boolean(security && security !== '--'), active: inUse === '*' };
        const prev = best.get(ssid);
        if (!prev || n.signal > prev.signal || n.active) best.set(ssid, { ...n, active: n.active || prev?.active });
      }
      const networks = [...best.values()].sort((a, b) => b.active - a.active || b.signal - a.signal);
      store.update('wifi', { networks, scanning: false, scannedAt: Date.now() });
    } catch (err) {
      store.update('wifi', { scanning: false, error: err.message });
    } finally {
      busy = false;
      status();
    }
  };

  store.register('wifi:scan', () => scan());

  store.register('wifi:connect', async ({ ssid, password }) => {
    if (typeof ssid !== 'string' || !ssid) return;
    store.update('wifi', { connecting: ssid, error: null });
    const saved = store.get('wifi')?.saved || [];
    try {
      if (!password && saved.includes(ssid)) {
        await nmcli(['connection', 'up', 'id', ssid], 45_000);
      } else {
        // Réseau déjà enregistré avec un nouveau mot de passe : on repart de zéro.
        if (password && saved.includes(ssid)) await nmcli(['connection', 'delete', 'id', ssid]).catch(() => {});
        await nmcli(['device', 'wifi', 'connect', ssid, ...(password ? ['password', String(password)] : []), 'ifname', IFACE], 45_000);
      }
      store.toast('success', 'WI-FI CONNECTÉ', ssid);
    } catch (err) {
      const wrongPw = /secrets were required|802-1x|password|Secrets/i.test(err.message);
      store.toast('warn', 'WI-FI : ÉCHEC', wrongPw ? `${ssid} · mot de passe incorrect ?` : `${ssid} · ${err.message}`, { sticky: true });
      // Un essai raté peut laisser un profil inutilisable : on le supprime pour pouvoir retaper le mot de passe.
      if (wrongPw && !saved.includes(ssid)) await nmcli(['connection', 'delete', 'id', ssid]).catch(() => {});
    } finally {
      store.update('wifi', { connecting: null });
      status();
    }
  });

  store.register('wifi:forget', async ({ ssid }) => {
    if (typeof ssid !== 'string' || !ssid) return;
    try {
      await nmcli(['connection', 'delete', 'id', ssid]);
      store.toast('info', 'WI-FI', `${ssid} oublié`);
    } catch (err) {
      store.toast('warn', 'WI-FI', err.message);
    }
    status();
  });

  status();
  setInterval(status, 30_000);
}
