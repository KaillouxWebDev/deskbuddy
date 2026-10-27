import React from 'react';
import { hhmm } from '../lib/format.js';

export function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function Header({ tabs, tab, setTab, date, connected, printerAlert, onSleep }) {
  return (
    <header className="header">
      <nav className="tabs" aria-label="Onglets">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? ' is-active' : ''}${t.id === 'printer' && printerAlert ? ' has-alert' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'printer' && printerAlert && <span className="dot dot-danger blink" aria-label="alerte" />}
          </button>
        ))}
      </nav>
      <div className="header-right">
        <span className={`live${connected ? '' : ' is-off'}`}>
          <span className={`dot${connected ? ' pulse' : ''}`} />
          {connected ? 'LIVE' : 'HORS LIGNE'}
        </span>
        <span className="header-time">{hhmm(date)}</span>
        <button type="button" className="icon-btn" aria-label="Mettre l'écran en veille" onClick={onSleep}>
          <MoonIcon />
        </button>
      </div>
    </header>
  );
}
