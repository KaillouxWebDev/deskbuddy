import React, { useEffect, useState } from 'react';
import Segmented from '../components/Segmented.jsx';
import { Empty, Stale } from '../components/Status.jsx';
import WxIcon from '../components/WxIcon.jsx';
import { aqiLevel, dir8, pollenLevel, wxLabel } from '../lib/wx.js';
import { hhmm, int } from '../lib/format.js';

const RANGES = [30, 60, 120, 200];
const R = 180; // anneau extérieur = portée choisie
const C = 202;
const EARTH_R = 6378137;
const RAIN_ZOOM = 7; // zoom max de l'API gratuite RainViewer
const FRAMES = 6; // dernière heure, une image toutes les 10 min
const toRad = (d) => (d * Math.PI) / 180;
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function worldPx(lat, lon, z) {
  const n = 256 * 2 ** z;
  const phi = toRad(lat);
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n };
}

/** Dernière heure de radar pluie, rejouée en boucle comme sur les sites météo. */
function useRainFrames() {
  const [frames, setFrames] = useState(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const json = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
        const past = (json.radar?.past || []).slice(-FRAMES).map((f) => ({ host: json.host, path: f.path, time: f.time * 1000 }));
        if (alive && past.length) setFrames(past);
      } catch {
        /* on garde les images précédentes */
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!frames) return undefined;
    setIdx(frames.length - 1);
    let i = frames.length - 1;
    let t;
    const step = () => {
      i = (i + 1) % frames.length;
      setIdx(i);
      t = setTimeout(step, i === frames.length - 1 ? 2500 : 600); // pause sur l'image la plus récente
    };
    t = setTimeout(step, 2500);
    return () => clearTimeout(t);
  }, [frames]);
  return { frames, idx };
}

