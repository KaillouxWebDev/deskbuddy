const nf = new Intl.NumberFormat('fr-FR');
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const int = (n) => (n === null || n === undefined ? '--' : nf.format(Math.round(n)));
export const dec1 = (n) => (n === null || n === undefined ? '--' : nf1.format(n));
export const pad = (n, len = 2) => String(n).padStart(len, '0');
export const deg = (n) => (n === null || n === undefined ? '---' : pad(Math.round(n) % 360, 3));
export const signed = (n) => (n === null || n === undefined ? '--' : `${n > 0 ? '+' : ''}${nf.format(Math.round(n))}`);

export function hhmm(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function duration(min) {
  if (min === null || min === undefined) return '--';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${pad(m)} min` : `${m} min`;
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const body = `${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return h ? `${h}:${body}` : body;
}

export function chrono(ms) {
  const t = Math.floor(ms / 100);
  return `${pad(Math.floor(t / 600))}:${pad(Math.floor(t / 10) % 60)}.${t % 10}`;
}

export function uptime(s) {
  if (!s && s !== 0) return '--';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} j ${pad(h)} h` : `${h} h ${pad(m)} min`;
}
