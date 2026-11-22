// SPDX-License-Identifier: MIT

// The end-to-end tests: the built site in Chromium, Firefox and WebKit. Run `pnpm build` first.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core's built files are loaded as they are, not transformed: they name source maps that
    // are not vendored.
    server: { deps: { external: [/\/vendor\/wirelith\/core\//] } },
    include: ['test/e2e/**/*.test.mjs'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One browser at a time: real pastes go through the clipboard, which they share.
    fileParallelism: false,
  },
});
