// SPDX-License-Identifier: MIT

// Checks the live site after a deploy: its build.json names the deployed commit, and every file
// build.json lists is served with exactly the bytes that were built.
//
//   node scripts/smoke.mjs <site URL> [<commit>]
//
// A host's cache may serve the previous deploy for a little while, so a mismatch is retried for
// a few minutes before it fails.

import { createHash } from 'node:crypto';

const ATTEMPTS = 12;
const WAIT_MS = 15_000;

/**
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function get(url) {
  const fresh = `${url}${url.includes('?') ? '&' : '?'}smoke=${Date.now()}`;
  const res = await fetch(fresh, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * @param {string} base the site's URL, ending in "/"
 * @param {string | undefined} commit
 * @returns {Promise<string[]>} the problems
 */
export async function check(base, commit) {
  const build = JSON.parse((await get(`${base}build.json`)).toString('utf8'));
  /** @type {string[]} */
  const problems = [];
  if (commit && build.playgroundCommit !== commit) {
    problems.push(`build.json names ${build.playgroundCommit}, not ${commit}`);
    return problems;
  }
  for (const [path, hash] of Object.entries(/** @type {Record<string, string>} */ (build.files ?? {}))) {
    try {
      const got = createHash('sha256')
        .update(await get(`${base}${path}`))
        .digest('hex');
      if (got !== hash) problems.push(`${path}: served bytes differ from the build`);
    } catch (e) {
      problems.push(`${path}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (Object.keys(build.files ?? {}).length === 0) problems.push('build.json lists no files');
  return problems;
}

const [url, commit] = process.argv.slice(2);
if (process.argv[1]?.endsWith('smoke.mjs')) {
  if (!url) {
    console.error('usage: node scripts/smoke.mjs <site URL> [<commit>]');
    process.exit(2);
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  /** @type {string[]} */
  let problems = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      problems = await check(base, commit);
    } catch (e) {
      problems = [e instanceof Error ? e.message : String(e)];
    }
    if (problems.length === 0) break;
    if (attempt < ATTEMPTS) {
      console.log(`smoke: attempt ${attempt} found ${problems.length} problem(s); trying again shortly.`);
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`smoke: ${p}`);
    process.exit(1);
  }
  console.log(`smoke: ${base} serves the build of ${commit ?? 'its build.json'} byte for byte.`);
}
