// SPDX-License-Identifier: MIT

// What this repository takes from the main repository, and how. update-upstream.mjs and
// check-upstream.mjs both use this module, so an update and a rebuild produce the same files.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { exampleTitle, splitAnswers, splitTasks, TASK_SETS } from './upstream-content.mjs';

export const UPSTREAM_REPO = 'wirelith/wirelith';
export const UPSTREAM_URL = `https://github.com/${UPSTREAM_REPO}`;
export const LOCK_PATH = 'scripts/upstream.lock.json';

/**
 * Files copied byte for byte to the same path here. An entry ending in "/" is a folder, copied
 * whole. They are never edited in this repository; a change goes to the main repository first.
 */
export const VERBATIM = [
  '.githooks/',
  '.github/workflows/pr-checks.yml',
  '.github/workflows/scan-posts.yml',
  'CODE_OF_CONDUCT.md',
  'LICENSE',
  'biome.json',
  'scripts/check-licenses.mjs',
  'scripts/check-spdx.mjs',
  'scripts/hygiene/',
  'scripts/install-hooks.mjs',
];

/** Copied byte for byte to another path here: [from, to]. Folders end in "/". */
export const MOVED = [
  ['conformance/cases/', 'vendor/wirelith/conformance/cases/'],
  ['conformance/runner/', 'vendor/wirelith/conformance/runner/'],
  ['packages/core/test/caps.test.ts', 'vendor/wirelith/tests/caps.test.ts'],
  ['packages/core/test/hostile.test.ts', 'vendor/wirelith/tests/hostile.test.ts'],
  ['third-party/fonts/', 'third-party/fonts/'],
  ['third-party/lucide/LICENSE', 'third-party/lucide/LICENSE'],
];

/** Where the built @wirelith/core goes. */
export const CORE_DIR = 'vendor/wirelith/core/';

/** Folders that hold only files from the main repository. Any other file in them is an error. */
export const VENDORED_FOLDERS = ['.githooks/', 'scripts/hygiene/', 'third-party/', 'vendor/'];

/**
 * This repository's own files inside those folders. vendor/biome.json turns Biome off for
 * vendor/, because those files are checked in the main repository, which leaves its own build
 * output and conformance cases out of Biome in the same way.
 */
export const LOCAL_IN_VENDORED_FOLDERS = ['vendor/biome.json'];

/**
 * @typedef {object} Lock
 * @property {string} repository
 * @property {string} commit
 * @property {string} coreVersion
 * @property {string} specVersion
 * @property {Record<string, string>} files path to SHA-256, sorted by path
 */

/**
 * @typedef {object} Collected
 * @property {Map<string, { bytes: Buffer, mode: number }>} files this repository's path to its content
 * @property {string} coreVersion
 * @property {string} specVersion
 */

/**
 * Reads one GitHub REST API path as JSON. (The update script can't use the vendored hygiene
 * client, because the first update is what brings it here.)
 * @param {string} path
 * @param {string | undefined} token
 * @returns {Promise<any>}
 */
