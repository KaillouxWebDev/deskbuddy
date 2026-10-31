import React from 'react';

/*
 * Icônes des onglets : un seul jeu pour tous les thèmes (même grille de 24, même trait de 1,8),
 * seule la couleur suit le thème. Ainsi rien ne se décale d'un thème à l'autre.
 */

const S = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

const ICONS = {
  radar: (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 L18.4 5.6" />
      <circle cx="15.6" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  weather: (
    <svg {...S}>
      <path d="M8.2 6.1 A4 4 0 0 1 15.4 8.4" />
      <path d="M11.5 2.5 V3.6 M5.4 5 L6.2 5.8 M3.5 10.5 H4.6 M17.6 5 L16.8 5.8" />
      <path d="M7 19.5 H17.5 A3.5 3.5 0 0 0 17.2 12.5 A5 5 0 0 0 7.6 13.6 A3 3 0 0 0 7 19.5 Z" />
    </svg>
  ),
  sky: (
    <svg {...S}>
      <circle cx="12" cy="12" r="5" />
      <ellipse cx="12" cy="12" rx="10.2" ry="3.4" transform="rotate(-24 12 12)" />
      <circle cx="19.5" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  printer: (
    <svg {...S}>
      <path d="M4 21 V3.5 H20 V21" />
      <path d="M3 21 H21" />
      <path d="M4 7.5 H20" />
      <path d="M10 7.5 V10 L12 12.2 L14 10 V7.5" />
      <rect x="9.5" y="15.5" width="5" height="3" />
    </svg>
  ),
  clock: (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7 V12 L15.5 14" />
    </svg>
  ),
  cyber: (
    <svg {...S}>
      <path d="M12 2.8 L19.5 5.6 V11.2 C19.5 16 16.3 19.4 12 21.2 C7.7 19.4 4.5 16 4.5 11.2 V5.6 Z" />
      <circle cx="12" cy="10.6" r="2" />
      <path d="M12 12.6 V15.6" />
    </svg>
  )
};

export default function TabIcon({ id }) {
  return ICONS[id] || null;
}
