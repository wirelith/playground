// SPDX-License-Identifier: MIT

// The main repository's hostile payloads, in every string position the way its own test places
// them, typed into the editor: they draw as text, and nothing else gets into the page.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BROWSERS, expectClean, launch, open, setSource, startServer } from './harness.mjs';
import { hostile } from './upstream-tests.mjs';

const { payloads, everywhere } = hostile();

/** SVGs the page's own check must refuse, parsed by the browser itself. */
const BAD = {
  script: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  foreignObject:
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>',
  style: '<svg xmlns="http://www.w3.org/2000/svg"><style>*{fill:red}</style></svg>',
  onload: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
  href: '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com/"><text>x</text></a></svg>',
  url: '<svg xmlns="http://www.w3.org/2000/svg"><g clip-path="url(https://example.com/#c)"/></svg>',
  malformed: '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
  html: '<p onclick="alert(1)">x</p>',
};

/** @type {Awaited<ReturnType<typeof startServer>>} */
let server;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.close());

describe.each(BROWSERS)('%s', (name) => {
  /** @type {import('playwright').Browser} */
  let browser;
  /** @type {Awaited<ReturnType<typeof open>>} */
  let s;
  beforeAll(async () => {
    browser = await launch(name);
    s = await open(browser, server.url);
  });
  afterAll(async () => {
    await expectClean(s, server.origin);
    await browser.close();
  });

  it.each(payloads)('draws %j as text, everywhere', async (p) => {
    const { page } = s;
    await setSource(s, everywhere(p));
    expect(await page.locator('.problem-error').count()).toBe(0);
    expect(await page.locator('#preview svg').count()).toBe(1);
    const found = await page.evaluate((payload) => {
      const texts = [...document.querySelectorAll('#preview text')].map((t) => t.textContent ?? '');
      return {
        drawn: texts.some((t) => t.includes(payload)),
        // The page's own module script is the only script; the harness checks that.
        anywhere: document.querySelectorAll(
          'iframe, foreignObject, image, style, object, embed, a[href^="javascript"]',
        ).length,
        events: [...document.querySelectorAll('*')].some((el) =>
          [...el.attributes].some((a) => a.name.toLowerCase().startsWith('on')),
        ),
        status: document.getElementById('status')?.textContent,
      };
    }, p);
    expect(found).toEqual({ drawn: true, anywhere: 0, events: false, status: '' });
  });

  it("refuses SVGs outside the allowlist, with the browser's own parser", async () => {
    // Its own session: parsing these on purpose makes the Content-Security-Policy block their
    // inline styles and handlers, which the browser logs. The page only ever parses core's output.
    const t = await open(browser, server.url);
    const good = readFileSync('vendor/wirelith/conformance/cases/example-2-first/output.svg', 'utf8');
    // As a string, so the test runner leaves its import() calls alone: they run in the page.
    const script = `(async ({ bad, ok }) => {
      const check = await import('./src/svg-check.js');
      const tt = await import('./src/trusted-types.js');
      const preview = await import('./src/preview.js');
      const out = {};
      for (const [k, svg] of Object.entries(bad)) {
        const container = document.createElement('div');
        out[k] = [
          check.parseAndCheck(tt.svgMarkup(svg), new DOMParser()).ok,
          preview.showSvg(container, svg),
          container.childNodes.length,
        ];
      }
      out.good = check.parseAndCheck(tt.svgMarkup(ok), new DOMParser()).ok;
      return out;
    })(${JSON.stringify({ bad: BAD, ok: good })})`;
    /** @type {Record<string, unknown>} */
    const results = await t.page.evaluate(script);
    for (const k of Object.keys(BAD)) expect(results[k], k).toEqual([false, false, 0]);
    expect(results.good).toBe(true);
    // Everything logged or reported is the policy blocking an inline style or handler in those
    // documents, or the parser rejecting the malformed one. Nothing else.
    const expected = /Content[- ]Security[- ]Policy|Refused to|XML Parsing Error/i;
    await t.page.waitForTimeout(500); // Some browsers deliver console messages late.
    expect(t.watch.errors.filter((e) => !expected.test(e))).toEqual([]);
    t.watch.errors = [];
    const directives = await t.page.evaluate(() => {
      const w = /** @type {any} */ (window);
      const seen = w.__violations.map((/** @type {string} */ v) => v.split(' ')[0]);
      w.__violations = [];
      return [...new Set(seen)];
    });
    const blocks = ['style-src-elem', 'style-src-attr', 'script-src-attr', 'require-trusted-types-for'];
    expect(directives.filter((d) => !blocks.includes(d))).toEqual([]);
    await expectClean(t, server.origin);
    await t.context.close();
  });
});
