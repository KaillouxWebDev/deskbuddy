// Chaque couleur a une version néon (fond sombre) et une version foncée lisible sur fond clair.
export const PRIMARIES = [
  { id: 'vert', name: 'Vert phosphore', dark: '#3dff8a', light: '#0a7a3a' },
  { id: 'cyan', name: 'Cyan', dark: '#4dd6ff', light: '#00698f' },
  { id: 'ambre', name: 'Ambre', dark: '#ffb03b', light: '#8f5300' },
  { id: 'rose', name: 'Rose néon', dark: '#ff6ad5', light: '#a3157f' }
];

export const SECONDARIES = [
  { id: 'ambre', name: 'Ambre', dark: '#ffb03b', light: '#8f5300' },
  { id: 'rouge', name: 'Rouge', dark: '#ff6b6b', light: '#b3261e' },
  { id: 'cyan', name: 'Cyan', dark: '#4dd6ff', light: '#00698f' },
  { id: 'violet', name: 'Violet', dark: '#b88cff', light: '#6a3fc1' }
];

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  primary: 'vert',
  secondary: 'ambre',
  brightness: 80,
  sleepEnabled: true,
  sleepFrom: '23:00',
  sleepTo: '07:00',
  rangeKm: 60,
  sweep: true
};

/** Mode "auto" : clair de 8 h à 19 h, sombre le reste du temps. */
export function resolveMode(theme, date) {
  if (theme !== 'auto') return theme;
  const h = date.getHours();
  return h >= 8 && h < 19 ? 'light' : 'dark';
}

export function themeVars(settings, mode) {
  const dark = mode === 'dark';
  const p = PRIMARIES.find((c) => c.id === settings.primary) || PRIMARIES[0];
  const s = SECONDARIES.find((c) => c.id === settings.secondary) || SECONDARIES[0];
  const base = dark
    ? { bg: '#050807', panel: '#08110c', soft: '#0d1c13', line: '#1d3a28', dim: '#8aa598', danger: '#ff6b6b', 'danger-bg': '#140606' }
    : { bg: '#eef1ee', panel: '#ffffff', soft: '#e3e9e4', line: '#c4cfc7', dim: '#4a5a52', danger: '#b3261e', 'danger-bg': '#fdeceb' };
  return { ...base, prim: dark ? p.dark : p.light, sec: dark ? s.dark : s.light };
}

export function applyTheme(vars) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
}
