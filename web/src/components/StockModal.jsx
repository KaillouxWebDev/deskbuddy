import React, { useState } from 'react';
import { CloseIcon } from './Toasts.jsx';

const LEVELS = [
  ['100', 1],
  ['75', 0.75],
  ['50', 0.5],
  ['25', 0.25],
  ['0', 0]
];

/* Toucher une bobine ouvre son réglage : niveaux rapides en %, ajustement au gramme, archivage. */

const kg = (g) => (g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg` : `${g} g`);

/** Stock de filament : toutes les bobines Bambu déjà passées dans l'AMS, avec leur dernière quantité connue. */
export default function StockModal({ spools, send, onClose }) {
  const [showArchived, setShowArchived] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(0);
  const openEdit = (s) => {
    setDraft(Math.round(s.grams));
    setEditId(s.uuid);
  };
  const active = spools.filter((s) => !s.archived);
  const archived = spools.filter((s) => s.archived);
  const list = showArchived ? archived : active;
  const total = Math.round(active.reduce((sum, s) => sum + (s.grams || 0), 0));

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
            const low = !s.needsLevel && s.pct <= 15;
            const editing = editId === s.uuid;
            return (
              <div key={s.uuid} className={`spool${low ? ' is-low' : ''}${s.slot ? ' is-loaded' : ''}${s.needsLevel ? ' needs-level' : ''}${editing ? ' is-editing' : ''}`}>
                <button type="button" className="spool-top" onClick={() => (editing ? setEditId(null) : openEdit(s))} aria-expanded={editing}>
                  <span className="swatch" style={{ background: s.color || 'transparent' }} />
                  <span className="spool-name">
                    <span className="ellipsis">{s.colorName}</span>
                    <span className="small dim ellipsis">{s.material}</span>
                  </span>
                  {s.slot && <span className="spool-slot">AMS {s.slot}</span>}
                </button>
                {s.needsLevel && !editing ? (
                  <div className="level-pick">
                    <span className="small sec">Niveau de départ (%) ?</span>
                    <div className="level-btns">
                      {LEVELS.map(([label, f]) => (
                        <button key={label} type="button" onClick={() => send('spool:level', { uuid: s.uuid, fraction: f })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : editing ? (
                  <div className="level-pick">
                    <div className="level-btns">
                      {LEVELS.map(([label, f]) => (
                        <button key={label} type="button" onClick={() => setDraft(Math.round(s.weightG * f))}>
                          {label}%
                        </button>
                      ))}
                    </div>
                    <div className="grams-step">
                      <button type="button" aria-label="Retirer 50 g" onClick={() => setDraft((g) => Math.max(0, g - 50))}>−50</button>
                      <button type="button" aria-label="Retirer 10 g" onClick={() => setDraft((g) => Math.max(0, g - 10))}>−10</button>
                      <span className="grams-val">{draft} g</span>
                      <button type="button" aria-label="Ajouter 10 g" onClick={() => setDraft((g) => g + 10)}>+10</button>
                      <button type="button" aria-label="Ajouter 50 g" onClick={() => setDraft((g) => g + 50)}>+50</button>
                    </div>
                    <div className="spool-btns">
                      <button type="button" className="spool-btn" onClick={() => setEditId(null)}>ANNULER</button>
                      <button
                        type="button"
                        className="spool-btn is-primary"
                        onClick={() => {
                          send('spool:grams', { uuid: s.uuid, grams: draft });
                          setEditId(null);
                        }}
                      >
                        VALIDER
                      </button>
                    </div>
                    {!s.slot && (
                      <button type="button" className="spool-btn" onClick={() => { send('spool:archive', { uuid: s.uuid, archived: !s.archived }); setEditId(null); }}>
                        {s.archived ? 'REMETTRE EN STOCK' : 'ARCHIVER CETTE BOBINE'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bar thin"><div style={{ width: `${s.pct}%` }} /></div>
                    <div className="spool-foot">
                      <span className={low ? 'danger' : ''}>~{kg(Math.round(s.grams))}</span>
                      <span className="small dim">{s.pct} %</span>
                    </div>
                  </>
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
