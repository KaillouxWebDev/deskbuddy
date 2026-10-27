import { useCallback, useEffect, useRef, useState } from 'react';

/** Connexion WebSocket au backend : état complet au démarrage, puis patchs et événements. */
export function useDeskbuddy(onEvent) {
  const [state, setState] = useState({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.type === 'snapshot') setState(msg.state);
        else if (msg.type === 'patch') setState((s) => ({ ...s, [msg.key]: msg.value }));
        else if (msg.type === 'event') onEventRef.current?.(msg.event);
        else if (msg.type === 'error') console.warn('[deskbuddy]', msg.message);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, Math.min(10_000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((action, payload = {}) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'action', action, payload }));
  }, []);

  return { state, connected, send };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
