// SPDX-License-Identifier: MIT

// A static scan of the built site, _site/. It fails on:
//
// - an absolute URL in a src, href, url() or import, outside vendor/. The only absolute URLs
//   allowed are links to the main repository, for the footer;
// - any of the APIs the site must never use (network, storage, cookies, markup from strings,
//   code from strings, clipboard reads), outside vendor/;
// - an index.html whose first element in <head> isn't the Content-Security-Policy meta with
//   exactly the expected policy, followed by the referrer meta; or one with an inline script, an
//   inline style or an event attribute.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filesUnder } from './lib/files.mjs';

export const POLICY =
  "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; font-src 'self'; " +
  "img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; " +
  "require-trusted-types-for 'script'; trusted-types playground";

export const FORBIDDEN = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'document.cookie',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'document.write',
  'eval(',
  'new Function',
  'navigator.clipboard.read',
  'navigator.clipboard.readText',
];

/** The only absolute URLs the site may contain: links to the main repository. */
export const ALLOWED_ABSOLUTE = /^https:\/\/github\.com\/wirelith\/wirelith(?:[/?#]|$)/;

/** XML namespace names: identifiers that look like URLs but are never fetched. */
export const NAMESPACES = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/2000/xmlns/',
  'http://www.w3.org/XML/1998/namespace',
]);

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const TEXT = /\.(?:html|js|mjs|css|json|svg|txt|md|wirelith)$/;

/**
 * Problems in one file's text.
 * @param {string} path relative to _site
 * @param {string} text
 * @returns {string[]}
 */
export function checkText(path, text) {
  /** @type {string[]} */
  const problems = [];
  const lines = text.split('\n');
  /** @param {RegExp} re @param {(m: RegExpMatchArray) => string | undefined} url @param {string} what */
  const urls = (re, url, what) => {
    lines.forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const u = (url(m) ?? '').trim();
        if (ABSOLUTE.test(u) && !ALLOWED_ABSOLUTE.test(u))
          problems.push(`${path}:${i + 1}: an absolute URL in ${what}`);
      }
    });
  };
  if (path.endsWith('.html') || path.endsWith('.svg')) {
    urls(
      /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (m) => m[1] ?? m[2] ?? m[3],
      'src or href',
    );
  }
  if (/\.(?:css|html|svg)$/.test(path)) {
    urls(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (m) => m[1] ?? m[2] ?? m[3], 'url()');
  }
  if (/\.(?:m?js)$/.test(path)) {
    urls(/\b(?:import|from)\s*\(?\s*(['"`])([^'"`]*)\1/g, (m) => m[2], 'an import');
    // Any other absolute URL in a string, such as one assigned to .src or .href.
    urls(
      /(['"`])((?:[a-z][a-z0-9+.-]*:)?\/\/[^'"`\s]*)\1/gi,
      (m) => (NAMESPACES.has(m[2] ?? '') ? '' : m[2]),
      'a string',
    );
  }
  lines.forEach((line, i) => {
    for (const f of FORBIDDEN) {
      if (line.includes(f)) problems.push(`${path}:${i + 1}: uses ${f}`);
    }
  });
  return problems;
}

/**
 * Problems in index.html's structure.
 * @param {string} html
 * @returns {string[]}
 */
export function checkIndex(html) {
  /** @type {string[]} */
  const problems = [];
  const head = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i.exec(html)?.[1];
  if (head === undefined) return ['index.html: no <head>'];
  const elements = [...head.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)];
  const first = elements[0];
  const second = elements[1];
  const csp = first && /^meta$/i.test(first[1] ?? '') ? attributes(first[2] ?? '') : null;
  if (csp?.['http-equiv']?.toLowerCase() !== 'content-security-policy') {
    problems.push('index.html: the first element in <head> is not the Content-Security-Policy meta');
  } else if (csp?.content !== POLICY) {
    problems.push('index.html: the Content-Security-Policy is not exactly the expected policy');
  }
  const referrer = second && /^meta$/i.test(second[1] ?? '') ? attributes(second[2] ?? '') : null;
  if (referrer?.name !== 'referrer' || referrer?.content !== 'no-referrer') {
    problems.push(
      'index.html: the second element in <head> is not <meta name="referrer" content="no-referrer">',
    );
  }
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1] ?? '') || (m[2] ?? '').trim() !== '')
      problems.push('index.html: an inline script');
  }
  if (/<style\b/i.test(html)) problems.push('index.html: a <style> element');
  if (/\sstyle\s*=/i.test(html)) problems.push('index.html: a style attribute');
  if (/<[^>]+\son[a-z]+\s*=/i.test(html)) problems.push('index.html: an event attribute');
  return problems;
}

/**
 * @param {string} s the text of a start tag after its name
 * @returns {Record<string, string>}
 */
function attributes(s) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of s.matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    out[(m[1] ?? '').toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function checkSite(root) {
  /** @type {string[]} */
  const problems = [];
  for (const f of filesUnder(root)) {
    if (f.startsWith('vendor/') || !TEXT.test(f)) continue;
    problems.push(...checkText(f, readFileSync(join(root, f), 'utf8')));
  }
  problems.push(...checkIndex(readFileSync(join(root, 'index.html'), 'utf8')));
  return problems;
}

const isMain = process.argv[1]?.endsWith('check-site.mjs') === true;
if (isMain) {
  const root = process.argv[2] ?? '_site';
  const problems = checkSite(root);
  if (problems.length > 0) {
    for (const p of problems) console.error(`site: ${p}`);
    process.exit(1);
  }
  console.log(
    `site: ${root}/ passes: relative URLs only, no forbidden API, and the expected policy first in <head>.`,
  );
}
