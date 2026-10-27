import React, { useState } from 'react';
import { FAMILIES, PASTELS, PRIMARIES, SECONDARIES, THEMES, themeOf } from '../lib/theme.js';
import NumPad from '../components/NumPad.jsx';
import FieldPad from '../components/FieldPad.jsx';
import WifiModal from '../components/WifiModal.jsx';
import { CloseIcon } from '../components/Toasts.jsx';
import { uptime } from '../lib/format.js';

function Swatches({ items, value, mode, onPick }) {
  return (
    <div className="swatches">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`swatch-btn${value === c.id ? ' is-on' : ''}`}
          aria-label={c.name}
          aria-pressed={value === c.id}
          onClick={() => onPick(c.id)}
        >
          <span style={{ background: mode === 'dark' ? c.dark : c.light }} />
        </button>
      ))}
    </div>
  );
}

/** Vignette d'un thème : sa palette sombre et sa police, pour juger d'un coup d'œil. */
function ThemeTile({ theme, settings, on, onPick }) {
  const v = theme.palette(theme.only || 'dark', settings);
  return (
    <button type="button" className={`theme-tile${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onPick}>
      <span className="theme-chip" style={{ background: v.bg, color: v.prim, borderColor: v.line, fontFamily: theme.tileFont || theme.fonts.display }}>
        Aa <i style={{ background: v.prim }} /> <i style={{ background: v.sec }} />
      </span>
      <span className="theme-name">{theme.name.toUpperCase()}</span>
    </button>
  );
}

/** Tous les thèmes, regroupés par famille. */
function ThemeGrid({ settings, value, onPick }) {
  return FAMILIES.map(([fam, title]) => (
    <React.Fragment key={fam}>
      <span className="theme-family">{title}</span>
      <div className="theme-grid">
        {THEMES.filter((t) => t.family === fam).map((t) => (
          <ThemeTile key={t.id} theme={t} settings={settings} on={t.id === value} onPick={() => onPick(t.id)} />
        ))}
      </div>
    </React.Fragment>
  ));
}

function Toggle({ label, detail, on, onChange, onEdit }) {
  // Avec un réglage associé (horaires...) : la pastille ouvre le réglage, l'interrupteur active/désactive.
  if (onEdit) {
    return (
      <div className="toggle-row">
        <span className="toggle-text">
          <span>{label}</span>
          <button type="button" className="edit-chip" onClick={onEdit}>
            {detail} <span className="sec">MODIFIER</span>
          </button>
        </span>
        <button type="button" className="switch-hit" aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
          <span className={`switch${on ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="toggle-row" aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        <span>{label}</span>
        {detail && <span className="small dim">{detail}</span>}
      </span>
      <span className={`switch${on ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
    </button>
  );
}

const eur = (v, d) => `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const pct = (used, total) => (used != null && total ? Math.round((used / total) * 100) : '--');

export default function System({ state, settings, send, mode }) {
  const set = (patch) => send('settings:update', patch);
  const sys = state.system || {};
  const screen = state.screen || {};
  const meta = state.meta || {};
  const theme = themeOf(settings.themeId); // thème choisi (de jour), même si le thème de nuit est affiché
  const nightTheme = settings.nightThemeId ? themeOf(settings.nightThemeId) : null;
  const saverTheme = settings.screensaverThemeId ? themeOf(settings.screensaverThemeId) : null;
  // Couleurs personnalisables : seulement pour Base (néons) et Modern (pastels).
  const find = (list, id) => list.find((c) => c.id === id) || list[0];
  const colors =
    theme.custom === 'base'
      ? { list1: PRIMARIES, list2: SECONDARIES, key1: 'primary', key2: 'secondary', primary: find(PRIMARIES, settings.primary), secondary: find(SECONDARIES, settings.secondary) }
      : theme.custom === 'modern'
        ? { list1: PASTELS, list2: PASTELS, key1: 'modernPrimary', key2: 'modernSecondary', primary: find(PASTELS, settings.modernPrimary), secondary: find(PASTELS, settings.modernSecondary) }
        : null;
  const home = state.home;
  const wifi = state.wifi || {};
  const [modal, setModal] = useState(null); // 'position' | 'wifi' | 'sleep' | 'costs' | 'nightTheme' | 'saverTheme'
  const picker =
    modal === 'nightTheme'
      ? { key: 'nightThemeId', title: 'THÈME DE NUIT', none: 'AUCUN', help: `Affiché de ${settings.sleepFrom} à ${settings.sleepTo} quand tu réveilles l'écran. Le reste du temps : ${themeOf(settings.themeId).name}.` }
      : modal === 'saverTheme'
        ? { key: 'screensaverThemeId', title: 'ÉCRAN DE VEILLE', none: 'THÈME ACTUEL', help: "Thème de l'horloge affichée quand l'écran est en veille. « Thème actuel » reprend celui qui est affiché à ce moment-là." }
        : null;

  return (
    <div className="split">
      <section className="card col-settings settings-scroll" aria-label="Affichage">
        <span className="caption">AFFICHAGE</span>

        <div className="setting">
          <span className="label">THÈME · {theme.name.toUpperCase()}</span>
          <ThemeGrid settings={settings} value={settings.themeId} onPick={(id) => set({ themeId: id })} />
        </div>

        {theme.light ? (
          <div className="setting">
            <span className="label">MODE{settings.theme === 'auto' ? ` · AUTO (${mode === 'dark' ? 'sombre' : 'clair'})` : ''}</span>
            <div className="grid3 gap8">
              {[
                ['dark', 'SOMBRE'],
                ['light', 'CLAIR'],
                ['auto', 'AUTO']
              ].map(([id, label]) => (
                <button key={id} type="button" className={`btn${settings.theme === id ? ' btn-prim' : ''}`} aria-pressed={settings.theme === id} onClick={() => set({ theme: id })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span className="small dim">Ce thème est toujours {theme.only === 'light' ? 'clair' : 'sombre'}.</span>
        )}

        {colors && (
          <>
            <div className="setting">
              <span className="label">COULEUR PRIMAIRE · {colors.primary.name.toUpperCase()}</span>
              <Swatches items={colors.list1} value={colors.primary.id} mode={mode} onPick={(id) => set({ [colors.key1]: id })} />
            </div>
            <div className="setting">
              <span className="label">COULEUR SECONDAIRE · {colors.secondary.name.toUpperCase()}</span>
              <Swatches items={colors.list2} value={colors.secondary.id} mode={mode} onPick={(id) => set({ [colors.key2]: id })} />
            </div>
          </>
        )}

        <div className="setting">
          <span className="label">LUMINOSITÉ{!screen.backlight ? ' · écran non détecté ou service hôte absent' : ''}</span>
          <div className="brightness">
            <button type="button" className="square-btn" aria-label="Baisser la luminosité" onClick={() => set({ brightness: settings.brightness - 10 })}>−</button>
            <div className="bar"><div style={{ width: `${settings.brightness}%` }} /></div>
            <button type="button" className="square-btn" aria-label="Augmenter la luminosité" onClick={() => set({ brightness: settings.brightness + 10 })}>+</button>
            <span className="value pct">{settings.brightness}%</span>
          </div>
        </div>

        <div className="setting costs">
          <span className="label">COÛT DES IMPRESSIONS 3D</span>
          <button type="button" className="place-row cost-row" onClick={() => setModal('costs')}>
            <span className="cost-vals">
              <span><b>{eur(settings.filamentPriceKg, 2)}</b> /kg</span>
              <span><b>{eur(settings.kwhPrice, 4)}</b> /kWh</span>
              <span><b>{settings.printerWatts}</b> W</span>
            </span>
            <span className="sec small">MODIFIER</span>
          </button>
        </div>
      </section>

      <section className="col settings-scroll" aria-label="État du Pi">
        <div className="card">
          <div className="card-head">
            <span className="caption">{(sys.hostname || 'deskbuddy').toUpperCase()}</span>
            <span className="small sec">v{meta.version} · {meta.commit}</span>
          </div>
          <div className="grid3 pi-stats">
            <div><div className="label">CPU</div><div className="value">{sys.cpuTemp ?? '--'}<span className="unit">°C</span></div></div>
            <div><div className="label">CHARGE</div><div className="value">{sys.load ?? '--'}<span className="unit">%</span></div></div>
            <div><div className="label">RAM</div><div className="value">{pct(sys.memory?.usedMb, sys.memory?.totalMb)}<span className="unit">%</span></div></div>
            <div><div className="label">CARTE SD</div><div className="value">{pct(sys.disk?.usedGb, sys.disk?.totalGb)}<span className="unit">%</span></div></div>
            <div><div className="label">IP</div><div className="value md">{sys.ip || '--'}</div></div>
            <div><div className="label">UPTIME</div><div className="value md">{uptime(sys.uptimeS)}</div></div>
          </div>
        </div>
        <div className="card place-card">
          <button type="button" className="place-row" onClick={() => setModal('position')}>
            <span className="label">LIEU</span>
            <span className="ellipsis place-val">
              {home ? `${home.isHome ? 'Maison' : home.label || '?'}${home.pending ? ' (nom en attente de réseau)' : ''}` : 'non réglé'}
            </span>
            <span className="sec small">MODIFIER</span>
          </button>
          <button type="button" className="place-row" onClick={() => setModal('wifi')}>
            <span className="label">WI-FI</span>
            <span className="ellipsis place-val">{wifi.connecting ? `connexion à ${wifi.connecting}…` : wifi.current || (wifi.available === false ? 'non pilotable' : 'non connecté')}</span>
            <span className="sec small">CHANGER</span>
          </button>
        </div>
        <div className="card options">
          <span className="caption">OPTIONS</span>
          <Toggle
            label="Veille nocturne"
            detail={`${settings.sleepFrom} → ${settings.sleepTo}`}
            on={settings.sleepEnabled}
            onChange={(v) => set({ sleepEnabled: v })}
            onEdit={() => setModal('sleep')}
          />
          <div className="toggle-row">
            <span className="toggle-text">
              <span>Thème de nuit</span>
              <span className="small dim">pendant {settings.sleepFrom} → {settings.sleepTo}, si tu réveilles l'écran</span>
            </span>
            <button type="button" className="edit-chip" onClick={() => setModal('nightTheme')}>
              {nightTheme ? nightTheme.name : 'Aucun'} <span className="sec">CHOISIR</span>
            </button>
          </div>
          <Toggle
            label="Écran de veille"
            detail={`Horloge · ${saverTheme ? saverTheme.name : 'thème actuel'}`}
            on={settings.screensaver}
            onChange={(v) => set({ screensaver: v })}
            onEdit={() => setModal('saverTheme')}
          />
          <Toggle label="Balayage radar" detail="à couper si le Pi rame" on={settings.sweep} onChange={(v) => set({ sweep: v })} />
        </div>
      </section>
      {modal === 'position' && (
        <NumPad
          home={home}
          onCancel={() => setModal(null)}
          onHome={() => {
            send('location:home');
            setModal(null);
          }}
          onOk={(pos) => {
            send('location:set', pos);
            setModal(null);
          }}
        />
      )}
      {modal === 'sleep' && (
        <FieldPad
          title="VEILLE NOCTURNE"
          subtitle="L'écran s'éteint à la première heure et se rallume à la seconde. Un toucher le réveille."
          fields={[
            { id: 'sleepFrom', label: 'EXTINCTION', value: settings.sleepFrom, kind: 'time' },
            { id: 'sleepTo', label: 'RALLUMAGE', value: settings.sleepTo, kind: 'time' }
          ]}
          note="Format 24 h : tape 2300 pour 23:00."
          onCancel={() => setModal(null)}
          onOk={(v) => {
            set(v);
            setModal(null);
          }}
        />
      )}
      {modal === 'costs' && (
        <FieldPad
          title="COÛT DES IMPRESSIONS"
          subtitle="Sert à l'estimation sous la jauge et au coût réel en fin d'impression."
          fields={[
            { id: 'filamentPriceKg', label: 'FILAMENT · € LE KILO', value: settings.filamentPriceKg, kind: 'decimal', min: 0, max: 500, decimals: 2, unit: '€/kg' },
            { id: 'kwhPrice', label: 'ÉLECTRICITÉ · € LE kWh (TTC)', value: settings.kwhPrice, kind: 'decimal', min: 0, max: 5, decimals: 4, unit: '€/kWh' },
            { id: 'printerWatts', label: 'CONSOMMATION MOYENNE DE L\'IMPRIMANTE', value: settings.printerWatts, kind: 'decimal', min: 1, max: 3000, decimals: 0, unit: 'W' }
          ]}
          note="A1 : environ 100 W en moyenne (plateau chauffé compris)."
          onCancel={() => setModal(null)}
          onOk={(v) => {
            set(v);
            setModal(null);
          }}
        />
      )}
      {picker && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="info-card stock-card" role="dialog" aria-labelledby="nt-title" onClick={(e) => e.stopPropagation()}>
            <div className="stock-head">
              <div>
                <h1 id="nt-title" className="callsign">{picker.title}</h1>
                <div className="small soft">{picker.help}</div>
              </div>
              <div className="stock-actions">
                <button type="button" className={`btn${!settings[picker.key] ? ' btn-prim' : ''}`} onClick={() => { set({ [picker.key]: '' }); setModal(null); }}>
                  {picker.none}
                </button>
                <button type="button" className="square-btn" aria-label="Fermer" onClick={() => setModal(null)}>
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>
            <div className="settings-scroll night-grid">
              <ThemeGrid settings={settings} value={settings[picker.key]} onPick={(id) => { set({ [picker.key]: id }); setModal(null); }} />
            </div>
          </div>
        </div>
      )}
      {modal === 'wifi' && <WifiModal wifi={wifi} send={send} onClose={() => setModal(null)} />}
    </div>
  );
}
