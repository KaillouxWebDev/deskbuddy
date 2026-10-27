import React, { useEffect, useState } from 'react';

/*
 * Écran en veille : le rétroéclairage est coupé mais le tactile reste actif.
 * Ce calque noir intercepte le toucher qui réveille, et reste encore 500 ms
 * après le réveil pour ne pas déclencher par erreur le bouton situé dessous.
 */
export default function SleepOverlay({ asleep, onWake }) {
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
  return (
    <div className="sleep-overlay" role="button" tabIndex={0} aria-label="Réveiller l'écran" onPointerDown={wake} onClick={(e) => e.stopPropagation()} onKeyDown={wake}>
      <span>écran en veille · touche pour réveiller</span>
    </div>
  );
}
