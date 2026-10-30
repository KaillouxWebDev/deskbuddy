import React from 'react';
import { hhmm } from '../lib/format.js';

export function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 17V11a6 6 0 0 1 12 0v6l1.8 2H4.2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 21.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const r = (a * Math.PI) / 180;
    return { x1: 12 + 6.4 * Math.sin(r), y1: 12 - 6.4 * Math.cos(r), x2: 12 + 9.6 * Math.sin(r), y2: 12 - 9.6 * Math.cos(r) };
  });
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {teeth.map((t, i) => (
        <line key={i} {...t} stroke="currentColor" strokeWidth="2.8" />
      ))}
    </svg>
  );
}

export default function Header({ tabs, tab, setTab, date, connected, online, printerAlert, satInView, wxLevel, onSleep, settingsOpen, onSettings, unread, onNotifs }) {
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
            {t.id === 'sky' && satInView && <span className="dot pulse" aria-label="satellite en vue" />}
            {t.id === 'weather' && wxLevel && <span className={`dot dot-wx-${wxLevel}${wxLevel === 'jaune' ? '' : ' blink'}`} aria-label={`vigilance ${wxLevel}`} />}
          </button>
        ))}
      </nav>
      <div className="header-right">
        {/* LIVE : tout va bien · SANS INTERNET : le Pi tourne mais rien ne se met à jour · DÉCONNECTÉ : l'écran ne joint plus le serveur */}
        <span className={`live${!connected ? ' is-off' : !online ? ' is-offline' : ''}`}>
          <span className={`dot${connected && online ? ' pulse' : ''}`} />
          {!connected ? 'DÉCONNECTÉ' : !online ? 'SANS INTERNET' : 'LIVE'}
        </span>
        <span className="header-time">{hhmm(date)}</span>
        <div className="header-actions">
          <button type="button" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} nouvelles)` : ''}`} onClick={onNotifs}>
            <span>
              <BellIcon />
            </span>
            {unread > 0 && <b className="badge">{unread > 9 ? "9+" : unread}</b>}
          </button>
          <button
            type="button"
            className={`icon-btn${settingsOpen ? ' is-on' : ''}`}
            aria-label="Réglages"
            aria-pressed={settingsOpen}
            onClick={onSettings}
          >
            <span>
              <GearIcon />
            </span>
          </button>
          <button type="button" className="icon-btn" aria-label="Mettre l'écran en veille" onClick={onSleep}>
            <span>
              <MoonIcon />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
