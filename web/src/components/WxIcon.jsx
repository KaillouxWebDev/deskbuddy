import React from 'react';
import { wxKind } from '../lib/wx.js';

/** Petites icônes météo en traits, dans la couleur du thème. */
export default function WxIcon({ code, day = true, size = 24 }) {
  const kind = wxKind(code);
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const cloud = <path d="M7 17 H16.5 A3.5 3.5 0 0 0 16.9 10.03 A5 5 0 0 0 7.3 9.3 A3.9 3.9 0 0 0 7 17 Z" />;
  const sunOrMoon = day ? (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3" />
    </>
  ) : (
    <path d="M19 14.5 A7.5 7.5 0 1 1 9.5 5 A6 6 0 0 0 19 14.5 Z" />
  );
  switch (kind) {
    case 'clear':
      return <svg {...p}>{sunOrMoon}</svg>;
    case 'partly':
      return (
        <svg {...p}>
          {day ? <path d="M8 3.5 V4.8 M3.5 8 H4.8 M4.8 4.8 L5.7 5.7 M11.2 4.8 L10.3 5.7 M5.6 10.5 A3 3 0 1 1 10.8 7.4" /> : <path d="M11 4.5 A4.5 4.5 0 0 0 5 10" />}
          <path d="M8 19 H17 A3.2 3.2 0 0 0 17.3 12.6 A4.6 4.6 0 0 0 8.3 12 A3.5 3.5 0 0 0 8 19 Z" />
        </svg>
      );
    case 'rain':
      return (
        <svg {...p}>
          <path d="M7 14 H16.5 A3.5 3.5 0 0 0 16.9 7.03 A5 5 0 0 0 7.3 6.3 A3.9 3.9 0 0 0 7 14 Z" />
          <path d="M8.5 17 L7.5 20 M12.5 17 L11.5 20 M16.5 17 L15.5 20" />
        </svg>
      );
    case 'storm':
      return (
        <svg {...p}>
          <path d="M7 14 H16.5 A3.5 3.5 0 0 0 16.9 7.03 A5 5 0 0 0 7.3 6.3 A3.9 3.9 0 0 0 7 14 Z" />
          <path d="M12.5 14.5 L10 18.5 H13.5 L11.5 22" />
        </svg>
      );
    case 'snow':
      return (
        <svg {...p}>
          <path d="M7 14 H16.5 A3.5 3.5 0 0 0 16.9 7.03 A5 5 0 0 0 7.3 6.3 A3.9 3.9 0 0 0 7 14 Z" />
          <path d="M8 18 L8 18.01 M12 17 L12 17.01 M16 18 L16 18.01 M10 21 L10 21.01 M14 21 L14 21.01" strokeWidth="2.6" />
        </svg>
      );
    case 'fog':
      return (
        <svg {...p}>
          <path d="M4 9 H20 M3 13 H18 M6 17 H21" />
        </svg>
      );
    default:
      return <svg {...p}>{cloud}</svg>;
  }
}
