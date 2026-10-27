/*
 * Thèmes du dashboard. Un thème définit sa palette (sombre, et claire s'il en a une), ses polices,
 * ses effets d'écran (classe CSS html[data-theme=...]) et son écran de démarrage.
 * Base et Modern sont les seuls dont on choisit les couleurs primaire et secondaire.
 * Les thèmes sont des ambiances inspirées d'œuvres : aucun logo ni personnage n'est repris.
 */

// Base : chaque couleur a une version néon (fond sombre) et une version foncée lisible sur fond clair.
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

// Modern : pastels, assombris en mode clair pour rester lisibles sur fond blanc.
export const PASTELS = [
  { id: 'menthe', name: 'Menthe', dark: '#8fe3c6', light: '#2c9a76' },
  { id: 'lavande', name: 'Lavande', dark: '#b9a8ff', light: '#6650c9' },
  { id: 'peche', name: 'Pêche', dark: '#ffc3a3', light: '#d4703f' },
  { id: 'ciel', name: 'Ciel', dark: '#9ed4ff', light: '#2f7fc1' },
  { id: 'rose', name: 'Rose', dark: '#ffb3d1', light: '#c24a80' }
];

const BASE_DARK = { bg: '#050807', panel: '#08110c', soft: '#0d1c13', line: '#1d3a28', dim: '#8aa598', danger: '#ff6b6b', 'danger-bg': '#140606' };
const BASE_LIGHT = { bg: '#eef1ee', panel: '#ffffff', soft: '#e3e9e4', line: '#c4cfc7', dim: '#4a5a52', danger: '#b3261e', 'danger-bg': '#fdeceb' };
const FONTS_BASE = { display: "'Share Tech Mono', ui-monospace, monospace", mono: "'IBM Plex Mono', ui-monospace, monospace" };
const pick = (list, id) => list.find((c) => c.id === id) || list[0];

/*
 * boot : lignes de l'écran de démarrage (textes originaux). « > » au début = ligne tapée,
 * « OK » à la fin = statut affiché à droite.
 */
