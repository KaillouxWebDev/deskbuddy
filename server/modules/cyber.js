import path from 'node:path';
import { periodic } from '../lib/task.js';
import { writeJson, readJson } from '../lib/fsx.js';
import {
  fromNvd,
  classify,
  matchKeywords,
  compileKeywords,
  standsOut,
  visible,
  severityOf,
  parseCertFr,
  explainVector,
  DEFAULT_KEYWORDS,
  keywordRe
} from './cyberClassify.js';

/*
 * Onglet CYBER : veille des failles de sécurité.
 * Sources (gratuites, sans clé) :
 * - NVD (API 2.0) : toutes les CVE publiées, toutes les 2 h (recommandation du NVD) ;
 * - CISA KEV : failles exploitées activement, toutes les heures ;
 * - CERT-FR : avis et alertes en français, toutes les 30 min ;
 * - EPSS (FIRST) : probabilité d'exploitation à 30 jours, une fois par jour pour les failles notables.
 * On garde 7 jours sur la carte SD (data/cyber.json).
 *
 * Notifications (rien pendant la veille nocturne, résumé à 8 h) :
 * - rouge, reste affichée : alerte CERT-FR, nouvelle faille exploitée (KEV) touchant un mot-clé ;
 * - orange : nouvelle faille exploitée hors mots-clés ; failles critiques (9+) touchant un mot-clé ou avec
 *   preuve d'exploitation, regroupées (une notif par produit, au plus une salve par 30 min) ;
 * - Patch Tuesday Microsoft : une seule notif pour toute la salve.
 */

const KEEP_MS = 7 * 86_400_000;
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const KEV = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CERT = 'https://cert.cyber.gouv.fr';
const UA = { 'user-agent': 'deskbuddy (dashboard de bureau personnel)' };
const MAX_FEED = 900; // entrées envoyées à l'écran
const DIGEST_HOUR = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoNvd = (ms) => new Date(ms).toISOString().replace('Z', '');

async function getJson(url, opts = {}) {
  const res = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 60_000) });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { data: await res.json(), etag: res.headers.get('etag') };
}

