import React, { useState } from 'react';
import { useNow } from '../lib/useDeskbuddy.js';
import { chrono, hhmm, mmss, pad } from '../lib/format.js';
import { CloseIcon } from '../components/Toasts.jsx';

const PRESETS = [1, 5, 10, 25];

export default function Clock({ state, send }) {
  const now = useNow(100);
  const d = new Date(now);
  const [sw, setSw] = useState({ running: false, start: 0, acc: 0, laps: [] });
  const elapsed = sw.acc + (sw.running ? now - sw.start : 0);
  const timers = state.timers || [];
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const toggle = () =>
    setSw((s) => (s.running ? { ...s, running: false, acc: s.acc + Date.now() - s.start } : { ...s, running: true, start: Date.now() }));
  const lap = () => elapsed > 0 && setSw((s) => ({ ...s, laps: [{ n: s.laps.length + 1, t: chrono(elapsed) }, ...s.laps] }));
  const reset = () => setSw({ running: false, start: 0, acc: 0, laps: [] });

  return (
    <div className="split">
      <section className="col clock-col">
        <div className="card">
          <div className="clock-big">
            <span>{hhmm(d)}</span>
            <span className="clock-sec">{pad(d.getSeconds())}</span>
          </div>
          <span className="small soft">{date.charAt(0).toUpperCase() + date.slice(1)}</span>
        </div>

        <div className="card grow" aria-label="Chronomètre">
          <span className="caption">CHRONO</span>
          <span className={`chrono${sw.running ? '' : ' soft'}`}>{chrono(elapsed)}</span>
          <div className="grid3 gap8">
            <button type="button" className="btn btn-prim" onClick={toggle}>
              {sw.running ? 'PAUSE' : elapsed > 0 ? 'REPRENDRE' : 'DÉMARRER'}
            </button>
            <button type="button" className="btn" onClick={lap}>TOUR</button>
            <button type="button" className="btn" onClick={reset}>RÉINIT.</button>
          </div>
          <div className="laps">
            {sw.laps.map((l) => (
              <div key={l.n} className="lap"><span>TOUR {l.n}</span><span>{l.t}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="card col-fill" aria-label="Minuteurs">
        <span className="caption">MINUTEURS</span>
        <div className="grid4 gap8">
          {PRESETS.map((m) => (
            <button key={m} type="button" className="btn btn-soft" aria-label={`Lancer un minuteur de ${m} minutes`} onClick={() => send('timer:add', { minutes: m })}>
              +{m} min
            </button>
          ))}
        </div>
        <div className="timers">
          {timers.map((t) => {
            const left = Math.max(0, t.endAt - now);
            const done = t.done || left === 0;
            return (
              <div key={t.id} className={`timer${done ? ' is-done' : ''}`}>
                <div className="timer-row">
                  <div className="timer-text">
                    <span className="small">{t.label}</span>
                    <span className={`timer-left${done ? ' blink' : ''}`}>{done ? 'TERMINÉ' : mmss(left)}</span>
                  </div>
                  <button type="button" className="square-btn" aria-label={`Supprimer ${t.label}`} onClick={() => send('timer:cancel', { id: t.id })}>
                    <CloseIcon size={16} />
                  </button>
                </div>
                <div className="bar thin"><div style={{ width: `${(left / t.totalMs) * 100}%` }} /></div>
              </div>
            );
          })}
          {!timers.length && <span className="small dim">Aucun minuteur. Touche une durée pour en lancer un.</span>}
        </div>
      </section>
    </div>
  );
}
