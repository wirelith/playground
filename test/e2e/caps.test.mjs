// SPDX-License-Identifier: MIT
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: `copies` holds lines of caps.test.ts as text, to check they still match.

// Sources at and one past each cap of spec section 16, built the way the main repository's
// packages/core/test/caps.test.ts builds them, and the largest valid sources timed against the
// render time limit.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BROWSERS, expectClean, launch, open, rendered, startServer } from './harness.mjs';

const lines = (/** @type {number} */ n, /** @type {(i: number) => string} */ f) =>
  Array.from({ length: n }, (_, i) => f(i)).join('\n');
const head = 'screen "A"\n// ';
const at = `${head}${'x'.repeat(65536 - head.length - 1)}\n`;
const list = (/** @type {number} */ n) => `[${Array.from({ length: n }, (_, i) => `i${i}`).join(', ')}]`;
const cols = (/** @type {number} */ n) => `[${Array.from({ length: n }, (_, i) => `c${i}`).join(', ')}]`;

/** Each cap: the source at the limit, the source one past it, and the line in caps.test.ts it copies. */
const CAPS = [
  {
    cap: 'source size',
    at: at,
    over: `${at} `,
    copies: "const at = `${head}${'x'.repeat(65536 - head.length - 1)}\\n`;",
  },
  {
    cap: 'elements',
    ...pair((n) => `screen "A"\n  row\n${lines(n - 2, () => '    badge "x"')}\n`, 2000),
    copies: `\`screen "A"\\n  row\\n\${lines(n - 2, () => '    badge "x"')}\\n\``,
  },
  {
    cap: 'screens',
    ...pair((n) => lines(n, (i) => `screen "S${i}" desktop`), 50),
    copies: 'screen "S${i}" desktop',
  },
  {
    cap: 'nesting depth',
    ...pair((d) => lines(d, (i) => `${'  '.repeat(i)}${i === 0 ? 'screen "A"' : 'column'}`), 16),
    copies: "`${'  '.repeat(i)}${i === 0 ? 'screen \"A\"' : 'column'}`",
  },
  {
    cap: 'string length',
    ...pair((n) => `screen "A"\n  text "${'界'.repeat(n)}"\n`, 500),
    copies: '`screen "A"\\n  text "${\'界\'.repeat(500)}"\\n`',
  },
  {
    cap: 'list items',
    ...pair((n) => `screen "A"\n  list ${list(n)}\n`, 100),
    copies: '`screen "A"\\n  list ${list(100)}\\n`',
  },
  {
    cap: 'table columns',
    ...pair((n) => `screen "A"\n  table ${cols(n)}\n`, 20),
    copies: '`screen "A"\\n  table ${cols(20)}\\n`',
  },
  {
    cap: 'table rows',
    ...pair((n) => `screen "A"\n  table [a]\n${lines(n, () => '    row [x]')}\n`, 200),
    copies: '`screen "A"\\n  table [a]\\n${lines(n, () => \'    row [x]\')}\\n`',
  },
  {
    cap: 'links and flows',
    ...pair((n) => `screen "A" #a\n  row\n${lines(n - 1, () => '    link "x" -> #a')}\nflow #a -> #a\n`, 500),
    copies: '`screen "A" #a\\n  row\\n${lines(n - 1, () => \'    link "x" -> #a\')}\\nflow #a -> #a\\n`',
  },
];

/**
 * @param {(n: number) => string} build
 * @param {number} limit
 */
function pair(build, limit) {
  return { at: build(limit), over: build(limit + 1) };
}

/** The largest valid sources, timed. */
const LARGEST = [
  { name: '2,000 elements', source: /** @type {string} */ (CAPS[1]?.at) },
  { name: '50 screens', source: /** @type {string} */ (CAPS[2]?.at) },
  { name: '500 links', source: /** @type {string} */ (CAPS[8]?.at) },
];

const capsTest = readFileSync('vendor/wirelith/tests/caps.test.ts', 'utf8');
/** @type {Record<string, Record<string, number>>} */
const timings = {};

/** @type {Awaited<ReturnType<typeof startServer>>} */
let server;
beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.close();
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/e2e-timings.json', `${JSON.stringify(timings, null, 2)}\n`);
  console.log(`render timings (ms, from the edit to the drawing, including the ${120} ms debounce):`);
  console.table(timings);
});

it('builds every source the way caps.test.ts does', () => {
  for (const c of CAPS) expect(capsTest, c.cap).toContain(c.copies);
});

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

  /** @param {string} text */
  const fill = (text) =>
    s.page.evaluate((t) => {
      const ta = /** @type {HTMLTextAreaElement} */ (document.getElementById('source'));
      ta.value = t;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
  const codes = () => s.page.locator('#problems .problem-label').allTextContents();

  it.each(CAPS)('$cap: accepted at the limit, E701 one past it', async ({ cap, at, over }) => {
    await rendered(s, () => fill(at));
    expect(await codes()).not.toContain('Error E701');
    expect(await s.page.locator('#preview svg').count()).toBe(1);
    if (cap === 'source size') {
      // Never posted to the worker: the page reports it as core would.
      await fill(over);
      await s.page.waitForFunction(
        () => document.querySelector('#problems .problem-label')?.textContent === 'Error E701',
      );
      expect(await s.page.locator('#problems .problem-where').allTextContents()).toEqual([
        'Line 1, column 1',
      ]);
    } else {
      await rendered(s, () => fill(over));
      expect(await codes()).toEqual(['Error E701']);
    }
    expect(await s.page.locator('#preview svg').count()).toBe(0);
  });

  it.each(LARGEST)(
    'draws the largest valid source, $name, within the time limit',
    async ({ name: what, source }) => {
      await rendered(s, () => fill('screen "Reset"\n'));
      const started = Date.now();
      await rendered(s, () => fill(source));
      const ms = Date.now() - started;
      timings[what] = { ...timings[what], [name]: ms };
      expect(await s.page.locator('#preview svg').count()).toBe(1);
      expect(await s.page.locator('#status').textContent()).toBe('');
      expect(ms).toBeLessThan(2000);
    },
  );
});
