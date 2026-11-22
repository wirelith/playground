// SPDX-License-Identifier: MIT

// The text the "Ask your AI" panel copies, and the reading of pasted AI replies. Nothing here
// calls a model or makes a request: the person copies and pastes.

/** @typedef {import('./render-job.js').Diagnostic} Diagnostic */

/** A paste longer than this is refused before it is scanned. */
export const MAX_PASTE_BYTES = 1_048_576;

export const EVAL_PREFIX = 'Write a Wirelith wireframe of:';
export const PROBLEMS_INSTRUCTION =
  'Fix every problem below and reply with the whole corrected source in one wirelith code block.';

/**
 * The preamble: what the language is and how to answer, then the one-page AI spec, exactly.
 * @param {{ specVersion: string, coreVersion: string, aiSpec: string }} v
 */
export function preamble({ specVersion, coreVersion, aiSpec }) {
  return [
    'You are writing a wireframe in Wirelith, a plain-text language for low-fidelity wireframes.',
    'Its whole definition is below. Reply with one ```wirelith code block and nothing else.',
    'Use made-up names for products and people. If I send you problems, fix every one and reply',
    'with the whole corrected source.',
    '',
    `This is Wirelith ${specVersion}, as rendered by @wirelith/core ${coreVersion}.`,
    '',
    '---',
    '',
    `${aiSpec}${aiSpec.endsWith('\n') ? '' : '\n'}`,
    '---',
    '',
    'The wireframe to write:',
    '',
  ].join('\n');
}

/**
 * A prompt as copied: the preamble, then the request.
 * @param {string} pre the preamble
 * @param {{ kind: 'eval' | 'playground', request: string }} prompt
 */
export function promptText(pre, prompt) {
  const request = prompt.kind === 'eval' ? `${EVAL_PREFIX} ${prompt.request}` : prompt.request;
  return `${pre}\n${request}\n`;
}

/**
 * A fence of backticks longer than any run of backticks at the start of a line in the text.
 * @param {string} text
 */
export function fenceFor(text) {
  let longest = 0;
  for (const line of text.split('\n')) {
    let i = 0;
    while (line[i] === ' ' && i < 3) i++;
    let run = 0;
    while (line[i + run] === '`') run++;
    longest = Math.max(longest, run);
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The text "Copy problems for your AI" copies.
 * @param {string} source
 * @param {Diagnostic[]} diagnostics
 */
export function problemsText(source, diagnostics) {
  const fence = fenceFor(source);
  const lines = diagnostics.map(
    (d) => `${d.code} ${d.severity} at line ${d.line}, column ${d.column}: ${d.message}`,
  );
  return `${PROBLEMS_INSTRUCTION}\n\n${lines.join('\n')}\n\n${fence}wirelith\n${source}${source.endsWith('\n') ? '' : '\n'}${fence}\n`;
}

/**
 * @typedef {object} Block
 * @property {string} source the block's contents, with LF line endings
 * @property {number} line the 1-based line of its opening fence in the paste
 * @property {boolean} closed false when the paste ended before a closing fence
 */

/**
 * An opening fence: up to three spaces, then three or more backticks or tildes, then an info
 * string whose first word is "wirelith". Returns the fence character and its length.
 * @param {string} line
 * @returns {{ char: string, length: number } | null}
 */
function openingFence(line) {
  let i = 0;
  while (i < 3 && line[i] === ' ') i++;
  const char = line[i];
  if (char !== '`' && char !== '~') return null;
  let length = 0;
  while (line[i + length] === char) length++;
  if (length < 3) return null;
  const info = line.slice(i + length).trim();
  if (char === '`' && info.includes('`')) return null;
  let end = 0;
  while (end < info.length && info[end] !== ' ' && info[end] !== '\t' && info[end] !== '{') end++;
  return info.slice(0, end).toLowerCase() === 'wirelith' ? { char, length } : null;
}

/**
 * True when the line closes a fence of this character and at least this length.
 * @param {string} line
 * @param {{ char: string, length: number }} fence
 */
function closesFence(line, fence) {
  let i = 0;
  while (i < 3 && line[i] === ' ') i++;
  let length = 0;
  while (line[i + length] === fence.char) length++;
  return length >= fence.length && line.slice(i + length).trim() === '';
}

/**
 * Splits text into lines at LF, CRLF or CR, without a regular expression.
 * @param {string} text
 */
function lines(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) {
      out.push(text.slice(start, i));
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * Every block fenced as wirelith in a pasted reply, in order, scanned line by line. A block
 * with no closing fence runs to the end of the paste.
 * @param {string} text
 * @returns {Block[]}
 */
export function extractBlocks(text) {
  /** @type {Block[]} */
  const blocks = [];
  const all = lines(text);
  for (let i = 0; i < all.length; i++) {
    const fence = openingFence(all[i] ?? '');
    if (!fence) continue;
    const body = [];
    let j = i + 1;
    while (j < all.length && !closesFence(all[j] ?? '', fence)) body.push(all[j++] ?? '');
    const closed = j < all.length;
    if (!closed && body.length > 0 && body[body.length - 1] === '') body.pop();
    blocks.push({ source: body.length > 0 ? `${body.join('\n')}\n` : '', line: i + 1, closed });
    i = j;
  }
  return blocks;
}
