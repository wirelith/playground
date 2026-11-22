// SPDX-License-Identifier: MIT

// Turns files from the main repository into the data this repository vendors: the examples'
// titles, the eval tasks, and the eval's reference answers. Pure functions of their input.

/**
 * @typedef {object} EvalTask
 * @property {string} id for example "eval-a1"
 * @property {string} set "A" or "B"
 * @property {number} number 1 to 5
 * @property {string} title the heading the reference answer gives it
 * @property {string} request what the task asks for, as written in tasks.md
 */

export const TASKS_PER_SET = 5;
export const TASK_SETS = ['A', 'B'];

/**
 * Splits eval/tasks/tasks.md into its numbered tasks. Fails unless each set has exactly tasks
 * 1 to 5, in order.
 * @param {string} text
 * @returns {Omit<EvalTask, 'title'>[]}
 */
export function splitTasks(text) {
  /** @type {Omit<EvalTask, 'title'>[]} */
  const tasks = [];
  /** @type {string | null} */
  let set = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^## Task set ([A-Z])$/.exec(line);
    if (heading) {
      set = heading[1] ?? null;
      continue;
    }
    if (line.startsWith('#')) {
      set = null;
      continue;
    }
    const item = /^(\d+)\. (.+)$/.exec(line);
    if (set && item) {
      tasks.push({
        id: `eval-${set.toLowerCase()}${item[1]}`,
        set,
        number: Number(item[1]),
        request: (item[2] ?? '').trim(),
      });
    } else if (set && line.trim() !== '' && tasks.length > 0 && /^\s+\S/.test(line)) {
      const last = tasks[tasks.length - 1];
      if (last) last.request = `${last.request} ${line.trim()}`;
    }
  }
  for (const s of TASK_SETS) {
    const numbers = tasks.filter((t) => t.set === s).map((t) => t.number);
    const expected = Array.from({ length: TASKS_PER_SET }, (_, i) => i + 1);
    if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
      throw new Error(
        `tasks.md: set ${s} has tasks ${numbers.join(', ') || 'none'}, expected 1 to ${TASKS_PER_SET}`,
      );
    }
  }
  if (tasks.some((t) => !TASK_SETS.includes(t.set))) throw new Error('tasks.md: an unexpected task set');
  return tasks;
}

/**
 * Splits a reference answer file into its wirelith blocks, in order, with the heading line
 * before each. Scans line by line. Fails unless there are exactly five blocks.
 * @param {string} text
 * @param {string} name for messages
 * @returns {{ title: string, source: string }[]}
 */
export function splitAnswers(text, name) {
  const lines = text.split(/\r?\n/);
  /** @type {{ title: string, source: string }[]} */
  const blocks = [];
  let title = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line === '```wirelith') {
      const body = [];
      let j = i + 1;
      while (j < lines.length && lines[j] !== '```') body.push(lines[j++] ?? '');
      if (j >= lines.length) throw new Error(`${name}: a wirelith block has no closing fence`);
      blocks.push({ title, source: `${body.join('\n')}\n` });
      title = '';
      i = j;
    } else if (line.trim() !== '') {
      title = line.trim();
    }
  }
  if (blocks.length !== TASKS_PER_SET) {
    throw new Error(`${name}: ${blocks.length} wirelith blocks, expected ${TASKS_PER_SET}`);
  }
  return blocks;
}

/**
 * The readable title of an example, from the specification's headings.
 * @param {string} name the example's file name without extension
 * @param {string} spec the text of spec/spec.md
 */
export function exampleTitle(name, spec) {
  if (name === 'readme-example') return 'The README example';
  if (name === 'example-ai-spec') return "The one-page AI spec's example";
  const m = /^example-(\d+)(?:-(\d+))?-/.exec(name);
  if (m) {
    const number = m[2] ? `${m[1]}\\.${m[2]}` : `${m[1]}\\.`;
    const heading = new RegExp(`^#{2,3} ${number} (.+)$`, 'm').exec(spec);
    if (heading?.[1]) return heading[1].trim();
  }
  throw new Error(`no title for the example ${name}`);
}
