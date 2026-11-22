// SPDX-License-Identifier: MIT

// The allowlist check every SVG passes before the page draws it: the elements and attributes of
// spec Appendix D, no event attribute, no href, and no URL other than url(#…). A conforming core
// never fails it; it is the defence spec section 16 asks hosts to keep.

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const SOURCE_NS = 'urn:wirelith:source';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * Appendix D, element by element. `a` is left out: the spec allows it only in interactive mode,
 * which core doesn't produce, and this page allows no href at all.
 * @type {Record<string, string[]>}
 */
export const ALLOWED = {
  svg: ['xmlns', 'width', 'height', 'viewBox', 'role', 'aria-labelledby', 'xml:space'],
  title: ['id'],
  desc: ['id'],
  metadata: [],
  defs: [],
  clipPath: ['id'],
  marker: ['id', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits'],
  g: [
    'id',
    'class',
    'transform',
    'clip-path',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'aria-hidden',
  ],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'fill-opacity', 'stroke', 'stroke-width'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'marker-end'],
  text: ['x', 'y', 'font-family', 'font-size', 'font-weight', 'fill'],
  tspan: ['fill'],
};
const SOURCE_ATTRIBUTES = ['xmlns:wl', 'version'];

const ELEMENT = 1;
const TEXT = 3;

/**
 * @typedef {object} CheckNode the parts of a DOM node the check reads
 * @property {number} nodeType
 * @property {string | null} [localName]
 * @property {string | null} [namespaceURI]
 * @property {{ length: number, item(i: number): { name: string, value: string, namespaceURI: string | null } | null } | null} [attributes]
 * @property {{ length: number, item(i: number): CheckNode | null }} childNodes
 * @property {CheckNode | null} [parentNode]
 */

/**
 * Every url(…) in a value names a fragment in the same document.
 * @param {string} value
 */
function urlsAreFragments(value) {
  const lower = value.toLowerCase();
  for (let i = lower.indexOf('url'); i !== -1; i = lower.indexOf('url', i + 3)) {
    let j = i + 3;
    while (lower[j] === ' ' || lower[j] === '\t' || lower[j] === '\n') j++;
    if (lower[j] !== '(') continue;
    if (!/^#[A-Za-z][\w.:-]*\)/.test(value.slice(j + 1))) return false;
  }
  return true;
}

/**
 * Checks a parsed SVG document. Returns null when it passes, or the first problem.
 * @param {{ documentElement: CheckNode | null, doctype?: unknown, childNodes: { length: number, item(i: number): CheckNode | null } }} doc
 * @returns {string | null}
 */
export function checkSvgDocument(doc) {
  if (doc.doctype) return 'a document type declaration';
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg')
    return 'the root is not an SVG element';
  for (let i = 0; i < doc.childNodes.length; i++) {
    const n = doc.childNodes.item(i);
    if (n && n !== root) return 'something outside the root element';
  }
  /** @type {CheckNode[]} */
  const stack = [root];
  while (stack.length > 0) {
    const node = /** @type {CheckNode} */ (stack.pop());
    if (node.nodeType === TEXT) continue;
    if (node.nodeType !== ELEMENT) return `a node of type ${node.nodeType}`;
    const problem = checkElement(node);
    if (problem) return problem;
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const child = node.childNodes.item(i);
      if (child) stack.push(child);
    }
  }
  return null;
}

/**
 * @param {CheckNode} el
 * @returns {string | null}
 */
function checkElement(el) {
  const name = el.localName ?? '';
  let allowed;
  if (el.namespaceURI === SOURCE_NS && name === 'source') {
    const parent = el.parentNode;
    if (!parent || parent.namespaceURI !== SVG_NS || parent.localName !== 'metadata') {
      return 'wl:source outside metadata';
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes.item(i)?.nodeType !== TEXT) return 'wl:source holds more than text';
    }
    allowed = SOURCE_ATTRIBUTES;
  } else if (el.namespaceURI === SVG_NS && Object.hasOwn(ALLOWED, name)) {
    allowed = ALLOWED[name] ?? [];
  } else {
    return `the element ${name || '(unnamed)'}`;
  }
  const attributes = el.attributes;
  for (let i = 0; i < (attributes?.length ?? 0); i++) {
    const a = attributes?.item(i);
    if (!a) continue;
    const lower = a.name.toLowerCase();
    if (lower.startsWith('on')) return `the event attribute ${a.name}`;
    if (lower === 'href' || lower.endsWith(':href')) return `the attribute ${a.name}`;
    if (!allowed.includes(a.name)) return `the attribute ${a.name} on ${name}`;
    if (a.name === 'xmlns' && (a.value !== SVG_NS || a.namespaceURI !== XMLNS_NS))
      return 'the wrong namespace';
    if (a.name === 'xmlns:wl' && a.value !== SOURCE_NS) return 'the wrong source namespace';
    if (a.name === 'xml:space' && a.namespaceURI !== XML_NS) return 'a bad xml:space';
    if (!urlsAreFragments(a.value)) return `a URL in ${a.name}`;
  }
  return null;
}

/**
 * @typedef {{ ok: true, doc: Document } | { ok: false, reason: string }} ParseResult
 */

/**
 * Parses core's SVG as an XML document and checks it. Nothing is inserted anywhere.
 * @param {unknown} markup the SVG string, or a TrustedHTML made from it
 * @param {{ parseFromString(markup: any, type: 'image/svg+xml'): Document }} parser
 * @returns {ParseResult}
 */
export function parseAndCheck(markup, parser) {
  let doc;
  try {
    doc = parser.parseFromString(markup, 'image/svg+xml');
  } catch {
    return { ok: false, reason: 'the SVG could not be parsed' };
  }
  if (doc.getElementsByTagName('parsererror').length > 0)
    return { ok: false, reason: 'the SVG is not well-formed' };
  const reason = checkSvgDocument(/** @type {any} */ (doc));
  return reason ? { ok: false, reason } : { ok: true, doc };
}