export const THEMES = [
  {
    id: 'base',
    name: 'Base',
    light: true,
    custom: 'base',
    fonts: FONTS_BASE,
    palette: (mode, s) => {
      const p = pick(PRIMARIES, s.primary);
      const q = pick(SECONDARIES, s.secondary);
      return { ...(mode === 'dark' ? BASE_DARK : BASE_LIGHT), prim: p[mode], sec: q[mode] };
    },
    boot: ['DESKBUDDY', 'Réveil des capteurs', 'Antenne ADS-B · OK', 'Satellites en orbite · OK', 'Imprimante sur le réseau · OK', 'Balayage radar lancé']
  },
  {
    id: 'modern',
    name: 'Modern',
    light: true,
    custom: 'modern',
    fonts: { display: "'Nunito', system-ui, sans-serif", mono: "'Nunito', system-ui, sans-serif" },
    palette: (mode, s) => {
      const p = pick(PASTELS, s.modernPrimary);
      const q = pick(PASTELS, s.modernSecondary);
      return mode === 'dark'
        ? { bg: '#15161c', panel: '#1d1f27', soft: '#262833', line: '#333645', dim: '#9a9fb3', danger: '#ff8f8f', 'danger-bg': '#2a1717', 'text-soft': '#d9dbe6', prim: p.dark, sec: q.dark }
        : { bg: '#f3f2f7', panel: '#ffffff', soft: '#efeef5', line: '#e0deea', dim: '#6c6a7e', danger: '#c9483f', 'danger-bg': '#fbe9e7', 'text-soft': '#3b3a4a', prim: p.light, sec: q.light };
    },
    boot: ['Bonjour', 'Préparation de ton bureau…', 'Tout est prêt']
  },
  {
    id: 'abri',
    name: 'Abri',
    mono: true,
    fonts: { display: "'VT323', monospace", mono: "'VT323', monospace" },
    palette: () => ({ bg: '#04140a', panel: '#06190d', soft: '#0a2614', line: '#16502c', dim: '#4fbf7f', prim: '#1aff80', sec: '#b9ffd8', danger: '#ffffff', 'danger-bg': '#0a2614', 'text-soft': '#8dffc0' }),
    boot: [
      'TERMINAL PERSONNEL DE SURVIE · MODÈLE DB-3',
      '> test mémoire ........ 65536 Ko',
      '> capteurs extérieurs .. OK',
      '> air respirable ....... OK',
      '> moral du résident .... STABLE',
      'BIENVENUE, RÉSIDENT. RESTEZ À L\'ABRI.'
    ]
  },
  {
    id: 'abri-ambre',
    name: 'Abri ambre',
    mono: true,
    fonts: { display: "'VT323', monospace", mono: "'VT323', monospace" },
    palette: () => ({ bg: '#140b02', panel: '#1a0f03', soft: '#261605', line: '#5a3608', dim: '#c98a2e', prim: '#ffb642', sec: '#ffe2b0', danger: '#ffffff', 'danger-bg': '#261605', 'text-soft': '#ffd08a' }),
    boot: [
      'TERMINAL PERSONNEL DE SURVIE · MODÈLE DB-3A',
      '> test mémoire ........ 65536 Ko',
      '> radiations ........... FAIBLES',
      '> réserves d\'eau ....... 92 %',
      '> horloge du désert .... SYNCHRONISÉE',
      'BONNE JOURNÉE DANS LES TERRES DÉSOLÉES.'
    ]
  },
  {
    id: 'macrodata',
    name: 'Macrodata',
    light: true,
    fonts: { display: "'Space Mono', ui-monospace, monospace", mono: "'Space Grotesk', system-ui, sans-serif" },
    palette: (mode) =>
      mode === 'dark'
        ? { bg: '#020c18', panel: '#04182b', soft: '#08243d', line: '#1d4a6b', dim: '#7fa9c4', prim: '#bfe9ff', sec: '#7ee0c3', danger: '#ff8a7a', 'danger-bg': '#1a0b10', 'text-soft': '#d6f1ff' }
        : { bg: '#e9ece6', panel: '#f7f8f4', soft: '#e1e6de', line: '#b8c4b6', dim: '#55665c', prim: '#1f5d4c', sec: '#2b6f9e', danger: '#a8322a', 'danger-bg': '#f6e4e1', 'text-soft': '#2f4a40' },
    boot: [
      'RAFFINAGE DES DONNÉES',
      'Certains chiffres vous attendent.',
      'Fichier du jour : BUREAU',
      'Progression trimestrielle · 100 %',
      'Merci pour votre travail. Il est important.'
    ]
  },
  {
    id: 'fsociety',
    name: 'fsociety',
    fonts: { display: "'JetBrains Mono', ui-monospace, monospace", mono: "'JetBrains Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#000000', panel: '#070707', soft: '#121212', line: '#2b2b2b', dim: '#8c8c8c', prim: '#ececec', sec: '#ff2b2b', danger: '#ff2b2b', 'danger-bg': '#1a0000', 'text-soft': '#bdbdbd' }),
    boot: [
      '> ssh root@deskbuddy',
      '> sudo ./reveil --discret',
      '[+] contournement de l\'ennui ......... fait',
      '[+] ouverture des flux ............... fait',
      '[+] traces effacées .................. fait',
      'à toi de jouer.'
    ]
  },
  {
    id: 'nuit-rouge',
    name: 'Nuit rouge',
    mono: true,
    fonts: FONTS_BASE,
    palette: () => ({ bg: '#000000', panel: '#070000', soft: '#120202', line: '#3a0808', dim: '#8f2a2a', prim: '#e0301e', sec: '#ff7a5c', danger: '#ffb199', 'danger-bg': '#220404', 'text-soft': '#c44a3a' }),
    boot: ['MODE NUIT', 'Éclairage rouge : ta vision nocturne est préservée', 'Laisse 20 minutes à tes yeux pour s\'habituer au noir', 'Bonne observation']
  },
  {
    id: 'neon-2049',
    name: 'Néon 2049',
    fonts: { display: "'Orbitron', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#0b0420', panel: '#12062e', soft: '#1b0a42', line: '#4a1f86', dim: '#a58bd6', prim: '#ff3fd8', sec: '#2ff3ff', danger: '#ffdd55', 'danger-bg': '#2a1a00', 'text-soft': '#ffc2f3' }),
    boot: ['SYSTÈME EN LIGNE', 'Pluie acide sur la ville · 14 mm', 'Fréquences de la mégapole · accordées', 'Bienvenue dans la nuit']
  }
];

export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const DEFAULT_SETTINGS = {
  themeId: 'base',
  theme: 'dark', // mode : dark | light | auto (pour les thèmes qui ont une version claire)
  primary: 'vert',
  secondary: 'ambre',
  modernPrimary: 'menthe',
  modernSecondary: 'peche',
  brightness: 80,
  sleepEnabled: true,
  sleepFrom: '23:00',
  sleepTo: '07:00',
  rangeKm: 60,
  sweep: true,
  rain: false,
  lightning: false,
  wxRangeKm: 120,
  filamentPriceKg: 10,
  kwhPrice: 0.1871,
  printerWatts: 100
};

/** Mode "auto" : clair de 8 h à 19 h, sombre le reste du temps. Thème sans version claire : toujours sombre. */
export function resolveMode(settings, date) {
  if (!themeOf(settings.themeId).light) return 'dark';
  if (settings.theme !== 'auto') return settings.theme;
  const h = date.getHours();
  return h >= 8 && h < 19 ? 'light' : 'dark';
}

export function themeVars(settings, mode) {
  const t = themeOf(settings.themeId);
  return { ...t.palette(mode, settings), display: t.fonts.display, mono: t.fonts.mono };
}

export function applyTheme(vars, theme) {
  const root = document.documentElement;
  // Variables fixées par un thème précédent (text-soft...) : on les retire avant d'appliquer le nouveau.
  for (const k of ['text-soft']) root.style.removeProperty(`--${k}`);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
  root.dataset.theme = theme.id;
  if (theme.mono) root.dataset.monoAlerts = '';
  else delete root.dataset.monoAlerts;
}
