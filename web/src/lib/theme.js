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
 * saver : petit message de l'écran de veille (Base n'en a pas).
 * boot : lignes de l'écran de démarrage (textes originaux). « > » au début = ligne tapée,
 * « OK » à la fin = statut affiché à droite.
 */
export const THEMES = [
  {
    id: 'base',
    name: 'Base',
    family: 'perso',
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
    saver: 'Prends soin de toi.',
    name: 'Modern',
    family: 'perso',
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
    saver: "RESTEZ À L'ABRI.",
    name: 'Abri',
    family: 'jeux',
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
    saver: 'LE DÉSERT VEILLE.',
    name: 'Abri ambre',
    family: 'jeux',
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
    saver: 'Votre extérieur se repose.',
    name: 'Macrodata',
    family: 'cinema',
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
    saver: 'ils dorment. pas nous.',
    name: 'fsociety',
    family: 'cinema',
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
    saver: 'Bonne observation.',
    name: 'Nuit rouge',
    family: 'metier',
    mono: true,
    fonts: FONTS_BASE,
    palette: () => ({ bg: '#000000', panel: '#070000', soft: '#120202', line: '#3a0808', dim: '#8f2a2a', prim: '#e0301e', sec: '#ff7a5c', danger: '#ffb199', 'danger-bg': '#220404', 'text-soft': '#c44a3a' }),
    boot: ['MODE NUIT', 'Éclairage rouge : ta vision nocturne est préservée', 'Laisse 20 minutes à tes yeux pour s\'habituer au noir', 'Bonne observation']
  },
  {
    id: 'neon-2049',
    saver: 'La ville ne dort jamais.',
    name: 'Néon 2049',
    family: 'cinema',
    fonts: { display: "'Orbitron', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#0b0420', panel: '#12062e', soft: '#1b0a42', line: '#4a1f86', dim: '#a58bd6', prim: '#ff3fd8', sec: '#2ff3ff', danger: '#ffdd55', 'danger-bg': '#2a1a00', 'text-soft': '#ffc2f3' }),
    boot: ['SYSTÈME EN LIGNE', 'Pluie acide sur la ville · 14 mm', 'Fréquences de la mégapole · accordées', 'Bienvenue dans la nuit']
  },
  /* ---------- Cinéma et séries ---------- */
  {
    id: 'nostromo',
    saver: 'équipage en hypersommeil.',
    name: 'Nostromo',
    family: 'cinema',
    tileFont: "'Major Mono Display', monospace",
    fonts: { display: "'Roboto Mono', ui-monospace, monospace", mono: "'Roboto Mono', ui-monospace, monospace" }, // Major Mono : légendes et onglets seulement (CSS)
    palette: () => ({ bg: '#000a07', panel: '#021410', soft: '#05201a', line: '#11493b', dim: '#4fae92', prim: '#6cffc8', sec: '#e6fff6', danger: '#ff5c4d', 'danger-bg': '#1a0605', 'text-soft': '#a9ffe0' }),
    boot: ['interface de bord en ligne', '> cap vers la terre ........... confirmé', '> équipage en hypersommeil .... 7', '> détecteur de mouvement ...... rien', '> signal inconnu .............. ignoré', 'bonne veille, équipage.']
  },
  {
    id: 'wopr',
    saver: 'PARTIE EN PAUSE.',
    name: 'WOPR',
    family: 'cinema',
    fonts: { display: "'Courier Prime', monospace", mono: "'Courier Prime', monospace" },
    palette: () => ({ bg: '#000814', panel: '#020f24', soft: '#061a38', line: '#123a73', dim: '#6f8fc0', prim: '#e8f1ff', sec: '#4da3ff', danger: '#ff4d4d', 'danger-bg': '#1a0508', 'text-soft': '#b9cff5' }),
    boot: ['CONNEXION ÉTABLIE · 300 BAUDS', '> IDENTIFIANT : DESKBUDDY', '> LISTE DES JEUX ............ DISPONIBLE', '> MORPION · ÉCHECS · RADAR AÉRIEN', 'UNE PETITE PARTIE, PEUT-ÊTRE ?']
  },
  {
    id: 'lcars',
    saver: 'EN ORBITE STANDARD.',
    name: 'LCARS',
    family: 'cinema',
    fonts: { display: "'Antonio', 'Barlow Condensed', sans-serif", mono: "'Antonio', 'Barlow Condensed', sans-serif" },
    palette: () => ({ bg: '#000000', panel: '#000000', soft: '#111118', line: '#9999ff', dim: '#9999cc', prim: '#ff9966', sec: '#cc99cc', danger: '#ff5555', 'danger-bg': '#220000', 'text-soft': '#ffcc99' }),
    boot: ['ORDINATEUR DE BORD · ACCÈS AUTORISÉ', 'Diagnostic de niveau 3 · nominal', 'Senseurs longue portée · actifs', 'Date stellaire · synchronisée', 'Prêt.']
  },
  {
    id: 'grille',
    saver: 'Fin de ligne.',
    name: 'Grille',
    family: 'cinema',
    fonts: { display: "'Rajdhani', sans-serif", mono: "'Rajdhani', sans-serif" },
    palette: () => ({ bg: '#000000', panel: '#020608', soft: '#051116', line: '#0d5c66', dim: '#4fb8c4', prim: '#6ff6ff', sec: '#ffa63d', danger: '#ff4d4d', 'danger-bg': '#1a0505', 'text-soft': '#c4fbff' }),
    boot: ['ENTRÉE DANS LA GRILLE', 'Programme utilisateur · reconnu', 'Disque d\'identité · synchronisé', 'Cycles lumineux · prêts', 'Bienvenue, utilisateur.']
  },
  {
    id: 'pluie-verte',
    saver: 'Suis le lapin blanc.',
    name: 'Pluie verte',
    family: 'cinema',
    bootStyle: 'rain',
    fonts: { display: "'Share Tech Mono', ui-monospace, monospace", mono: "'JetBrains Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#000000', panel: '#000500', soft: '#000f02', line: '#0b3d14', dim: '#1fa33c', prim: '#00ff41', sec: '#b6ffc8', danger: '#ffffff', 'danger-bg': '#002208', 'text-soft': '#7dff9f' }),
    boot: ['SIGNAL ENTRANT', 'Le terrier est plus profond qu\'il n\'y paraît.', 'Suis le flux.', 'Connexion établie.']
  },
  {
    id: 'mission',
    saver: 'Tous les systèmes sont nominaux.',
    name: 'Mission',
    family: 'cinema',
    fonts: { display: "'Barlow Condensed', sans-serif", mono: "'Barlow', system-ui, sans-serif" },
    palette: () => ({ bg: '#0d0f12', panel: '#14171c', soft: '#1c2027', line: '#2c323b', dim: '#8a94a3', prim: '#f2f4f7', sec: '#ff6a13', danger: '#ff4d3d', 'danger-bg': '#1f0c08', 'text-soft': '#c9ced6' }),
    boot: ['CONTRÔLE DE MISSION', 'T-10 · vérifications terminées', 'Télémétrie · nominale', 'Fenêtre de lancement · ouverte', 'Décollage.']
  },
  {
    id: 'cockpit',
    saver: 'Unité en veille. Pilote au repos.',
    name: 'Cockpit',
    family: 'cinema',
    fonts: { display: "'Chakra Petch', sans-serif", mono: "'Chakra Petch', sans-serif" },
    palette: () => ({ bg: '#070b18', panel: '#0c1328', soft: '#121c3a', line: '#2a3d78', dim: '#8fa3d6', prim: '#eef3ff', sec: '#ffd23f', danger: '#ff3b3b', 'danger-bg': '#260808', 'text-soft': '#c7d4ff' }),
    boot: ['SYSTÈME DE PILOTAGE · ACTIVATION', '> synchronisation neuronale ... 98 %', '> réacteur .................... stable', '> armement .................... verrouillé', '> radar tactique .............. en ligne', 'PILOTE RECONNU. LANCEMENT AUTORISÉ.']
  },
  /* ---------- Jeux vidéo ---------- */
  {
    id: 'hev',
    saver: 'Surveillance biométrique active.',
    name: 'HEV',
    family: 'jeux',
    fonts: { display: "'Chakra Petch', sans-serif", mono: "'Chakra Petch', sans-serif" },
    palette: () => ({ bg: '#0d0700', panel: '#150c02', soft: '#221405', line: '#5c3606', dim: '#c4862c', prim: '#ff9b1a', sec: '#ffd28a', danger: '#ff3b2f', 'danger-bg': '#200503', 'text-soft': '#ffc46e' }),
    boot: ['COMBINAISON DE PROTECTION · MISE EN SERVICE', '> surveillance biométrique ... active', '> dosimètre .................. actif', '> module défensif ............ chargé', 'Bienvenue. Bonne journée au labo.']
  },
  {
    id: 'aperture',
    saver: 'Le test reprendra bientôt.',
    name: 'Aperture',
    family: 'jeux',
    only: 'light',
    fonts: { display: "'Barlow', system-ui, sans-serif", mono: "'Barlow', system-ui, sans-serif" },
    palette: () => ({ bg: '#eef0f2', panel: '#ffffff', soft: '#e6e9ec', line: '#cfd5db', dim: '#6b737c', prim: '#1d2228', sec: '#ff8a00', danger: '#d0342c', 'danger-bg': '#fbe7e5', 'text-soft': '#3a4048' }),
    boot: ['CENTRE D\'ESSAIS · OUVERTURE', 'Ce bureau a été inspecté pour votre sécurité.', 'Un gâteau vous attend à la fin du test.', 'Votre participation est très appréciée.', 'Le test peut commencer.']
  },
  {
    id: 'automata',
    saver: 'Unité en mode repos.',
    name: 'Automata',
    family: 'jeux',
    only: 'light',
    fonts: { display: "'Barlow Condensed', sans-serif", mono: "'Barlow', system-ui, sans-serif" },
    palette: () => ({ bg: '#d9d2b8', panel: '#e4ddc4', soft: '#cfc7aa', line: '#a99f80', dim: '#6e6550', prim: '#4a4334', sec: '#9a5f3a', danger: '#8f2a20', 'danger-bg': '#ecd6cc', 'text-soft': '#5c5442' }),
    boot: ['SYSTÈME EN LIGNE', 'Contrôle de l\'unité · nominal', 'Sauvegarde · effectuée', 'Mission du jour · observer', 'Bonne journée, unité.']
  },
  {
    id: 'dmg',
    saver: 'PAUSE',
    name: 'DMG',
    family: 'jeux',
    tileFont: "'Press Start 2P', monospace",
    only: 'light',
    mono: true,
    bootStyle: 'drop',
    fonts: { display: "'VT323', monospace", mono: "'VT323', monospace" }, // police pixel : titres et onglets seulement (CSS)
    palette: () => ({ bg: '#9bbc0f', panel: '#8bac0f', soft: '#7d9c0d', line: '#306230', dim: '#306230', prim: '#0f380f', sec: '#306230', danger: '#0f380f', 'danger-bg': '#8bac0f', 'text-soft': '#1f4a1f' }),
    boot: ['DESKBUDDY', 'APPUIE SUR START']
  },
  {
    id: 'neo-tokyo',
    saver: 'Synchronisation en attente.',
    name: 'Neo Tokyo',
    family: 'jeux',
    fonts: { display: "'DM Serif Display', serif", mono: "'Share Tech Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#070707', panel: '#0d0d0d', soft: '#171717', line: '#3d2a12', dim: '#a88a5c', prim: '#ff7a00', sec: '#5dff3d', danger: '#ff2a2a', 'danger-bg': '#200404', 'text-soft': '#ffb26b' }),
    boot: ['QUARTIER GÉNÉRAL · ALERTE LEVÉE', 'Taux de synchronisation · 41,3 %', 'Champ de protection · stable', 'Ville fortifiée · remontée en surface', 'Bureau opérationnel.']
  },
  /* ---------- Réel et métier ---------- */
  {
    id: 'controle-aerien',
    saver: 'Pas de trafic.',
    name: 'Contrôle aérien',
    family: 'metier',
    fonts: { display: "'Roboto Mono', ui-monospace, monospace", mono: "'Roboto Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#15181b', panel: '#1c2024', soft: '#252a2f', line: '#3a4047', dim: '#8e98a3', prim: '#e9edf1', sec: '#ffd400', danger: '#ff4040', 'danger-bg': '#260a0a', 'text-soft': '#c5ccd3' }),
    boot: ['POSITION RADAR · PRISE DE SERVICE', 'Fréquences · en écoute', 'Strips · à jour', 'Météo des terrains · reçue', 'Bonne vacation.']
  },
  {
    id: 'apollo',
    saver: 'Tout est GO.',
    name: 'Apollo',
    family: 'metier',
    fonts: { display: "'Barlow Condensed', sans-serif", mono: "'Roboto Mono', ui-monospace, monospace" },
    palette: () => ({ bg: '#1e2022', panel: '#2c2f32', soft: '#373a3e', line: '#4a4e53', dim: '#c9bc9c', prim: '#b4ff6b', sec: '#e8dcc0', danger: '#ff5a3c', 'danger-bg': '#2a120c', 'text-soft': '#e8dcc0' }),
    boot: ['SALLE DE CONTRÔLE · OUVERTURE DES CONSOLES', 'Ordinateur de guidage · en ligne', 'Télémétrie · reçue', 'Tour de table · GO', 'Go pour le bureau.']
  }
];

export const FAMILIES = [
  ['perso', 'PERSONNALISABLES'],
  ['cinema', 'CINÉMA ET SÉRIES'],
  ['jeux', 'JEUX VIDÉO'],
  ['metier', 'RÉEL ET MÉTIER']
];
export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const DEFAULT_SETTINGS = {
  themeId: 'base',
  nightThemeId: '',
  screensaver: false,
  screensaverThemeId: '',
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

/** "23:00" à "07:00" passe minuit : on gère les deux cas. */
export function inWindow(hm, from, to) {
  if (!from || !to || from === to) return false;
  return from < to ? hm >= from && hm < to : hm >= from || hm < to;
}

/**
 * Thème affiché maintenant : le thème de nuit pendant les heures de veille nocturne (s'il est choisi),
 * le thème choisi le reste du temps.
 */
export function activeThemeId(settings, date) {
  if (!settings.nightThemeId) return settings.themeId;
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return inWindow(hm, settings.sleepFrom, settings.sleepTo) ? settings.nightThemeId : settings.themeId;
}

/** Mode "auto" : clair de 8 h à 19 h, sombre le reste du temps. Thème sans version claire : toujours sombre. */
export function resolveMode(settings, date, themeId = settings.themeId) {
  const t = themeOf(themeId);
  if (t.only === 'light') return 'light';
  if (!t.light) return 'dark';
  if (settings.theme !== 'auto') return settings.theme;
  const h = date.getHours();
  return h >= 8 && h < 19 ? 'light' : 'dark';
}

export function themeVars(settings, mode, themeId = settings.themeId) {
  const t = themeOf(themeId);
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
