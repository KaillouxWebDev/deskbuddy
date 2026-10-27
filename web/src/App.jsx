import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeskbuddy, useNow } from './lib/useDeskbuddy.js';
import { DEFAULT_SETTINGS, applyTheme, resolveMode, themeVars } from './lib/theme.js';
import Header from './components/Header.jsx';
import Toasts from './components/Toasts.jsx';
import AlertModal from './components/AlertModal.jsx';
import SleepOverlay from './components/SleepOverlay.jsx';
import Radar from './tabs/Radar.jsx';
import Printer from './tabs/Printer.jsx';
import Clock from './tabs/Clock.jsx';
import Space from './tabs/Space.jsx';
import Weather from './tabs/Weather.jsx';
import System from './tabs/System.jsx';

export const TABS = [
  { id: 'radar', label: 'RADAR' },
  { id: 'weather', label: 'MÉTÉO' },
  { id: 'sky', label: 'ESPACE' },
  { id: 'printer', label: 'IMPRIMANTE' },
  { id: 'clock', label: 'HORLOGE' }
];

export default function App() {
  const [tab, setTabRaw] = useState('radar');
  const lastTab = useRef('radar');
  const setTab = useCallback((id) => {
    if (id !== 'system') lastTab.current = id;
    setTabRaw(id);
  }, []);
  // La roue crantée ouvre les réglages ; un second appui ramène à l'onglet précédent.
  const toggleSettings = () => setTab(tab === 'system' ? lastTab.current : 'system');
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const onEvent = useCallback(
    (e) => {
      if (e.kind === 'toast') {
        setToasts((t) => [...t.slice(-2), e]);
        if (!e.sticky) setTimeout(() => dismiss(e.id), 8_000);
      } else if (e.kind === 'printer:alert') {
        setTab('printer');
      }
    },
    [dismiss, setTab]
  );

  const { state, connected, send } = useDeskbuddy(onEvent);
  const now = useNow(1000);
  const date = new Date(now);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...state.settings }), [state.settings]);
  const mode = resolveMode(settings.theme, date);

  useEffect(() => {
    applyTheme(themeVars(settings, mode));
    document.documentElement.dataset.mode = mode;
  }, [settings.primary, settings.secondary, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nouvelle version déployée (le conteneur a redémarré avec un autre commit) : on recharge la page.
  const commit = state.meta?.commit;
  const firstCommit = useRef(null);
  useEffect(() => {
    if (!commit) return;
    if (firstCommit.current === null) firstCommit.current = commit;
    else if (commit !== firstCommit.current) location.reload();
  }, [commit]);

  const alert = state.printer?.alert;
  // Alerte déjà active au chargement (page rechargée, kiosque redémarré) : on bascule aussi sur l'imprimante.
  const alertKey = alert && !alert.acked ? alert.key : null;
  useEffect(() => {
    if (alertKey) setTab('printer');
  }, [alertKey, setTab]);
  const showAlert = Boolean(alert && !alert.acked && now >= (alert.snoozeUntil || 0));

  const props = { state, settings, send, now };

  // Pastilles sur les onglets, visibles depuis n'importe quelle page.
  const satInView = (state.satPasses?.passes || []).some((p) => p.maxEl >= 20 && p.aos <= now && now < p.los);
  const wxLevel = ['rouge', 'orange', 'jaune'].find((l) => (state.weather?.warnings || []).some((w) => w.level === l)) || null;

  return (
    <div className="app">
      <Header
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        date={date}
        connected={connected}
        online={state.net?.online !== false}
        printerAlert={Boolean(alert)}
        satInView={satInView}
        wxLevel={wxLevel}
        onSleep={() => send('screen:sleep')}
        settingsOpen={tab === 'system'}
        onSettings={toggleSettings}
      />
      <main className="content">
        {tab === 'radar' && <Radar {...props} />}
        {tab === 'weather' && <Weather {...props} />}
        {tab === 'sky' && <Space {...props} />}
        {tab === 'printer' && <Printer {...props} />}
        {tab === 'clock' && <Clock {...props} />}
        {tab === 'system' && <System {...props} mode={mode} />}
      </main>
      <Toasts toasts={toasts} onClose={dismiss} />
      {showAlert && tab === 'printer' && <AlertModal alert={alert} printer={state.printer} send={send} />}
      <SleepOverlay asleep={Boolean(state.screen?.asleep)} onWake={() => send('screen:wake')} />
    </div>
  );
}
