import React from 'react';
import { PRIMARIES, SECONDARIES } from '../lib/theme.js';
import { dec1, int, uptime } from '../lib/format.js';

function Swatches({ items, value, mode, onPick }) {
  return (
    <div className="swatches">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`swatch-btn${value === c.id ? ' is-on' : ''}`}
          aria-label={c.name}
          aria-pressed={value === c.id}
          onClick={() => onPick(c.id)}
        >
          <span style={{ background: mode === 'dark' ? c.dark : c.light }} />
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, detail, on, onChange }) {
  return (
    <button type="button" className="toggle-row" aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        <span>{label}</span>
        {detail && <span className="small dim">{detail}</span>}
      </span>
      <span className={`switch${on ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
    </button>
  );
}

export default function System({ state, settings, send, mode }) {
  const set = (patch) => send('settings:update', patch);
  const sys = state.system || {};
  const screen = state.screen || {};
  const meta = state.meta || {};
  const primary = PRIMARIES.find((c) => c.id === settings.primary);
  const secondary = SECONDARIES.find((c) => c.id === settings.secondary);

  return (
    <div className="split">
      <section className="card col-settings" aria-label="Affichage">
        <span className="caption">AFFICHAGE</span>

        <div className="setting">
          <span className="label">MODE{settings.theme === 'auto' ? ` · AUTO (${mode === 'dark' ? 'sombre' : 'clair'})` : ''}</span>
          <div className="grid3 gap8">
            {[
              ['dark', 'SOMBRE'],
              ['light', 'CLAIR'],
              ['auto', 'AUTO']
            ].map(([id, label]) => (
              <button key={id} type="button" className={`btn${settings.theme === id ? ' btn-prim' : ''}`} aria-pressed={settings.theme === id} onClick={() => set({ theme: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <span className="label">COULEUR PRIMAIRE · {primary?.name.toUpperCase()}</span>
          <Swatches items={PRIMARIES} value={settings.primary} mode={mode} onPick={(id) => set({ primary: id })} />
        </div>

        <div className="setting">
          <span className="label">COULEUR SECONDAIRE · {secondary?.name.toUpperCase()}</span>
          <Swatches items={SECONDARIES} value={settings.secondary} mode={mode} onPick={(id) => set({ secondary: id })} />
        </div>

        <div className="setting">
          <span className="label">LUMINOSITÉ{screen.writable === false && screen.backlight ? ' · non pilotable (conteneur non privilégié)' : !screen.backlight ? ' · écran non détecté' : ''}</span>
          <div className="brightness">
            <button type="button" className="square-btn" aria-label="Baisser la luminosité" onClick={() => set({ brightness: settings.brightness - 10 })}>−</button>
            <div className="bar"><div style={{ width: `${settings.brightness}%` }} /></div>
            <button type="button" className="square-btn" aria-label="Augmenter la luminosité" onClick={() => set({ brightness: settings.brightness + 10 })}>+</button>
            <span className="value pct">{settings.brightness}%</span>
          </div>
        </div>
      </section>

      <section className="col" aria-label="État du Pi">
        <div className="card">
          <div className="card-head">
            <span className="caption">{(sys.hostname || 'deskbuddy').toUpperCase()}</span>
            <span className="small sec">v{meta.version} · {meta.commit}</span>
          </div>
          <div className="grid2">
            <div><div className="label">CPU</div><div className="value">{sys.cpuTemp ?? '--'}<span className="unit">°C</span></div></div>
            <div><div className="label">CHARGE</div><div className="value">{sys.load ?? '--'}<span className="unit">%</span></div></div>
            <div><div className="label">RAM</div><div className="value">{int(sys.memory?.usedMb)}<span className="unit"> / {int(sys.memory?.totalMb)} Mo</span></div></div>
            <div><div className="label">CARTE SD</div><div className="value">{dec1(sys.disk?.usedGb)}<span className="unit"> / {dec1(sys.disk?.totalGb)} Go</span></div></div>
            <div><div className="label">IP</div><div className="value md">{sys.ip || '--'}</div></div>
            <div><div className="label">UPTIME</div><div className="value md">{uptime(sys.uptimeS)}</div></div>
          </div>
        </div>
        <div className="card grow options">
          <span className="caption">OPTIONS</span>
          <Toggle
            label="Veille nocturne"
            detail={`${settings.sleepFrom} → ${settings.sleepTo}`}
            on={settings.sleepEnabled}
            onChange={(v) => set({ sleepEnabled: v })}
          />
          <Toggle label="Balayage radar" detail="à couper si le Pi rame" on={settings.sweep} onChange={(v) => set({ sweep: v })} />
        </div>
      </section>
    </div>
  );
}
