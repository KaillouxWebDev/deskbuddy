import fs from 'node:fs';
import { writeJson } from '../lib/fsx.js';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | auto
  primary: 'vert',
  secondary: 'ambre',
  brightness: 80, // %
  sleepEnabled: true,
  sleepFrom: '23:00',
  sleepTo: '07:00',
  rangeKm: 60,
  sweep: true,
  rain: false,
  lightning: false,
  wxRangeKm: 120,
  filamentPriceKg: 10, // € le kilo
  kwhPrice: 0.1871, // € TTC le kWh
  printerWatts: 100 // consommation moyenne de l'A1 en impression
};

const ENUMS = {
  theme: ['dark', 'light', 'auto'],
  primary: ['vert', 'cyan', 'ambre', 'rose'],
  secondary: ['ambre', 'rouge', 'cyan', 'violet'],
  rangeKm: [15, 30, 60, 100],
  wxRangeKm: [30, 60, 120, 200]
};

function sanitize(key, value) {
  if (!(key in DEFAULT_SETTINGS)) return undefined;
  if (typeof value !== typeof DEFAULT_SETTINGS[key]) return undefined;
  if (ENUMS[key] && !ENUMS[key].includes(value)) return undefined;
  if (key === 'brightness') return Math.min(100, Math.max(10, Math.round(value)));
  if ((key === 'sleepFrom' || key === 'sleepTo') && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  return value;
}

export function startSettings(store, { dataDir }) {
  const file = path.join(dataDir, 'settings.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* premier démarrage */
  }

  const settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(saved)) {
    const clean = sanitize(k, v);
    if (clean !== undefined) settings[k] = clean;
  }
  store.set('settings', settings);

  let timer;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        writeJson(file, store.get('settings'), true);
      } catch (err) {
        console.error('[settings] écriture impossible', err.message);
      }
    }, 500);
  };

  store.register('settings:update', (patch) => {
    const next = { ...store.get('settings') };
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      const clean = sanitize(k, v);
      if (clean !== undefined && next[k] !== clean) {
        next[k] = clean;
        changed = true;
      }
    }
    if (changed) {
      store.set('settings', next);
      save();
    }
  });
}
