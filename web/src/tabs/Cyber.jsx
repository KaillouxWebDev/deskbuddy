import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import Segmented from '../components/Segmented.jsx';
import Keyboard from '../components/Keyboard.jsx';
import { CloseIcon } from '../components/Toasts.jsx';
import { Empty, Stale } from '../components/Status.jsx';

/* Onglet CYBER : fil des failles (CVE, avis CERT-FR), filtres par famille, détail avec vecteur CVSS en clair. */

const CATS = [
  ['web', 'WEB'],
  ['linux', 'LINUX'],
  ['windows', 'WIN'],
  ['apple', 'APPLE'],
  ['reseau', 'RÉSEAU'],
  ['telecom', 'TÉLÉCOM'],
  ['certfr', 'CERT-FR']
];
const SEV = { critique: 'CRIT', elevee: 'ÉLEV', moyenne: 'MOY', faible: 'FAIB' };
const GROUP = { wordpress: 'WordPress', kernel: 'Noyau Linux' };

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}
const pad = (n) => String(n).padStart(2, '0');
const dateFr = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const pct = (x) => (x == null ? null : x >= 0.1 ? `${Math.round(x * 100)} %` : `${(x * 100).toFixed(1).replace('.', ',')} %`);

function Badge({ v }) {
  if (v.kind === 'group') return <span className="cy-badge cy-grp">×{v.n}</span>;
  if (v.kind === 'certfr') return <span className={`cy-badge cy-cert${v.type === 'alerte' ? ' is-alert' : ''}`}>{v.type === 'alerte' ? 'ALERTE' : 'AVIS'}</span>;
  return (
    <span className={`cy-badge cy-${v.sev || 'nn'}`}>
      <b>{v.s != null ? v.s.toFixed(1) : '?'}</b>
      <span>{SEV[v.sev] || 'N/N'}</span>
    </span>
  );
}

