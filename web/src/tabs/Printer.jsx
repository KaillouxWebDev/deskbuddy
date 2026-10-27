import React, { useState } from 'react';
import StockModal from '../components/StockModal.jsx';
import { duration, hhmm, int } from '../lib/format.js';

const STATE = {
  RUNNING: { label: 'IMPRESSION', tone: 'sec' },
  PREPARE: { label: 'PRÉPARATION', tone: 'sec' },
  SLICING: { label: 'PRÉPARATION', tone: 'sec' },
  PAUSE: { label: 'EN PAUSE', tone: 'danger' },
  FAILED: { label: 'ÉCHEC', tone: 'danger' },
  FINISH: { label: 'TERMINÉ', tone: 'prim' },
  IDLE: { label: 'EN ATTENTE', tone: 'dim' }
};

function Temp({ label, value, target }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="card temp">
      <span className="label">{label}</span>
      <span className="value big">
        {int(value)}
        <span className="unit">°C</span> <span className="dim small">/ {target ? int(target) : '--'}</span>
      </span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Notice({ title, children }) {
  return (
    <div className="notice">
      <span className="caption">{title}</span>
      <p>{children}</p>
    </div>
  );
}

export default function Printer({ state, now, send }) {
  const [showStock, setShowStock] = useState(false);
  const p = state.printer;
  if (!p) return <Notice title="IMPRIMANTE">Connexion au serveur…</Notice>;
  if (p.configured === false) {
    return (
      <Notice title="IMPRIMANTE NON CONFIGURÉE">
        Renseigne BAMBU_HOST, BAMBU_SERIAL et BAMBU_ACCESS_CODE dans le fichier .env du Pi, puis redémarre le conteneur.
      </Notice>
    );
  }
  if (!p.connected && p.state === undefined) {
    return <Notice title="IMPRIMANTE">Connexion à l'A1…{p.error ? ` (${p.error})` : ''}</Notice>;
  }

  const st = STATE[p.state] || { label: p.state, tone: 'dim' };
  const active = ['RUNNING', 'PAUSE', 'PREPARE', 'SLICING'].includes(p.state);
  const pct = p.percent ?? 0;
  const circ = 2 * Math.PI * 96;
  const end = p.remainingMin ? hhmm(new Date(now + p.remainingMin * 60_000)) : null;
  const slots = p.trays?.length ? p.trays : p.external ? [{ slot: 'ext', ...p.external }] : [];

  return (
    <div className="split">
      <section className="card progress-card" aria-label="Progression">
        <div className="card-head">
          <span className="caption">PROGRESSION</span>
          <span className={`small tone-${st.tone}`}>● {st.label}{p.mock ? ' (démo)' : ''}</span>
        </div>
        <div className="ring">
          <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`Progression ${pct} %`}>
            <circle cx="110" cy="110" r="96" className="ring-track" />
            <circle
              cx="110"
              cy="110"
              r="96"
              className={`ring-value tone-stroke-${p.state === 'PAUSE' || p.state === 'FAILED' ? 'danger' : 'prim'}`}
              strokeDasharray={`${(circ * pct) / 100} ${circ}`}
              transform="rotate(-90 110 110)"
            />
          </svg>
          <div className="ring-center">
            <span className="ring-pct">{active || p.state === 'FINISH' ? `${pct}%` : '--'}</span>
            {p.totalLayers ? <span className="small soft">couche {p.layer ?? 0} / {p.totalLayers}</span> : null}
          </div>
        </div>
        <div className={`remaining tone-${p.state === 'PAUSE' ? 'danger' : 'sec'}`}>
          {p.state === 'RUNNING' ? duration(p.remainingMin) : p.state === 'PAUSE' ? 'en pause' : st.label.toLowerCase()}
        </div>
        <div className="print-meta">
          <div className="small soft center ellipsis">{p.file || 'aucun fichier'}</div>
          {p.state === 'RUNNING' && end && <div className="small sec center">fin estimée vers {end}</div>}
          {p.job?.estimate && (
            <div className="small dim center">
              ~{p.job.estimate.grams} g{p.job.spool ? ` ${p.job.spool.toLowerCase()}` : ''} · ~{p.job.estimate.cost.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </div>
          )}
        </div>
      </section>

      <section className="col" aria-label="Températures et filaments">
        <div className="grid2 gap12">
          <Temp label="BUSE" value={p.nozzle} target={p.nozzleTarget} />
          <Temp label="PLATEAU" value={p.bed} target={p.bedTarget} />
        </div>

        <div className="card">
          <div className="card-head">
            <span className="label">{p.trays?.length ? 'AMS LITE' : 'BOBINE'}</span>
            <button type="button" className="link-btn" onClick={() => setShowStock(true)}>
              STOCK · {(state.spools || []).filter((s) => !s.archived).length} bobines
            </button>
          </div>
          <div className="ams">
            {slots.map((t) => {
              const on = t.slot === p.activeSlot;
              return (
                <div key={t.slot} className={`tray${on ? ' is-active' : ''}`}>
                  <span className="swatch" style={{ background: t.color || 'transparent' }} />
                  <span className="small">{t.type || 'Vide'}{on ? ' ▶' : ''}</span>
                  {(() => {
                    const sp = (state.spools || []).find((s) => s.uuid === t.uuid);
                    if (!sp) return null;
                    if (sp.needsLevel) return <span className="small sec">niveau ?</span>;
                    return <span className={`small ${sp.pct <= 15 ? 'danger' : 'dim'}`}>~{sp.pct}%</span>;
                  })()}
                </div>
              );
            })}
            {!slots.length && <span className="small dim">Aucune bobine détectée</span>}
          </div>
        </div>

        <div className="card journal">
          <div className="grid3">
            <div><div className="label">VITESSE</div><div className="value">{p.speed || '--'}</div></div>
            <div><div className="label">VENTILO</div><div className="value">{p.fan ?? '--'}{p.fan !== null && p.fan !== undefined ? '%' : ''}</div></div>
            <div><div className="label">WI-FI</div><div className="value">{p.wifi || '--'}</div></div>
          </div>
          <div className="journal-list">
            {(p.journal || []).slice(0, 3).map((j) => (
              <span key={j.at + j.text} className={`small tone-${j.level === 'error' ? 'danger' : j.level === 'success' ? 'prim' : 'soft'} ellipsis`}>
                {hhmm(new Date(j.at))} · {j.text}
              </span>
            ))}
          </div>
        </div>
      </section>
      {showStock && <StockModal spools={state.spools || []} send={send} onClose={() => setShowStock(false)} />}
    </div>
  );
}
