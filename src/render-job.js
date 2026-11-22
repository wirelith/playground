// SPDX-License-Identifier: MIT

// The one function the worker runs. The conformance test calls it directly, which shows the
// page passes core's diagnostics and SVG through unchanged.

/**
 * @typedef {object} Diagnostic
 * @property {string} code
 * @property {'error' | 'warning'} severity
 * @property {number} line
 * @property {number} column
 * @property {string} message
 * @property {string} [hint]
 */

/**
 * @typedef {object} Outline
 * @property {{ id: string, title?: string, of?: string, overlays: { id: string, type: string, title?: string }[] }[]} screens
 * @property {unknown[]} links
 */

/**
 * @typedef {object} RenderOptions
 * @property {boolean} [notes]
 * @property {boolean} [flows]
 * @property {string} [screen]
 */

/**
 * @typedef {object} RenderResult
 * @property {string | null} svg core's SVG, exactly, or null
 * @property {Diagnostic[]} diagnostics
 * @property {Outline | null} outline null when the source has errors
 * @property {boolean} screenReset true when the screen option named an id the source no longer has
 * @property {string} [error] set when core threw
 */

/**
 * The part of @wirelith/core this page uses.
 * @typedef {object} Core
 * @property {(source: string, options?: RenderOptions) => { svg: string | null, diagnostics: Diagnostic[] }} render
 * @property {(source: string, options?: RenderOptions) => { outline: Outline | null, diagnostics: Diagnostic[] }} outline
 */

// Imported by URL, so the type checker uses the interface above rather than checking core's built
// JavaScript, which the main repository checks as TypeScript.
/** @type {Core} */
const core = await import(new URL('../vendor/wirelith/core/index.js', import.meta.url).href);

/**
 * Every screen and overlay id in an outline, in source order.
 * @param {Outline} o
 * @returns {string[]}
 */
export function screenIds(o) {
  return o.screens.flatMap((s) => [s.id, ...s.overlays.map((v) => v.id)]);
}

/**
 * @param {{ source: string, options?: RenderOptions }} job
 * @returns {RenderResult}
 */
export function renderJob({ source, options = {} }) {
  try {
    const { screen, ...rest } = options;
    /** @type {Outline | null} */
    const o = core.outline(source, rest).outline ?? null;
    /** @type {RenderOptions} */
    const used = { ...rest };
    let screenReset = false;
    if (screen !== undefined) {
      // An id that isn't in the source is a host error, which core throws. Leave it out, and
      // tell the page to go back to all screens, unless the source has errors and can't be
      // drawn anyway.
      if (o && screenIds(o).includes(screen)) used.screen = screen;
      else if (o) screenReset = true;
    }
    const { svg, diagnostics } = core.render(source, used);
    return { svg, diagnostics, outline: o, screenReset };
  } catch (e) {
    return {
      svg: null,
      diagnostics: [],
      outline: null,
      screenReset: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
