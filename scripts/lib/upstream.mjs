// SPDX-License-Identifier: MIT

// What this repository takes from the main repository, and how. update-upstream.mjs and
// check-upstream.mjs both use this module, so an update and a rebuild produce the same files.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/** Folders that hold only files from the main repository. Any other file in them is an error. */
export const VENDORED_FOLDERS = ['.githooks/', 'scripts/hygiene/'];

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

  for (const entry of VERBATIM) {
    const found = trackedFiles(dir, entry);
    if (found.length === 0) throw new Error(`the main repository has no ${entry}`);
    for (const f of found) add(f, f);
  }

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
