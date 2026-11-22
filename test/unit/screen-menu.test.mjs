// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { renderJob } from '../../src/render-job.js';
import { screenChoices } from '../../src/screen-menu.js';

describe('screen choices', () => {
  it("list every screen and overlay id from core's outline, in source order", () => {
    const source =
      'screen "Home" #home\n  button "Open" -> #m\n  modal "Menu" #m\n    text "x"\n  drawer #d\n    text "y"\n\n' +
      'screen "Home" #home-empty of=#home state="Empty"\n';
    const outline = renderJob({ source }).outline;
    expect(outline).not.toBeNull();
    expect(screenChoices(/** @type {any} */ (outline))).toEqual([
      { id: 'home', label: 'Home (#home)' },
      { id: 'm', label: 'Home, modal Menu (#m)' },
      { id: 'd', label: 'Home, drawer d (#d)' },
      { id: 'home-empty', label: 'Home (#home-empty)' },
    ]);
  });
});
