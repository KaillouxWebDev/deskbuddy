import React from 'react';
import { hhmm, pad } from '../lib/format.js';

const TONE = { bonne: 'prim', moyenne: 'sec', mauvaise: 'danger' };

function kpLabel(k) {
  if (k === null || k === undefined) return { text: '--', tone: 'dim' };
  if (k >= 7) return { text: 'tempête forte', tone: 'danger' };
  if (k >= 5) return { text: 'tempête', tone: 'danger' };
  if (k >= 4) return { text: 'agité', tone: 'sec' };
  return { text: 'calme', tone: 'prim' };
}

/** Conditions solaires et propagation HF (N0NBH / hamqsl.com). */
export function SolarPanel({ space }) {
  const s = space?.solar;
  if (!s) return <p className="empty">{space?.solarError ? `Données solaires indisponibles (${space.solarError})` : 'Chargement des conditions solaires…'}</p>;
  const kp = kpLabel(s.k);
  return (
    <div className="space-panel">
      <div className="card">
        <div className="card-head">
          <span className="caption">CHAMP MAGNÉTIQUE</span>
          <span className={`small tone-${kp.tone}`}>{kp.text}</span>
        </div>
        <div className="grid3">
          <div><div className="label">INDICE Kp</div><div className={`value tone-${kp.tone}`}>{s.k ?? '--'}</div></div>
          <div><div className="label">FLUX SOLAIRE</div><div className="value">{s.sfi ?? '--'}</div></div>
          <div><div className="label">TACHES</div><div className="value">{s.sunspots ?? '--'}</div></div>
          <div><div className="label">RAYONS X</div><div className="value md">{s.xray || '--'}</div></div>
          <div><div className="label">VENT SOLAIRE</div><div className="value md">{s.solarWind ? Math.round(s.solarWind) : '--'}<span className="unit"> km/s</span></div></div>
          <div><div className="label">BRUIT HF</div><div className="value md">{s.noise || '--'}</div></div>
        </div>
      </div>
      <div className="card">
        <div className="bands">
          <span className="label">BANDES HF</span>
          <span className="label center">JOUR</span>
          <span className="label center">NUIT</span>
          {s.bands.map((b) => (
            <React.Fragment key={b.name}>
              <span className="band-name">{b.name}</span>
              <span className={`band-chip tone-${TONE[b.day] || 'dim'}`}>{b.day}</span>
              <span className={`band-chip tone-${TONE[b.night] || 'dim'}`}>{b.night}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="vhf">
          {s.vhf.map((v) => (
            <span key={v.name} className={`small ${v.open ? 'sec' : 'dim'}`}>
              {v.name} : {v.open ? 'ouverte' : 'fermée'}
            </span>
          ))}
        </div>
        <span className="small dim">Source N0NBH (hamqsl.com) · {(s.updated || '').split(' ').slice(-2).join(' ')}</span>
      </div>
    </div>
  );
}

function countdown(ms) {
  if (ms <= 0) return 'en cours';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `T- ${d} j ${pad(h)} h ${pad(m)}` : `T- ${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

const STATUS = { Go: 'confirmé', TBD: 'date à confirmer', TBC: 'à confirmer', Hold: 'suspendu', 'In Flight': 'en vol' };
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm(d)}`;
};

/** Prochains lancements (Launch Library 2). */
export function LaunchesPanel({ space, now }) {
  const list = (space?.launches?.list || []).filter((l) => l.net > now - 3600_000);
  if (!list.length) return <p className="empty">{space?.launchesError ? `Lancements indisponibles (${space.launchesError})` : 'Chargement des lancements…'}</p>;
  const [next, ...rest] = list;
  return (
    <div className="space-panel">
      <div className="card">
        <div className="card-head">
          <span className="caption">PROCHAIN LANCEMENT</span>
          <span className={`small ${next.status === 'Go' ? 'prim' : 'sec'}`}>{STATUS[next.status] || next.statusName || ''}</span>
        </div>
        <div className="launch-rocket ellipsis">{next.rocket}</div>
        <div className="small soft ellipsis">
          {next.mission || 'Mission non communiquée'}
          {next.orbit ? ` · orbite ${next.orbit}` : ''}
        </div>
        <div className="sat-countdown">{countdown(next.net - now)}</div>
        <div className="small dim ellipsis">
          {fmtDate(next.net)} · {next.provider}
        </div>
        <div className="small dim ellipsis">{next.pad}</div>
      </div>
      <div className="list-scroll">
        {rest.map((l) => (
          <div key={l.id} className="row static">
            <span>{fmtDate(l.net)}</span>
            <span className="ellipsis">{l.rocket}</span>
            <span className={`right small ${l.status === 'Go' ? 'prim' : 'dim'}`}>{l.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
