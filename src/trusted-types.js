// SPDX-License-Identifier: MIT

// The page's one Trusted Types policy, "playground". The Content-Security-Policy allows no other
// policy and requires one for every script URL and every string parsed as markup.
//
// - createScriptURL accepts only the worker's own URL.
// - createHTML is used only for core's SVG, which is then parsed as XML and checked against the
//   allowlist before anything is inserted (see preview.js).
//
// Browsers without Trusted Types ignore the CSP directive, and get the plain strings.

const WORKER_URL = new URL('./worker.js', import.meta.url).href;

/** @type {any} */
const tt = /** @type {any} */ (globalThis).trustedTypes;

const policy = tt
  ? tt.createPolicy('playground', {
      /** @param {string} url */
      createScriptURL(url) {
        if (url !== WORKER_URL) throw new TypeError('This page loads no script but its own worker.');
        return url;
      },
      /** @param {string} svg */
      createHTML(svg) {
        return svg;
      },
    })
  : null;

/** The worker's URL, as a TrustedScriptURL where the browser has Trusted Types. */
export function workerScriptURL() {
  return policy ? policy.createScriptURL(WORKER_URL) : WORKER_URL;
}

/**
 * Core's SVG, ready to be parsed. Only preview.js calls this, and only on core's output.
 * @param {string} svg
 * @returns {unknown}
 */
export function svgMarkup(svg) {
  return policy ? policy.createHTML(svg) : svg;
}
