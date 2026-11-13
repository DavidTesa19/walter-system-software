// Motivy › AI návrh from a website: read the site's real colours and fonts
// (meta theme-color, CSS custom properties, the colours its stylesheets use
// most, font families) instead of relying on what Claude remembers of the
// brand. Anthropic's web_fetch returns page text only, no styles.
//
// This server fetches a user-typed address, so it is guarded against SSRF:
// - http/https only, default ports only, no credentials in the URL;
// - every connection resolves the host itself (`lookup`) and refuses private,
//   loopback, link-local, CGNAT, multicast and reserved addresses, so a
//   redirect or a DNS answer that changes between check and connect cannot
//   reach the internal network or cloud metadata;
// - at most 3 redirects, each checked the same way; 6 s per request, 1.5 MB
//   per page, 600 kB per stylesheet, at most 4 stylesheets;
// - only text/html and text/css are read, nothing is executed.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const TIMEOUT_MS = 6000;
const MAX_HTML = 1_500_000;
const MAX_CSS = 600_000;
const MAX_STYLESHEETS = 4;
const MAX_REDIRECTS = 3;
// The whole read (page and stylesheets); a slower site falls back to web_fetch.
const TOTAL_MS = 12000;

export class SiteFetchError extends Error {}

// ---- Address checks -------------------------------------------------------

const v4ToInt = (ip) => ip.split('.').reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
const inV4 = (ip, cidr) => {
  const [base, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
};
const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
  '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

/** True for an address the server must never connect to on a user's behalf. */
export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED_V4.some((cidr) => inV4(address, cidr));
  if (family === 6) {
    const ip = address.toLowerCase();
    if (ip === '::' || ip === '::1') return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast,
    // 2001:db8::/32 documentation, 64:ff9b::/96 NAT64 (could reach v4 inside).
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff') || ip.startsWith('2001:db8') || ip.startsWith('64:ff9b');
  }
  return true;
}

// Resolve, then refuse a blocked answer: used as the socket's own lookup, so
// the address checked is the address connected to.
const guardedLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    const allowed = addresses.filter((entry) => !isBlockedAddress(entry.address));
    if (allowed.length === 0 || allowed.length !== addresses.length) {
      return callback(new SiteFetchError('Adresa vede do neveřejné sítě, takový web číst nelze.'));
    }
    if (options?.all) return callback(null, allowed);
    return callback(null, allowed[0].address, allowed[0].family);
  });
};

/** A URL the server may fetch, or throws. */
export function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SiteFetchError('Webová adresa není platná.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SiteFetchError('Jen http a https.');
  if (url.username || url.password) throw new SiteFetchError('Adresa nesmí obsahovat přihlašovací údaje.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new SiteFetchError('Jen standardní porty webu.');
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new SiteFetchError('Adresa vede do neveřejné sítě, takový web číst nelze.');
  }
  return url;
}

// ---- Fetching ---------------------------------------------------------------

function getOnce(url, { maxBytes, accept, signal }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        signal,
        headers: { 'User-Agent': 'WalterSystemThemeReader/1.0', Accept: accept, 'Accept-Encoding': 'identity' },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ redirect: new URL(response.headers.location, url) });
        }
        if (status !== 200) {
          response.resume();
          return reject(new SiteFetchError(`Web odpověděl ${status}.`));
        }
        const type = String(response.headers['content-type'] ?? '');
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy();
            resolve({ body: Buffer.concat(chunks).toString('utf8'), type, truncated: true });
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), type }));
        response.on('error', reject);
      }
    );
    request.on('timeout', () => request.destroy(new SiteFetchError('Web neodpověděl včas.')));
    request.on('error', reject);
  });
}

async function fetchText(raw, options) {
  let url = checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await getOnce(url, options);
    if (!result.redirect) return { ...result, url };
    url = checkUrl(result.redirect.toString());
  }
  throw new SiteFetchError('Příliš mnoho přesměrování.');
}

// ---- Extracting ---------------------------------------------------------------

const COLOR_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/gi;

/** "#abc", "rgb(…)" → "#aabbcc" (alpha dropped), or null. */
export function toHex(value) {
  const text = value.trim().toLowerCase();
  let r;
  let g;
  let b;
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full = hex.length <= 4 ? hex.slice(0, 3).split('').map((c) => c + c).join('') : hex.slice(0, 6);
    if (!/^[0-9a-f]{6}$/.test(full)) return null;
    return `#${full}`;
  }
  const match = text.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?/);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) < 0.5) return null; // mostly transparent
  [r, g, b] = match.slice(1, 4).map((part) => Math.min(255, Number(part)));
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

