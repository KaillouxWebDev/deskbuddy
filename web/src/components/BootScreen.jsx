import React, { useEffect, useState } from 'react';

/*
 * Écran de démarrage du thème : les lignes s'affichent une à une, puis l'écran s'efface.
 * Un toucher le passe. Animations légères (opacité, pas de calcul) pour le Pi 3.
 */
const STEP_MS = 420;
const HOLD_MS = 900;
const FADE_MS = 400;

// Pluie de caractères : quelques colonnes générées une fois (animation CSS, rien à recalculer).
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789ABCDEFZ';
function Rain() {
  const [cols] = useState(() =>
    Array.from({ length: 26 }, () => ({
      text: Array.from({ length: 18 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''),
      dur: 1.6 + Math.random() * 2.2,
      delay: -Math.random() * 3
    }))
  );
  return (
    <div className="boot-rain" aria-hidden="true">
      {cols.map((c, i) => (
        <span key={i} style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

export default function BootScreen({ theme, onDone }) {
  const lines = theme.boot || [];
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timers = lines.map((_, i) => setTimeout(() => setShown(i + 1), 250 + i * STEP_MS));
    const end = 250 + lines.length * STEP_MS + HOLD_MS;
    timers.push(setTimeout(() => setLeaving(true), end));
    timers.push(setTimeout(onDone, end + FADE_MS));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = (e) => {
    e.stopPropagation();
    onDone();
  };

  const [title, ...rest] = lines;
  return (
    <div className={`boot${leaving ? ' is-leaving' : ''}${theme.bootStyle === 'drop' ? ' is-drop' : ''}`} onClick={skip} role="status" aria-label={`Démarrage du thème ${theme.name}`}>
      {theme.bootStyle === 'rain' && <Rain />}
      <div className="boot-inner">
        {shown > 0 && <div className="boot-title">{title}</div>}
        {rest.slice(0, Math.max(0, shown - 1)).map((l, i) => (
          <div key={i} className={`boot-line${l.startsWith('>') || l.startsWith('[') ? ' is-cmd' : ''}`}>
            {l}
          </div>
        ))}
        <span className="boot-caret blink" aria-hidden="true">_</span>
      </div>
      <div className="boot-skip small dim">toucher pour passer</div>
    </div>
  );
}
