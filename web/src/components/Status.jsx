import React from 'react';
import { hhmm } from '../lib/format.js';

/*
 * États « pas encore de données » et « données anciennes », au même format partout :
 * ce qui manque, depuis quand, et quand le prochain essai aura lieu.
 */

const at = (ms) => (ms ? hhmm(new Date(ms)) : null);

/**
 * Bloc vide : chargement, ou source indisponible avec l'heure du prochain essai.
 * loading : « Chargement des prévisions… » ; failed : « Prévisions indisponibles ».
 */
export function Empty({ loading, failed, error, retryAt }) {
  if (!error) return <p className="empty">{loading}</p>;
  return (
    <div className="empty status-empty">
      <span>{`${failed}${retryAt ? ` · nouvel essai à ${at(retryAt)}` : ''}`}</span>
      <span className="small dim">{error}</span>
    </div>
  );
}

/** Petite ligne au-dessus de données qui n'ont pas pu être rafraîchies. */
export function Stale({ updatedAt, error, retryAt }) {
  if (!error) return null;
  return (
    <div className="stale small" role="status">
      {updatedAt ? `Données de ${at(updatedAt)}` : 'Données anciennes'}
      {retryAt ? ` · nouvel essai à ${at(retryAt)}` : ''}
    </div>
  );
}