export function startCyber(store, { dataDir }) {
  const file = path.join(dataDir, 'cyber.json');
  const kwFile = path.join(dataDir, 'cyber-keywords.json');
  const saved = readJson(file, {});
  const vulns = new Map((saved.items || []).map((v) => [v.id, v])); // CVE et avis CERT-FR
  const kev = new Map(Object.entries(saved.kev || {})); // CVE -> infos KEV
  const notified = new Map(Object.entries(saved.notified || {}));
  let meta = { nvdAt: 0, kevEtag: null, digestDay: null, ...(saved.meta || {}) };
  let keywords = readJson(kwFile, null) || DEFAULT_KEYWORDS;
  let compiled = compileKeywords(keywords);
  const firstRun = vulns.size === 0; // premier remplissage : pas de notification pour l'historique

  store.set('cyber', { feed: [], stats: null, keywords: [], loading: true });

  /* ---------- enrichissement ---------- */
  const enrich = (v) => {
    if (v.kind === 'cve') {
      const k = kev.get(v.id);
      if (k) Object.assign(v, { exploited: true, kev: k });
      Object.assign(v, classify(v));
    } else {
      Object.assign(v, classify({ ...v, product: '', products: [], cpes: [], desc: `${v.title} ${v.desc}` }));
      v.group = null;
      if (v.type === 'alerte') v.exploited = true;
    }
    v.kw = matchKeywords(v, compiled);
    v.sev = v.kind === 'cve' ? severityOf(v.score) : null;
    return v;
  };
  const reclassifyAll = () => vulns.forEach(enrich);

  /* ---------- publication ---------- */
  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        // Failles hors fil : on garde de quoi les reclasser (produit), pas leur description (moins d'écritures sur la carte SD).
        const items = [...vulns.values()].map((v) => (visible(v) ? v : { ...v, desc: v.products?.length || v.product ? '' : v.desc, refs: [] }));
        writeJson(file, { items, kev: Object.fromEntries(kev), notified: Object.fromEntries(notified), meta });
        writeJson(kwFile, keywords, true);
      } catch (err) {
        console.error('[cyber] écriture impossible', err.message);
      }
    }, 3000);
  };

  const compact = (v) => ({
    id: v.id,
    kind: v.kind,
    type: v.type,
    t: v.published,
    s: v.score,
    sev: v.sev,
    p: v.kind === 'certfr' ? v.title : v.product || null,
    d: (v.kind === 'certfr' ? v.desc : v.desc || '').slice(0, 160),
    cats: v.cats,
    kw: v.kw,
    ex: Boolean(v.exploited),
    poc: Boolean(v.poc),
    epss: v.epss ?? null,
    cert: v.certfr || null
  });

  const publish = () => {
    const now = Date.now();
    const all = [...vulns.values()].filter((v) => now - v.published < KEEP_MS);
    const shown = all.filter(visible);
    const indiv = shown.filter(standsOut);
    // Regroupements du jour : WordPress et noyau Linux
    const groups = new Map();
    for (const v of shown) {
      if (standsOut(v)) continue;
      const day = new Date(v.published).toDateString();
      const key = `${v.group}|${day}`;
      const g = groups.get(key) || { id: `grp-${v.group}-${new Date(v.published).toISOString().slice(0, 10)}`, kind: 'group', group: v.group, t: 0, n: 0, crit: 0, high: 0, cats: v.group === 'wordpress' ? ['web'] : ['linux'], kw: [], items: [] };
      g.n++;
      g.t = Math.max(g.t, v.published);
      if (v.sev === 'critique') g.crit++;
      if (v.sev === 'elevee') g.high++;
      if (g.items.length < 60) g.items.push({ id: v.id, s: v.score, p: v.group === 'kernel' ? v.subject || v.id : v.product });
      groups.set(key, g);
    }
    const feed = [...indiv.map(compact), ...groups.values()].sort((a, b) => b.t - a.t).slice(0, MAX_FEED);

    // Statistiques : 24 h et 7 derniers jours (toutes les CVE reçues, pas seulement le fil)
    const cves = all.filter((v) => v.kind === 'cve');
    const day24 = cves.filter((v) => now - v.published < 86_400_000);
    const bySev = (list) => ({
      critique: list.filter((v) => v.sev === 'critique').length,
      elevee: list.filter((v) => v.sev === 'elevee').length,
      moyenne: list.filter((v) => v.sev === 'moyenne').length,
      total: list.length
    });
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000).toDateString();
      days.push(cves.filter((v) => new Date(v.published).toDateString() === d).length);
    }
    const kwCount = {};
    for (const v of all) for (const k of v.kw || []) kwCount[k] = (kwCount[k] || 0) + 1;
    store.update('cyber', {
      loading: false,
      feed,
      stats: { ...bySev(day24), exploited: all.filter((v) => v.exploited && now - (v.kev ? Date.parse(v.kev.dateAdded) : v.published) < KEEP_MS).length, days },
      keywords: keywords.map((k) => ({ label: k.label, count: kwCount[k.label] || 0 }))
    });
    save();
  };

  const prune = () => {
    const now = Date.now();
    for (const [id, v] of vulns) if (now - v.published > KEEP_MS && !(v.kev && now - Date.parse(v.kev.dateAdded) < KEEP_MS)) vulns.delete(id);
    for (const [id, at] of notified) if (now - at > KEEP_MS) notified.delete(id);
  };

  /* ---------- notifications ---------- */
  const pending = new Map(); // produit -> failles critiques en attente
  let lastFlush = 0;
  const asleep = () => Boolean(store.get('screen')?.asleep);
  const seen = (id) => notified.has(id);
  const mark = (id) => notified.set(id, Date.now());
  const label = (v) => v.product || v.id;

  const notifyNew = (fresh, initial) => {
    if (initial) return fresh.forEach((v) => mark(v.id));
    // Patch Tuesday : une salve Microsoft (25+ CVE du jour d'un coup) = une seule notif
    const ms = fresh.filter((v) => v.kind === 'cve' && v.source === 'secure@microsoft.com' && !seen(v.id));
    if (ms.length >= 25 && ms.every((v) => Date.now() - v.published < 86_400_000)) {
      const crit = ms.filter((v) => v.sev === 'critique').length;
      const ex = ms.filter((v) => v.exploited).length;
      ms.forEach((v) => mark(v.id));
      if (!asleep()) store.toast('warn', 'PATCH TUESDAY MICROSOFT', `${ms.length} failles dont ${crit} critique${crit > 1 ? 's' : ''}${ex ? `, ${ex} déjà exploitée${ex > 1 ? 's' : ''}` : ''} · onglet CYBER`, { sticky: ex > 0 });
    }
    for (const v of fresh) {
      if (seen(v.id) || !visible(v) || !standsOut(v)) continue;
      if (v.kind === 'cve' && v.sev === 'critique' && (v.kw.length || v.poc || v.exploited || (v.epss ?? 0) >= 0.1)) {
        mark(v.id);
        const key = label(v);
        pending.set(key, [...(pending.get(key) || []), v]);
      }
    }
    flush();
  };

  const flush = (force = false) => {
    if (!pending.size || asleep()) return;
    if (!force && Date.now() - lastFlush < 30 * 60_000) return;
    lastFlush = Date.now();
    const groups = [...pending.entries()];
    pending.clear();
    if (groups.length <= 2) {
      for (const [prod, list] of groups) {
        const top = list.sort((a, b) => b.score - a.score)[0];
        const why = top.kw.length ? `★ ${top.kw[0]}` : top.poc ? "preuve d'exploitation publiée" : top.epss ? `exploitation probable ${Math.round(top.epss * 100)} %` : '';
        store.toast('warn', `CVE CRITIQUE · ${prod.toUpperCase()}`, list.length > 1 ? `${list.length} failles, jusqu'à ${top.score} · ${why}` : `${top.id} · ${top.score} · ${why}`);
      }
    } else {
      const n = groups.reduce((s, [, l]) => s + l.length, 0);
      store.toast('warn', `${n} FAILLES CRITIQUES`, `${groups.map(([p]) => p).slice(0, 4).join(', ')}${groups.length > 4 ? '…' : ''} · onglet CYBER`);
    }
  };

  const notifyKev = (v, k) => {
    if (seen(`kev:${v.id}`)) return;
    mark(`kev:${v.id}`);
    if (firstRun && !meta.kevEtag) return;
    if (asleep()) return;
    const mine = v.kw?.length;
    const ransom = k.knownRansomwareCampaignUse === 'Known' ? ' · utilisée par des rançongiciels' : '';
    store.toast(mine ? 'warn' : 'info', `FAILLE EXPLOITÉE · ${k.vendorProject} ${k.product}`.toUpperCase().slice(0, 60), `${v.id}${v.score ? ` · ${v.score}` : ''} · ${k.vulnerabilityName}${ransom}${mine ? ` · ★ ${v.kw[0]}` : ''}`, { sticky: Boolean(mine) });
  };

  const notifyCert = (a) => {
    if (seen(a.id)) return;
    mark(a.id);
    if (a.type !== 'alerte' || (firstRun && !meta.certAt)) return;
    if (asleep()) return;
    store.toast('warn', 'ALERTE CERT-FR', `${a.title} · ${a.desc}`.slice(0, 300), { sticky: true });
  };

  // Résumé quotidien à 8 h (ou au premier réveil après 8 h)
  const digest = () => {
    const now = new Date();
    const today = now.toDateString();
    if (meta.digestDay === today || now.getHours() < DIGEST_HOUR || asleep() || !meta.nvdAt || !kevLoaded) return;
    meta.digestDay = today;
    const s = store.get('cyber')?.stats;
    if (!s || !s.total) return;
    const day = [...vulns.values()].filter((v) => Date.now() - v.published < 86_400_000);
    const mine = day.filter((v) => v.kw?.length && (v.sev === 'critique' || v.sev === 'elevee')).length;
    store.toast('info', 'VEILLE CYBER · 24 H', `${s.total} CVE : ${s.critique} critiques, ${s.elevee} élevées · ${mine} élevées ou plus dans ta liste · ${s.exploited} exploitée${s.exploited > 1 ? 's' : ''} cette semaine`);
    save();
  };

  /* ---------- sources ---------- */
  async function nvdPage(params) {
    const out = [];
    for (let start = 0, total = 1, pages = 0; start < total && pages < 4; pages++) {
      const q = new URLSearchParams({ ...params, resultsPerPage: '2000', startIndex: String(start) });
      const { data } = await getJson(`${NVD}?${q}`, { timeout: 90_000 });
      total = data.totalResults || 0;
      out.push(...(data.vulnerabilities || []).map((x) => x.cve));
      start += data.resultsPerPage || 2000;
      if (start < total) await sleep(7000); // sans clé : 5 requêtes / 30 s
    }
    return out;
  }

  async function nvd() {
    const now = Date.now();
    const initial = !meta.nvdAt;
    const since = meta.nvdAt ? meta.nvdAt - 30 * 60_000 : now - KEEP_MS;
    const fresh = [];
    const ingest = (list, onlyKnownOrRecent) => {
      for (const c of list) {
        const v = enrich(fromNvd(c));
        if (now - v.published > KEEP_MS) continue;
        const prev = vulns.get(v.id);
        if (onlyKnownOrRecent && !prev && now - v.published > 86_400_000) continue;
        if (prev) Object.assign(v, { epss: prev.epss, epssAt: prev.epssAt, certfr: prev.certfr });
        vulns.set(v.id, v);
        if (!prev) fresh.push(v);
      }
    };
    // L'intervalle maximum de l'API est de 120 jours : 7 jours passent en une fois.
    ingest(await nvdPage({ pubStartDate: isoNvd(since), pubEndDate: isoNvd(now) }), false);
    if (meta.nvdAt) {
      await sleep(7000);
      // Mises à jour (score CVSS ajouté après coup...) des failles de la semaine
      ingest(await nvdPage({ lastModStartDate: isoNvd(since), lastModEndDate: isoNvd(now) }), true);
    }
    meta.nvdAt = now;
    prune();
    notifyNew(fresh, initial);
    publish();
  }

  let kevLoaded = kev.size > 0;
  async function kevFeed() {
    const r = await getJson(KEV, { headers: meta.kevEtag ? { 'if-none-match': meta.kevEtag } : {} });
    if (r.notModified) return;
    const now = Date.now();
    const missing = [];
    kev.clear();
    for (const k of r.data.vulnerabilities || []) {
      kev.set(k.cveID, {
        dateAdded: k.dateAdded,
        vendorProject: k.vendorProject,
        product: k.product,
        vulnerabilityName: k.vulnerabilityName,
        shortDescription: k.shortDescription,
        requiredAction: k.requiredAction,
        dueDate: k.dueDate,
        knownRansomwareCampaignUse: k.knownRansomwareCampaignUse
      });
    }
    for (const [id, k] of kev) {
      if (now - Date.parse(k.dateAdded) > KEEP_MS) continue;
      if (!vulns.has(id)) missing.push(id);
    }
    // Failles anciennes ajoutées au catalogue cette semaine : on va chercher leur fiche NVD.
    for (const id of missing.slice(0, 8)) {
      try {
        const { data } = await getJson(`${NVD}?cveId=${id}`);
        const c = data.vulnerabilities?.[0]?.cve;
        if (c) {
          const v = fromNvd(c);
          v.published = Math.max(v.published, Date.parse(kev.get(id).dateAdded)); // affichée à la date d'ajout au catalogue
          vulns.set(id, v);
        }
      } catch {
        /* réessayé à la prochaine passe */
      }
      await sleep(7000);
    }
    reclassifyAll();
    for (const [id, k] of kev) {
      if (now - Date.parse(k.dateAdded) > 3 * 86_400_000) continue;
      const v = vulns.get(id);
      if (v) notifyKev(v, k);
    }
    meta.kevEtag = r.etag;
    kevLoaded = true;
    publish();
  }

  async function certFr() {
    const list = [];
    for (const type of ['alerte', 'avis']) {
      const res = await fetch(`${CERT}/${type}/feed/`, { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      list.push(...parseCertFr(await res.text(), type));
    }
    const now = Date.now();
    let fetched = 0;
    for (const a of list) {
      if (now - a.published > KEEP_MS) continue;
      const prev = vulns.get(a.id);
      if (prev?.cves) {
        a.cves = prev.cves;
      } else if (fetched < 12) {
        // Détail de l'avis (format JSON officiel) : liste des CVE concernées
        fetched++;
        try {
          const { data } = await getJson(`${a.url.replace(/\/?$/, '/')}json/`, { timeout: 20_000 });
          a.cves = (data.cves || []).map((c) => c.name).filter(Boolean).slice(0, 80);
          a.systems = (data.affected_systems || []).map((s) => s.description).slice(0, 10);
        } catch {
          a.cves = null;
        }
        await sleep(800);
      }
      enrich(a);
      vulns.set(a.id, a);
      for (const id of a.cves || []) {
        const v = vulns.get(id);
        if (v) v.certfr = { id: a.id, type: a.type, url: a.url };
      }
      notifyCert(a);
    }
    meta.certAt = now;
    publish();
  }

  async function epss() {
    const now = Date.now();
    const want = [...vulns.values()]
      .filter((v) => v.kind === 'cve' && (v.score ?? 0) >= 7 && visible(v) && standsOut(v) && (!v.epssAt || now - v.epssAt > 86_400_000))
      .map((v) => v.id)
      .slice(0, 600);
    for (let i = 0; i < want.length; i += 80) {
      const ids = want.slice(i, i + 80);
      const { data } = await getJson(`https://api.first.org/data/v1/epss?cve=${ids.join(',')}`);
      const got = new Map((data.data || []).map((d) => [d.cve, Number(d.epss)]));
      for (const id of ids) {
        const v = vulns.get(id);
        if (!v) continue;
        v.epssAt = now;
        if (got.has(id)) v.epss = got.get(id);
      }
      await sleep(1500);
    }
    publish();
  }

  /* ---------- actions de l'écran ---------- */
  store.register('cyber:select', ({ id }) => {
    const v = vulns.get(id);
    if (!v) return store.set('cyberDetail', null);
    store.set('cyberDetail', {
      ...v,
      explain: explainVector(v.vector),
      url: v.kind === 'certfr' ? v.url : `https://nvd.nist.gov/vuln/detail/${v.id}`
    });
  });
  store.register('cyber:keyword:add', ({ label }) => {
    const l = typeof label === 'string' ? label.trim().slice(0, 40) : '';
    if (l.length < 2 || keywords.some((k) => k.label.toLowerCase() === l.toLowerCase()) || keywords.length >= 80) return;
    keywords = [...keywords, { label: l, re: keywordRe(l) }];
    compiled = compileKeywords(keywords);
    reclassifyAll();
    publish();
  });
  store.register('cyber:keyword:remove', ({ label }) => {
    keywords = keywords.filter((k) => k.label !== label);
    compiled = compileKeywords(keywords);
    reclassifyAll();
    publish();
  });

  /* ---------- démarrage ---------- */
  reclassifyAll();
  if (vulns.size) publish();
  periodic(store, { key: 'cyber', name: 'nvd', everyMs: 2 * 3600_000, run: nvd, tag: 'cyber' });
  setTimeout(() => periodic(store, { key: 'cyber', name: 'kev', everyMs: 3600_000, run: kevFeed, tag: 'cyber' }), 20_000);
  setTimeout(() => periodic(store, { key: 'cyber', name: 'cert', everyMs: 30 * 60_000, run: certFr, tag: 'cyber' }), 5_000);
  setTimeout(() => periodic(store, { key: 'cyber', name: 'epss', everyMs: 6 * 3600_000, run: epss, tag: 'cyber' }), 5 * 60_000);
  setInterval(() => {
    flush();
    digest();
  }, 60_000);
  // Réveil de l'écran : on envoie ce qui attendait pendant la nuit.
  store.on('patch', (k, v) => {
    if (k === 'screen' && v && !v.asleep) setTimeout(() => {
      digest();
      flush(true);
    }, 5000);
  });
}
