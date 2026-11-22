// SPDX-License-Identifier: MIT

// The conformance adapter for the playground. It answers through src/render-job.js, the function
// the page's worker runs, so passing the suite shows the page hands on core's diagnostics and SVG
// unchanged.
//
//   node test/conformance/adapter.mjs diagnostics|svg   (a source on stdin)

import { readFileSync } from 'node:fs';
import { renderJob } from '../../src/render-job.js';

const source = readFileSync(0, 'utf8');
const options = process.env.WIRELITH_OPTIONS ? JSON.parse(process.env.WIRELITH_OPTIONS) : {};
const result = renderJob({ source, options });
const kind = process.argv[2];
if (result.error) {
  console.error(result.error);
  process.exit(1);
} else if (kind === 'diagnostics') {
  process.stdout.write(`${JSON.stringify(result.diagnostics)}\n`);
} else if (kind === 'svg') {
  if (result.svg === null) {
    console.error('the source has errors');
    process.exit(1);
  }
  process.stdout.write(result.svg);
} else {
  console.error('usage: adapter.mjs diagnostics|svg');
  process.exit(2);
}
