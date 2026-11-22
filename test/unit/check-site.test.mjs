// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkIndex, checkText, FORBIDDEN, POLICY } from '../../scripts/check-site.mjs';
import { CSP } from '../../scripts/serve.mjs';

const index = readFileSync('src/index.html', 'utf8');

describe('the site check', () => {
  it('passes the real index.html', () => {
    expect(checkIndex(index)).toEqual([]);
    expect(checkText('index.html', index)).toEqual([]);
  });

  it('uses the same policy as the local server, which adds frame-ancestors', () => {
    expect(CSP).toBe(`${POLICY}; frame-ancestors 'none'`);
  });

  it('fails when the policy is not first, or differs', () => {
    const moved = index
      .replace('<meta name="referrer" content="no-referrer">\n', '')
      .replace('<meta http-equiv', '<meta name="referrer" content="no-referrer">\n<meta http-equiv');
    expect(checkIndex(moved).length).toBeGreaterThan(0);
    expect(checkIndex(index.replace("connect-src 'none'", "connect-src 'self'")).length).toBe(1);
  });

  it('fails on inline script, inline style and event attributes', () => {
    expect(checkIndex(index.replace('</body>', '<script>1</script></body>'))).toContain(
      'index.html: an inline script',
    );
    expect(checkIndex(index.replace('<body>', '<body style="x">'))).toContain(
      'index.html: a style attribute',
    );
    expect(checkIndex(index.replace('<body>', '<body onload="x()">'))).toContain(
      'index.html: an event attribute',
    );
  });

  it('fails on absolute URLs, except links to the main repository', () => {
    expect(checkText('a.html', '<img src="https://example.com/x.png">')).toHaveLength(1);
    expect(checkText('a.html', '<link href="//example.com/x.css">')).toHaveLength(1);
    expect(checkText('a.css', 'b { background: url("https://example.com/p.png") }')).toHaveLength(1);
    expect(checkText('a.css', 'b { background: url(../fonts/x.ttf) }')).toEqual([]);
    expect(checkText('a.js', "import x from 'https://example.com/m.js';")).toContain(
      'a.js:1: an absolute URL in an import',
    );
    expect(checkText('a.js', "el.src = 'https://example.com/x.js';")).toHaveLength(1);
    expect(checkText('a.js', "a.href = 'https://github.com/wirelith/wirelith/commit/abc';")).toEqual([]);
    expect(checkText('a.js', "const NS = 'http://www.w3.org/2000/svg';")).toEqual([]);
  });

  it.each(FORBIDDEN)('fails on %s', (api) => {
    expect(checkText('a.js', `x.${api}`)).toHaveLength(api === 'navigator.clipboard.readText' ? 2 : 1);
  });
});