function Row({ v, selected, onSelect, open, onToggle }) {
  if (v.kind === 'group') {
    return (
      <div className={`cy-row cy-group${open ? ' is-open' : ''}`}>
        <button type="button" className="cy-row-main" onClick={onToggle}>
          <Badge v={v} />
          <span className="cy-row-text">
            <span className="cy-row-top">
              <span className="cy-prod ellipsis">{GROUP[v.group]} · {v.n} faille{v.n > 1 ? 's' : ''}</span>
              <span className="cy-ago">{ago(v.t)}</span>
            </span>
            <span className="cy-row-sub ellipsis">
              {v.crit + v.high === 0 ? 'mineures ou pas encore notées' : `${v.crit ? `${v.crit} critique${v.crit > 1 ? 's' : ''}, ` : ''}${v.high} élevée${v.high > 1 ? 's' : ''}`}
              {` · voir ${open ? '▴' : '▾'}`}
            </span>
          </span>
        </button>
        {open && (
          <div className="cy-group-list">
            {v.items.map((i) => (
              <button key={i.id} type="button" className={`cy-sub${selected === i.id ? ' is-on' : ''}`} onClick={() => onSelect(i.id)}>
                <span className="cy-sub-score">{i.s != null ? i.s.toFixed(1) : '--'}</span>
                <span className="ellipsis">{i.p || i.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <button type="button" className={`cy-row${selected === v.id ? ' is-on' : ''}${v.ex ? ' is-exploited' : ''}`} onClick={() => onSelect(v.id)}>
      <span className="cy-row-main">
        <Badge v={v} />
        <span className="cy-row-text">
          <span className="cy-row-top">
            {v.ex && <span className="cy-flag" title="exploitée">⚠</span>}
            {v.kw?.length > 0 && <span className="cy-star" title={v.kw.join(', ')}>★</span>}
            <span className="cy-prod ellipsis">{v.p || v.id}</span>
            <span className="cy-ago">{ago(v.t)}</span>
          </span>
          <span className="cy-row-sub ellipsis">{v.kind === 'certfr' ? v.d : `${v.id} · ${v.d}`}</span>
        </span>
      </span>
    </button>
  );
}

function Qr({ url }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [url]);
  return (
    <svg className="cy-qr" viewBox={`-2 -2 ${svg.n + 4} ${svg.n + 4}`} role="img" aria-label="QR code de la fiche">
      <rect x="-2" y="-2" width={svg.n + 4} height={svg.n + 4} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  );
}

function Detail({ d }) {
  if (!d) return <p className="empty">Touche une faille pour voir le détail.</p>;
  if (d.kind === 'certfr') {
    return (
      <div className="cy-detail">
        <div className="cy-d-head">
          <span className={`cy-badge cy-cert${d.type === 'alerte' ? ' is-alert' : ''}`}>{d.type === 'alerte' ? 'ALERTE' : 'AVIS'}</span>
          <span className="small dim">{d.id} · {dateFr(d.published)}</span>
        </div>
        <div className="cy-d-title">{d.title}</div>
        <div className="cy-d-scroll">
          <p className="cy-d-desc">{d.desc}</p>
          {d.systems?.length > 0 && (
            <>
              <div className="label">SYSTÈMES AFFECTÉS</div>
              <ul className="cy-d-list">
                {d.systems.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {d.cves?.length > 0 && <div className="small dim">{d.cves.length} CVE : {d.cves.slice(0, 12).join(', ')}{d.cves.length > 12 ? '…' : ''}</div>}
        </div>
        <div className="cy-d-foot">
          <span className="small dim">Fiche complète sur ton téléphone</span>
          <Qr url={d.url} />
        </div>
      </div>
    );
  }
  const e = d.explain || {};
  const k = d.kev;
  return (
    <div className="cy-detail">
      <div className="cy-d-head">
        <Badge v={{ kind: 'cve', s: d.score, sev: d.sev }} />
        <div className="cy-d-id">
          <span className="callsign cy-d-cve">{d.id}</span>
          <span className="small dim">publiée le {dateFr(d.published)}</span>
        </div>
      </div>
      <div className="cy-d-title ellipsis">{d.product || 'Produit non précisé'}</div>
      <div className="cy-d-flags">
        {k && (
          <span className="cy-pill is-danger">
            ⚠ EXPLOITÉE · CISA {k.dateAdded.split('-').reverse().slice(0, 2).join('/')}
            {k.knownRansomwareCampaignUse === 'Known' ? ' · RANÇONGICIELS' : ''}
          </span>
        )}
        {!k && d.exploited && <span className="cy-pill is-danger">⚠ EXPLOITÉE</span>}
        {d.poc && !d.exploited && <span className="cy-pill is-warn">PREUVE D'EXPLOITATION</span>}
        {d.epss != null && <span className="cy-pill">EPSS {pct(d.epss)}</span>}
        {d.certfr && <span className="cy-pill">CERT-FR {d.certfr.type.toUpperCase()}</span>}
        {d.kw?.map((w) => (
          <span key={w} className="cy-pill is-star">★ {w}</span>
        ))}
      </div>
      <div className="cy-d-scroll">
        {d.vector && (
          <div className="cy-vec">
            <div><span className="label">ATTAQUE</span><span>{e.access || '?'}</span></div>
            <div><span className="label">COMPTE</span><span>{e.auth || '?'}</span></div>
            <div><span className="label">VICTIME</span><span>{e.user || '?'}</span></div>
            <div><span className="label">IMPACT</span><span>confid. {e.confidentiality || '?'} · intégr. {e.integrity || '?'} · dispo. {e.availability || '?'}</span></div>
          </div>
        )}
        {k && <p className="cy-d-desc"><b>{k.vulnerabilityName}.</b> {k.requiredAction}</p>}
        <p className="cy-d-desc">{d.desc || 'Pas encore de description.'}</p>
        {d.cwe && <div className="small dim">{d.cwe}{d.vector ? ` · ${d.vector}` : ''}</div>}
      </div>
      <div className="cy-d-foot">
        <span className="small dim">Fiche complète sur ton téléphone</span>
        <Qr url={d.url} />
      </div>
    </div>
  );
}

function KeywordsModal({ keywords, send, onClose }) {
  const [typing, setTyping] = useState(false);
  if (typing) {
    return (
      <Keyboard
        title="NOUVEAU MOT-CLÉ"
        subtitle="Un produit, un éditeur ou une technologie : Proxmox, Synology, WordPress..."
        minLength={2}
        okLabel="AJOUTER"
        onCancel={() => setTyping(false)}
        onOk={(label) => {
          send('cyber:keyword:add', { label });
          setTyping(false);
        }}
      />
    );
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="info-card stock-card" role="dialog" aria-labelledby="kw-title" onClick={(e) => e.stopPropagation()}>
        <div className="stock-head">
          <div>
            <h1 id="kw-title" className="callsign">MOTS-CLÉS</h1>
            <div className="small soft">Les failles qui les touchent sont marquées ★. Entre parenthèses : failles trouvées sur 7 jours.</div>
          </div>
          <div className="stock-actions">
            <button type="button" className="spool-btn is-primary cy-add" onClick={() => setTyping(true)}>
              + AJOUTER
            </button>
            <button type="button" className="square-btn" aria-label="Fermer" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>
        <div className="cy-kw-list">
          {keywords.map((k) => (
            <span key={k.label} className={`cy-kw${k.count ? ' has-hits' : ''}`}>
              {k.label} <span className="dim">({k.count})</span>
              <button type="button" aria-label={`Retirer ${k.label}`} onClick={() => send('cyber:keyword:remove', { label: k.label })}>
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Cyber({ state, send }) {
  const c = state.cyber || {};
  const feed = c.feed || [];
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState(null);
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(null);
  const [kwOpen, setKwOpen] = useState(false);
  const [more, setMore] = useState(1);
  useEffect(() => setMore(1), [filter, cat]);

  const list = useMemo(
    () =>
      feed.filter((v) => {
        if (cat === 'certfr' ? v.kind !== 'certfr' : cat && !v.cats?.includes(cat)) return false;
        if (filter === 'mine') return v.kw?.length > 0;
        if (filter === 'exploited') return v.ex;
        return true;
      }),
    [feed, filter, cat]
  );
  const mineCount = feed.filter((v) => v.kw?.length).length;
  const exCount = feed.filter((v) => v.ex).length;

  // Par défaut : la faille exploitée la plus récente, sinon la première du fil.
  const fallback = (list.find((v) => v.ex && v.kind !== 'group') || list.find((v) => v.kind !== 'group'))?.id;
  const current = sel || fallback;
  useEffect(() => {
    if (current && state.cyberDetail?.id !== current) send('cyber:select', { id: current });
  }, [current, send, state.cyberDetail?.id]);

  const st = c.stats;
  const err = c.nvdError || c.kevError || c.certError;
  const maxDay = Math.max(1, ...(st?.days || [1]));

  return (
    <div className="split cy">
      <div className="col cy-left">
        <div className="cy-stats">
          {st ? (
            <>
              <span className="label cy-24">24 H</span>
              <span className="cy-stat cy-critique">{st.critique} <span>CRIT</span></span>
              <span className="cy-stat cy-elevee">{st.elevee} <span>ÉLEV</span></span>
              <span className="cy-stat">{st.total} <span>CVE</span></span>
              <span className="cy-spark" aria-label="CVE par jour sur 7 jours">
                {st.days.map((n, i) => (
                  <i key={i} style={{ height: `${Math.max(2, (n / maxDay) * 18)}px` }} />
                ))}
              </span>
            </>
          ) : (
            <span className="small dim">Veille en cours de chargement…</span>
          )}
          <button type="button" className="edit-chip cy-kw-btn" onClick={() => setKwOpen(true)}>★ MOTS-CLÉS</button>
        </div>
        <Segmented
          label="Filtre"
          value={filter}
          onChange={setFilter}
          items={[
            ['all', 'TOUT'],
            ['mine', `★ LISTE${mineCount ? ` · ${mineCount}` : ''}`],
            ['exploited', `⚠ EXPLOITÉES${exCount ? ` · ${exCount}` : ''}`]
          ]}
        />
        <div className="cy-cats">
          {CATS.map(([id, label]) => (
            <button key={id} type="button" className={`cy-cat${cat === id ? ' is-on' : ''}`} onClick={() => setCat(cat === id ? null : id)}>
              {label}
            </button>
          ))}
        </div>
        <Stale updatedAt={null} error={err} retryAt={c.nvdRetryAt || c.kevRetryAt || c.certRetryAt} />
        <div className="cy-list">
          {!feed.length && <Empty loading="Récupération des failles des 7 derniers jours…" failed="Veille indisponible" error={err} retryAt={c.nvdRetryAt} />}
          {feed.length > 0 && !list.length && <p className="empty">Rien dans ce filtre sur 7 jours.</p>}
          {list.slice(0, 120 * more).map((v) => (
            <Row key={v.id} v={v} selected={current} onSelect={setSel} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} />
          ))}
          {list.length > 120 * more && (
            <button type="button" className="spool-btn cy-more" onClick={() => setMore(more + 1)}>
              VOIR LES {Math.min(120, list.length - 120 * more)} SUIVANTES ({list.length - 120 * more} restantes)
            </button>
          )}
        </div>
      </div>
      <div className="col cy-right card">
        <Detail d={state.cyberDetail && state.cyberDetail.id === current ? state.cyberDetail : null} />
      </div>
      {kwOpen && <KeywordsModal keywords={c.keywords || []} send={send} onClose={() => setKwOpen(false)} />}
    </div>
  );
}
