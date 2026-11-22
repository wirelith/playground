// SPDX-License-Identifier: MIT

// Builds the site into _site/. There is no bundler: files are copied, and every URL in them is
// relative, so the site works at any path (for example /playground/ or /).
//
//   _site/index.html                 from src/index.html
//   _site/src/                       the page's own modules, styles and icon
//   _site/src/site-data.js           the versions and the examples, as a module the page imports
//   _site/vendor/wirelith/core/      the vendored @wirelith/core
//   _site/vendor/wirelith/examples/  the examples' sources
//   _site/third-party/fonts/         the fonts, with their licenses
//   _site/LICENSE.txt, NOTICE.txt
//   _site/build.json                 the commits, the versions, and a SHA-256 for every other file
//
// The page can't read build.json itself: its Content-Security-Policy allows no fetch. It imports
// site-data.js instead. build.json is for the smoke test after a deploy.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { filesUnder } from './lib/files.mjs';
import { readLock, sha256 } from './lib/upstream.mjs';

const OUT = '_site';

/**
 * @param {string} from
 * @param {string} to relative to _site
 */
function copy(from, to) {
  const dest = join(OUT, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
}

/**
 * @param {string} to relative to _site
 * @param {string} text
 */
function write(to, text) {
  const dest = join(OUT, to);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
}

/** The commit being built: CI's, or the checkout's. */
function playgroundCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

const lock = readLock();
rmSync(OUT, { recursive: true, force: true });

copy('src/index.html', 'index.html');
for (const f of filesUnder('src')) {
  if (f === 'index.html' || f.endsWith('.d.ts')) continue;
  copy(join('src', f), `src/${f}`);
}
for (const f of filesUnder('vendor/wirelith/core'))
  copy(join('vendor/wirelith/core', f), `vendor/wirelith/core/${f}`);
for (const f of filesUnder('vendor/wirelith/examples')) {
  copy(join('vendor/wirelith/examples', f), `vendor/wirelith/examples/${f}`);
}
for (const f of filesUnder('third-party/fonts')) copy(join('third-party/fonts', f), `third-party/fonts/${f}`);
copy('LICENSE', 'LICENSE.txt');
copy('NOTICE', 'NOTICE.txt');

/** @type {{ id: string, title: string, file: string }[]} */
const index = JSON.parse(readFileSync('vendor/wirelith/examples/index.json', 'utf8'));
const build = {
  repository: lock.repository,
  upstreamCommit: lock.commit,
  coreVersion: lock.coreVersion,
  specVersion: lock.specVersion,
};
const examples = index.map(({ id, title, file }) => ({
  id,
  title,
  source: readFileSync(join('vendor/wirelith/examples', file), 'utf8'),
}));
write(
  'src/site-data.js',
  [
    '// SPDX-License-Identifier: MIT',
    '// Written by scripts/build-site.mjs. Do not edit.',
    '',
    `export const BUILD = ${JSON.stringify(build, null, 2)};`,
    '',
    `export const EXAMPLES = ${JSON.stringify(examples, null, 2)};`,
    '',
  ].join('\n'),
);

/** @type {Record<string, string>} */
const files = {};
for (const f of filesUnder(OUT)) files[f] = sha256(readFileSync(join(OUT, f)));
write(
  'build.json',
  `${JSON.stringify({ playgroundCommit: playgroundCommit(), ...build, files }, null, 2)}\n`,
);
console.log(`build: ${Object.keys(files).length} files in ${OUT}/, core ${lock.coreVersion}.`);
