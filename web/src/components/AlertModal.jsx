import React from 'react';
import { hhmm } from '../lib/format.js';

export default function AlertModal({ alert, printer, send }) {
  const since = hhmm(new Date(alert.since));
  const slot = printer?.activeSlot && printer.activeSlot !== 'ext' ? printer.trays?.find((t) => t.slot === printer.activeSlot) : null;
  return (
    <div className="modal-backdrop">
      <div className="alert-card pulse-danger" role="alertdialog" aria-labelledby="alert-title" aria-describedby="alert-text">
        <div className="alert-head">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 L22 20 L2 20 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 9 L12 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1.2" fill="currentColor" />
          </svg>
          <span>ALERTE IMPRIMANTE · {since}</span>
        </div>
        <h1 id="alert-title" className="alert-title">{alert.paused ? 'IMPRESSION EN PAUSE' : 'MESSAGE IMPRIMANTE'}</h1>
        <p id="alert-text" className="alert-text">
          L'imprimante signale un problème{alert.paused ? ' et a mis l\'impression en pause' : ''}
          {printer?.percent !== null && printer?.percent !== undefined ? ` à ${printer.percent} %` : ''}. Regarde son écran
          pour le détail ; cette alerte disparaîtra d'elle-même une fois le problème résolu.
        </p>
        <div className="alert-meta">
          <span>Code : {alert.codes.join(', ')}</span>
          {slot && <span>Slot AMS : {slot.slot} ({slot.type || '?'})</span>}
        </div>
        <div className="alert-actions">
          <button type="button" className="btn btn-danger" onClick={() => send('printer:ack')}>VU</button>
          <button type="button" className="btn btn-danger-ghost" onClick={() => send('printer:snooze', { minutes: 5 })}>
            RAPPEL DANS 5 MIN
          </button>
        </div>
      </div>
    </div>
  );
}
