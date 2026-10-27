import React, { useState } from 'react';
import { CloseIcon } from './Toasts.jsx';

const kg = (g) => (g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg` : `${g} g`);

/** Stock de filament : toutes les bobines Bambu déjà passées dans l'AMS, avec leur dernière quantité connue. */
export default function StockModal({ spools, send, onClose }) {
  const [showArchived, setShowArchived] = useState(false);
  const active = spools.filter((s) => !s.archived);
  const archived = spools.filter((s) => s.archived);
  const list = showArchived ? archived : active;
  const total = active.reduce((sum, s) => sum + (s.grams || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card stock-card" role="dialog" aria-labelledby="stock-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="stock-title" className="callsign">STOCK FILAMENT</h1>
            <div className="small soft">
              {active.length} bobine{active.length > 1 ? 's' : ''} · environ {kg(total)} au total
            </div>
          </div>
          <div className="stock-actions">
            {archived.length > 0 && (
              <button type="button" className={`btn${showArchived ? ' btn-prim' : ''}`} onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'EN STOCK' : `ARCHIVÉES (${archived.length})`}
              </button>
            )}
            <button type="button" className="square-btn" aria-label="Fermer le stock" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className="stock-grid">
          {list.map((s) => {
            const pct = s.remain ?? 0;
            const low = s.remain !== null && s.remain <= 15;
            return (
              <div key={s.uuid} className={`spool${low ? ' is-low' : ''}${s.slot ? ' is-loaded' : ''}`}>
                <div className="spool-top">
                  <span className="swatch" style={{ background: s.color || 'transparent' }} />
                  <div className="spool-name">
                    <span className="ellipsis">{s.colorName}</span>
                    <span className="small dim ellipsis">{s.material}</span>
                  </div>
                  {s.slot && <span className="spool-slot">AMS {s.slot}</span>}
                </div>
                <div className="bar thin"><div style={{ width: `${pct}%` }} /></div>
                <div className="spool-foot">
                  <span className={low ? 'danger' : ''}>{s.grams !== null ? `~${kg(s.grams)}` : '?'}</span>
                  <span className="small dim">{s.remain !== null ? `${s.remain} %` : 'restant inconnu'}</span>
                </div>
                {!s.slot && (
                  <button type="button" className="spool-btn" onClick={() => send('spool:archive', { uuid: s.uuid, archived: !s.archived })}>
                    {s.archived ? 'REMETTRE EN STOCK' : 'ARCHIVER'}
                  </button>
                )}
              </div>
            );
          })}
          {!list.length && (
            <p className="empty">
              {showArchived
                ? 'Aucune bobine archivée.'
                : "Aucune bobine connue pour l'instant : passe tes bobines Bambu une par une dans l'AMS, elles s'ajoutent toutes seules."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
