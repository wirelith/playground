// SPDX-License-Identifier: MIT

// Runs the built site, _site/, in Chromium, Firefox and WebKit, served by scripts/serve.mjs, and
// watches everything the page does. Each test checks, at the end:
//
// - every request went to the page's own origin, and none at all after the first render;
// - no cookies; no Content-Security-Policy violation; no dialog; no navigation to a new document;
// - the preview holds only Appendix D elements and attributes;
// - a heartbeat timer in the page kept ticking.

import { chromium, firefox, webkit } from 'playwright';
import { expect } from 'vitest';
import { createSiteServer } from '../../scripts/serve.mjs';
import { ALLOWED, SOURCE_NS, SVG_NS } from '../../src/svg-check.js';

const ALL = { chromium, firefox, webkit };

/** The browsers to run, from E2E_BROWSERS (comma-separated), or all three. */
export const BROWSERS = /** @type {(keyof typeof ALL)[]} */ (
  (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit').split(',').filter((b) => b in ALL)
);

/** @param {keyof typeof ALL} name */
export function launch(name) {
  return ALL[name].launch();
}

/** Serves _site/ on a free port. */
export async function startServer() {
  const server = createSiteServer({ root: '_site' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    url: `${origin}/`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

/** Runs in the page before its own scripts: the heartbeat, and records of what happens. */
function watchPage() {
  const w = /** @type {any} */ (window);
  w.__docId = Math.random();
  w.__beats = [];
  setInterval(() => w.__beats.push(performance.now()), 50);
  w.__violations = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    w.__violations.push(`${e.violatedDirective} ${e.blockedURI}`),
  );
  // Count the worker's answers, so tests can wait for a render.
  w.__answers = 0;
  w.__copied = [];
  const RealWorker = window.Worker;
  window.Worker = /** @type {any} */ (
    function Worker(/** @type {any} */ url, /** @type {any} */ options) {
      const worker = new RealWorker(url, options);
      worker.addEventListener('message', () => {
        w.__answers++;
      });
      return worker;
    }
  );
  if (navigator.clipboard) {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (/** @type {string} */ text) => {
      w.__copied.push(text);
      return write(text).catch(() => undefined);
    };
  }
}

/**
 * Opens the playground in a fresh context and starts watching it.
 * @param {import('playwright').Browser} browser
 * @param {string} url
 */
export async function open(browser, url) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const watch = {
    /** @type {string[]} */
    requests: [],
    /** @type {string[]} */
    late: [],
    /** @type {string[]} */
    errors: [],
    dialogs: 0,
    ready: false,
  };
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('blob:') || u.startsWith('data:')) return;
    watch.requests.push(u);
    if (watch.ready) watch.late.push(u);
  });
  page.on('pageerror', (e) => watch.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') watch.errors.push(`console: ${m.text()}`);
  });
  page.on('dialog', (d) => {
    watch.dialogs++;
    d.dismiss().catch(() => {});
  });
  await page.addInitScript(watchPage);
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]');
  watch.ready = true;
  const docId = await page.evaluate(() => /** @type {any} */ (window).__docId);
  return { context, page, watch, docId };
}

/**
 * @typedef {Awaited<ReturnType<typeof open>>} Session
 */

/**
 * Waits for the worker's next answer after `action`, and a moment for the page to show it.
 * @param {Session} s
 * @param {() => Promise<unknown>} action
 */
export async function rendered(s, action) {
  const before = await s.page.evaluate(() => /** @type {any} */ (window).__answers);
  await action();
  await s.page.waitForFunction((n) => /** @type {any} */ (window).__answers > n, before, { timeout: 10000 });
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
}

/**
 * Replaces the editor's text, exactly, with an input event as an edit makes, and waits for the
 * render. (Filling the field as typing does drops some control characters in some browsers.)
 * @param {Session} s
 * @param {string} text
 */
export async function setSource(s, text) {
  await rendered(s, () =>
    s.page.evaluate((t) => {
      const ta = /** @type {HTMLTextAreaElement} */ (document.getElementById('source'));
      ta.value = t;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, text),
  );
}

/**
 * Pastes text into the editor with a real paste: the text is put on the clipboard by a trusted
 * click in a helper page, then pasted with the keyboard. (Firefox gives a scripted paste event
 * no data.)
 * @param {Session} s
 * @param {string} text
 */
export async function paste(s, text) {
  const helper = await s.context.newPage();
  await helper.setContent('<button id="b">copy</button>');
  await helper.evaluate((t) => {
    /** @type {HTMLButtonElement} */ (document.getElementById('b')).onclick = () => {
      // Set the exact text, line endings included, from a trusted copy.
      document.addEventListener(
        'copy',
        (e) => {
          e.clipboardData?.setData('text/plain', t);
          e.preventDefault();
        },
        { once: true },
      );
      document.execCommand('copy');
    };
  }, text);
  await helper.click('#b');
  await helper.close();
  await s.page.bringToFront();
  await s.page.locator('#source').focus();
  await s.page.keyboard.press('ControlOrMeta+V');
}

/**
 * The checks every test ends with.
 * @param {Session} s
 * @param {string} origin
 */
export async function expectClean(s, origin) {
  const { page, watch } = s;
  expect(watch.requests.filter((u) => new URL(u).origin !== origin)).toEqual([]);
  expect(watch.late).toEqual([]);
  expect(await s.context.cookies()).toEqual([]);
  expect(watch.dialogs).toBe(0);
  expect(watch.errors).toEqual([]);
  const state = await page.evaluate(
    ({ allowed, svgNs, sourceNs }) => {
      const w = /** @type {any} */ (window);
      const bad = [];
      for (const el of document.querySelectorAll('#preview *')) {
        const ok =
          (el.namespaceURI === svgNs && Object.hasOwn(allowed, el.localName)) ||
          (el.namespaceURI === sourceNs && el.localName === 'source');
        if (!ok) bad.push(`<${el.localName}>`);
        const names = el.namespaceURI === sourceNs ? ['xmlns:wl', 'version'] : (allowed[el.localName] ?? []);
        for (const a of el.attributes) if (!names.includes(a.name)) bad.push(`${el.localName}@${a.name}`);
      }
      const beats = w.__beats;
      let gap = 0;
      for (let i = 1; i < beats.length; i++) gap = Math.max(gap, beats[i] - beats[i - 1]);
      return {
        docId: w.__docId,
        violations: w.__violations,
        bad,
        maxGap: gap,
        sinceLastBeat: performance.now() - (beats.at(-1) ?? 0),
        scripts: document.scripts.length,
      };
    },
    { allowed: ALLOWED, svgNs: SVG_NS, sourceNs: SOURCE_NS },
  );
  expect(state.docId).toBe(s.docId);
  expect(state.violations).toEqual([]);
  expect(state.bad).toEqual([]);
  expect(state.scripts).toBe(1);
  // The page never froze: the heartbeat kept ticking, with no gap near the render time limit.
  expect(state.sinceLastBeat).toBeLessThan(1000);
  expect(state.maxGap).toBeLessThan(2000);
}
