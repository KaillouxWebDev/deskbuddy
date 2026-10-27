import React, { useState } from 'react';
import { dec1, deg, int, signed } from '../lib/format.js';

const RANGES = [15, 30, 60, 100];
const R = 180; // rayon utile en px (anneau extérieur)
const C = 202; // centre du radar

function PlaneIcon({ track }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${track ?? 0}deg)` }}>
      <path
        d="M12 2 L13.6 9 L21 13 L21 15 L13.6 13 L13.2 19 L15.5 20.8 L15.5 22 L12 21 L8.5 22 L8.5 20.8 L10.8 19 L10.4 13 L3 15 L3 13 L10.4 9 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Field({ label, value, unit }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

export default function Radar({ state, settings, send }) {
  const [selectedId, setSelectedId] = useState(null);
  const aircraft = state.aircraft || { list: [] };
  const range = RANGES.includes(settings.rangeKm) ? settings.rangeKm : 60;
  const list = (aircraft.list || []).filter((a) => a.dist <= range);
  const sel = list.find((a) => a.id === selectedId) || list[0] || null;
  const q = range / 4;
  const ring = (n) => (Number.isInteger(q * n) ? q * n : dec1(q * n));

  const zoom = (dir) => {
    const i = RANGES.indexOf(range);
    send('settings:update', { rangeKm: RANGES[Math.min(RANGES.length - 1, Math.max(0, i + dir))] });
  };

  return (
    <div className="split">
      <section className="radar" aria-label="Radar">
        <svg className="radar-grid" width="404" height="404" viewBox="0 0 404 404" role="img" aria-label="Écran radar centré sur le domicile">
          <circle cx={C} cy={C} r="200" className="radar-disc" />
          {[45, 90, 135].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} className="radar-ring" />
          ))}
          <circle cx={C} cy={C} r="180" className="radar-ring radar-ring-outer" />
          <line x1={C} y1="2" x2={C} y2="402" className="radar-axis" />
          <line x1="2" y1={C} x2="402" y2={C} className="radar-axis" />
          <line x1="60.6" y1="60.6" x2="343.4" y2="343.4" className="radar-diag" />
          <line x1="343.4" y1="60.6" x2="60.6" y2="343.4" className="radar-diag" />
          <text x={C} y="16" textAnchor="middle" className="radar-card">N</text>
          <text x="392" y="207" textAnchor="middle" className="radar-card">E</text>
          <text x={C} y="398" textAnchor="middle" className="radar-card">S</text>
          <text x="12" y="207" textAnchor="middle" className="radar-card">O</text>
          <circle cx={C} cy={C} r="4" className="radar-home" />
        </svg>
        {settings.sweep && <div className="sweep" aria-hidden="true" />}
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="ring-label" style={{ top: C - 45 * n - 2 }}>
            {ring(n)}
          </span>
        ))}

        {list.map((a) => {
          const k = (a.dist / range) * R;
          const rad = (a.bearing * Math.PI) / 180;
          const isSel = sel && a.id === sel.id;
          return (
            <button
              key={a.id}
              type="button"
              className={`plane${isSel ? ' is-sel' : ''}${a.emergency ? ' is-emergency' : ''}`}
              style={{ left: Math.round(C + k * Math.sin(rad) - 22), top: Math.round(C - k * Math.cos(rad) - 22) }}
              onClick={() => setSelectedId(a.id)}
              aria-label={`${a.callsign}, ${a.airline || 'compagnie inconnue'}, ${a.onGround ? 'au sol' : `${int(a.alt)} pieds`}`}
            >
              <PlaneIcon track={a.track} />
              {(isSel || a.dist / range > 0.22) && <span className="plane-label">{a.callsign}</span>}
            </button>
          );
        })}

        <div className="range-label">{range} km</div>
        <div className="zoom">
          <button type="button" className="square-btn" aria-label="Zoomer" onClick={() => zoom(-1)} disabled={range === RANGES[0]}>+</button>
          <button type="button" className="square-btn" aria-label="Dézoomer" onClick={() => zoom(1)} disabled={range === RANGES[RANGES.length - 1]}>−</button>
        </div>
        <div className="radar-foot">{list.length} avion{list.length > 1 ? 's' : ''}</div>
      </section>

      <section className="col" aria-label="Données du vol sélectionné">
        <div className="card flight-card">
          <div className="card-head">
            <span className="caption">DONNÉES VOL</span>
            {sel && <span className="sec small">{sel.reg || sel.squawk || ''}</span>}
          </div>
          {sel ? (
            <>
              <div className="callsign">{sel.callsign}</div>
              <div className="subline">
                {sel.airline || 'Compagnie inconnue'}
                {sel.type ? ` · ${sel.type}` : ''}
                {sel.emergency ? ` · URGENCE ${sel.emergency.toUpperCase()}` : ''}
              </div>
              <div className="grid2">
                <Field label="ALTITUDE" value={sel.onGround ? 'SOL' : int(sel.alt)} unit={sel.onGround ? null : ' ft'} />
                <Field label="VITESSE" value={int(sel.speed)} unit=" km/h" />
                <Field label="CAP" value={deg(sel.track)} unit="°" />
                <Field label="VARIO" value={signed(sel.vs)} unit=" ft/min" />
                <Field label="DISTANCE" value={dec1(sel.dist)} unit=" km" />
                <Field label="RELÈVEMENT" value={deg(sel.bearing)} unit="°" />
              </div>
            </>
          ) : (
            <p className="empty">
              {aircraft.error || (aircraft.updatedAt ? `Aucun avion dans un rayon de ${range} km.` : 'Recherche des avions…')}
            </p>
          )}
        </div>

        <div className="list-block">
          <div className="caption">
            À PROXIMITÉ{aircraft.error && list.length ? <span className="danger"> · {aircraft.error}</span> : null}
          </div>
          <div className="list-scroll">
            {list.map((a) => (
              <button key={a.id} type="button" className={`row${sel && a.id === sel.id ? ' is-sel' : ''}`} onClick={() => setSelectedId(a.id)}>
                <span>{a.callsign}</span>
                <span className="right">{a.onGround ? 'SOL' : `${int(a.alt)} ft`}</span>
                <span className="right">{dec1(a.dist)} km</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
