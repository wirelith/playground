// SPDX-License-Identifier: MIT

// Reads the hostile payloads, and the function that places one in every string position, from
// the vendored copy of the main repository's packages/core/test/hostile.test.ts, so the browser
// tests use exactly what core's own tests use. If that file changes shape, this fails loudly.

import { readFileSync } from 'node:fs';

/**
 * @param {string} text
 * @param {string} start
 * @param {string} end
 */
function between(text, start, end) {
  const i = text.indexOf(start);
  const j = i === -1 ? -1 : text.indexOf(end, i + start.length);
  if (i === -1 || j === -1) throw new Error(`hostile.test.ts no longer contains ${JSON.stringify(start)}`);
  return text.slice(i, j + end.length);
}

export function hostile() {
  const text = readFileSync('vendor/wirelith/tests/hostile.test.ts', 'utf8');
  const payloads = between(text, 'const PAYLOADS = [', '\n];').replace('const PAYLOADS = ', 'return ');
  const q = between(text, 'const q = (s: string) =>', ';\n').replace('(s: string)', '(s)');
  const everywhere = between(text, 'function everywhere(p: string): string {', '\n}\n').replace(
    '(p: string): string',
    '(p)',
  );
  if (/:\s*(?:string|number)\b/.test(q + everywhere))
    throw new Error('hostile.test.ts has new type annotations');
  // Test code only, from a vendored file whose hash is pinned in scripts/upstream.lock.json.
  return {
    /** @type {string[]} */
    payloads: new Function(payloads)(),
    /** @type {(p: string) => string} */
    everywhere: new Function(`${q}\n${everywhere}\nreturn everywhere;`)(),
  };
}