function WeatherMap({ home, towns, range }) {
  const { frames, idx } = useRainFrames();
  const halfKm = (range * 200) / 180;
  const polar = (dist, brg) => {
    const k = (dist / range) * R;
    return { x: C + k * Math.sin(toRad(brg)), y: C - k * Math.cos(toRad(brg)) };
  };

  let tiles = [];
  if (frames) {
    const h = worldPx(home.lat, home.lon, RAIN_ZOOM);
    const s = ((156.543 * Math.cos(toRad(home.lat))) / 2 ** RAIN_ZOOM) * (200 / halfKm);
    const span = 200 / s;
    for (let tx = Math.floor((h.x - span) / 256); tx <= Math.floor((h.x + span) / 256); tx++) {
      for (let ty = Math.floor((h.y - span) / 256); ty <= Math.floor((h.y + span) / 256); ty++) {
        tiles.push({ key: `${tx}-${ty}`, tx, ty, left: 200 + (tx * 256 - h.x) * s, top: 200 + (ty * 256 - h.y) * s, size: 256 * s });
      }
    }
  }

  const mx = EARTH_R * toRad(home.lon);
  const my = EARTH_R * Math.log(Math.tan(Math.PI / 4 + toRad(home.lat) / 2));
  const half = (halfKm * 1000) / Math.cos(toRad(home.lat));
  const bbox = [mx - half, my - half, mx + half, my + half].map(Math.round).join(',');
  const slot = Math.floor(Date.now() / 300_000);
  const lightningSrc = `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=${bbox}&width=400&height=400&format=image/png&transparent=true&_=${slot}`;

  const frame = frames?.[idx];
  // Villes repères : les plus peuplées d'abord, en sautant celles dont l'étiquette chevaucherait une autre.
  const visibleTowns = [];
  for (const t of towns || []) {
    if (t.dist > range * 1.05 || t.dist < range * 0.05) continue;
    const p = polar(t.dist, t.bearing);
    if (visibleTowns.every((v) => Math.abs(v.p.x - p.x) > 70 || Math.abs(v.p.y - p.y) > 16)) visibleTowns.push({ ...t, p });
    if (visibleTowns.length >= 14) break;
  }

  return (
    <>
      <svg className="radar-grid" width="404" height="404" viewBox="0 0 404 404" role="img" aria-label="Carte de la pluie et des orages autour de chez toi">
        <circle cx={C} cy={C} r="200" className="radar-disc" />
        <circle cx={C} cy={C} r="90" className="radar-ring" />
        <circle cx={C} cy={C} r="180" className="radar-ring radar-ring-outer" />
        <text x={C} y="16" textAnchor="middle" className="radar-card">N</text>
        <text x="392" y="207" textAnchor="middle" className="radar-card">E</text>
        <text x={C} y="398" textAnchor="middle" className="radar-card">S</text>
        <text x="12" y="207" textAnchor="middle" className="radar-card">O</text>
      </svg>
      <div className="wx-layer" aria-hidden="true">
        {frames?.map((f, i) => (
          <div key={f.path} className="wx-frame" style={{ visibility: i === idx ? 'visible' : 'hidden' }}>
            {tiles.map((t) => (
              <img
                key={t.key}
                className="wx-rain-full"
                src={`${f.host}${f.path}/256/${RAIN_ZOOM}/${t.tx}/${t.ty}/2/1_1.png`}
                alt=""
                style={{ left: t.left, top: t.top, width: t.size, height: t.size }}
              />
            ))}
          </div>
        ))}
        <img className="wx-lightning" src={lightningSrc} alt="" />
      </div>
      <svg className="radar-grid wx-overlay" width="404" height="404" viewBox="0 0 404 404" aria-hidden="true">
        <text x={C + 4} y={C - 90 + 12} className="sky-label">{range / 2}</text>
        <text x={C + 4} y={C - 180 + 12} className="sky-label">{range} km</text>
        {visibleTowns.map((t) => {
          const { p } = t;
          return (
            <g key={t.name} className="wx-town">
              <circle cx={p.x} cy={p.y} r="2" />
              <text x={p.x + 5} y={p.y + 4}>{t.name}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="4" className="radar-home" />
      </svg>
      <div className="wx-legend">
        <span className="small dim">{frame ? `pluie ${hhmm(new Date(frame.time))}` : 'pluie…'}</span>
        <span className="wx-scale" aria-label="intensité de la pluie, de faible à forte" />
        <span className="small dim">faible → forte · <span className="wx-bolt-key">éclairs</span></span>
      </div>
    </>
  );
}

function Now({ w }) {
  const f = w.forecast;
  if (!f) return <Empty loading="Chargement de la météo…" failed="Météo indisponible" error={w.forecastError} retryAt={w.forecastRetryAt} />;
  const c = f.current;
  const today = f.daily[0];
  return (
    <div className="card wx-now">
      <Stale updatedAt={f.at} error={w.forecastError} retryAt={w.forecastRetryAt} />
      <div className="wx-now-head">
        <WxIcon code={c.code} day={c.day} size={52} />
        <div>
          <div className="wx-temp">{Math.round(c.temp)}°</div>
          <div className="small soft">{wxLabel(c.code)}</div>
        </div>
        {today && (
          <div className="wx-minmax small">
            <span className="sec">{Math.round(today.max)}°</span>
            <span className="dim">{Math.round(today.min)}°</span>
          </div>
        )}
      </div>
      <div className="grid2">
        <div><div className="label">RESSENTI</div><div className="value md">{Math.round(c.feels)}°</div></div>
        <div><div className="label">HUMIDITÉ</div><div className="value md">{c.humidity}%</div></div>
        <div><div className="label">VENT</div><div className="value md">{Math.round(c.wind)}<span className="unit"> km/h {dir8(c.windDir)}</span></div></div>
        <div><div className="label">RAFALES</div><div className="value md">{Math.round(c.gusts)}<span className="unit"> km/h</span></div></div>
        <div><div className="label">PLUIE (1 H)</div><div className="value md">{f.nextHourRain ?? '--'}<span className="unit"> mm</span></div></div>
        <div>
          <div className="label">SOLEIL</div>
          <div className="value md">{today ? `${hhmm(new Date(today.sunrise))} · ${hhmm(new Date(today.sunset))}` : '--'}</div>
        </div>
      </div>
    </div>
  );
}

function Forecast({ w }) {
  const f = w.forecast;
  if (!f) return <Empty loading="Chargement des prévisions…" failed="Prévisions indisponibles" error={w.forecastError} retryAt={w.forecastRetryAt} />;
  return (
    <div className="wx-forecast">
      <Stale updatedAt={f.at} error={w.forecastError} retryAt={w.forecastRetryAt} />
      <div className="card wx-hours">
        {f.hourly.map((h) => (
          <div key={h.at} className="wx-hour">
            <span className="small dim">{new Date(h.at).getHours()} h</span>
            <WxIcon code={h.code} day={h.day} size={22} />
            <span className="wx-hour-temp">{Math.round(h.temp)}°</span>
            <span className={`small ${h.pop >= 50 ? 'sec' : 'dim'}`}>{h.pop ?? 0}%</span>
          </div>
        ))}
      </div>
      <div className="card wx-days">
        {f.daily.slice(1, 4).map((d) => (
          <div key={d.date} className="wx-day">
            <span>{DAYS[new Date(`${d.date}T12:00`).getDay()]}</span>
            <WxIcon code={d.code} size={22} />
            <span className="small soft ellipsis">{wxLabel(d.code)}</span>
            <span className="right">
              <span className="sec">{Math.round(d.max)}°</span> <span className="dim">{Math.round(d.min)}°</span>
            </span>
            <span className="right small dim">{d.rain ? `${int(d.rain)} mm` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Air({ w }) {
  const a = w.air;
  if (!a) return <Empty loading="Chargement de la qualité de l'air…" failed="Qualité de l'air indisponible" error={w.airError} retryAt={w.airRetryAt} />;
  const lvl = aqiLevel(a.aqi);
  return (
    <div className="wx-forecast">
      <Stale updatedAt={a.at} error={w.airError} retryAt={w.airRetryAt} />
      <div className="card">
        <div className="card-head">
          <span className="caption">QUALITÉ DE L'AIR</span>
          <span className="small dim">indice européen</span>
        </div>
        <div className="wx-aqi">
          <span className={`wx-temp tone-${lvl.tone}`}>{a.aqi ?? '--'}</span>
          <span className={`tone-${lvl.tone}`}>{lvl.text}</span>
        </div>
        <div className="grid4 gap8">
          <div><div className="label">PM2.5</div><div className="value md">{int(a.pm25)}</div></div>
          <div><div className="label">PM10</div><div className="value md">{int(a.pm10)}</div></div>
          <div><div className="label">OZONE</div><div className="value md">{int(a.o3)}</div></div>
          <div><div className="label">NO₂</div><div className="value md">{int(a.no2)}</div></div>
        </div>
        <span className="small dim">en µg/m³</span>
      </div>
      <div className="card">
        <span className="caption">POLLENS</span>
        <div className="pollens">
          {a.pollens.map((p) => {
            const l = pollenLevel(p.value);
            return (
              <div key={p.name} className="pollen">
                <span className="small">{p.name}</span>
                <span className={`small tone-${l.tone}`}>{l.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Weather({ state, settings, send }) {
  const [view, setView] = useState('now');
  const w = state.weather || {};
  const range = RANGES.includes(settings.wxRangeKm) ? settings.wxRangeKm : 120;
  const zoom = (dir) => {
    const i = RANGES.indexOf(range);
    send('settings:update', { wxRangeKm: RANGES[Math.min(RANGES.length - 1, Math.max(0, i + dir))] });
  };
  const warn = (w.warnings || [])[0];

  return (
    <div className="split">
      <section className="radar" aria-label="Carte météo">
        {state.home ? <WeatherMap home={state.home} towns={state.towns} range={range} /> : <p className="empty">Coordonnées manquantes.</p>}
        <div className="range-label">{range} km</div>
        <div className="zoom">
          <button type="button" className="square-btn" aria-label="Dézoomer" onClick={() => zoom(1)} disabled={range === RANGES[RANGES.length - 1]}>−</button>
          <button type="button" className="square-btn" aria-label="Zoomer" onClick={() => zoom(-1)} disabled={range === RANGES[0]}>+</button>
        </div>
      </section>

      <section className="col" aria-label="Prévisions">
        {warn && (
          <div className={`wx-warning level-${warn.level}`}>
            <span>VIGILANCE {warn.level.toUpperCase()}</span>
            <span className="small">{(w.warnings || []).map((x) => x.type).join(' · ')}</span>
          </div>
        )}
        <Segmented
          label="Vue météo"
          value={view}
          onChange={setView}
          items={[
            ['now', 'MAINTENANT'],
            ['forecast', 'PRÉVISIONS'],
            ['air', 'AIR']
          ]}
        />
        {view === 'now' && <Now w={w} />}
        {view === 'forecast' && <Forecast w={w} />}
        {view === 'air' && <Air w={w} />}
      </section>
    </div>
  );
}
