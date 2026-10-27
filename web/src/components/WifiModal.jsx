import React, { useEffect, useState } from 'react';
import { CloseIcon } from './Toasts.jsx';
import Keyboard from './Keyboard.jsx';

function Bars({ signal }) {
  const n = signal >= 70 ? 4 : signal >= 50 ? 3 : signal >= 30 ? 2 : 1;
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-label={`signal ${signal} %`}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4.5} y={10 - i * 3.3} width="3" height={4 + i * 3.3} rx="0.6" fill="currentColor" opacity={i < n ? 1 : 0.22} />
      ))}
    </svg>
  );
}

function Lock() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-label="protégé">
      <rect x="1" y="6" width="10" height="7.5" rx="1.5" fill="currentColor" />
      <path d="M3.4 6 V4.2 a2.6 2.6 0 0 1 5.2 0 V6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Choix du réseau Wi-Fi : liste des réseaux à portée, connexion, oubli. */
export default function WifiModal({ wifi, send, onClose }) {
  const [typing, setTyping] = useState(null); // réseau dont on saisit le mot de passe
  const [menu, setMenu] = useState(null); // réseau enregistré touché : se connecter ou l'oublier
  useEffect(() => {
    send('wifi:scan');
  }, [send]);

  const saved = new Set(wifi.saved || []);
  const nets = wifi.networks || [];

  const tap = (n) => {
    if (n.active) return;
    if (saved.has(n.ssid)) setMenu(n.ssid);
    else if (n.secure) setTyping(n.ssid);
    else send('wifi:connect', { ssid: n.ssid });
  };

  if (typing) {
    return (
      <Keyboard
        title={`MOT DE PASSE · ${typing}`}
        subtitle="Partage de connexion de ton téléphone : le mot de passe est dans ses réglages."
        secret
        minLength={8}
        okLabel="CONNEXION"
        onCancel={() => setTyping(null)}
        onOk={(password) => {
          send('wifi:connect', { ssid: typing, password });
          setTyping(null);
        }}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card wifi-card" role="dialog" aria-labelledby="wifi-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="wifi-title" className="callsign">WI-FI</h1>
            <div className="small soft">
              {wifi.connecting ? `Connexion à ${wifi.connecting}…` : wifi.current ? `Connecté à ${wifi.current}` : 'Non connecté'}
            </div>
          </div>
          <div className="stock-actions">
            <button type="button" className="btn" disabled={wifi.scanning} onClick={() => send('wifi:scan')}>
              {wifi.scanning ? 'RECHERCHE…' : 'ACTUALISER'}
            </button>
            <button type="button" className="square-btn" aria-label="Fermer" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {wifi.available === false ? (
          <p className="empty">
            Wi-Fi non pilotable : {wifi.error || 'NetworkManager introuvable'}.
            <br />
            Il faut « pid: host » dans docker-compose.yml (fourni par la mise à jour).
          </p>
        ) : (
          <div className="wifi-list">
            {nets.map((n) => (
              <div key={n.ssid} className={`wifi-row${n.active ? ' is-active' : ''}`}>
                <button type="button" className="wifi-main" onClick={() => tap(n)} disabled={Boolean(wifi.connecting)}>
                  <Bars signal={n.signal} />
                  <span className="ellipsis wifi-ssid">{n.ssid}</span>
                  {saved.has(n.ssid) && !n.active && <span className="small dim">enregistré</span>}
                  {n.active && <span className="small">connecté</span>}
                  {wifi.connecting === n.ssid && <span className="small sec blink">connexion…</span>}
                  {n.secure && <Lock />}
                </button>
                {menu === n.ssid && (
                  <div className="wifi-menu">
                    <button type="button" className="spool-btn is-primary" onClick={() => { send('wifi:connect', { ssid: n.ssid }); setMenu(null); }}>SE CONNECTER</button>
                    <button type="button" className="spool-btn" onClick={() => { setMenu(null); setTyping(n.ssid); }}>NOUVEAU MOT DE PASSE</button>
                    <button type="button" className="spool-btn" onClick={() => { send('wifi:forget', { ssid: n.ssid }); setMenu(null); }}>OUBLIER</button>
                  </div>
                )}
              </div>
            ))}
            {!nets.length && <p className="empty">{wifi.scanning ? 'Recherche des réseaux…' : 'Aucun réseau trouvé. Active le partage de connexion de ton téléphone puis ACTUALISER.'}</p>}
          </div>
        )}
        <div className="small dim">Le dashboard fonctionne sans Internet ; seules les données en ligne (avions, météo...) attendent la connexion.</div>
      </div>
    </div>
  );
}
