// SPDX-License-Identifier: MIT

// Diagnostics give a line and a column counted in Unicode code points (spec section 15). A
// textarea counts UTF-16 code units, in text whose line endings it has already turned into LF.

/**
 * The textarea offset of a 1-based line and code-point column. A column past the end of its line
 * gives the line's end; a line past the end of the text gives the text's end.
 * @param {string} text with LF line endings, as a textarea's value has
 * @param {number} line
 * @param {number} column
 */
export function offsetOf(text, line, column) {
  let start = 0;
  for (let l = 1; l < line; l++) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) return text.length;
    start = newline + 1;
  }
  const newline = text.indexOf('\n', start);
  const end = newline === -1 ? text.length : newline;
  // A byte-order mark is not part of the source (spec section 3), so it isn't counted.
  let offset = start === 0 && text.charCodeAt(0) === 0xfeff ? 1 : start;
  for (let c = 1; c < column && offset < end; c++) {
    const cp = text.codePointAt(offset) ?? 0;
    offset += cp > 0xffff ? 2 : 1;
  }
  return offset;
}

/**
 * The number of lines in a textarea's value.
 * @param {string} text
 */
export function lineCount(text) {
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

/**
 * The number of bytes the text takes in UTF-8. A lone surrogate counts as U+FFFD, 3 bytes, as
 * core counts it after replacing it (spec section 3).
 * @param {string} text
 */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
