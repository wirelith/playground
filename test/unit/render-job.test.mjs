// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { renderJob, screenIds } from '../../src/render-job.js';
import { outline, render } from '../helpers/core.mjs';

const SOURCE = 'screen "A" #a\n  button "Open" -> #m\n  modal "M" #m\n    text "Hi"\n\nscreen "B" #b\n';

describe('renderJob', () => {
  it("returns core's SVG and diagnostics exactly, with the outline", () => {
    const r = renderJob({ source: SOURCE });
    expect(r.svg).toBe(render(SOURCE).svg);
    expect(r.diagnostics).toEqual(render(SOURCE).diagnostics);
    expect(r.outline).toEqual(outline(SOURCE).outline);
    expect(r.screenReset).toBe(false);
  });

  it('lists screen and overlay ids', () => {
    const o = renderJob({ source: SOURCE }).outline;
    expect(o && screenIds(o)).toEqual(['a', 'm', 'b']);
  });

  it('passes the screen option through when the id exists', () => {
    const r = renderJob({ source: SOURCE, options: { screen: 'm', notes: false, flows: false } });
    expect(r.svg).toBe(render(SOURCE, { screen: 'm', notes: false, flows: false }).svg);
    expect(r.screenReset).toBe(false);
  });

  it('drops a screen id the source no longer has, and says so', () => {
    const r = renderJob({ source: SOURCE, options: { screen: 'gone' } });
    expect(r.svg).toBe(render(SOURCE).svg);
    expect(r.screenReset).toBe(true);
  });

  it('keeps the screen choice while the source has errors', () => {
    const r = renderJob({ source: 'screen "A" #a\n  bogus\n', options: { screen: 'a' } });
    expect(r.svg).toBeNull();
    expect(r.outline).toBeNull();
    expect(r.screenReset).toBe(false);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E201']);
  });

  it('catches anything core throws', () => {
    const r = renderJob({ source: SOURCE, options: /** @type {any} */ ({ idPrefix: '1 bad' }) });
    expect(r.svg).toBeNull();
    expect(r.error).toEqual(expect.any(String));
  });
});
