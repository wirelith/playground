// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPlaygroundPrompts } from '../../scripts/lib/prompts.mjs';
import { readLock } from '../../scripts/lib/upstream.mjs';
import {
  EVAL_PREFIX,
  extractBlocks,
  fenceFor,
  PROBLEMS_INSTRUCTION,
  preamble,
  problemsText,
  promptText,
} from '../../src/ai.js';
import { EVAL_TASKS_SHOWN } from '../../src/config.js';
import { AI_SPEC } from '../../vendor/wirelith/core/ai-spec.js';
import { validate } from '../helpers/core.mjs';

const lock = readLock();
const pre = preamble({ specVersion: lock.specVersion, coreVersion: lock.coreVersion, aiSpec: AI_SPEC });

describe('the preamble', () => {
  it("contains core's one-page AI spec exactly", () => {
    expect(AI_SPEC.length).toBeGreaterThan(1000);
    expect(pre).toContain(AI_SPEC);
    expect(pre.split(AI_SPEC)).toHaveLength(2);
  });

  it('names the spec and core versions', () => {
    expect(pre).toContain(
      `This is Wirelith ${lock.specVersion}, as rendered by @wirelith/core ${lock.coreVersion}.`,
    );
  });

  it('is the agreed text around the spec', () => {
    const [head, tail] = pre.split(AI_SPEC);
    expect(head).toBe(
      'You are writing a wireframe in Wirelith, a plain-text language for low-fidelity wireframes.\n' +
        'Its whole definition is below. Reply with one ```wirelith code block and nothing else.\n' +
        'Use made-up names for products and people. If I send you problems, fix every one and reply\n' +
        'with the whole corrected source.\n\n' +
        `This is Wirelith ${lock.specVersion}, as rendered by @wirelith/core ${lock.coreVersion}.\n\n---\n\n`,
    );
    expect(tail?.endsWith('\n---\n\nThe wireframe to write:\n')).toBe(true);
  });

  it('copies a prompt with the preamble in front, and eval tasks prefixed', () => {
    expect(promptText(pre, { kind: 'playground', request: 'A login page.' })).toBe(`${pre}\nA login page.\n`);
    expect(promptText(pre, { kind: 'eval', request: 'A login page.' })).toBe(
      `${pre}\n${EVAL_PREFIX} A login page.\n`,
    );
  });
});

