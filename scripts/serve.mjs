// SPDX-License-Identifier: MIT

// Serves _site/ locally, with the page's Content-Security-Policy sent as a header too, plus the
// headers a host that can send them would add. Node built-ins only.
//
//   node scripts/serve.mjs [--port 4173] [--base /playground/] [--root _site]

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

/** The policy in src/index.html, plus what only a header can say. */
export const CSP =
  "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; font-src 'self'; " +
  "img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; " +
  "require-trusted-types-for 'script'; trusted-types playground; frame-ancestors 'none'";

/** Every feature off, except writing to the clipboard from this origin. */
export const PERMISSIONS = [
  'accelerometer=()',
  'autoplay=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'clipboard-read=()',
  'clipboard-write=(self)',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'identity-credentials-get=()',
  'idle-detection=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'otp-credentials=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-create=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'serial=()',
  'storage-access=()',
  'usb=()',
  'window-management=()',
  'xr-spatial-tracking=()',
].join(', ');

export const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': PERMISSIONS,
  'Cache-Control': 'no-store',
};

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wirelith': 'text/plain; charset=utf-8',
};

/**
 * @param {{ root?: string, base?: string }} [o]
 */
export function createSiteServer({ root = '_site', base = '/' } = {}) {
  const top = resolve(root);
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    /** @param {number} code @param {string} text */
    const fail = (code, text) => {
      res.writeHead(code, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'Method not allowed');
    if (!url.pathname.startsWith(base)) return fail(404, 'Not found');
    let path;
    try {
      path = decodeURIComponent(url.pathname.slice(base.length));
    } catch {
      return fail(400, 'Bad request');
    }
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = resolve(top, path);
    if (file !== top && !file.startsWith(top + sep)) return fail(404, 'Not found');
    let size;
    try {
      const s = statSync(file);
      if (!s.isFile()) return fail(404, 'Not found');
      size = s.size;
    } catch {
      return fail(404, 'Not found');
    }
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': size,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  const args = process.argv.slice(2);
  /** @param {string} name @param {string} fallback */
  const arg = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] !== undefined ? (args[i + 1] ?? fallback) : fallback;
  };
  const port = Number(arg('--port', process.env.PORT ?? '4173'));
  const base = arg('--base', '/');
  const server = createSiteServer({ root: arg('--root', '_site'), base });
  server.listen(port, '127.0.0.1', () => {
    console.log(`serve: http://127.0.0.1:${port}${base}`);
  });
}
