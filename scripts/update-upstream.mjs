// SPDX-License-Identifier: MIT

// Takes everything this repository uses from the main repository, at one commit:
//
//   node scripts/update-upstream.mjs <commit>
//
// 1. Refuses unless the commit is on the main repository's main branch and its CI passed.
// 2. Fetches the main repository at that commit into a temporary folder.
// 3. Copies the files listed in scripts/lib/upstream.mjs, and removes any file the previous
//    commit provided that this one no longer does.
// 4. Writes scripts/upstream.lock.json: the commit, the core and spec versions, and a SHA-256
//    for every copied file.
//
// Set GITHUB_TOKEN to raise the GitHub API rate limit. The token needs no permissions.

import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  collect,
  fetchUpstream,
  githubJson,
  isCommit,
  LOCK_PATH,
  makeLock,
  readLock,
  UPSTREAM_REPO,
} from './lib/upstream.mjs';

const commit = process.argv[2] ?? '';
if (!isCommit(commit)) {
  console.error('usage: node scripts/update-upstream.mjs <full 40-character commit SHA>');
  process.exit(2);
}
const token = process.env.GITHUB_TOKEN;

// 1. The commit is on main: comparing it with main shows main ahead of it, or the same.
const compare = await githubJson(`/repos/${UPSTREAM_REPO}/compare/${commit}...main`, token);
if (compare.status !== 'ahead' && compare.status !== 'identical') {
  console.error(`update-upstream: ${commit} is not on the main branch of ${UPSTREAM_REPO}.`);
  process.exit(1);
}
// ...and its CI workflow passed on a push to main.
const runs = await githubJson(
  `/repos/${UPSTREAM_REPO}/actions/runs?head_sha=${commit}&event=push&per_page=100`,
  token,
);
const passed = (runs.workflow_runs ?? []).some(
  (/** @type {any} */ r) => r.name === 'CI' && r.head_branch === 'main' && r.conclusion === 'success',
);
if (!passed) {
  console.error(`update-upstream: the CI workflow has not passed for ${commit} on main.`);
  process.exit(1);
}

// 2 and 3.
const dir = fetchUpstream(commit);
try {
  const collected = collect(dir);
  const previous = existsSync(LOCK_PATH) ? Object.keys(readLock().files) : [];
  for (const path of previous) {
    if (!collected.files.has(path)) rmSync(path, { force: true });
  }
  for (const [path, { bytes, mode }] of collected.files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    chmodSync(path, mode);
  }

  // 4.
  writeFileSync(LOCK_PATH, `${JSON.stringify(makeLock(commit, collected), null, 2)}\n`);
  console.log(
    `update-upstream: ${collected.files.size} files from ${UPSTREAM_REPO} at ${commit.slice(0, 12)} ` +
      `(core ${collected.coreVersion}, spec ${collected.specVersion}).`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
