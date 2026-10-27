import React from 'react';
import FieldPad from './FieldPad.jsx';

/*
 * Saisie de la position : latitude et longitude en degrés décimaux.
 * Astuce : un appui long sur la carte de Google Maps (ou Plans) sur le téléphone affiche ces deux nombres.
 */
export default function NumPad({ home, onOk, onHome, onCancel }) {
  return (
    <FieldPad
      title="POSITION"
      subtitle="Centre du radar, de la météo et des passages de satellites."
      fields={[
        { id: 'lat', label: 'LATITUDE · N+ / S−', value: home?.lat ?? '', kind: 'decimal', min: -90, max: 90, decimals: 4, signed: true },
        { id: 'lon', label: 'LONGITUDE · E+ / O−', value: home?.lon ?? '', kind: 'decimal', min: -180, max: 180, decimals: 4, signed: true }
      ]}
      note="Sur ton téléphone : appui long sur la carte dans Google Maps ou Plans pour lire ces deux nombres."
      extra={home?.canGoHome && !home?.isHome ? <button type="button" className="btn" onClick={onHome}>MAISON</button> : null}
      onOk={onOk}
      onCancel={onCancel}
    />
  );
}
