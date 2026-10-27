// Codes météo WMO (Open-Meteo) : libellé français + famille d'icône.
const CODES = {
  0: ['Ciel dégagé', 'clear'],
  1: ['Peu nuageux', 'partly'],
  2: ['Partiellement nuageux', 'partly'],
  3: ['Couvert', 'cloud'],
  45: ['Brouillard', 'fog'],
  48: ['Brouillard givrant', 'fog'],
  51: ['Bruine légère', 'rain'],
  53: ['Bruine', 'rain'],
  55: ['Bruine dense', 'rain'],
  56: ['Bruine verglaçante', 'rain'],
  57: ['Bruine verglaçante', 'rain'],
  61: ['Pluie faible', 'rain'],
  63: ['Pluie', 'rain'],
  65: ['Forte pluie', 'rain'],
  66: ['Pluie verglaçante', 'rain'],
  67: ['Pluie verglaçante', 'rain'],
  71: ['Neige faible', 'snow'],
  73: ['Neige', 'snow'],
  75: ['Forte neige', 'snow'],
  77: ['Grains de neige', 'snow'],
  80: ['Averses', 'rain'],
  81: ['Averses', 'rain'],
  82: ['Fortes averses', 'rain'],
  85: ['Averses de neige', 'snow'],
  86: ['Averses de neige', 'snow'],
  95: ['Orage', 'storm'],
  96: ['Orage avec grêle', 'storm'],
  99: ['Orage avec grêle', 'storm']
};

export const wxLabel = (code) => CODES[code]?.[0] || '--';
export const wxKind = (code) => CODES[code]?.[1] || 'cloud';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const dir8 = (deg) => (deg === null || deg === undefined ? '' : DIRS[Math.round(deg / 45) % 8]);

/** Indice européen de qualité de l'air (AEE). */
export function aqiLevel(v) {
  if (v === null || v === undefined) return { text: '--', tone: 'dim' };
  if (v <= 20) return { text: 'Bon', tone: 'prim' };
  if (v <= 40) return { text: 'Moyen', tone: 'prim' };
  if (v <= 60) return { text: 'Dégradé', tone: 'sec' };
  if (v <= 80) return { text: 'Mauvais', tone: 'danger' };
  if (v <= 100) return { text: 'Très mauvais', tone: 'danger' };
  return { text: 'Extrêmement mauvais', tone: 'danger' };
}

/** Niveaux de pollen indicatifs (grains/m³), les seuils officiels varient selon l'espèce. */
export function pollenLevel(v) {
  if (v === null || v === undefined) return { text: '--', tone: 'dim' };
  if (v < 1) return { text: 'aucun', tone: 'dim' };
  if (v < 10) return { text: 'faible', tone: 'prim' };
  if (v < 50) return { text: 'modéré', tone: 'sec' };
  if (v < 200) return { text: 'élevé', tone: 'danger' };
  return { text: 'très élevé', tone: 'danger' };
}
