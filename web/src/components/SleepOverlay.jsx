import React, { useEffect, useState } from 'react';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n) => String(n).padStart(2, '0');

/*
 * Écran en veille. Le tactile reste actif : ce calque intercepte le toucher qui réveille, et reste encore
 * 500 ms après le réveil pour ne pas déclencher par erreur le bouton situé dessous.
 * - Sans écran de veille : noir (le rétroéclairage est coupé).
 * - Avec écran de veille : horloge et petit message du thème, rétroéclairage baissé. L'horloge se décale
 *   un peu chaque minute pour ne pas marquer l'écran à force d'afficher la même chose au même endroit.
 */
export default function SleepOverlay({ asleep, saver, date, onWake }) {
  const [visible, setVisible] = useState(asleep);

  useEffect(() => {
    if (asleep) {
      setVisible(true);
      return undefined;
    }
    const t = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(t);
  }, [asleep]);

  if (!visible) return null;
  const wake = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (asleep) onWake();
  };

  const m = date.getHours() * 60 + date.getMinutes();
  const shift = { transform: `translate(${((m * 37) % 81) - 40}px, ${((m * 23) % 61) - 30}px)` };

  return (
    <div
      className={`sleep-overlay${saver ? ' is-saver' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Réveiller l'écran"
      onPointerDown={wake}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={wake}
    >
      {saver ? (
        <div className="saver" style={shift}>
          <div className="saver-time">
            {pad(date.getHours())}
            <span className="saver-colon">:</span>
            {pad(date.getMinutes())}
          </div>
          <div className="saver-date">
            {DAYS[date.getDay()]} {date.getDate()} {MONTHS[date.getMonth()]}
          </div>
          {saver.saver && <div className="saver-msg">{saver.saver}</div>}
        </div>
      ) : (
        <span>écran en veille · touche pour réveiller</span>
      )}
    </div>
  );
}
