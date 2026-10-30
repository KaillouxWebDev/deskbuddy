import React, { useEffect, useState } from 'react';
import { CloseIcon } from './Toasts.jsx';
import Segmented from './Segmented.jsx';

const pad = (n) => String(n).padStart(2, '0');
const when = (ms) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return { day: today ? "aujourd'hui" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const LEVEL = { success: 'OK', info: 'INFO', warn: 'ALERTE', error: 'ERREUR' };

/** Notifications passées et journal technique, avec le texte complet (les bandeaux le coupent). */
export default function NotificationsModal({ data, send, onClose }) {
  const [kind, setKind] = useState('toast');
  const all = data?.items || [];
  const list = all.filter((i) => i.kind === kind);
  const logs = all.filter((i) => i.kind === 'log').length;
  useEffect(() => {
    send('notif:seen');
  }, [send]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card stock-card" role="dialog" aria-labelledby="notif-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="notif-title" className="callsign">NOTIFICATIONS</h1>
            <div className="notif-tabs">
              <Segmented
                label="Type"
                value={kind}
                onChange={setKind}
                items={[
                  ['toast', 'BANDEAUX'],
                  ['log', `JOURNAL TECHNIQUE${logs ? ` (${logs})` : ''}`]
                ]}
              />
            </div>
          </div>
          <div className="stock-actions">
            {list.length > 0 && (
              <button type="button" className="spool-btn" onClick={() => send('notif:clear', { kind })}>
                EFFACER
              </button>
            )}
            <button type="button" className="square-btn" aria-label="Fermer les notifications" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className="hist-list">
          {list.length === 0 && (
            <div className="small dim notif-empty">
              {kind === 'toast' ? 'Aucune notification.' : 'Aucune erreur enregistrée : tout tourne normalement.'}
            </div>
          )}
          {list.map((n) => {
            const w = when(n.at);
            return (
              <div key={n.id} className={`notif-row notif-${n.level}`}>
                <div className="hist-when">
                  <span>{w.time}</span>
                  <span className="small dim">{w.day}</span>
                </div>
                <div className="notif-main">
                  <div className="notif-title">
                    <span className="notif-level">{LEVEL[n.level] || n.level}</span>
                    {n.title}
                    {n.count > 1 && <span className="notif-count">×{n.count}</span>}
                  </div>
                  {n.text && <div className="notif-text">{n.text}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