// A colour with some hue: what makes a brand, unlike the greys around it.
const isColourful = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) > 40;
};

const GENERIC_FONTS = /^(inherit|initial|unset|serif|sans-serif|monospace|system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy|helvetica|arial|segoe ui|roboto|times new roman|georgia|apple color emoji|segoe ui emoji|var\(.*)$/i;

/** Colours and fonts from a page's HTML and CSS text. */
export function extractStyle(html, cssTexts) {
  const css = cssTexts.join('\n');
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const all = `${inline}\n${css}`;

  const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)?.[1];

  // Custom properties with a brand-ish name.
  const variables = [];
  for (const match of all.matchAll(/(--[\w-]*(?:primary|brand|accent|secondary|main|theme|link|button)[\w-]*)\s*:\s*([^;}{]+)/gi)) {
    const hex = (match[2].match(COLOR_RE) ?? []).map(toHex).find(Boolean);
    if (hex && !variables.some((entry) => entry.name === match[1])) variables.push({ name: match[1], color: hex });
    if (variables.length >= 12) break;
  }

  // Every colour the styles use, by how often.
  const counts = new Map();
  for (const match of all.matchAll(COLOR_RE)) {
    const hex = toHex(match[0]);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const brand = ranked.filter(([hex]) => isColourful(hex)).slice(0, 10).map(([hex, count]) => ({ color: hex, count }));
  const neutrals = ranked.filter(([hex]) => !isColourful(hex)).slice(0, 6).map(([hex, count]) => ({ color: hex, count }));

  // Fonts: font-family declarations and Google Fonts links.
  const fontCounts = new Map();
  for (const match of all.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = match[1].split(',')[0].replace(/["']/g, '').replace(/!important/i, '').trim();
    if (first && !GENERIC_FONTS.test(first)) fontCounts.set(first, (fontCounts.get(first) ?? 0) + 1);
  }
  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi)) {
    for (const family of decodeURIComponent(match[1]).split('|')) {
      const name = family.split(':')[0].replace(/\+/g, ' ').trim();
      if (name) fontCounts.set(name, (fontCounts.get(name) ?? 0) + 5);
    }
  }
  const fonts = [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);

  return { themeColor: themeColor ? toHex(themeColor) ?? themeColor : null, variables, brand, neutrals, fonts };
}

/**
 * Read a site's style: its page and up to four of its stylesheets. Returns
 * null when nothing usable was found; throws SiteFetchError for an address
 * that must not or cannot be read.
 */
export async function readSiteStyle(address, { signal: outer } = {}) {
  const deadline = AbortSignal.timeout(TOTAL_MS);
  const signal = outer ? AbortSignal.any([outer, deadline]) : deadline;
  const page = await fetchText(address, { maxBytes: MAX_HTML, accept: 'text/html', signal });
  if (!/html/i.test(page.type)) throw new SiteFetchError('Adresa nevede na webovou stránku.');
  const sheetUrls = [...page.body.matchAll(/<link[^>]+>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["'][^"']*stylesheet/i.test(tag))
    .map((tag) => tag.match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((href) => {
      try {
        return new URL(href, page.url).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, MAX_STYLESHEETS);
  const sheets = await Promise.all(
    sheetUrls.map((href) => fetchText(href, { maxBytes: MAX_CSS, accept: 'text/css', signal }).then((result) => result.body).catch(() => ''))
  );
  const style = extractStyle(page.body, sheets);
  const found = style.themeColor || style.variables.length || style.brand.length;
  return found ? { ...style, url: page.url.toString(), stylesheets: sheetUrls.length } : null;
}

/** The extracted style as lines for the prompt. */
export function describeSiteStyle(style) {
  const lines = [`Styly načtené z webu ${style.url}:`];
  if (style.themeColor) lines.push(`- meta theme-color: ${style.themeColor}`);
  if (style.variables.length) lines.push(`- CSS proměnné: ${style.variables.map((entry) => `${entry.name} = ${entry.color}`).join(', ')}`);
  if (style.brand.length) lines.push(`- nejčastější barevné odstíny (barva × počet použití): ${style.brand.map((entry) => `${entry.color} ×${entry.count}`).join(', ')}`);
  if (style.neutrals.length) lines.push(`- nejčastější neutrální: ${style.neutrals.map((entry) => `${entry.color} ×${entry.count}`).join(', ')}`);
  if (style.fonts.length) lines.push(`- písma webu: ${style.fonts.join(', ')}`);
  return lines.join('\n');
}
