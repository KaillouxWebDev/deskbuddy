import React, { useEffect, useRef, useState } from 'react';
import { dec1, deg, int, signed } from '../lib/format.js';

const RANGES = [15, 30, 60, 100];
const R = 180; // rayon utile en px (anneau extérieur)
const C = 202; // centre du radar
const MAIN_FREQS = ['TWR', 'AFIS', 'A/A', 'APP', 'A/D'];

const mhz = (f) => f.toFixed(3);
const polar = (dist, brg, range) => {
  const k = (dist / range) * R;
  const rad = (brg * Math.PI) / 180;
  return { x: C + k * Math.sin(rad), y: C - k * Math.cos(rad) };
};

function PlaneIcon({ track, kind }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${track ?? 0}deg)` }}>
      {kind === 'heli' ? (
        <>
          {/* rotor, fuselage, poutre de queue et rotor arrière, vus de dessus */}
          <path d="M3.5 3.5 L20.5 20.5 M20.5 3.5 L3.5 20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="12" cy="10.5" rx="3.6" ry="5" fill="currentColor" />
          <path d="M12 15 L12 22 M9.5 21.5 L14.5 21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <path
          d="M12 2 L13.6 9 L21 13 L21 15 L13.6 13 L13.2 19 L15.5 20.8 L15.5 22 L12 21 L8.5 22 L8.5 20.8 L10.8 19 L10.4 13 L3 15 L3 13 L10.4 9 Z"
          fill="currentColor"
        />
      )}
    </svg>
  );
}

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };



function AntennaIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="9" r="1.4" fill="currentColor" />
      <path d="M12 10.5 V21 M8.5 21 H15.5" />
      <path d="M8.8 5.8 A4.5 4.5 0 0 0 8.8 12.2 M15.2 5.8 A4.5 4.5 0 0 1 15.2 12.2" />
      <path d="M5.9 3 A8.5 8.5 0 0 0 5.9 15 M18.1 3 A8.5 8.5 0 0 1 18.1 15" />
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

function RouteLine({ route }) {
  if (!route?.from && !route?.to) return null;
  const end = (a) => (
    <span className="route-end">
      <span className="route-code">{a?.iata || a?.icao || '???'}</span>
      <span className="route-city ellipsis">{a?.city || a?.name || ''}</span>
    </span>
  );
  return (
    <div className="route">
      {end(route.from)}
      <svg width="18" height="12" viewBox="0 0 18 12" aria-label="vers">
        <path d="M1 6 H16 M11 1 L16 6 L11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {end(route.to)}
    </div>
  );
}

/** Si le vol part ou arrive d'un aéroport proche, ses fréquences principales, prêtes à régler sur la radio. */
function FreqHint({ route, airports }) {
  const codes = [route?.from?.icao, route?.to?.icao].filter(Boolean);
  const ap = airports.find((a) => codes.includes(a.icao));
  if (!ap) return null;
  const main = ap.freqs.filter((f) => MAIN_FREQS.includes(f.type)).slice(0, 2);
  if (!main.length) return null;
  return (
    <div className="freq-hint">
      <span className="dim">{ap.icao}</span>
      {main.map((f) => (
        <span key={f.type + f.mhz}>
          {f.type} <b>{mhz(f.mhz)}</b>
        </span>
      ))}
    </div>
  );
}

function FreqPanel({ airports, highlight }) {
  const list = airports.list || [];
  return (
    <section className="col" aria-label="Fréquences des aéroports proches">
      <div className="caption">FRÉQUENCES · AÉROPORTS PROCHES</div>
      <div className="list-scroll">
        {list.map((a) => (
          <div key={a.icao} className={`card airport${highlight.includes(a.icao) ? ' is-hl' : ''}`}>
            <div className="airport-head">
              <span className="airport-code">{a.icao}</span>
              <span className="small soft ellipsis">{a.name}</span>
              <span className="small dim airport-dist">{dec1(a.dist)} km</span>
            </div>
            <div className="freqs">
              {a.freqs.map((f) => (
                <div key={f.type + f.mhz} className="freq" title={f.label}>
                  <span className="label">{f.type}</span>
                  <span className="freq-mhz">{mhz(f.mhz)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!list.length && (
          <p className="empty">{airports.error || (airports.loading ? 'Téléchargement de la base des fréquences…' : 'Aucun aéroport trouvé.')}</p>
        )}
      </div>
      <div className="small dim">Source OurAirports · à vérifier sur les cartes VAC du SIA</div>
    </section>
  );
}

/*
 * Balayage façon vrai radar : un avion n'est redessiné que quand le faisceau passe sur lui, puis son écho
 * s'estompe jusqu'au tour suivant (rémanence du phosphore). Un tour = une interrogation des données.
 */
const TICK_MS = 100;

/** Faisceau en phase avec l'horloge (au nord à chaque multiple de la période). Le décalage n'est fixé
 *  qu'au montage : le modifier ensuite décalerait l'animation en cours. */
function Sweep({ period }) {
  const [delay] = useState(() => Date.now() % period);
  return <div className="sweep" aria-hidden="true" style={{ animationDuration: `${period}ms`, animationDelay: `-${delay}ms` }} />;
}
const sweepAngle = (t, period) => ((t % period) / period) * 360;
const crossed = (from, to, brg) => (from <= to ? brg > from && brg <= to : brg > from || brg <= to);

function usePhosphor(list, period, enabled) {
  const latest = useRef(list);
  latest.current = list;
  const [painted, setPainted] = useState(() => new Map(list.map((a) => [a.id, { ...a, paintedAt: Date.now() }])));

  useEffect(() => {
    if (!enabled) return undefined;
    let prev = sweepAngle(Date.now(), period);
    const id = setInterval(() => {
      const now = Date.now();
      const cur = sweepAngle(now, period);
      setPainted((old) => {
        let next = null;
        const live = new Map(latest.current.map((a) => [a.id, a]));
        for (const a of live.values()) {
          if (crossed(prev, cur, a.bearing)) (next ??= new Map(old)).set(a.id, { ...a, paintedAt: now });
        }
        // Avion disparu : son écho n'est plus rafraîchi et s'efface au passage suivant du faisceau.
        for (const [pid, p] of old) {
          if (!live.has(pid) && crossed(prev, cur, p.bearing)) (next ??= new Map(old)).delete(pid);
        }
        return next || old;
      });
      prev = cur;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [period, enabled]);

  if (!enabled) return list.map((a) => ({ ...a, paintedAt: 0 }));
  return [...painted.values()];
}

export default function Radar({ state, settings, send, now }) {
  const [lockedId, setLockedId] = useState(null);
  const [showFreq, setShowFreq] = useState(false);
  const autoId = useRef(null);
  const aircraft = state.aircraft || { list: [] };
  const airports = state.airports || { list: [] };
  const range = RANGES.includes(settings.rangeKm) ? settings.rangeKm : 60;
  const list = (aircraft.list || []).filter((a) => a.dist <= range);
  const period = aircraft.pollMs || 6000;
  const blips = usePhosphor(aircraft.list || [], period, settings.sweep).filter((b) => b.dist <= range);

  /*
   * Sélection : un appareil touché reste « fixé » tant qu'il est dans la zone du radar.
   * Sinon, mode auto : l'appareil en vol le plus proche. On ne change d'appareil auto que si
   * un autre est plus proche d'au moins 1 km, pour éviter que la fiche clignote entre deux avions.
   */
  const locked = lockedId ? list.find((a) => a.id === lockedId) : null;
  useEffect(() => {
    if (lockedId && !locked) setLockedId(null);
  }, [lockedId, locked]);
  const airborne = list.filter((a) => !a.onGround);
  const nearest = airborne[0] || list[0] || null;
  let auto = list.find((a) => a.id === autoId.current && !a.onGround) || null;
  if (!auto || (nearest && nearest.dist < auto.dist - 1)) auto = nearest;
  autoId.current = auto?.id ?? null;
  const sel = locked || auto;
  const isLocked = Boolean(locked);
  const q = range / 4;
  const ring = (n) => (Number.isInteger(q * n) ? q * n : dec1(q * n));
  const highlight = [sel?.route?.from?.icao, sel?.route?.to?.icao].filter(Boolean);

  const zoom = (dir) => {
    const i = RANGES.indexOf(range);
    send('settings:update', { rangeKm: RANGES[Math.min(RANGES.length - 1, Math.max(0, i + dir))] });
  };
  // Toucher l'appareil déjà fixé le libère (retour au mode auto).
  const pick = (id) => {
    setLockedId((cur) => (cur === id ? null : id));
    setShowFreq(false);
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
          {(airports.list || [])
            .filter((a) => a.dist <= range)
            .map((a) => {
              const { x, y } = polar(a.dist, a.bearing, range);
              const hl = highlight.includes(a.icao);
              return (
                <g key={a.icao} className={`radar-airport${hl ? ' is-hl' : ''}`}>
                  <rect x={x - 3.5} y={y - 3.5} width="7" height="7" />
                  <text x={x + 7} y={y + 12}>{a.icao}</text>
                </g>
              );
            })}
          <circle cx={C} cy={C} r="4" className="radar-home" />
        </svg>
        {settings.sweep && <Sweep period={period} key={period} />}
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="ring-label" style={{ top: C - 45 * n - 2 }}>
            {ring(n)}
          </span>
        ))}

        {blips.map((a) => {
          const { x, y } = polar(a.dist, a.bearing, range);
          const isSel = sel && a.id === sel.id;
          return (
            <button
              key={`${a.id}-${a.paintedAt}`}
              type="button"
              className={`plane${isSel ? ' is-sel' : ''}${a.emergency ? ' is-emergency' : ''}${a.onGround ? ' is-ground' : ''}${a.paintedAt ? ' is-echo' : ''}`}
              style={{ left: Math.round(x - 22), top: Math.round(y - 22), animationDuration: `${period}ms` }}
              onClick={() => pick(a.id)}
              aria-label={`${a.callsign}, ${a.airline || 'compagnie inconnue'}, ${a.onGround ? 'au sol' : `${int(a.alt)} pieds`}`}
            >
              <PlaneIcon track={a.track} kind={a.kind} />
              {(isSel || (!a.onGround && a.dist / range > 0.22)) && <span className="plane-label">{a.callsign}</span>}
            </button>
          );
        })}

        <div className="range-label">{range} km</div>
        <div className="zoom">
          <button type="button" className="square-btn" aria-label="Dézoomer" onClick={() => zoom(1)} disabled={range === RANGES[RANGES.length - 1]}>−</button>
          <button type="button" className="square-btn" aria-label="Zoomer" onClick={() => zoom(-1)} disabled={range === RANGES[0]}>+</button>
        </div>
        <div className="radar-foot">
          {list.length} avion{list.length > 1 ? 's' : ''}
          {aircraft.source ? ` · ${aircraft.source}` : ''}
        </div>
        <div className="layer-toggles">
          <button
            type="button"
            className={`square-btn${showFreq ? ' is-on' : ''}`}
            aria-pressed={showFreq}
            aria-label="Fréquences des aéroports proches"
            onClick={() => setShowFreq((v) => !v)}
          >
            <AntennaIcon />
          </button>
        </div>
      </section>

      {showFreq ? (
        <FreqPanel airports={airports} highlight={highlight} />
      ) : (
        <section className="col" aria-label="Données du vol sélectionné">
          <div className="card flight-card">
            <div className="card-head">
              <span className="caption">
                DONNÉES VOL{' '}
                {sel && (
                  <span className={`mode-chip${isLocked ? ' is-locked' : ''}`}>{isLocked ? 'FIXÉ' : 'AUTO · PLUS PROCHE'}</span>
                )}
              </span>
              {sel && <span className="sec small">{sel.reg || sel.squawk || ''}</span>}
            </div>
            {sel ? (
              <>
                <div className="callsign">{sel.callsign}</div>
                <RouteLine route={sel.route} />
                <div className="subline ellipsis">
                  {sel.airline || 'Compagnie inconnue'}
                  {sel.type ? ` · ${sel.type}` : ''}
                  {sel.kind === 'heli' ? ' · hélicoptère' : ''}
                  {sel.emergency ? ` · URGENCE ${sel.emergency.toUpperCase()}` : ''}
                </div>
                <FreqHint route={sel.route} airports={airports.list || []} />
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
                <button key={a.id} type="button" className={`row${sel && a.id === sel.id ? ' is-sel' : ''}`} onClick={() => pick(a.id)}>
                  <span>{a.callsign}</span>
                  <span className="right">{a.onGround ? 'SOL' : `${int(a.alt)} ft`}</span>
                  <span className="right">{dec1(a.dist)} km</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
