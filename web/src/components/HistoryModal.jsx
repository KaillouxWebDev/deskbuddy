import React from 'react';
import { CloseIcon } from './Toasts.jsx';

const pad = (n) => String(n).padStart(2, '0');
const when = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const duration = (min) => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)} h ${pad(min % 60)}` : `${min} min`);
const euros = (v) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const grams = (g) => `${g.toLocaleString('fr-FR', { maximumFractionDigits: g < 10 ? 1 : 0 })} g`;
// Anciennes entrées (avant la v0.11) : pas de nom ni de statut, on les déduit.
const nameOf = (e) => e.name || (e.file || 'Sans nom').replace(/(\.gcode)?\.3mf$/i, '');

/** Les 10 dernières impressions : modèle, date, durée, filaments utilisés, poids et coût. */
export default function HistoryModal({ history, onClose }) {
  const list = history || [];
  const totalG = list.reduce((s, e) => s + (e.grams || 0), 0);
  const totalCost = list.reduce((s, e) => s + (e.cost || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card stock-card" role="dialog" aria-labelledby="hist-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="hist-title" className="callsign">HISTORIQUE</h1>
            <div className="small soft">
              {list.length ? `${list.length} dernière${list.length > 1 ? 's' : ''} impression${list.length > 1 ? 's' : ''} · ${grams(totalG)} · ${euros(totalCost)}` : 'Aucune impression enregistrée'}
            </div>
          </div>
          <button type="button" className="square-btn" aria-label="Fermer l'historique" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="hist-list">
          {list.map((e) => {
            const cancelled = e.status ? e.status === 'annulée' : e.fraction < 1;
            return (
              <div key={e.at} className={`hist-row${cancelled ? ' is-cancelled' : ''}`}>
                <div className="hist-when">
                  <span>{when(e.start || e.at)}</span>
                  <span className="small dim">{duration(e.durationMin)}</span>
                </div>
                <div className="hist-main">
                  <div className="hist-name ellipsis">
                    {nameOf(e)}
                    {cancelled && <span className="hist-tag">annulée à {Math.round((e.fraction || 0) * 100)} %</span>}
                  </div>
                  <div className="hist-fils">
                    {(e.filaments || []).map((f, i) => (
                      <span key={i} className="hist-fil">
                        <span className="swatch" style={{ background: f.color || 'transparent' }} />
                        {f.known ? `${f.material} ${f.colorName.toLowerCase()}` : `${f.material || 'filament'} non reconnu`}
                        <span className="dim"> · {grams(f.grams)}</span>
                      </span>
                    ))}
                    {!(e.filaments || []).length && <span className="small dim">{e.grams == null ? 'consommation inconnue' : 'détail des bobines non enregistré'}</span>}
                  </div>
                </div>
                <div className="hist-cost">
                  <span className="hist-euros">{e.cost != null ? euros(e.cost) : '--'}</span>
                  <span className="small dim">{e.grams != null ? grams(e.grams) : '? g'}</span>
                </div>
              </div>
            );
          })}
          {!list.length && <p className="empty">Les impressions apparaîtront ici à la fin de chacune, avec le filament utilisé et leur coût.</p>}
        </div>
      </div>
    </div>
  );
}
