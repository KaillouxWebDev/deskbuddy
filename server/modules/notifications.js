import path from 'node:path';
import { writeJson, readJson } from '../lib/fsx.js';

/*
 * Journal des notifications et des erreurs, consultable à l'écran avec le texte complet.
 * - notifications : tout ce qui s'est affiché en bandeau (toasts)
 * - journal technique : les erreurs et avertissements des modules (console.error / console.warn),
 *   qui jusque-là n'étaient visibles qu'en SSH avec docker logs
 * Les messages identiques et rapprochés sont regroupés (« ×12 ») pour qu'une erreur répétée toutes les
 * minutes ne noie pas le reste. Conservé sur la carte SD : survit aux redémarrages.
 */

const MAX = 120;
const GROUP_MS = 30 * 60_000;

export function startNotifications(store, { dataDir }) {
  const file = path.join(dataDir, 'notifications.json');
  const saved = readJson(file, {});
  let items = Array.isArray(saved.items) ? saved.items.slice(0, MAX) : [];
  let unread = Number(saved.unread) || 0;
  const origError = console.error.bind(console);

  let saveTimer;
  const publish = () => {
    store.set('notifications', { items, unread });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        writeJson(file, { items, unread });
      } catch (err) {
        origError('[notifications] écriture impossible', err.message);
      }
    }, 2000);
  };

  let seq = 0;
  const add = (entry) => {
    const now = Date.now();
    const same = items.find((i) => i.kind === entry.kind && i.title === entry.title && i.text === entry.text && now - i.at < GROUP_MS);
    if (same) {
      same.count = (same.count || 1) + 1;
      same.at = now;
      items = [same, ...items.filter((i) => i !== same)];
    } else {
      items = [{ id: `${now}-${seq++}`, at: now, count: 1, ...entry }, ...items].slice(0, MAX);
    }
    if (entry.kind === 'toast') unread += 1;
    publish();
  };

  store.on('event', (e) => {
    if (e.kind === 'toast') add({ kind: 'toast', level: e.level || 'info', title: e.title || '', text: e.text || '' });
  });

  // Erreurs des modules : « [weather] fetch failed ... » -> titre « weather », texte complet.
  const fmt = (args) =>
    args
      .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
      .join(' ')
      .slice(0, 2000);
  const capture = (level, orig) => (...args) => {
    orig(...args);
    try {
      const msg = fmt(args);
      const m = msg.match(/^\[([^\]]{1,30})\]\s*([\s\S]*)$/);
      add({ kind: 'log', level, title: m ? m[1] : 'serveur', text: m ? m[2] : msg });
    } catch {
      /* le journal ne doit jamais casser le serveur */
    }
  };
  console.error = capture('error', origError);
  console.warn = capture('warn', console.warn.bind(console));

  store.register('notif:seen', () => {
    if (!unread) return;
    unread = 0;
    publish();
  });
  store.register('notif:clear', ({ kind }) => {
    items = kind ? items.filter((i) => i.kind !== kind) : [];
    if (!kind || kind === 'toast') unread = 0;
    publish();
  });

  publish();
}
