import React, { useState } from 'react';
import { hhmm } from '../lib/format.js';
import { CloseIcon } from './Toasts.jsx';

const mhz = (f) => (f.range ? f.range : f.down.toFixed(3));

/** Fiche pratique des satellites suivis : rôle, intérêt pour l'écoute, matériel, fréquences, orbite. */
export default function SatInfoModal({ catalog, passes, initialId, onClose }) {
  const [id, setId] = useState(initialId ?? catalog[0]?.id);
  const sat = catalog.find((s) => s.id === id) || catalog[0];
  const nextPass = (satId) => passes.find((p) => p.satId === satId && p.los > Date.now());
  if (!sat) return null;
  const np = nextPass(sat.id);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card" role="dialog" aria-labelledby="sat-info-title" onClick={(e) => e.stopPropagation()}>
        <nav className="info-list" aria-label="Satellites">
          <span className="caption">SATELLITES</span>
          {catalog.map((s) => {
            const p = nextPass(s.id);
            return (
              <button key={s.id} type="button" className={`info-item${s.id === sat.id ? ' is-sel' : ''}`} onClick={() => setId(s.id)}>
                <span>{s.name}</span>
                <span className="small dim">{p ? (p.aos <= Date.now() ? 'en vue' : hhmm(new Date(p.aos))) : '--'}</span>
              </button>
            );
          })}
        </nav>

        <div className="info-body">
          <div className="info-head">
            <div>
              <h1 id="sat-info-title" className="callsign">{sat.name}</h1>
              <div className="small soft">
                {sat.fullName} · {sat.kind}
              </div>
            </div>
            <button type="button" className="square-btn" aria-label="Fermer la fiche" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="info-facts">
            <div><span className="label">OPÉRATEUR</span><span>{sat.operator}</span></div>
            <div><span className="label">LANCÉ EN</span><span>{sat.launched}</span></div>
            {sat.orbit && (
              <>
                <div>
                  <span className="label">ALTITUDE</span>
                  <span>{sat.orbit.perigeeKm === sat.orbit.apogeeKm ? `${sat.orbit.perigeeKm} km` : `${sat.orbit.perigeeKm} à ${sat.orbit.apogeeKm} km`}</span>
                </div>
                <div><span className="label">TOUR DE LA TERRE</span><span>{Math.round(sat.orbit.periodMin)} min</span></div>
                <div><span className="label">INCLINAISON</span><span>{sat.orbit.inclination}°</span></div>
              </>
            )}
            <div><span className="label">PROCHAIN PASSAGE</span><span>{np ? `${hhmm(new Date(np.aos))} · max ${np.maxEl}°` : 'aucun sous 24 h'}</span></div>
          </div>

          <section>
            <span className="label">À QUOI IL SERT</span>
            <p>{sat.role}</p>
          </section>
          <section>
            <span className="label">POUR TOI</span>
            <p>{sat.forYou}</p>
          </section>
          <section>
            <span className="label">MATÉRIEL</span>
            <p>{sat.gear}</p>
          </section>
          <section>
            <span className="label">FRÉQUENCES</span>
            {sat.freqs.map((f) => (
              <div key={f.label} className="info-freq">
                <span className="soft">{f.label}</span>
                <span className="info-freq-val">{mhz(f)} MHz</span>
                {f.up && <span className="small dim">montée {f.up}</span>}
              </div>
            ))}
          </section>
          <p className="small dim">Statut à vérifier avant une écoute : amsat.org/status</p>
        </div>
      </div>
    </div>
  );
}
