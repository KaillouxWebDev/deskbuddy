import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BACKLIGHT_ROOT = '/sys/class/backlight';

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return null;
  }
};
const write = (p, v) => {
  try {
    fs.writeFileSync(p, String(v));
    return true;
  } catch {
    return false;
  }
};

function findBacklight() {
  try {
    const dir = fs.readdirSync(BACKLIGHT_ROOT)[0];
    return dir ? path.join(BACKLIGHT_ROOT, dir) : null;
  } catch {
    return null;
  }
}

/** "23:00" à "07:00" passe minuit : on gère les deux cas. */
export function inWindow(hm, from, to) {
  if (from === to) return false;
  return from < to ? hm >= from && hm < to : hm >= from || hm < to;
}

function localIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('172.17.')) return i.address;
    }
  }
  return null;
}

function memory() {
  const info = read('/proc/meminfo');
  if (!info) return { totalMb: Math.round(os.totalmem() / 1e6), usedMb: Math.round((os.totalmem() - os.freemem()) / 1e6) };
  const val = (k) => Number((info.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')) || [])[1] || 0) / 1024;
  const total = val('MemTotal');
  return { totalMb: Math.round(total), usedMb: Math.round(total - val('MemAvailable')) };
}

function disk(dir) {
  try {
    const s = fs.statfsSync(dir);
    const total = s.blocks * s.bsize;
    return { totalGb: +(total / 1e9).toFixed(1), usedGb: +((total - s.bavail * s.bsize) / 1e9).toFixed(1) };
  } catch {
    return null;
  }
}

export function startSystem(store, { dataDir }) {
  /* ---------- Écran : rétroéclairage, veille, luminosité ---------- */
  const bl = findBacklight();
  const max = bl ? Number(read(path.join(bl, 'max_brightness'))) || 255 : 0;
  const blPower = bl ? path.join(bl, 'bl_power') : null;

  const applyBrightness = (pct) => (bl ? write(path.join(bl, 'brightness'), Math.max(1, Math.round((max * pct) / 100))) : false);

  const setScreen = (on) => {
    if (!bl) return false;
    if (blPower && fs.existsSync(blPower)) {
      const ok = write(blPower, on ? 0 : 1);
      if (on) applyBrightness(store.get('settings').brightness);
      return ok;
    }
    return on ? applyBrightness(store.get('settings').brightness) : write(path.join(bl, 'brightness'), 0);
  };

  const writable = bl ? applyBrightness(store.get('settings').brightness) : false;
  store.set('screen', { asleep: false, reason: null, backlight: Boolean(bl), writable });
  if (!bl) console.log('[screen] pas de rétroéclairage pilotable (normal hors Pi) : la veille sera simulée à l\'écran');
  else if (!writable) console.warn('[screen] rétroéclairage trouvé mais pas modifiable : le conteneur doit être "privileged"');

  const sleep = (reason) => {
    setScreen(false);
    store.update('screen', { asleep: true, reason });
  };
  const wake = () => {
    setScreen(true);
    store.update('screen', { asleep: false, reason: null });
  };

  store.register('screen:sleep', () => sleep('manual'));
  store.register('screen:wake', () => wake());

  let lastBrightness = store.get('settings').brightness;
  store.on('patch', (key, value) => {
    if (key !== 'settings' || value.brightness === lastBrightness) return;
    lastBrightness = value.brightness;
    if (!store.get('screen').asleep) applyBrightness(value.brightness);
  });

  /* Veille nocturne : on n'agit qu'aux changements de plage, pour qu'un réveil manuel la nuit tienne. */
  let wasNight = null;
  const checkSchedule = () => {
    const s = store.get('settings');
    if (!s.sleepEnabled) {
      wasNight = null;
      return;
    }
    const d = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const night = inWindow(hm, s.sleepFrom, s.sleepTo);
    if (night !== wasNight) {
      if (night) sleep('night');
      else if (wasNight !== null) wake();
    }
    wasNight = night;
  };
  checkSchedule();
  setInterval(checkSchedule, 20_000);

  /* ---------- Stats du Pi ---------- */
  const collect = () => {
    const temp = Number(read('/sys/class/thermal/thermal_zone0/temp'));
    store.set('system', {
      hostname: os.hostname(),
      ip: localIp(),
      cpuTemp: Number.isFinite(temp) && temp > 0 ? Math.round(temp / 1000) : null,
      load: Math.round((os.loadavg()[0] / os.cpus().length) * 100),
      memory: memory(),
      disk: disk(dataDir),
      uptimeS: Math.round(os.uptime())
    });
  };
  collect();
  setInterval(collect, 5_000);
}
