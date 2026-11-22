// SPDX-License-Identifier: MIT

// Every diagnostic-* conformance case: the gutter marks exactly the lines in its
// diagnostics.json, and clicking each problem puts the caret at its line and column.

import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { offsetOf } from '../../src/positions.js';
import { BROWSERS, expectClean, launch, open, setSource, startServer } from './harness.mjs';

const CASES = 'vendor/wirelith/conformance/cases';
const cases = readdirSync(CASES)
  .filter((c) => c.startsWith('diagnostic-'))
  .map((c) => ({
    name: c,
    source: readFileSync(`${CASES}/${c}/input.wirelith`, 'utf8'),
    /** @type {{ code: string, severity: string, line: number, column: number }[]} */
    expected: JSON.parse(readFileSync(`${CASES}/${c}/diagnostics.json`, 'utf8')),
  }));

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

  it('has the cases', () => {
    expect(cases.length).toBeGreaterThan(30);
  });

  it.each(cases)('$name', async ({ source, expected }) => {
    const { page } = s;
    await setSource(s, source);
    const text = await page.locator('#source').inputValue();
    expect(text).toBe(source);

    const marked = await page
      .locator('.gutter-row.has-error, .gutter-row.has-warning')
      .evaluateAll((rows) => rows.map((r) => Number(/** @type {HTMLElement} */ (r).dataset.line)));
    expect(marked).toEqual([...new Set(expected.map((d) => d.line))].sort((a, b) => a - b));
    for (const line of new Set(expected.map((d) => d.line))) {
      const worst = expected.some((d) => d.line === line && d.severity === 'error') ? 'Error' : 'Warning';
      expect(await page.locator(`.gutter-row[data-line="${line}"] .marker`).textContent()).toBe(worst);
    }

    const buttons = page.locator('#problems button');
    expect(await buttons.count()).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const d = /** @type {(typeof expected)[number]} */ (expected[i]);
      expect(await buttons.nth(i).textContent()).toContain(`${d.code}`);
      await buttons.nth(i).click();
      const caret = await page.evaluate(() => {
        const ta = /** @type {HTMLTextAreaElement} */ (document.getElementById('source'));
        return { start: ta.selectionStart, end: ta.selectionEnd, focused: document.activeElement === ta };
      });
      const offset = offsetOf(text, d.line, d.column);
      expect(caret).toEqual({ start: offset, end: offset, focused: true });
    }
  });
});
