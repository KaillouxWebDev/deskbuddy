import React from 'react';

export function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Icon({ level }) {
  if (level === 'success') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 9 L12 13 L15 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Toasts({ toasts, onClose, onOpen }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.level || 'info'}`}>
          <Icon level={t.level} />
          <button type="button" className="toast-body" aria-label="Voir le texte complet" onClick={() => onOpen?.(t.id)}>
            <span className="toast-title">{t.title}</span>
            {t.text && <span className="toast-text">{t.text}</span>}
          </button>
          <button type="button" className="toast-close" aria-label="Fermer la notification" onClick={() => onClose(t.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
