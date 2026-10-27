import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createStore } from './store.js';
import { startSettings } from './modules/settings.js';
import { startSystem } from './modules/system.js';
import { startAircraft } from './modules/aircraft.js';
import { startPrinter } from './modules/printer.js';
import { startTimers } from './modules/timers.js';
import { startAirports } from './modules/airports.js';
import { startSatellites } from './modules/satellites.js';
import { startWeather } from './modules/weather.js';
import { startSpace } from './modules/space.js';
import { startLocation } from './modules/location.js';
import { startWifi } from './modules/wifi.js';
import { startNet } from './modules/net.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../dist');
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(here, '../data'));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '../package.json'), 'utf8'));

fs.mkdirSync(DATA_DIR, { recursive: true });

const store = createStore();
store.set('meta', {
  version: process.env.APP_VERSION || pkg.version,
  commit: (process.env.GIT_SHA || 'dev').slice(0, 7),
  startedAt: Date.now()
});

startSettings(store, { dataDir: DATA_DIR });
startSystem(store, { dataDir: DATA_DIR });
startNet(store);
startWifi(store);

// Modules qui dépendent de la position : relancés proprement à chaque changement de lieu.
const POLL_MS = Math.max(4, Number(process.env.AIRCRAFT_POLL_S || 4)) * 1000;
let geo = null;
startLocation(store, {
  home: { lat: parseFloat(process.env.HOME_LAT), lon: parseFloat(process.env.HOME_LON) },
  homeArea: process.env.WEATHER_AREA || 'Rhône',
  homeTz: process.env.TZ || 'Europe/Paris',
  dataDir: DATA_DIR,
  onChange(loc) {
    geo?.stop();
    geo = store.scope();
    const at = loc ? { lat: loc.lat, lon: loc.lon } : { lat: NaN, lon: NaN };
    startAircraft(geo, { ...at, pollMs: POLL_MS });
    startAirports(geo, { ...at, dataDir: DATA_DIR });
    startSatellites(geo, { ...at, dataDir: DATA_DIR });
    startWeather(geo, { ...at, area: loc?.area || loc?.label, alertAreas: loc?.alertAreas || [], feed: loc?.feed, dataDir: DATA_DIR });
  }
});
startSpace(store);
startPrinter(store, {
  host: process.env.BAMBU_HOST,
  serial: process.env.BAMBU_SERIAL,
  accessCode: process.env.BAMBU_ACCESS_CODE,
  mock: process.env.MOCK_PRINTER === '1',
  dataDir: DATA_DIR
});
startTimers(store, { dataDir: DATA_DIR });

/* ---------- Fichiers statiques (front buildé) ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ...store.get('meta') }));
  }

  // Adresse mal formée (%E0%A4%A...) : refusée proprement au lieu de faire planter le serveur.
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  let file = path.normalize(path.join(DIST, pathname));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const st = await fs.promises.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html');
  }

  const ext = path.extname(file);
  const stream = fs.createReadStream(file);
  stream.on('open', () => {
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Front non buildé : lance "npm run build" (ou utilise "npm run dev:web").');
  });
});

/* ---------- WebSocket ---------- */

/*
 * Seul l'écran du Pi (ou ton navigateur en dev) peut piloter le dashboard :
 * - le serveur n'écoute que sur 127.0.0.1 (BIND=0.0.0.0 dans .env pour l'ouvrir au réseau, en dev) ;
 * - une page web tierce ne peut pas s'y connecter (contrôle de l'origine) ;
 * - messages limités à 16 Ko.
 */
const BIND = process.env.BIND || '127.0.0.1';
const sameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true; // client non navigateur (tests en ligne de commande)
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024, verifyClient: ({ req }) => sameOrigin(req) });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

store.on('patch', (key, value) => broadcast({ type: 'patch', key, value }));
store.on('event', (event) => broadcast({ type: 'event', event }));

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', state: store.state }));
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type !== 'action' || typeof msg.action !== 'string') return;
    try {
      await store.dispatch(msg.action, msg.payload);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });
});

server.listen(PORT, BIND, () => {
  console.log(`[deskbuddy] v${store.get('meta').version} sur http://${BIND}:${PORT} (données : ${DATA_DIR})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[deskbuddy] arrêt (${sig})`);
    process.exit(0);
  });
}