describe('the prompt library', () => {
  const evalTasks = JSON.parse(readFileSync('vendor/wirelith/prompts/eval-tasks.json', 'utf8'));
  const own = readPlaygroundPrompts();

  it('has unique ids', () => {
    const ids = [...evalTasks.map((/** @type {{ id: string }} */ t) => t.id), ...own.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(EVAL_TASKS_SHOWN).size).toBe(EVAL_TASKS_SHOWN.length);
  });

  it('shows only eval tasks that exist', () => {
    const known = new Set(evalTasks.map((/** @type {{ id: string }} */ t) => t.id));
    for (const id of EVAL_TASKS_SHOWN) expect(known.has(id)).toBe(true);
  });

  it('has a title and a request for every prompt of its own', () => {
    expect(own.length).toBeGreaterThan(0);
    for (const p of own) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.request.length).toBeGreaterThan(20);
    }
  });

  it('has an .md file for every example answer', () => {
    for (const f of readdirSync('prompts').filter((n) => n.endsWith('.wirelith'))) {
      expect(existsSync(`prompts/${f.replace(/\.wirelith$/, '.md')}`)).toBe(true);
    }
  });

  const answers = [
    ...own.flatMap((p) => (p.answer === undefined ? [] : [[`prompts/${p.id}.wirelith`, p.answer]])),
    ...evalTasks.map((/** @type {{ id: string }} */ t) => [
      `vendor/wirelith/prompts/answers/${t.id}.wirelith`,
      readFileSync(`vendor/wirelith/prompts/answers/${t.id}.wirelith`, 'utf8'),
    ]),
  ];

  it.each(answers)('has no error in the example answer %s', (_file, source) => {
    expect(validate(source).filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('reading a pasted AI reply', () => {
  const block = (/** @type {string} */ body, fence = '```') => `${fence}wirelith\n${body}${fence}\n`;

  it('keeps only the block, not the prose around it', () => {
    const reply = `Here is your wireframe:\n\n${block('screen "A"\n  text "Hi"\n')}\nLet me know if you want changes.\n`;
    expect(extractBlocks(reply)).toEqual([{ source: 'screen "A"\n  text "Hi"\n', line: 3, closed: true }]);
  });

  it('finds several blocks, in order', () => {
    const reply = `One:\n${block('screen "A"\n')}Two:\n${block('screen "B"\n')}\n${block('screen "C"\n')}`;
    expect(extractBlocks(reply).map((b) => [b.source, b.line])).toEqual([
      ['screen "A"\n', 2],
      ['screen "B"\n', 6],
      ['screen "C"\n', 10],
    ]);
  });

  it('reads blocks fenced with tildes, and longer fences', () => {
    expect(extractBlocks(block('screen "A"\n', '~~~'))[0]?.source).toBe('screen "A"\n');
    const long = '````wirelith\nscreen "A"\n```\nstill inside\n````\n';
    expect(extractBlocks(long)[0]?.source).toBe('screen "A"\n```\nstill inside\n');
    // A backtick fence doesn't close a tilde block.
    expect(extractBlocks('~~~wirelith\nscreen "A"\n```\n~~~\n')[0]?.source).toBe('screen "A"\n```\n');
  });

  it('reads CRLF and CR line endings, and gives LF', () => {
    expect(extractBlocks('Hi\r\n```wirelith\r\nscreen "A"\r\n  text "B"\r\n```\r\nBye')).toEqual([
      { source: 'screen "A"\n  text "B"\n', line: 2, closed: true },
    ]);
    expect(extractBlocks('```wirelith\rscreen "A"\r```\r')[0]?.source).toBe('screen "A"\n');
  });

  it('runs an unclosed block to the end of the paste, and says so', () => {
    expect(extractBlocks('Sure:\n```wirelith\nscreen "A"\n  text "cut off\n')).toEqual([
      { source: 'screen "A"\n  text "cut off\n', line: 2, closed: false },
    ]);
  });

  it('finds no block in plain text, or in blocks of other languages', () => {
    expect(extractBlocks('screen "A"\n  text "Hi"\n')).toEqual([]);
    expect(extractBlocks('```js\nalert(1)\n```\n```\nscreen "A"\n```\n')).toEqual([]);
    expect(extractBlocks('``wirelith\nx\n``\n')).toEqual([]);
    expect(extractBlocks('    ```wirelith\nindented code, not a fence\n```\n')).toEqual([]);
  });

  it('accepts an info string after the language, in any case, indented up to three spaces', () => {
    expect(extractBlocks('   ```Wirelith title="x"\nscreen "A"\n   ```\n')[0]?.source).toBe('screen "A"\n');
  });

  it('scans a long paste in linear time', () => {
    const started = Date.now();
    const blocks = extractBlocks(`${'`'.repeat(200_000)}\n${'~~~wirelith x\n'.repeat(20_000)}`);
    expect(blocks).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('copying problems for an AI assistant', () => {
  it('lists every diagnostic, then the source in a wirelith block', () => {
    const source = 'screen "A"\n  bogus\n  button "B" colour=red\n';
    const diagnostics = validate(source);
    const text = problemsText(source, diagnostics);
    expect(text.startsWith(`${PROBLEMS_INSTRUCTION}\n\n`)).toBe(true);
    for (const d of diagnostics) {
      expect(text).toContain(`${d.code} ${d.severity} at line ${d.line}, column ${d.column}: ${d.message}`);
    }
    expect(text.endsWith(`\n\n\`\`\`wirelith\n${source}\`\`\`\n`)).toBe(true);
    expect(extractBlocks(text)[0]?.source).toBe(source);
  });

  it('uses a fence longer than any in the source', () => {
    expect(fenceFor('text\n````\n')).toBe('`````');
    const source = 'screen "A"\n// ```\n```\n';
    expect(extractBlocks(problemsText(source, []))[0]?.source).toBe(source);
  });
});