export async function githubJson(path, token) {
  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'wirelith-playground-upstream',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path.split('?')[0]}`);
  return res.json();
}

/** @param {string} s */
export function isCommit(s) {
  return /^[0-9a-f]{40}$/.test(s);
}

/** @param {Buffer | string} data */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

/**
 * Fetches the main repository at one commit into a new temporary folder, and returns the folder.
 * @param {string} commit
 */
export function fetchUpstream(commit) {
  if (!isCommit(commit)) throw new Error(`not a full commit SHA: ${commit}`);
  const dir = mkdtempSync(join(tmpdir(), 'wirelith-upstream-'));
  git(['init', '-q'], dir);
  git(['fetch', '-q', '--depth=1', `${UPSTREAM_URL}.git`, commit], dir);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], dir);
  const head = git(['rev-parse', 'HEAD'], dir).trim();
  if (head !== commit) throw new Error(`fetched ${head}, expected ${commit}`);
  return dir;
}

/**
 * The files git tracks under one path of a checkout, sorted.
 * @param {string} dir
 * @param {string} path
 */
function trackedFiles(dir, path) {
  return git(['ls-files', '-z', '--', path], dir).split('\0').filter(Boolean).sort();
}

/**
 * Collects everything this repository takes from a checkout of the main repository.
 * @param {string} dir the checkout
 * @returns {Collected}
 */
export function collect(dir) {
  /** @type {Collected['files']} */
  const files = new Map();
  /** @param {string} from @param {string} to */
  const add = (from, to) => {
    const full = join(dir, from);
    files.set(to, { bytes: readFileSync(full), mode: statSync(full).mode & 0o777 });
  };

  /** @param {string} to @param {string} text */
  const addText = (to, text) => files.set(to, { bytes: Buffer.from(text, 'utf8'), mode: 0o644 });
  /** @param {string} entry */
  const tracked = (entry) => {
    const found = trackedFiles(dir, entry);
    if (found.length === 0) throw new Error(`the main repository has no ${entry}`);
    return found;
  };

  for (const entry of VERBATIM) {
    for (const f of tracked(entry)) add(f, f);
  }
  for (const [from = '', to = ''] of MOVED) {
    for (const f of tracked(from)) add(f, `${to}${f.slice(from.length)}`);
  }

  // @wirelith/core, built by the main repository's own lockfile and build script. Only the
  // JavaScript: not the source maps or type declarations.
  const run = (/** @type {string[]} */ args) =>
    execFileSync('pnpm', args, { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
  run(['install', '--frozen-lockfile']);
  run(['--filter', '@wirelith/core', 'run', 'build']);
  const dist = 'packages/core/dist/';
  const built = git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', dist], dir)
    .split('\0')
    .filter((f) => f.endsWith('.js'))
    .sort();
  if (!built.includes(`${dist}index.js`) || !built.includes(`${dist}ai-spec.js`)) {
    throw new Error('the core build has no index.js or ai-spec.js');
  }
  for (const f of built) add(f, `${CORE_DIR}${f.slice(dist.length)}`);

  // The examples: the README's, and the specification's worked examples from the conformance suite.
  const spec = readFileSync(join(dir, 'spec/spec.md'), 'utf8');
  const examples = [
    'docs/readme-example.wirelith',
    ...tracked('conformance/cases/')
      .filter((f) => /^conformance\/cases\/example-[^/]+\/input\.wirelith$/.test(f))
      .sort(byExampleOrder),
  ];
  const index = examples.map((f) => {
    const id = f.startsWith('docs/') ? basename(f, '.wirelith') : (f.split('/')[2] ?? '');
    add(f, `vendor/wirelith/examples/${id}.wirelith`);
    return { id, title: exampleTitle(id, spec), file: `${id}.wirelith` };
  });
  addText('vendor/wirelith/examples/index.json', `${JSON.stringify(index, null, 2)}\n`);

  // The eval's ten tasks, titled by their reference answers' headings, and those answers.
  const tasks = splitTasks(readFileSync(join(dir, 'eval/tasks/tasks.md'), 'utf8'));
  /** @type {import('./upstream-content.mjs').EvalTask[]} */
  const titled = [];
  for (const set of TASK_SETS) {
    const ref = `eval/test/fixtures/reference-${set.toLowerCase()}.md`;
    const answers = splitAnswers(readFileSync(join(dir, ref), 'utf8'), ref);
    const inSet = tasks.filter((t) => t.set === set);
    inSet.forEach((t, i) => {
      const answer = answers[i];
      if (!answer) throw new Error(`${ref}: no answer for task ${t.number}`);
      titled.push({ ...t, title: answer.title });
      addText(`vendor/wirelith/prompts/answers/${t.id}.wirelith`, answer.source);
    });
  }
  addText(
    'vendor/wirelith/prompts/eval-tasks.json',
    `${JSON.stringify(
      titled.map(({ id, set, number, title, request }) => ({ id, set, number, title, request })),
      null,
      2,
    )}\n`,
  );

  const core = JSON.parse(readFileSync(join(dir, 'packages/core/package.json'), 'utf8'));
  const parseSource = readFileSync(join(dir, 'packages/core/src/parse.ts'), 'utf8');
  const specVersion = /export const SPEC_VERSION = '([^']+)';/.exec(parseSource)?.[1];
  if (typeof core.version !== 'string' || !specVersion) throw new Error('could not read the versions');
  return {
    files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1))),
    coreVersion: core.version,
    specVersion,
  };
}

/**
 * Orders the conformance examples by the specification's section numbers, then by name.
 * @param {string} a
 * @param {string} b
 */
function byExampleOrder(a, b) {
  const key = (/** @type {string} */ f) => {
    const m = /example-(\d+)(?:-(\d+))?-/.exec(f);
    return m ? [Number(m[1]), Number(m[2] ?? 0)] : [Number.POSITIVE_INFINITY, 0];
  };
  const [a1 = 0, a2 = 0] = key(a);
  const [b1 = 0, b2 = 0] = key(b);
  return a1 - b1 || a2 - b2 || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * @param {string} commit
 * @param {Collected} collected
 * @returns {Lock}
 */
export function makeLock(commit, collected) {
  /** @type {Record<string, string>} */
  const files = {};
  for (const [path, { bytes }] of collected.files) files[path] = sha256(bytes);
  return {
    repository: UPSTREAM_URL,
    commit,
    coreVersion: collected.coreVersion,
    specVersion: collected.specVersion,
    files,
  };
}

/** @returns {Lock} */
export function readLock() {
  return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
}
