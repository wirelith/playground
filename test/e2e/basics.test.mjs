// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from '../helpers/core.mjs';
import { BROWSERS, expectClean, launch, open, rendered, setSource, startServer } from './harness.mjs';

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

  it('draws the README example, loads every font from its own origin, and fills the footer', async () => {
    const s = await open(browser, server.url);
    const { page, watch } = s;
    const readme = readFileSync('vendor/wirelith/examples/readme-example.wirelith', 'utf8');
    expect(await page.locator('#source').inputValue()).toBe(readme);
    expect(await page.locator('#preview svg > title').textContent()).toBe('3 screens');
    const fonts = watch.requests.filter((u) => u.endsWith('.ttf'));
    expect(fonts).toHaveLength(11);
    for (const f of fonts) expect(new URL(f).origin).toBe(server.origin);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
    expect(loaded).toBe(11);
    const lock = JSON.parse(readFileSync('scripts/upstream.lock.json', 'utf8'));
    expect(await page.locator('#upstream-commit').getAttribute('href')).toBe(
      `https://github.com/wirelith/wirelith/commit/${lock.commit}`,
    );
    expect(await page.locator('#core-version').textContent()).toBe(lock.coreVersion);
    expect(await page.locator('#spec-version').textContent()).toBe(lock.specVersion);
    await expectClean(s, server.origin);
    await s.context.close();
  });

  it('renders as you type, with no request after load', async () => {
    const s = await open(browser, server.url);
    const { page } = s;
    await page.locator('#source').click();
    await page.keyboard.press('ControlOrMeta+A');
    await rendered(s, () =>
      page.keyboard.type('screen "Typed" #typed\n  button "Go" primary\n', { delay: 5 }),
    );
    await page.waitForFunction(() => document.querySelector('#preview svg > title')?.textContent === 'Typed');
    await expectClean(s, server.origin);
    await s.context.close();
  });

  it('inserts two spaces on Tab, and lets Escape then Tab move focus on', async () => {
    const s = await open(browser, server.url);
    const { page } = s;
    await setSource(s, 'screen "A"\n');
    await page.locator('#source').focus();
    await page.keyboard.press('ControlOrMeta+End');
    await rendered(s, () => page.keyboard.press('Tab'));
    expect(await page.locator('#source').inputValue()).toBe('screen "A"\n  ');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('source');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('source');
    expect(await page.locator('#source').inputValue()).toBe('screen "A"\n  ');
    expect(await page.locator('#editor-help').textContent()).toContain('press Escape, then Tab');
    await expectClean(s, server.origin);
    await s.context.close();
  });

  it('applies the options, downloads exactly core’s SVG, and shares a link that opens the same', async () => {
    const s = await open(browser, server.url);
    const { page } = s;
    const source = readFileSync('vendor/wirelith/examples/example-18-2-sign-in-flow.wirelith', 'utf8');
    await setSource(s, source);
    await page.click('#screen-button');
    const radios = page.locator('#screen-list input[type=radio]');
    const id = /** @type {string} */ (await radios.nth(2).getAttribute('value'));
    await rendered(s, () => radios.nth(2).check());
    await rendered(s, () => page.uncheck('#opt-notes'));
    await rendered(s, () => page.uncheck('#opt-flows'));
    const options = { screen: id, notes: false, flows: false };

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    expect(download.suggestedFilename()).toBe('wireframe.svg');
    expect(readFileSync(/** @type {string} */ (await download.path()), 'utf8')).toBe(
      render(source, options).svg,
    );

    const before = page.url();
    await page.click('#share');
    await page.waitForFunction(() => location.hash.startsWith('#v=1&src='));
    await page.waitForFunction(() =>
      document.getElementById('notice')?.textContent?.includes('Anyone with the link can read the source.'),
    );
    const link = page.url();
    expect(link).not.toBe(before);
    expect(link).toMatch(/&notes=0&flows=0&screen=/);
    // Typing never changes the URL.
    await page.locator('#source').focus();
    await rendered(s, () => page.keyboard.type('// more\n'));
    expect(page.url()).toBe(link);
    await expectClean(s, server.origin);

    const t = await open(browser, link);
    expect(await t.page.locator('#source').inputValue()).toBe(source);
    expect(await t.page.isChecked('#opt-notes')).toBe(false);
    expect(await t.page.isChecked('#opt-flows')).toBe(false);
    expect(await t.page.locator('#screen-button').textContent()).toBe(`Screen: #${id}`);
    expect(await t.page.locator('#preview svg').count()).toBe(1);
    await expectClean(t, server.origin);
    await t.context.close();
    await s.context.close();
  });
});
