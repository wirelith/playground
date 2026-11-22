// SPDX-License-Identifier: MIT

// Hostile share links: each shows its error, opens nothing, and leaves the page working.

import { deflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MESSAGES } from '../../src/share.js';
import { BROWSERS, expectClean, launch, open, rendered, startServer } from './harness.mjs';

const bomb = deflateRawSync(Buffer.alloc(10_000_000), { level: 9 }).toString('base64url');
const LINKS = [
  { name: 'bad base64', hash: '#v=1&src=%%%not-base64', message: MESSAGES.base64 },
  { name: 'a decompression bomb', hash: `#v=1&src=${bomb}`, message: MESSAGES.tooLarge },
  { name: 'a truncated stream', hash: '#v=1&src=y0vNKUlNSS0', message: MESSAGES.stream },
  { name: 'control characters', hash: '#v=1&src=ab%01%07%1Bcd', message: MESSAGES.base64 },
  { name: 'an unknown version', hash: '#v=99&src=AAAA', message: MESSAGES.version },
];

/** @type {Awaited<ReturnType<typeof startServer>>} */
let server;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.close());

describe.each(BROWSERS)('%s', (name) => {
  /** @type {import('playwright').Browser} */
  let browser;
  beforeAll(async () => {
    browser = await launch(name);
  });
  afterAll(() => browser.close());

  it.each(LINKS)(
    'opening a link with $name shows an error and the README example',
    async ({ hash, message }) => {
      const s = await open(browser, `${server.url}${hash}`);
      expect(await s.page.locator('#notice').textContent()).toBe(message);
      expect(await s.page.locator('#source').inputValue()).toMatch(/^wirelith 0\.1\n\nscreen "Sign in"/);
      expect(await s.page.locator('#preview svg').count()).toBe(1);
      await expectClean(s, server.origin);
      await s.context.close();
    },
  );

  it.each(LINKS)(
    'following a link with $name while open shows an error and keeps the source',
    async ({ hash, message }) => {
      const s = await open(browser, server.url);
      const before = await s.page.locator('#source').inputValue();
      await s.page.evaluate((h) => {
        location.hash = h;
      }, hash);
      await s.page.waitForFunction((m) => document.getElementById('notice')?.textContent === m, message);
      expect(await s.page.locator('#source').inputValue()).toBe(before);
      await expectClean(s, server.origin);
      await s.context.close();
    },
  );

  it('a 10 MB fragment opens nothing and the page keeps working', async () => {
    const s = await open(browser, server.url);
    const before = await s.page.locator('#source').inputValue();
    await s.page.evaluate(() => {
      try {
        location.hash = `#v=1&src=${'A'.repeat(10 * 1024 * 1024)}`;
      } catch {
        // A browser may refuse a URL this long; that opens nothing either.
      }
    });
    await s.page.waitForTimeout(1000);
    expect(await s.page.locator('#source').inputValue()).toBe(before);
    const notice = await s.page.locator('#notice').textContent();
    expect(['', MESSAGES.tooLong]).toContain(notice);
    // Still renders.
    await rendered(s, () => s.page.locator('#source').fill('screen "Still here"\n'));
    expect(await s.page.locator('#preview svg > title').textContent()).toBe('Still here');
    // A browser may refuse the URL and say so in the console (one does); nothing else may be logged.
    const refusal = `console: Not allowed to load local resource: ${server.origin}/#v=1&src=AAAA`;
    s.watch.errors = s.watch.errors.filter((e) => !e.startsWith(refusal));
    await expectClean(s, server.origin);
    await s.context.close();
  });
});
