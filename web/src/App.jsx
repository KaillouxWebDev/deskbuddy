import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeskbuddy, useNow } from './lib/useDeskbuddy.js';
import { DEFAULT_SETTINGS, activeThemeId, applyTheme, resolveMode, themeOf, themeVars } from './lib/theme.js';
import BootScreen from './components/BootScreen.jsx';
import Header from './components/Header.jsx';
import Toasts from './components/Toasts.jsx';
import AlertModal from './components/AlertModal.jsx';
import NotificationsModal from './components/NotificationsModal.jsx';
import SleepOverlay from './components/SleepOverlay.jsx';
import Radar from './tabs/Radar.jsx';
import Printer from './tabs/Printer.jsx';
import Clock from './tabs/Clock.jsx';
import Cyber from './tabs/Cyber.jsx';
import Space from './tabs/Space.jsx';
import Weather from './tabs/Weather.jsx';
import System from './tabs/System.jsx';

export const TABS = [
  { id: 'radar', label: 'RADAR' },
  { id: 'weather', label: 'MÉTÉO' },
  { id: 'sky', label: 'ESPACE' },
  { id: 'printer', label: 'IMPRIMANTE' },
  { id: 'clock', label: 'HORLOGE' },
  { id: 'cyber', label: 'CYBER' }
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
  const [notifOpen, setNotifOpen] = useState(false);

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
  // Thème de nuit pendant les heures de veille nocturne, thème choisi le reste du temps.
  const asleep = Boolean(state.screen?.asleep);
  const saver = asleep && Boolean(state.screen?.saver);
  // Écran de veille avec son propre thème ; sinon thème de nuit pendant la veille nocturne, sinon le thème choisi.
  const themeId = saver && settings.screensaverThemeId ? settings.screensaverThemeId : activeThemeId(settings, date);
  const mode = resolveMode(settings, date, themeId);
  const theme = themeOf(themeId);

  useEffect(() => {
    applyTheme(themeVars(settings, mode, themeId), theme);
    document.documentElement.dataset.mode = mode;
  }, [themeId, settings.primary, settings.secondary, settings.modernPrimary, settings.modernSecondary, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Écran de démarrage : au lancement (donc aussi après une mise à jour) et à chaque changement de thème.
  const loadedThemeId = state.settings ? settings.themeId : null;
  const shownTheme = useRef(null);
  const [boot, setBoot] = useState(null);
  useEffect(() => {
    if (!loadedThemeId || shownTheme.current === loadedThemeId) return;
    shownTheme.current = loadedThemeId;
    setBoot(loadedThemeId);
  }, [loadedThemeId]);

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
        cyberAlert={Boolean(state.cyber?.feed?.some((v) => v.ex && Date.now() - v.t < 86_400_000))}
        onSleep={() => send('screen:sleep')}
        settingsOpen={tab === 'system'}
        onSettings={toggleSettings}
        unread={state.notifications?.unread || 0}
        onNotifs={() => setNotifOpen(true)}
      />
      <main className="content">
        {tab === 'radar' && <Radar {...props} />}
        {tab === 'weather' && <Weather {...props} />}
        {tab === 'sky' && <Space {...props} />}
        {tab === 'printer' && <Printer {...props} />}
        {tab === 'clock' && <Clock {...props} />}
        {tab === 'cyber' && <Cyber {...props} />}
        {tab === 'system' && <System {...props} mode={mode} />}
      </main>
      <Toasts
        toasts={toasts}
        onClose={dismiss}
        onOpen={(id) => {
          dismiss(id);
          setNotifOpen(true);
        }}
      />
      {notifOpen && <NotificationsModal data={state.notifications} send={send} onClose={() => setNotifOpen(false)} />}
      {boot && <BootScreen key={boot} theme={themeOf(boot)} onDone={() => setBoot(null)} />}
      {showAlert && tab === 'printer' && <AlertModal alert={alert} printer={state.printer} send={send} />}
      <SleepOverlay asleep={asleep} saver={saver ? theme : null} date={date} onWake={() => send('screen:wake')} />
    </div>
  );
}
