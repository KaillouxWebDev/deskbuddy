/*
 * Veille cyber : normalisation et classement des failles (fonctions pures, testables sans réseau).
 *
 * Familles : web, linux, windows, apple, réseau et objets, télécom et ondes.
 * Une faille peut appartenir à plusieurs familles. Hors familles, elle n'apparaît que si elle est
 * exploitée ou touche un mot-clé.
 * Deux sources très bavardes sont regroupées en une ligne par jour :
 * - WordPress (extensions) : seules les failles exploitées ou critiques avec preuve d'exploitation sortent du lot ;
 * - noyau Linux : seules les failles élevées (7+) ou exploitées sortent du lot.
 */

// Organismes qui publient les CVE (CNA) : signe très fiable de la famille.
const CNA = {
  'secure@microsoft.com': 'windows',
  'product-security@apple.com': 'apple',
  '416baaa9-dc9f-4396-8d5f-8c081fb06d67': 'kernel', // kernel.org
  'security@wordfence.com': 'wordpress',
  'audit@patchstack.com': 'wordpress',
  'contact@wpscan.com': 'wordpress',
  'security@mozilla.org': 'web',
  'chrome-cve-admin@google.com': 'web',
  'mlhess@drupal.org': 'web',
  'secalert@redhat.com': 'linux',
  'security@ubuntu.com': 'linux',
  'security@debian.org': 'linux',
  'security@suse.com': 'linux'
};

