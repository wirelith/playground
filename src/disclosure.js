// SPDX-License-Identifier: MIT

// A button that shows and hides a panel below it. The page uses these instead of <select>:
// at least one browser engine reports its own drawing of a <select> as an inline-style
// violation of the page's Content-Security-Policy.

/**
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} panel
 */
export function disclosure(button, panel) {
  /** @param {boolean} open */
  const set = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  set(false);
  button.addEventListener('click', () => set(panel.hidden !== false));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      set(false);
      button.focus();
    }
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') set(false);
  });
  document.addEventListener('pointerdown', (e) => {
    const target = /** @type {Node | null} */ (e.target);
    if (!panel.hidden && target && !panel.contains(target) && !button.contains(target)) set(false);
  });
  return {
    close: () => set(false),
    get open() {
      return !panel.hidden;
    },
  };
}
