import { host } from '../lib/host.js';

/*
 * Wi-Fi du Pi (NetworkManager), pour emmener le dashboard ailleurs (vacances, partage de connexion du
 * téléphone). Les commandes passent par le service hôte, qui vérifie chaque paramètre.
 */

// Version du service hôte attendue par ce dashboard (HOSTD_VERSION dans scripts/hostd.py).
const HOSTD_EXPECTED = 4;
// Profils générés par netplan (Raspberry Pi OS récent) : « netplan-wlan0-MonReseau » désigne le réseau « MonReseau ».
const ssidOf = (name) => (typeof name === 'string' ? name.replace(/^netplan-[^-]+-(?=.)/, '') : name);

export function startWifi(store) {
  let busy = false;
  store.set('wifi', { available: null, networks: [], saved: [], current: null, scanning: false, connecting: null });

  const status = async () => {
    try {
      const st = await host('wifi.status');
      store.update('wifi', {
        ...st,
        current: st.current ? ssidOf(st.current) : null,
        saved: [...new Set((st.saved || []).map(ssidOf))].sort(),
        error: null
      });
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
    store.update('wifi', { connecting: ssid, needPassword: null, error: null });
    try {
      await host('wifi.connect', password ? { ssid, password: String(password) } : { ssid });
      store.toast('success', 'WI-FI CONNECTÉ', ssid);
    } catch (err) {
      if (/mot de passe requis/.test(err.message)) {
        // Mot de passe absent ou plus valable : l'écran ouvre directement le clavier.
        store.update('wifi', { needPassword: ssid });
        store.toast('warn', 'WI-FI', `${ssid} · mot de passe à ressaisir`);
      } else if (/mot de passe refusé/.test(err.message)) {
        store.update('wifi', { needPassword: ssid });
        store.toast('warn', 'WI-FI : ÉCHEC', `${ssid} · mot de passe refusé par la box`, { sticky: true });
      } else {
        // Le réseau reste enregistré : un échec vient souvent d'un signal faible ou d'un partage de connexion endormi.
        store.toast('warn', 'WI-FI : ÉCHEC', `${ssid} · ${err.message}`, { sticky: true });
      }
    } finally {
      store.update('wifi', { connecting: null });
      status();
    }
  });

  store.register('wifi:prompted', () => store.update('wifi', { needPassword: null }));

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

  // Le service hôte (root) est mis à jour par scripts/update.sh avec sudo. S'il est resté sur une ancienne
  // version, le Wi-Fi se comporte mal sans raison visible : on le signale à l'écran.
  let warned = false;
  const checkHost = async () => {
    let v = 0;
    try {
      v = Number(await host('version', {}, 5000)) || 0;
    } catch (err) {
      if (/absent|pas de réponse/.test(err.message)) return; // hors Pi, ou service arrêté : déjà signalé ailleurs
    }
    if (v < HOSTD_EXPECTED && !warned) {
      warned = true;
      store.toast('warn', 'SERVICE HÔTE PAS À JOUR', `version ${v || 'ancienne'} au lieu de ${HOSTD_EXPECTED} · sur le Pi : cd deskbuddy && ./scripts/update.sh`, { sticky: true });
    }
    if (v >= HOSTD_EXPECTED) warned = false;
  };

  status();
  setInterval(status, 30_000);
  setTimeout(checkHost, 20_000);
  setInterval(checkHost, 15 * 60_000);
}
