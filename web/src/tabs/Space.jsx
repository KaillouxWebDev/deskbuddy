import React, { useState } from 'react';
import { useNow } from '../lib/useDeskbuddy.js';
import { hhmm, mmss } from '../lib/format.js';
import SatInfoModal from '../components/SatInfoModal.jsx';
import Segmented from '../components/Segmented.jsx';
import { LaunchesPanel, SolarPanel } from './SpacePanels.jsx';

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="visible à l'œil nu">
      <path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const R = 180; // horizon (0°) sur l'anneau extérieur
const C = 202;
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

const card = (az) => CARD[Math.round(az / 45) % 8];
const sky = (az, el) => {
  const r = (R * (90 - Math.max(0, el))) / 90;
  const a = (az * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

function until(ms) {
  if (ms < 3600_000) return mmss(ms);
  const h = Math.floor(ms / 3600_000);
  const m = Math.round((ms % 3600_000) / 60_000);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function Freq({ f, live }) {
  const value = f.range ? f.range : (live && f.live ? f.live : f.down).toFixed(3);
  return (
    <div className="sat-freq">
      <span className="small soft ellipsis">{f.label}</span>
      <span className="sat-freq-val">
        {value}
        <span className="unit"> MHz</span>
      </span>
      {f.up && <span className="small dim">montée {f.up}</span>}
    </div>
  );
}

export default function Space({ state }) {
  const now = useNow(1000);
  const [selId, setSelId] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [view, setView] = useState('passes');
  const passes = (state.satPasses?.passes || []).filter((p) => p.los > now);
  const live = state.satLive?.sats || [];
  const inView = live.filter((s) => s.visible).sort((a, b) => b.el - a.el);

  // Par défaut : le satellite en vue le plus haut, sinon le prochain beau passage.
  const fallback = inView[0]?.id ?? (passes.find((p) => p.maxEl >= 15) || passes[0])?.satId ?? null;
  const satId = selId ?? fallback;
  const sat = live.find((s) => s.id === satId);
  const pass = passes.find((p) => p.satId === satId);
  const visible = Boolean(sat?.visible);

  const track = pass ? pass.path.map(([az, el]) => sky(az, el)) : [];
  const aosPt = track[0];
  const losPt = track[track.length - 1];

  return (
    <div className="split">
      <section className="radar" aria-label="Ciel au-dessus de chez toi">
        <svg className="radar-grid" width="404" height="404" viewBox="0 0 404 404" role="img" aria-label="Vue du ciel : horizon sur le bord, zénith au centre">
          <circle cx={C} cy={C} r="200" className="radar-disc" />
          <circle cx={C} cy={C} r="60" className="radar-ring" />
          <circle cx={C} cy={C} r="120" className="radar-ring" />
          <circle cx={C} cy={C} r="180" className="radar-ring radar-ring-outer" />
          <line x1={C} y1="2" x2={C} y2="402" className="radar-axis" />
          <line x1="2" y1={C} x2="402" y2={C} className="radar-axis" />
          <text x={C} y="16" textAnchor="middle" className="radar-card">N</text>
          <text x="392" y="207" textAnchor="middle" className="radar-card">E</text>
          <text x={C} y="398" textAnchor="middle" className="radar-card">S</text>
          <text x="12" y="207" textAnchor="middle" className="radar-card">O</text>
          {[0, 30, 60].map((el, i) => (
            <text key={el} x={C + 4} y={C - (180 - i * 60) + 12} className="sky-label">{el}°</text>
          ))}
          {track.length > 1 && (
            <>
              <polyline points={track.map((p) => `${p.x},${p.y}`).join(' ')} className="sky-track" />
              <circle cx={aosPt.x} cy={aosPt.y} r="4" className="sky-aos" />
              <circle cx={losPt.x} cy={losPt.y} r="4" className="sky-los" />
            </>
          )}
          {inView.map((s) => {
            const p = sky(s.az, s.el);
            const isSel = s.id === satId;
            return (
              <g key={s.id} className={`sky-sat${isSel ? ' is-sel' : ''}`} onClick={() => setSelId(s.id)}>
                <circle cx={p.x} cy={p.y} r="22" className="sky-hit" />
                <circle cx={p.x} cy={p.y} r="6" />
                <text x={p.x + 10} y={p.y - 8}>{s.name}</text>
              </g>
            );
          })}
        </svg>
        <div className="range-label">CIEL</div>
        <div className="radar-foot sky-foot">{inView.length ? `${inView.length} en vue` : 'aucun en vue'}</div>
        <button type="button" className="square-btn sky-info-btn" aria-label="Fiche des satellites" onClick={() => setShowInfo(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11 V17" />
            <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
          </svg>
        </button>
      </section>

      <section className="col" aria-label="Espace">
        <Segmented
          label="Vue"
          value={view}
          onChange={setView}
          items={[
            ['passes', 'PASSAGES'],
            ['solar', 'SOLEIL'],
            ['launches', 'LANCEMENTS']
          ]}
        />
        {view === 'solar' && <SolarPanel space={state.space} />}
        {view === 'launches' && <LaunchesPanel space={state.space} now={now} />}
        {view === 'passes' && (
        <>
        <div className="card sat-card">
          <div className="card-head">
            <span className="caption">{visible ? 'EN VUE' : 'PROCHAIN PASSAGE'}</span>
            {pass && <span className={`small ${pass.maxEl >= 30 ? 'sec' : 'dim'}`}>max {pass.maxEl}°</span>}
          </div>
          {sat ? (
            <>
              <div className="callsign">{sat.name}</div>
              {pass ? (
                <>
                  <div className={`sat-countdown${visible ? ' is-live' : ''}`}>
                    {visible ? `fin dans ${until(pass.los - now)}` : `dans ${until(pass.aos - now)}`}
                  </div>
                  <div className="small soft">
                    {hhmm(new Date(pass.aos))} {card(pass.aosAz)} → {hhmm(new Date(pass.los))} {card(pass.losAz)}
                    {visible ? ` · élév. ${Math.round(sat.el)}° az ${Math.round(sat.az)}°` : ''}
                  </div>
                  {pass.visible && (
                    <div className="naked-eye">
                      <EyeIcon /> visible à l'œil nu de {hhmm(new Date(pass.visStart))} à {hhmm(new Date(pass.visEnd))}, apparaît au {card(pass.visStartAz)}
                    </div>
                  )}
                </>
              ) : (
                <div className="small dim">Pas de passage dans les 24 h.</div>
              )}
              <div className="sat-freqs">
                {sat.freqs.map((f) => (
                  <Freq key={f.label} f={f} live={visible} />
                ))}
              </div>
              {visible && <div className="small dim">Fréquences corrigées de l'effet Doppler en direct.</div>}
            </>
          ) : (
            <p className="empty">{state.satPasses?.error || (state.satPasses?.loading ? 'Calcul des orbites…' : 'Aucun satellite.')}</p>
          )}
        </div>

        <div className="list-block">
          <div className="caption">PASSAGES À VENIR</div>
          <div className="list-scroll">
            {passes.slice(0, 12).map((p) => (
              <button
                key={`${p.satId}-${p.aos}`}
                type="button"
                className={`row${p.satId === satId && p === pass ? ' is-sel' : ''}${p.maxEl < 15 ? ' is-low' : ''}`}
                onClick={() => setSelId(p.satId)}
              >
                <span>{p.aos <= now ? 'EN VUE' : hhmm(new Date(p.aos))}</span>
                <span className="ellipsis">
                  {p.name} {p.visible && <EyeIcon />}
                </span>
                <span className="right">{p.maxEl}°</span>
              </button>
            ))}
          </div>
        </div>
        </>
        )}
      </section>
      {showInfo && (
        <SatInfoModal catalog={state.satCatalog || []} passes={passes} initialId={satId} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}
