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

/* ---------- Calques météo : pluie (RainViewer) et éclairs (Meteosat MTG, EUMETSAT) ---------- */

const EARTH_R = 6378137;
const RAIN_ZOOM = 7; // zoom max de l'API gratuite RainViewer
const toRad = (d) => (d * Math.PI) / 180;

function worldPx(lat, lon, z) {
  const n = 256 * 2 ** z;
  const phi = toRad(lat);
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n };
}

function useRainFrame(enabled) {
  const [frame, setFrame] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const json = await res.json();
        const last = json.radar?.past?.at(-1);
        if (alive && last) setFrame({ host: json.host, path: last.path, time: last.time * 1000 });
      } catch {
        /* on garde l'image précédente */
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);
  return frame;
}

function WeatherLayer({ home, range, rain, lightning, now }) {
  const frame = useRainFrame(rain);
  if (!home || (!rain && !lightning)) return null;
  const halfKm = (range * 200) / 180; // le disque fait 200 px de rayon, l'anneau extérieur 180 px

  let tiles = [];
  if (rain && frame) {
    const h = worldPx(home.lat, home.lon, RAIN_ZOOM);
    const s = ((156.543 * Math.cos(toRad(home.lat))) / 2 ** RAIN_ZOOM) * (200 / halfKm); // px écran par px de tuile
    const span = 200 / s;
    for (let tx = Math.floor((h.x - span) / 256); tx <= Math.floor((h.x + span) / 256); tx++) {
      for (let ty = Math.floor((h.y - span) / 256); ty <= Math.floor((h.y + span) / 256); ty++) {
        tiles.push({ key: `${tx}-${ty}`, left: 200 + (tx * 256 - h.x) * s, top: 200 + (ty * 256 - h.y) * s, size: 256 * s, src: `${frame.host}${frame.path}/256/${RAIN_ZOOM}/${tx}/${ty}/2/1_1.png` });
      }
    }
  }

  let lightningSrc = null;
  if (lightning) {
    const mx = EARTH_R * toRad(home.lon);
    const my = EARTH_R * Math.log(Math.tan(Math.PI / 4 + toRad(home.lat) / 2));
    const half = (halfKm * 1000) / Math.cos(toRad(home.lat));
    const bbox = [mx - half, my - half, mx + half, my + half].map((v) => Math.round(v)).join(',');
    const slot = Math.floor(now / 300_000); // nouvelle image toutes les 5 min
    lightningSrc = `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=${bbox}&width=400&height=400&format=image/png&transparent=true&_=${slot}`;
  }

  return (
    <div className="wx-layer" aria-hidden="true">
      {tiles.map((t) => (
        <img key={t.key} className="wx-rain" src={t.src} alt="" style={{ left: t.left, top: t.top, width: t.size, height: t.size }} />
      ))}
      {lightningSrc && <img className="wx-lightning" src={lightningSrc} alt="" />}
    </div>
  );
}

export default function Radar({ state, settings, send, now }) {
  const [lockedId, setLockedId] = useState(null);
  const [showFreq, setShowFreq] = useState(false);
  const autoId = useRef(null);
  const aircraft = state.aircraft || { list: [] };
  const airports = state.airports || { list: [] };
  const range = RANGES.includes(settings.rangeKm) ? settings.rangeKm : 60;
  const list = (aircraft.list || []).filter((a) => a.dist <= range);

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
        <WeatherLayer home={state.home} range={range} rain={settings.rain} lightning={settings.lightning} now={now} />
        {settings.sweep && <div className="sweep" aria-hidden="true" />}
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="ring-label" style={{ top: C - 45 * n - 2 }}>
            {ring(n)}
          </span>
        ))}

        {list.map((a) => {
          const { x, y } = polar(a.dist, a.bearing, range);
          const isSel = sel && a.id === sel.id;
          return (
            <button
              key={a.id}
              type="button"
              className={`plane${isSel ? ' is-sel' : ''}${a.emergency ? ' is-emergency' : ''}${a.onGround ? ' is-ground' : ''}`}
              style={{ left: Math.round(x - 22), top: Math.round(y - 22) }}
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
          <button type="button" className="square-btn" aria-label="Zoomer" onClick={() => zoom(-1)} disabled={range === RANGES[0]}>+</button>
          <button type="button" className="square-btn" aria-label="Dézoomer" onClick={() => zoom(1)} disabled={range === RANGES[RANGES.length - 1]}>−</button>
          <button
            type="button"
            className={`square-btn wide${showFreq ? ' is-on' : ''}`}
            aria-pressed={showFreq}
            aria-label="Fréquences des aéroports proches"
            onClick={() => setShowFreq((v) => !v)}
          >
            FRÉQ
          </button>
        </div>
        <div className="radar-foot">{list.length} avion{list.length > 1 ? 's' : ''}</div>
        <div className="layer-toggles">
          <button type="button" className={`square-btn wide${settings.rain ? ' is-on' : ''}`} aria-pressed={settings.rain} onClick={() => send('settings:update', { rain: !settings.rain })}>
            PLUIE
          </button>
          <button type="button" className={`square-btn wide${settings.lightning ? ' is-on' : ''}`} aria-pressed={settings.lightning} onClick={() => send('settings:update', { lightning: !settings.lightning })}>
            ORAGE
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
