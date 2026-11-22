// SPDX-License-Identifier: MIT

// Draws core's SVG: parse it as XML, check it against the allowlist, and only then import the
// checked nodes. Nothing is ever inserted as HTML.

import { parseAndCheck } from './svg-check.js';
import { svgMarkup } from './trusted-types.js';

export const REJECTED = 'The renderer returned something outside the allowed SVG. Nothing was drawn.';

/**
 * Replaces the preview with the SVG, or empties it and returns false when the check fails.
 * @param {HTMLElement} container
 * @param {string} svg
 */
export function showSvg(container, svg) {
  const result = parseAndCheck(svgMarkup(svg), new DOMParser());
  if (!result.ok) {
    container.replaceChildren();
    return false;
  }
  container.replaceChildren(document.importNode(result.doc.documentElement, true));
  return true;
}
