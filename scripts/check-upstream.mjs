// SPDX-License-Identifier: MIT

// Checks the files this repository takes from the main repository.
//
//   node scripts/check-upstream.mjs            every file in the lock is here, unchanged, and the
//                                              vendored folders hold nothing else
//   node scripts/check-upstream.mjs --rebuild  also fetches the pinned commit again, collects
//                                              everything again, and compares it byte for byte

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  collect,
  fetchUpstream,
  isCommit,
  LOCAL_IN_VENDORED_FOLDERS,
  LOCK_PATH,
  readLock,
  sha256,
  VENDORED_FOLDERS,
} from './lib/upstream.mjs';

const rebuild = process.argv.includes('--rebuild');
const lock = readLock();
const problems = [];

if (!isCommit(lock.commit)) problems.push(`${LOCK_PATH}: "commit" is not a full commit SHA`);

for (const [path, hash] of Object.entries(lock.files)) {
  if (!existsSync(path)) problems.push(`${path}: missing`);
  else if (sha256(readFileSync(path)) !== hash) problems.push(`${path}: differs from the main repository`);
}

const here = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
for (const path of here) {
  if (
    VENDORED_FOLDERS.some((f) => path.startsWith(f)) &&
    !(path in lock.files) &&
    !LOCAL_IN_VENDORED_FOLDERS.includes(path) &&
    existsSync(path)
  ) {
    problems.push(`${path}: not from the main repository, in a folder that holds only its files`);
  }
}

if (rebuild && problems.length === 0) {
  const dir = fetchUpstream(lock.commit);
  try {
    const fresh = collect(dir);
    if (fresh.coreVersion !== lock.coreVersion)
      problems.push(`core version: lock ${lock.coreVersion}, rebuilt ${fresh.coreVersion}`);
    if (fresh.specVersion !== lock.specVersion)
      problems.push(`spec version: lock ${lock.specVersion}, rebuilt ${fresh.specVersion}`);
    for (const [path, { bytes }] of fresh.files) {
      if (!(path in lock.files)) problems.push(`${path}: the rebuild has it, the lock doesn't`);
      else if (!readFileSync(path).equals(bytes)) problems.push(`${path}: differs from the rebuild`);
    }
    for (const path of Object.keys(lock.files)) {
      if (!fresh.files.has(path)) problems.push(`${path}: the lock has it, the rebuild doesn't`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`upstream: ${p}`);
  console.error('Vendored files change only through scripts/update-upstream.mjs. See CONTRIBUTING.md.');
  process.exit(1);
}
const count = Object.keys(lock.files).length;
console.log(
  `upstream: ${count} files match ${lock.repository} at ${lock.commit.slice(0, 12)}` +
    (rebuild ? ', and a fresh rebuild matches them byte for byte.' : '.'),
);
