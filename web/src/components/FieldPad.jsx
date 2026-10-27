import React, { useState } from 'react';
import { CloseIcon } from './Toasts.jsx';

/*
 * Saisie au pavé numérique, commune à tous les réglages chiffrés (position, horaires, prix).
 * Champs :
 *   { id, label, value, kind: 'decimal', min, max, decimals, signed, unit }
 *   { id, label, value: 'HH:MM', kind: 'time' }
 * Le premier chiffre tapé remplace la valeur du champ ; les suivants la complètent.
 */

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

const toEdit = (f) => (f.kind === 'time' ? String(f.value || '').replace(':', '') : String(f.value ?? ''));
const timeOf = (s) => `${s.padEnd(4, '-').slice(0, 2)}:${s.padEnd(4, '-').slice(2, 4)}`;

function valid(f, s) {
  if (f.kind === 'time') {
    if (!/^\d{4}$/.test(s)) return false;
    return Number(s.slice(0, 2)) < 24 && Number(s.slice(2)) < 60;
  }
  const v = Number(s);
  return s !== '' && s !== '-' && s !== '.' && Number.isFinite(v) && v >= (f.min ?? -Infinity) && v <= (f.max ?? Infinity);
}

export default function FieldPad({ title, subtitle, fields, note, extra, onOk, onCancel }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.id, toEdit(f)])));
  const [cur, setCur] = useState(0);
  const [fresh, setFresh] = useState(true); // première frappe : remplace au lieu d'allonger
  const f = fields[cur];

  const set = (fn) => {
    setVals((v) => ({ ...v, [f.id]: fn(fresh ? '' : v[f.id], v[f.id]) }));
    setFresh(false);
  };
  const digit = (k) =>
    set((s) => {
      if (f.kind === 'time') return s.length >= 4 ? s : s + k;
      const dec = s.split('.')[1];
      if (dec !== undefined && dec.length >= (f.decimals ?? 0)) return s;
      return s.replace('-', '').length >= 9 ? s : s + k;
    });
  const dot = () => set((s) => (s.includes('.') ? s : `${s || '0'}.`));
  const sign = () => set((s, old) => {
    const base = fresh ? old : s;
    return base.startsWith('-') ? base.slice(1) : `-${base}`;
  });
  const erase = () => set((s) => s.slice(0, -1));
  const pick = (i) => {
    setCur(i);
    setFresh(true);
  };

  const ok = fields.every((x) => valid(x, vals[x.id]));
  const submit = () =>
    onOk(Object.fromEntries(fields.map((x) => [x.id, x.kind === 'time' ? timeOf(vals[x.id]) : Number(vals[x.id])])));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="info-card numpad-card" role="dialog" aria-labelledby="fp-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head np-head">
          <div className="ellipsis">
            <h1 id="fp-title" className="callsign">{title}</h1>
            {subtitle && <div className="small soft ellipsis">{subtitle}</div>}
          </div>
          <button type="button" className="square-btn" aria-label="Fermer" onClick={onCancel}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="numpad-left">
          <div className={`np-fields${fields.length > 2 ? ' is-compact' : ''}`}>
            {fields.map((x, i) => {
              const s = vals[x.id];
              return (
                <button key={x.id} type="button" className={`np-field${i === cur ? ' is-on' : ''}${s && !valid(x, s) ? ' is-bad' : ''}`} onClick={() => pick(i)}>
                  <span className="label">{x.label}</span>
                  <span className="np-value">
                    {x.kind === 'time' ? timeOf(s) : s || ' '}
                    {i === cur && x.kind !== 'time' && <span className="blink">_</span>}
                    {x.unit && <span className="unit"> {x.unit}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {note && <span className="small dim">{note}</span>}
          <div className="np-actions">
            {extra}
            <button type="button" className="btn" onClick={onCancel}>ANNULER</button>
            <button type="button" className="btn btn-prim" disabled={!ok} onClick={submit}>VALIDER</button>
          </div>
        </div>
        <div className="numpad">
          {DIGITS.map((k) => (
            <button key={k} type="button" className="kb-key np-key" onClick={() => digit(k)}>{k}</button>
          ))}
          <button type="button" className="kb-key np-key" onClick={sign} disabled={!f.signed}>±</button>
          <button type="button" className="kb-key np-key" onClick={() => digit('0')}>0</button>
          <button type="button" className="kb-key np-key" onClick={dot} disabled={f.kind === 'time' || !f.decimals}>.</button>
          <button type="button" className="kb-key np-key np-erase" onClick={erase} aria-label="Effacer">⌫</button>
          <button type="button" className="kb-key np-key np-next" onClick={() => pick((cur + 1) % fields.length)}>
            CHAMP SUIVANT ›
          </button>
        </div>
      </div>
    </div>
  );
}
