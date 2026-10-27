import React, { useState } from 'react';

/* Clavier tactile AZERTY plein écran, pensé pour saisir un mot de passe Wi-Fi sur l'écran 7". */

const LETTERS = [
  ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
  ['w', 'x', 'c', 'v', 'b', 'n', "'", '-']
];
const SYMBOLS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '&', '*', '_', '+', '=', '(', ')', '/'],
  ['!', '?', '.', ',', ':', ';', '"', '$', '%', '€']
];
const MORE = ['<', '>', '[', ']', '{', '}', '\\', '|', '~', '^'];

export default function Keyboard({ title, subtitle, initial = '', secret = false, minLength = 0, okLabel = 'VALIDER', onOk, onCancel }) {
  const [value, setValue] = useState(initial);
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const [layer, setLayer] = useState('abc'); // abc | 123 | more
  const [show, setShow] = useState(!secret);

  const type = (ch) => {
    setValue((v) => v + (shift || caps ? ch.toUpperCase() : ch));
    if (shift && !caps) setShift(false);
  };
  // Double toucher sur Maj : verrouillage des majuscules.
  const tapShift = () => {
    if (caps) {
      setCaps(false);
      setShift(false);
    } else if (shift) setCaps(true);
    else setShift(true);
  };

  const rows = layer === 'abc' ? LETTERS : layer === '123' ? SYMBOLS : [SYMBOLS[0], MORE, SYMBOLS[2]];
  const upper = shift || caps;
  const ok = value.length >= minLength;

  return (
    <div className="kb-backdrop" role="dialog" aria-label={title}>
      <div className="kb-head">
        <div className="kb-title">
          <span className="caption">{title}</span>
          {subtitle && <span className="small dim ellipsis">{subtitle}</span>}
        </div>
        <div className="kb-field">
          <span className={`kb-value${show ? '' : ' is-secret'}`}>{show ? value : '•'.repeat(value.length)}</span>
          <span className="kb-caret blink" aria-hidden="true">_</span>
        </div>
        {secret && (
          <button type="button" className={`btn kb-eye${show ? ' btn-prim' : ''}`} onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? 'MASQUER' : 'AFFICHER'}
          </button>
        )}
      </div>

      <div className="kb">
        {rows.map((row, i) => (
          <div key={i} className="kb-row">
            {i === 2 && layer === 'abc' && (
              <button type="button" className={`kb-key kb-wide kb-glyph${upper ? ' is-on' : ''}${caps ? ' is-caps' : ''}`} onClick={tapShift} aria-label="Majuscule">
                ⇧
              </button>
            )}
            {i === 2 && layer !== 'abc' && (
              <button type="button" className="kb-key kb-wide" onClick={() => setLayer(layer === '123' ? 'more' : '123')}>
                {layer === '123' ? '#+=' : '123'}
              </button>
            )}
            {row.map((k) => (
              <button key={k} type="button" className="kb-key" onClick={() => type(k)}>
                {layer === 'abc' && upper ? k.toUpperCase() : k}
              </button>
            ))}
            {i === 2 && (
              <button type="button" className="kb-key kb-wide kb-glyph" onClick={() => setValue((v) => v.slice(0, -1))} aria-label="Effacer">
                ⌫
              </button>
            )}
          </div>
        ))}
        <div className="kb-row">
          <button type="button" className="kb-key kb-wide" onClick={onCancel}>ANNULER</button>
          <button type="button" className="kb-key kb-wide" onClick={() => setLayer(layer === 'abc' ? '123' : 'abc')}>
            {layer === 'abc' ? '123' : 'ABC'}
          </button>
          <button type="button" className="kb-key kb-space" onClick={() => setValue((v) => `${v} `)} aria-label="Espace">
            espace
          </button>
          <button type="button" className="kb-key kb-wide kb-ok" disabled={!ok} onClick={() => onOk(value)}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
