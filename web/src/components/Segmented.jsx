import React from 'react';

/** Sélecteur de vue en haut d'une colonne (3 boutons max sur 364 px). */
export default function Segmented({ items, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {items.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={`seg${value === id ? ' is-on' : ''}`} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}
