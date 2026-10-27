import React, { useState } from 'react';
import { CloseIcon } from './Toasts.jsx';

/*
 * Saisie de la position au pavé numérique : latitude et longitude en degrés décimaux.
 * Astuce : un appui long sur la carte de Google Maps (ou Plans) sur le téléphone affiche ces deux nombres.
 */

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.'];
const LIMIT = { lat: 90, lon: 180 };

function valid(field, s) {
  const v = Number(s);
  return s !== '' && s !== '-' && Number.isFinite(v) && Math.abs(v) <= LIMIT[field];
}

export default function NumPad({ home, onOk, onHome, onCancel }) {
  const [vals, setVals] = useState({ lat: home ? String(home.lat) : '', lon: home ? String(home.lon) : '' });
  const [field, setField] = useState('lat');
  const [fresh, setFresh] = useState(true); // première frappe : remplace la valeur au lieu de l'allonger

  const press = (k) => {
    setVals((v) => {
      let s = fresh ? '' : v[field];
      if (k === '±') s = fresh ? (v[field].startsWith('-') ? v[field].slice(1) : `-${v[field]}`) : s.startsWith('-') ? s.slice(1) : `-${s}`;
      else if (k === '.') s = s.includes('.') ? s : `${s || '0'}.`;
      else if (s.replace('-', '').split('.')[1]?.length >= 4) return v; // 4 décimales : ~10 m, largement assez
      else s += k;
      return { ...v, [field]: s };
    });
    setFresh(false);
  };
  const erase = () => {
    setVals((v) => ({ ...v, [field]: fresh ? '' : v[field].slice(0, -1) }));
    setFresh(false);
  };
  const pick = (f) => {
    setField(f);
    setFresh(true);
  };
  const ok = valid('lat', vals.lat) && valid('lon', vals.lon);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="info-card numpad-card" role="dialog" aria-labelledby="np-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head np-head">
          <div>
            <h1 id="np-title" className="callsign">POSITION</h1>
            <div className="small soft">Centre du radar, de la météo et des passages de satellites.</div>
          </div>
          <button type="button" className="square-btn" aria-label="Fermer" onClick={onCancel}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="numpad-left">
          {['lat', 'lon'].map((f) => (
            <button key={f} type="button" className={`np-field${field === f ? ' is-on' : ''}${vals[f] && !valid(f, vals[f]) ? ' is-bad' : ''}`} onClick={() => pick(f)}>
              <span className="label">{f === 'lat' ? 'LATITUDE · N+ / S−' : 'LONGITUDE · E+ / O−'}</span>
              <span className="np-value">
                {vals[f] || ' '}
                {field === f && <span className="blink">_</span>}
              </span>
            </button>
          ))}
          <span className="small dim">Sur ton téléphone : appui long sur la carte dans Google Maps ou Plans pour lire ces deux nombres.</span>
          <div className="np-actions">
            {home?.canGoHome && !home?.isHome && (
              <button type="button" className="btn" onClick={onHome}>MAISON</button>
            )}
            <button type="button" className="btn" onClick={onCancel}>ANNULER</button>
            <button type="button" className="btn btn-prim" disabled={!ok} onClick={() => onOk({ lat: Number(vals.lat), lon: Number(vals.lon) })}>
              VALIDER
            </button>
          </div>
        </div>
        <div className="numpad">
          {KEYS.map((k) => (
            <button key={k} type="button" className="kb-key np-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button type="button" className="kb-key np-key np-erase" onClick={erase} aria-label="Effacer">⌫</button>
          <button type="button" className="kb-key np-key np-next" onClick={() => pick(field === 'lat' ? 'lon' : 'lat')}>
            {field === 'lat' ? 'LONGITUDE ›' : '‹ LATITUDE'}
          </button>
        </div>
      </div>
    </div>
  );
}
