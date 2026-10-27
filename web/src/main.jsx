import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/share-tech-mono';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import App from './App.jsx';

// En mode kiosque (?kiosk=1) : pas de curseur, pas de menu contextuel.
if (new URLSearchParams(location.search).has('kiosk')) {
  document.documentElement.classList.add('kiosk');
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

createRoot(document.getElementById('root')).render(<App />);
