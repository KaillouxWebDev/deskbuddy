import { host } from '../lib/host.js';

/*
 * Wi-Fi du Pi (NetworkManager), pour emmener le dashboard ailleurs (vacances, partage de connexion du
 * téléphone). Les commandes passent par le service hôte, qui vérifie chaque paramètre.
 */

export function startWifi(store) {
  let busy = false;
  store.set('wifi', { available: null, networks: [], saved: [], current: null, scanning: false, connecting: null });

  const status = async () => {
    try {
      store.update('wifi', { ...(await host('wifi.status')), error: null });
    } catch (err) {
      store.update('wifi', { available: false, error: err.message });
    }
  };

  const scan = async () => {
    if (busy) return;
    busy = true;
    store.update('wifi', { scanning: true });
    try {
      store.update('wifi', { networks: await host('wifi.scan'), scanning: false, scannedAt: Date.now() });
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
    try {
      await host('wifi.connect', password ? { ssid, password: String(password) } : { ssid });
      store.toast('success', 'WI-FI CONNECTÉ', ssid);
    } catch (err) {
      const wrongPw = /secrets were required|802-1x|password|mot de passe/i.test(err.message);
      store.toast('warn', 'WI-FI : ÉCHEC', wrongPw ? `${ssid} · mot de passe incorrect ?` : `${ssid} · ${err.message}`, { sticky: true });
    } finally {
      store.update('wifi', { connecting: null });
      status();
    }
  });

  store.register('wifi:forget', async ({ ssid }) => {
    if (typeof ssid !== 'string' || !ssid) return;
    try {
      await host('wifi.forget', { ssid });
      store.toast('info', 'WI-FI', `${ssid} oublié`);
    } catch (err) {
      store.toast('warn', 'WI-FI', err.message);
    }
    status();
  });

  status();
  setInterval(status, 30_000);
}
