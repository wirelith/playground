// SPDX-License-Identifier: MIT

// The screen option: "All screens", or one screen or overlay id from core's outline, as radio
// buttons in a panel that opens from a button.

import { disclosure } from './disclosure.js';

/** @typedef {import('./render-job.js').Outline} Outline */

export const ALL_SCREENS = 'All screens';

/**
 * The choices an outline offers, in source order: each screen, then its overlays.
 * @param {Outline} outline
 * @returns {{ id: string, label: string }[]}
 */
export function screenChoices(outline) {
  return outline.screens.flatMap((s) => [
    { id: s.id, label: `${s.title ?? s.id} (#${s.id})` },
    ...s.overlays.map((o) => ({
      id: o.id,
      label: `${s.title ?? s.id}, ${o.type} ${o.title ?? o.id} (#${o.id})`,
    })),
  ]);
}

export class ScreenMenu {
  /**
   * @param {HTMLButtonElement} button
   * @param {HTMLElement} panel
   * @param {(id: string) => void} onChange called with "" for all screens
   */
  constructor(button, panel, onChange) {
    this.button = button;
    this.panel = panel;
    this.onChange = onChange;
    this.menu = disclosure(button, panel);
    this.value = '';
    /** @type {{ id: string, label: string }[]} */
    this.choices = [];
    this.render();
  }

  /**
   * Updates the choices from a new outline. If the chosen id is gone, goes back to all screens.
   * @param {Outline} outline
   * @returns {boolean} true when the choice was reset
   */
  update(outline) {
    const choices = screenChoices(outline);
    const reset = this.value !== '' && !choices.some((c) => c.id === this.value);
    if (reset) this.value = '';
    if (reset || JSON.stringify(choices) !== JSON.stringify(this.choices)) {
      this.choices = choices;
      this.render();
    }
    return reset;
  }

  /** @param {string} id "" for all screens */
  set(id) {
    this.value = id;
    this.render();
  }

  render() {
    const legend = document.createElement('legend');
    legend.textContent = 'Screen';
    const rows = [{ id: '', label: ALL_SCREENS }, ...this.choices].map(({ id, label }) => {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'screen';
      input.value = id;
      input.checked = id === this.value;
      input.addEventListener('change', () => {
        this.value = id;
        this.updateButton();
        this.menu.close();
        this.button.focus();
        this.onChange(id);
      });
      row.append(input, ` ${label}`);
      return row;
    });
    this.panel.replaceChildren(legend, ...rows);
    this.updateButton();
  }

  updateButton() {
    this.button.textContent = `Screen: ${this.value === '' ? ALL_SCREENS : `#${this.value}`}`;
  }
}
