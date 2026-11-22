// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exampleTitle, splitAnswers, splitTasks } from '../../scripts/lib/upstream-content.mjs';

const tasksMd = (/** @type {number} */ a, /** @type {number} */ b) =>
  [
    '# Tasks',
    '',
    '## Task set A',
    '',
    'Intro text.',
    '',
    ...Array.from({ length: a }, (_, i) => `${i + 1}. Task A${i + 1}.`),
    '',
    '## Task set B',
    '',
    ...Array.from({ length: b }, (_, i) => `${i + 1}. Task B${i + 1}.`),
  ].join('\n');

const answersMd = (/** @type {number} */ n) =>
  Array.from({ length: n }, (_, i) => `Heading ${i + 1}\n\n\`\`\`wirelith\nscreen "S${i}"\n\`\`\`\n`).join(
    '\n',
  );

describe('splitTasks', () => {
  it('reads five tasks per set, with ids eval-a1 to eval-b5', () => {
    const tasks = splitTasks(tasksMd(5, 5));
    expect(tasks.map((t) => t.id)).toEqual([
      'eval-a1',
      'eval-a2',
      'eval-a3',
      'eval-a4',
      'eval-a5',
      'eval-b1',
      'eval-b2',
      'eval-b3',
      'eval-b4',
      'eval-b5',
    ]);
    expect(tasks[0]).toEqual({ id: 'eval-a1', set: 'A', number: 1, request: 'Task A1.' });
  });

  it('fails unless each set has exactly five', () => {
    expect(() => splitTasks(tasksMd(4, 5))).toThrow(/set A/);
    expect(() => splitTasks(tasksMd(5, 6))).toThrow(/set B/);
  });

  it('reads the vendored copy of the real file', () => {
    const answers = JSON.parse(readFileSync('vendor/wirelith/prompts/eval-tasks.json', 'utf8'));
    expect(answers).toHaveLength(10);
    for (const t of answers) {
      expect(readFileSync(`vendor/wirelith/prompts/answers/${t.id}.wirelith`, 'utf8')).toMatch(
        /^wirelith 0\.1\n/,
      );
      expect(t.title.length).toBeGreaterThan(0);
    }
  });
});

describe('splitAnswers', () => {
  it('takes each wirelith block with the heading before it', () => {
    const blocks = splitAnswers(answersMd(5), 'ref');
    expect(blocks).toHaveLength(5);
    expect(blocks[2]).toEqual({ title: 'Heading 3', source: 'screen "S2"\n' });
  });

  it('fails unless there are exactly five', () => {
    expect(() => splitAnswers(answersMd(4), 'ref')).toThrow(/4 wirelith blocks/);
    expect(() => splitAnswers(answersMd(6), 'ref')).toThrow(/6 wirelith blocks/);
  });

  it('fails on a block with no closing fence', () => {
    expect(() => splitAnswers(`${answersMd(4)}\nLast\n\n\`\`\`wirelith\nscreen "X"\n`, 'ref')).toThrow(
      /no closing fence/,
    );
  });
});

describe('exampleTitle', () => {
  const spec = '## 2. A first example\n\n### 18.4 Data table with filters\n';
  it('uses the specification headings', () => {
    expect(exampleTitle('example-2-first', spec)).toBe('A first example');
    expect(exampleTitle('example-18-4-data-table-with-filters', spec)).toBe('Data table with filters');
    expect(exampleTitle('readme-example', spec)).toBe('The README example');
  });

  it('fails for an example it cannot title', () => {
    expect(() => exampleTitle('example-18-9-new', spec)).toThrow();
  });
});
