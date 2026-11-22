// SPDX-License-Identifier: MIT

// Fails a pull request unless the playground's own checklist items are ticked. The five items
// the main repository defines are checked by scripts/hygiene/check-pr-body.mjs.

import { readEvent } from './hygiene/lib/github.mjs';
import { untickedExtraCheckboxes } from './lib/pr-extra.mjs';

const missing = untickedExtraCheckboxes(readEvent().pull_request?.body);
if (missing.length > 0) {
  console.error('PR checklist: these playground items are not ticked:');
  for (const m of missing) console.error(`  - ...${m}...`);
  console.error(
    'Tick each one in the description once it is true. Editing the description re-runs this check.',
  );
  process.exit(1);
}
console.log('PR checklist: the playground items are ticked.');
