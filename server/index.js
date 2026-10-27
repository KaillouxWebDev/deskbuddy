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
const HOME = { lat: parseFloat(process.env.HOME_LAT), lon: parseFloat(process.env.HOME_LON) };
if (Number.isFinite(HOME.lat) && Number.isFinite(HOME.lon)) store.set('home', HOME);
startAircraft(store, { ...HOME, pollMs: Math.max(5, Number(process.env.AIRCRAFT_POLL_S || 8)) * 1000 });
startAirports(store, { ...HOME, dataDir: DATA_DIR });
startSatellites(store, { ...HOME, dataDir: DATA_DIR });
startWeather(store, { ...HOME, area: process.env.WEATHER_AREA || 'Rhône', dataDir: DATA_DIR });
startSpace(store);
startPrinter(store, {
  host: process.env.BAMBU_HOST,
  serial: process.env.BAMBU_SERIAL,
  accessCode: process.env.BAMBU_ACCESS_CODE,
  mock: process.env.MOCK_PRINTER === '1'
});
startTimers(store);

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

  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) {
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

const wss = new WebSocketServer({ server, path: '/ws' });

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

server.listen(PORT, () => {
  console.log(`[deskbuddy] v${store.get('meta').version} sur http://localhost:${PORT} (données : ${DATA_DIR})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[deskbuddy] arrêt (${sig})`);
    process.exit(0);
  });
}
