// SPDX-License-Identifier: MIT

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core's built files are loaded as they are, not transformed: they name source maps that
    // are not vendored.
    server: { deps: { external: [/\/vendor\/wirelith\/core\//] } },
    include: ['test/unit/**/*.test.mjs', 'scripts/**/test/**/*.test.mjs'],
  },
});
