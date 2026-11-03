import React, { useEffect, useState } from 'react';
import { CloseIcon } from './Toasts.jsx';
import Keyboard from './Keyboard.jsx';

/*
 * Connexion à l'imprimante depuis l'écran : adresse IP, numéro de série, code d'accès LAN.
 * RECHERCHER trouve les imprimantes Bambu du réseau (et remplit l'IP et le numéro de série).
 * Rien n'est enregistré tant que l'essai de connexion n'a pas réussi. Le code d'accès n'est jamais réaffiché.
 */

const FIELDS = {
  host: { title: 'ADRESSE IP', subtitle: "Sur l'A1 : Paramètres > Réseau (ex. 192.168.1.42).", min: 7 },
  serial: { title: 'NUMÉRO DE SÉRIE', subtitle: "Sur l'A1 : Paramètres > Appareil, ou au dos de l'imprimante.", min: 8 },
  accessCode: { title: "CODE D'ACCÈS LAN", subtitle: "Sur l'A1 : Paramètres > Réseau > code d'accès (8 caractères).", min: 6, secret: true }
};

export default function PrinterSetupModal({ link, setup, send, onClose }) {
  const [form, setForm] = useState({ host: link?.host || '', serial: link?.serial || '', accessCode: '' });
  const [typing, setTyping] = useState(null);
  const s = setup || {};
  useEffect(() => {
    if (s.test?.ok) {
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [s.test, onClose]);

  if (typing) {
    const f = FIELDS[typing];
    return (
      <Keyboard
        title={f.title}
        subtitle={f.subtitle}
        initial={typing === 'accessCode' ? '' : form[typing]}
        secret={Boolean(f.secret)}
        minLength={f.min}
        okLabel="OK"
        onCancel={() => setTyping(null)}
        onOk={(v) => {
          setForm({ ...form, [typing]: v.trim() });
          setTyping(null);
        }}
      />
    );
  }

  const codeLabel = form.accessCode ? '•'.repeat(form.accessCode.length) : link?.codeSet ? `${link.codeHint} (inchangé)` : 'à saisir';
  const canTest = form.host && form.serial && (form.accessCode || link?.codeSet) && !s.testing;
  const busy = s.testing || s.scanning;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card stock-card" role="dialog" aria-labelledby="ps-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="ps-title" className="callsign">IMPRIMANTE</h1>
            <div className="small soft">Connexion en réseau local à l'A1, en lecture seule.</div>
          </div>
          <button type="button" className="square-btn" aria-label="Fermer" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="card place-card ps-fields">
          <button type="button" className="place-row" onClick={() => setTyping('host')}>
            <span className="label">IP</span>
            <span className="ellipsis place-val">{form.host || 'à saisir'}</span>
            <span className="sec small">MODIFIER</span>
          </button>
          <button type="button" className="place-row" onClick={() => setTyping('serial')}>
            <span className="label">SÉRIE</span>
            <span className="ellipsis place-val">{form.serial || 'à saisir'}</span>
            <span className="sec small">MODIFIER</span>
          </button>
          <button type="button" className="place-row" onClick={() => setTyping('accessCode')}>
            <span className="label">CODE</span>
            <span className="ellipsis place-val">{codeLabel}</span>
            <span className="sec small">MODIFIER</span>
          </button>
        </div>

        <div className="ps-scan">
          <button type="button" className="spool-btn" disabled={busy} onClick={() => send('printer:discover')}>
            {s.scanning ? 'RECHERCHE SUR LE RÉSEAU…' : 'RECHERCHER SUR LE RÉSEAU'}
          </button>
          {s.found && s.found.length === 0 && <span className="small dim">Aucune imprimante Bambu trouvée (allumée ? sur le même réseau ?)</span>}
          {s.found?.map((f) => (
            <button key={f.host} type="button" className={`ps-found${form.host === f.host ? ' is-on' : ''}`} onClick={() => setForm({ ...form, host: f.host, serial: f.serial })}>
              <b>{f.host}</b>
              <span className="small soft">{f.serial}</span>
            </button>
          ))}
        </div>

        <div className="ps-foot">
          <span className={`small ${s.test ? (s.test.ok ? 'tone-prim' : 'tone-danger') : 'dim'}`}>
            {s.testing ? 'Essai de connexion…' : s.test ? (s.test.ok ? 'Imprimante connectée, réglages enregistrés.' : `Échec : ${s.test.msg}`) : "Les réglages ne sont enregistrés qu'après un essai réussi."}
          </span>
          <button
            type="button"
            className="spool-btn is-primary ps-go"
            disabled={!canTest}
            onClick={() => send('printer:configure', { host: form.host, serial: form.serial, ...(form.accessCode ? { accessCode: form.accessCode } : {}) })}
          >
            TESTER ET ENREGISTRER
          </button>
        </div>
      </div>
    </div>
  );
}
