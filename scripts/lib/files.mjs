// SPDX-License-Identifier: MIT

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every file under a folder, as paths relative to it with "/" separators, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
export function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== '.DS_Store')
    .map((d) => relative(dir, join(d.parentPath, d.name)).split('\\').join('/'))
    .sort();
}
