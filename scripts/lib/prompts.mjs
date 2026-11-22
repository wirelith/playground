// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROMPTS_DIR = 'prompts';

/**
 * @typedef {object} PlaygroundPrompt
 * @property {string} id
 * @property {'playground'} kind
 * @property {string} title
 * @property {string} request
 * @property {string} [answer]
 */

/**
 * The playground's own prompts: prompts/<id>.md is a title line, then the request, and
 * prompts/<id>.wirelith is an optional example answer. Sorted by id.
 * @param {string} [dir]
 * @returns {PlaygroundPrompt[]}
 */
export function readPlaygroundPrompts(dir = PROMPTS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const id = f.slice(0, -3);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
        throw new Error(`${dir}/${f}: ids are lowercase words joined by "-"`);
      const [title = '', ...rest] = readFileSync(join(dir, f), 'utf8').split('\n');
      const request = rest.join('\n').trim();
      if (title.trim() === '' || request === '')
        throw new Error(`${dir}/${f}: needs a title line, then the request`);
      /** @type {PlaygroundPrompt} */
      const prompt = { id, kind: 'playground', title: title.trim(), request };
      const answer = join(dir, `${id}.wirelith`);
      if (existsSync(answer)) prompt.answer = readFileSync(answer, 'utf8');
      return prompt;
    });
}
