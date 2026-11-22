// SPDX-License-Identifier: MIT

// The vendored @wirelith/core for tests, imported by URL for the same reason as in
// src/render-job.js: so the type checker doesn't check core's built JavaScript.

/** @typedef {import('../../src/render-job.js').Diagnostic} Diagnostic */
/** @typedef {import('../../src/render-job.js').Core} Core */

/** @type {Core & { validate(source: string, options?: object): Diagnostic[] }} */
export const core = await import(new URL('../../vendor/wirelith/core/index.js', import.meta.url).href);
export const { render, outline, validate } = core;
