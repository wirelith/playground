// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { lineCount, offsetOf, utf8Length } from '../../src/positions.js';
import { render, validate } from '../helpers/core.mjs';

describe('offsetOf: code-point columns to textarea offsets', () => {
  it('counts plain columns', () => {
    const text = 'screen "A"\n  buton "Go"\n';
    expect(offsetOf(text, 1, 1)).toBe(0);
    expect(offsetOf(text, 2, 3)).toBe(text.indexOf('buton'));
  });

  it('counts an emoji before the error as one column, two code units', () => {
    // core reports E106 at the bad escape; the emoji before it is one code point.
    const text = 'screen "A"\n  text "😀 \\q"\n';
    const [d] = validate(text);
    expect(d?.code).toBe('E106');
    const offset = offsetOf(text, d?.line ?? 0, d?.column ?? 0);
    expect(text.slice(offset).startsWith('\\q')).toBe(true);
    // Counting UTF-16 units instead would land one character early.
    const naive = text.indexOf('\n') + 1 + (d?.column ?? 0) - 1;
    expect(naive).toBe(offset - 1);
  });

  it('handles several astral characters and other scripts', () => {
    const line = '  text "𝒜𝒷𝒸 漢字 é" bogus=';
    const text = `screen "A"\n${line}`;
    const col = [...line].indexOf('b') + 1; // the "b" of bogus, in code points
    expect(text.slice(offsetOf(text, 2, col)).startsWith('bogus')).toBe(true);
  });

  it('skips a byte-order mark on line 1, as core does', () => {
    const text = '\uFEFFscreen "A"\n';
    expect(offsetOf(text, 1, 1)).toBe(1);
    expect(offsetOf(text, 1, 2)).toBe(2);
  });

  it('clamps past the end of a line or the text', () => {
    const text = 'ab\ncd';
    expect(offsetOf(text, 1, 99)).toBe(2);
    expect(offsetOf(text, 9, 1)).toBe(text.length);
  });

  it('agrees with core on every diagnostic of a source with emoji everywhere', () => {
    const text = 'screen "😀" #a\n  text "😀😀" x=1 y=2\n  bogus "😀"\n  button "😀" -> #nowhere\n';
    for (const d of render(text).diagnostics) {
      const offset = offsetOf(text, d.line, d.column);
      const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
      expect([...text.slice(lineStart, offset)].length).toBe(d.column - 1);
    }
  });
});

describe('lineCount and utf8Length', () => {
  it('count lines', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a\nb\n')).toBe(3);
  });

  it('count UTF-8 bytes like TextEncoder', () => {
    for (const s of ['', 'abc', 'é', '漢字', '😀', 'a\uD800b', '\uDC00', `x${'é'.repeat(100)}`]) {
      expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
    }
  });
});
