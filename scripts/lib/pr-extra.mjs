// SPDX-License-Identifier: MIT

// The playground's own pull request checklist items, on top of the five the main repository's
// scripts/hygiene/lib/pr-template.mjs checks. Each is matched by a key phrase from its line in
// .github/PULL_REQUEST_TEMPLATE.md, with the same tick test as that file.

export const EXTRA_CHECKBOXES = [
  'adds no network request, cookie, analytics, tracker or third-party file',
  'adds no runtime dependency',
];

/**
 * Returns the key phrases of the extra checkboxes that are missing or not ticked.
 * @param {string | null | undefined} body
 * @returns {string[]}
 */
export function untickedExtraCheckboxes(body) {
  const lines = (body ?? '').split(/\r?\n/);
  return EXTRA_CHECKBOXES.filter(
    (phrase) =>
      !lines.some(
        (line) => /^\s*[-*] \[[xX]\] /.test(line) && line.toLowerCase().includes(phrase.toLowerCase()),
      ),
  );
}
