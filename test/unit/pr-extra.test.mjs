// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKBOXES } from '../../scripts/hygiene/lib/pr-template.mjs';
import { EXTRA_CHECKBOXES, untickedExtraCheckboxes } from '../../scripts/lib/pr-extra.mjs';

const template = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
const tickAll = (/** @type {string} */ body) => body.replaceAll('- [ ] ', '- [x] ');

describe('the playground checklist items', () => {
  it('are in the template, after the five from the main repository', () => {
    const boxes = template.split('\n').filter((l) => l.startsWith('- [ ] '));
    expect(boxes).toHaveLength(REQUIRED_CHECKBOXES.length + EXTRA_CHECKBOXES.length);
    REQUIRED_CHECKBOXES.forEach((phrase, i) => {
      expect(boxes[i]?.toLowerCase()).toContain(phrase.toLowerCase());
    });
    EXTRA_CHECKBOXES.forEach((phrase, i) => {
      expect(boxes[REQUIRED_CHECKBOXES.length + i]).toContain(phrase);
    });
  });

  it('fail while unticked, or missing', () => {
    expect(untickedExtraCheckboxes(template)).toEqual(EXTRA_CHECKBOXES);
    expect(untickedExtraCheckboxes('')).toEqual(EXTRA_CHECKBOXES);
    expect(untickedExtraCheckboxes(null)).toEqual(EXTRA_CHECKBOXES);
  });

  it('pass once ticked, with x or X, - or *, and CRLF line endings', () => {
    expect(untickedExtraCheckboxes(tickAll(template))).toEqual([]);
    const upper = tickAll(template).replaceAll('- [x] ', '* [X] ').replaceAll('\n', '\r\n');
    expect(untickedExtraCheckboxes(upper)).toEqual([]);
  });

  it('need each item ticked on its own line', () => {
    const one = template.replace(`- [ ] This ${EXTRA_CHECKBOXES[0]}`, `- [x] This ${EXTRA_CHECKBOXES[0]}`);
    expect(untickedExtraCheckboxes(one)).toEqual([EXTRA_CHECKBOXES[1]]);
    // A phrase quoted in prose, or under an unticked box, doesn't count.
    expect(
      untickedExtraCheckboxes(`I promise this ${EXTRA_CHECKBOXES[0]}.\n- [ ] ${EXTRA_CHECKBOXES[1]}`),
    ).toEqual(EXTRA_CHECKBOXES);
  });
});