const RX = {
  wordpress: /\bwordpress\b|\bwp[- ]plugin\b/i,
  kernel: /^In the Linux kernel\b|\bnoyau linux\b|\blinux kernel\b/i,
  linux: /\b(linux|debian|ubuntu|red ?hat|rhel|fedora|suse|centos|alpine linux|arch linux|raspberry pi os|glibc|systemd|openssh|sudo|polkit|gnu bash|util-linux|xz utils)\b/i,
  windows: /\b(microsoft|windows|office|exchange server|sharepoint|outlook|azure|\.net framework|hyper-v|win32k)\b/i,
  apple: /\b(apple|macos|mac os|ios|ipados|safari|webkit|watchos|visionos|tvos|xcode)\b/i,
  web: /\b(cross[- ]site|xss|sql injection|injection sql|csrf|ssrf|web application|application web|php|node\.?js|npm|javascript|typescript|react|next\.js|express|django|flask|laravel|symfony|drupal|joomla|magento|nginx|apache http|httpd|tomcat|navigateur|browser|firefox|chrome|chromium|edge|gitlab|jenkins|grafana|n8n)\b/i,
  reseau: /\b(router|routeur|firewall|pare-feu|vpn|switch|access point|point d'accès|nas|ip camera|caméra|camera|printer|imprimante|firmware|iot|objet connecté|smart home|fortinet|fortigate|fortios|fortiweb|palo alto|pan-os|cisco|juniper|junos|ivanti|citrix|netscaler|sonicwall|zyxel|tp-link|d-link|netgear|mikrotik|routeros|ubiquiti|synology|qnap|hikvision|dahua|epson|canon|brother|lexmark|xerox|ricoh|openwrt|vmware esx|esxi)\b/i,
  telecom: /\b(lte|4g|5g|baseband|modem|volte|ims|ss7|diameter|enodeb|gnodeb|sim card|carte sim|esim|cellular|cellulaire|qualcomm|mediatek|unisoc|exynos|femtocell|umts|gsm|wi-?fi|wpa2|wpa3|bluetooth|ble|lora|lorawan|zigbee|z-wave|rfid|nfc|sdr|livebox|freebox|bbox|sfr box|sagemcom|technicolor|fritz!?box|téléphonie|telephony|voip|sip|asterisk)\b/i
};

export const CATEGORIES = [
  ['web', 'WEB'],
  ['linux', 'LINUX'],
  ['windows', 'WINDOWS'],
  ['apple', 'APPLE'],
  ['reseau', 'RÉSEAU'],
  ['telecom', 'TÉLÉCOM']
];

/** Mots-clés de départ (validés). re : expression cherchée dans le texte, produits et identifiants CPE. */
export const DEFAULT_KEYWORDS = [
  ['Node.js', 'node\\.?js|nodejs:node\\.js'],
  ['React', 'react(?:js)?(?!-native)'],
  ['Next.js', 'next\\.js|vercel:next'],
  ['npm', 'npm'],
  ['Vite', 'vite(?:js)?'],
  ['Express', 'express(?:js)?(?= |$|:)|expressjs'],
  ['TypeScript', 'typescript'],
  ['VS Code / Cursor', 'visual studio code|vs ?code|cursor ide|anysphere'],
  ['GitHub', 'github'],
  ['Git', 'git(?!hub|lab|ea)'],
  ['Nginx', 'nginx'],
  ['PostgreSQL', 'postgres(?:ql)?'],
  ['Cal.com', 'cal\\.com|calcom'],
  ['Notion', 'notion'],
  ['n8n', 'n8n'],
  ['Docker', 'docker|moby|containerd|runc'],
  ['Chrome / Chromium', 'chrome|chromium'],
  ['Debian', 'debian|raspbian|raspberry pi os'],
  ['Raspberry Pi', 'raspberry ?pi'],
  ['OpenSSH', 'openssh'],
  ['OpenSSL', 'openssl'],
  ['sudo', 'sudo'],
  ['systemd', 'systemd'],
  ['glibc', 'glibc|gnu c library'],
  ['curl', 'curl|libcurl'],
  ['Python', 'python|cpython'],
  ['NetworkManager / wpa_supplicant', 'networkmanager|wpa_supplicant|hostapd'],
  ['Windows', 'windows'],
  ['HP', 'hp(?: inc)?|hewlett'],
  ['Imprimantes', 'printers?|imprimantes?|cups'],
  ['Wi-Fi', 'wi-?fi|wpa2|wpa3|802\\.11'],
  ['Bluetooth', 'bluetooth|ble'],
  ['Box opérateurs', 'livebox|freebox|bbox|sfr box|sagemcom|orange'],
  ['Téléphonie mobile', 'lte|4g|5g|baseband|volte|ss7|cellular|cellulaire|esim'],
  ['Bambu Lab', 'bambu'],
  ['Kali Linux', 'kali'],
  ['Wireshark', 'wireshark|tshark'],
  ['Flipper Zero', 'flipper'],
  ['SDR', 'sdr|hackrf|rtl-sdr|gnu ?radio'],
  ['Meshtastic / MeshCore', 'meshtastic|meshcore'],
  ['LoRa', 'lora(?:wan)?']
].map(([label, re]) => ({ label, re }));

export const keywordRe = (label) => label.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

export function compileKeywords(list) {
  return list.map((k) => ({ label: k.label, rx: new RegExp(`(?<![a-z0-9])(?:${k.re})(?![a-z0-9])`, 'i') }));
}

export function severityOf(score) {
  if (score == null) return null;
  if (score >= 9) return 'critique';
  if (score >= 7) return 'elevee';
  if (score >= 4) return 'moyenne';
  return 'faible';
}

/** Meilleure mesure CVSS disponible : NVD (Primary) d'abord, puis celle de l'éditeur ; v3.1 avant v4 (plus parlante). */
function pickCvss(metrics = {}) {
  const lists = [metrics.cvssMetricV31, metrics.cvssMetricV40, metrics.cvssMetricV30, metrics.cvssMetricV2];
  for (const primary of [true, false]) {
    for (const l of lists) {
      const m = (l || []).find((x) => (x.type === 'Primary') === primary);
      if (m?.cvssData?.baseScore != null) return { score: m.cvssData.baseScore, vector: m.cvssData.vectorString || null };
    }
  }
  return { score: null, vector: null };
}

function ssvcExploitation(metrics = {}) {
  for (const s of metrics.ssvcV203 || []) {
    for (const o of s.ssvcData?.options || []) if (o.exploitation) return o.exploitation; // none | poc | active
  }
  return null;
}

/** Entrée NVD (API 2.0) -> faille au format du dashboard. */
export function fromNvd(cve) {
  const desc = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || '';
  const { score, vector } = pickCvss(cve.metrics);
  const products = [];
  for (const a of cve.affected || []) {
    for (const p of a.affectedData || []) {
      const vendor = p.vendor && !/^n\/?a$/i.test(p.vendor) ? p.vendor : '';
      const prod = p.product && !/^n\/?a$/i.test(p.product) ? p.product : '';
      // « Red Hat » + « Red Hat Enterprise Linux » -> « Red Hat Enterprise Linux »
      products.push((prod.toLowerCase().startsWith(vendor.toLowerCase()) ? prod : `${vendor} ${prod}`).trim());
    }
  }
  const cpes = [];
  for (const c of cve.configurations || []) for (const n of c.nodes || []) for (const m of n.cpeMatch || []) if (m.vulnerable) cpes.push(m.criteria);
  // Produit lisible : données de l'éditeur, sinon CPE (cpe:2.3:a:vendor:product:...)
  let product = products[0] || '';
  if (!product && cpes[0]) {
    const [, , , vendor, prod] = cpes[0].split(':');
    product = `${vendor} ${prod}`.replace(/_/g, ' ');
  }
  // Noyau Linux : le vrai sujet est la ligne qui suit « the following vulnerability has been resolved: »
  const kernelSubject = (desc.match(/has been resolved:\s*\n+\s*([^\n]{3,120})/) || [])[1] || null;
  return {
    id: cve.id,
    kind: 'cve',
    subject: kernelSubject,
    published: Date.parse(`${cve.published}Z`),
    modified: Date.parse(`${cve.lastModified}Z`),
    score,
    vector,
    product: tidyProduct(product),
    products: [...new Set(products)].slice(0, 8),
    cpes: [...new Set(cpes)].slice(0, 12),
    cwe: (cve.weaknesses || []).flatMap((w) => w.description.map((d) => d.value)).find((v) => /^CWE-\d+/.test(v)) || null,
    desc,
    source: cve.sourceIdentifier || null,
    poc: ssvcExploitation(cve.metrics) === 'poc',
    exploited: ssvcExploitation(cve.metrics) === 'active' || Boolean(cve.cisaExploitAdd),
    refs: (cve.references || []).slice(0, 6).map((r) => r.url)
  };
}

const tidyProduct = (s) => s.replace(/\s+/g, ' ').replace(/^(\S+) \1\b/i, '$1').trim().slice(0, 60);

/** Texte utilisé pour le classement et les mots-clés. */
const haystack = (v) => [v.product, ...(v.products || []), ...(v.cpes || []).map((c) => c.split(':').slice(3, 5).join(':')), v.title || '', v.desc || ''].join(' \n ');

export function classify(v) {
  const text = haystack(v);
  const cats = new Set();
  const cna = CNA[v.source];
  let group = null;
  if (cna === 'wordpress' || RX.wordpress.test(`${v.product} ${v.title || ''} ${v.desc.slice(0, 300)}`)) group = 'wordpress';
  else if (cna === 'kernel' || RX.kernel.test(v.desc) || /linux:linux_kernel/.test(v.cpes.join(' '))) group = 'kernel';
  if (group === 'wordpress') cats.add('web');
  if (group === 'kernel') cats.add('linux');
  if (cna && cna !== 'wordpress' && cna !== 'kernel') cats.add(cna);
  for (const [cat] of CATEGORIES) if (RX[cat].test(text)) cats.add(cat);
  return { cats: [...cats], group };
}

/** Mots-clés : cherchés dans le produit touché (éditeur, produit, CPE), pas dans toute la description,
 *  sinon « PostgreSQL » remonte chaque appli qui mentionne sa base de données. La description ne sert
 *  qu'à défaut de produit connu (et seulement sa première phrase). */
export function matchKeywords(v, compiled) {
  const known = [v.product, ...(v.products || [])].filter((p) => p && !/^n\/a/i.test(p));
  const text = [...known, ...(v.cpes || []).map((c) => c.split(':').slice(3, 5).join(':')), v.title || '', known.length ? '' : (v.desc || '').split(/\.\s/)[0]].join(' \n ');
  return compiled.filter((k) => k.rx.test(text)).map((k) => k.label);
}

/**
 * Faille individuelle ou fondue dans le regroupement du jour ?
 * WordPress : seulement les failles exploitées, ou critiques avec preuve d'exploitation (ou EPSS ≥ 10 %).
 * Noyau Linux : élevées ou plus, ou exploitées.
 */
export function standsOut(v) {
  if (v.exploited) return true;
  if (v.group === 'wordpress') return (v.score ?? 0) >= 9 && (v.poc || (v.epss ?? 0) >= 0.1);
  if (v.group === 'kernel') return (v.score ?? 0) >= 7;
  return true;
}

/** Visible dans le fil : dans une famille (hors failles faibles), ou exploitée, ou dans la liste de mots-clés. */
export function visible(v) {
  if (v.exploited || v.kw?.length) return true;
  if (!v.cats.length) return false;
  return v.score == null || v.score >= 4;
}

/* ---------- CVSS en clair ---------- */
const AV = { N: 'à distance (réseau)', A: 'réseau local', L: 'accès local', P: 'accès physique' };
const PR = { N: 'sans compte', L: 'avec un compte simple', H: 'avec un compte administrateur' };
const UI = { N: 'sans action de la victime', R: 'si la victime clique ou ouvre un fichier', P: 'avec action passive de la victime', A: 'avec action de la victime' };
const IMP = { H: 'total', L: 'partiel', N: 'aucun' };

export function explainVector(vector) {
  if (!vector) return null;
  const m = Object.fromEntries(vector.split('/').map((p) => p.split(':')));
  const imp = (k) => IMP[m[k] || m[`V${k}`]] || null;
  return {
    access: AV[m.AV] || null,
    auth: PR[m.PR] || null,
    user: UI[m.UI] || null,
    complexity: m.AC ? (m.AC === 'L' ? 'simple' : 'difficile') : null,
    confidentiality: imp('C'),
    integrity: imp('I'),
    availability: imp('A')
  };
}

/** Flux RSS du CERT-FR (avis, alertes) : extraction simple, le format est stable. */
export function parseCertFr(xml, type) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) => (m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim() || '';
    const link = get('link');
    const id = (link.match(/(CERTFR-\d{4}-[A-Z]+-\d+)/) || [])[1];
    if (!id) continue;
    items.push({
      id,
      kind: 'certfr',
      type, // avis | alerte
      title: decode(get('title')).replace(/\s*\(\d{1,2} \S+ \d{4}\)$/, ''),
      desc: decode(get('description')),
      url: link,
      published: Date.parse(get('pubDate')) || Date.now()
    });
  }
  return items;
}

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
