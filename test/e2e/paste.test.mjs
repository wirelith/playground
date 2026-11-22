// SPDX-License-Identifier: MIT

// Pasted AI replies: the editor keeps only the wirelith block, never the prose around it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BROWSERS, expectClean, launch, open, paste, rendered, setSource, startServer } from './harness.mjs';
import { hostile } from './upstream-tests.mjs';

const { payloads, everywhere } = hostile();
const PROSE = 'PROSE-SENTINEL';
const fenced = (/** @type {string} */ body, fence = '```') => `${fence}wirelith\n${body}${fence}\n`;

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

  /** Loads a known, unedited source, so a paste needs no question. */
  async function reset() {
    await s.page.locator('#blocks').evaluate((el) => {
      /** @type {HTMLElement} */ (el).hidden = true;
    });
    await s.page.click('#examples-button');
    const unedited = s.page.locator('[data-example="example-2-first"]');
    await unedited.click();
    if (await s.page.locator('#confirm').isVisible())
      await rendered(s, () => s.page.click('#confirm button.primary'));
    await s.page.waitForFunction(() => document.getElementById('confirm')?.hidden === true);
  }

  it('refuses a 10 MB paste before reading it', async () => {
    await reset();
    const before = await s.page.locator('#source').inputValue();
    await paste(s, `${PROSE}\n${fenced(`screen "Big"\n// ${'x'.repeat(10 * 1024 * 1024)}\n`)}`);
    await s.page.waitForFunction(() => document.getElementById('notice')?.textContent?.includes('over 1 MB'));
    expect(await s.page.locator('#source').inputValue()).toBe(before);
  });

  it('keeps the first of several blocks, says so, and offers the others', async () => {
    await reset();
    const reply = `${PROSE} one\n${fenced('screen "One" #one\n')}\n${PROSE} two\r\n~~~wirelith\r\nscreen "Two" #two\r\n~~~\r\n${fenced('screen "Three" #three\n', '````')}${PROSE} end`;
    await rendered(s, () => paste(s, reply));
    expect(await s.page.locator('#source').inputValue()).toBe('screen "One" #one\n');
    expect(await s.page.locator('#notice').textContent()).toContain('3 wirelith blocks');
    expect(await s.page.locator('#blocks button').count()).toBe(3);
    await rendered(s, () => s.page.click('#blocks button[data-block="2"]'));
    expect(await s.page.locator('#source').inputValue()).toBe('screen "Two" #two\n');
    await rendered(s, () => s.page.click('#blocks button[data-block="3"]'));
    expect(await s.page.locator('#source').inputValue()).toBe('screen "Three" #three\n');
    expect(await s.page.locator('#preview svg > title').textContent()).toBe('Three');
  });

  it('keeps an unclosed block to the end of the paste, and says so', async () => {
    await reset();
    await rendered(s, () => paste(s, `${PROSE}\n\`\`\`wirelith\nscreen "Cut" #cut\n  text "off`));
    expect(await s.page.locator('#source').inputValue()).toBe('screen "Cut" #cut\n  text "off\n');
    expect(await s.page.locator('#notice').textContent()).toContain('no closing fence');
  });

  it('pastes text without a block as it is', async () => {
    await reset();
    await s.page.locator('#source').focus();
    await s.page.keyboard.press('ControlOrMeta+A');
    await rendered(s, () => paste(s, 'screen "Plain" #plain\n'));
    expect(await s.page.locator('#source').inputValue()).toBe('screen "Plain" #plain\n');
  });

  it('asks before replacing edited text, and keeps it if told to', async () => {
    await setSource(s, 'screen "Mine" #mine\n');
    await paste(s, `${PROSE}\n${fenced('screen "Theirs"\n')}`);
    await s.page.locator('#confirm').waitFor({ state: 'visible' });
    await s.page.click('#confirm button:not(.primary)');
    expect(await s.page.locator('#source').inputValue()).toBe('screen "Mine" #mine\n');
  });

  it.each(payloads)('keeps a block carrying %j, and draws it safely', async (p) => {
    await reset();
    const source = everywhere(p);
    await rendered(s, () => paste(s, `${PROSE} ${p}\n\n${fenced(source)}\n${PROSE} ${p}`));
    const value = await s.page.locator('#source').inputValue();
    expect(value).toBe(source);
    expect(value).not.toContain(PROSE);
    expect(await s.page.locator('.problem-error').count()).toBe(0);
    expect(await s.page.locator('#preview svg').count()).toBe(1);
  });
});
