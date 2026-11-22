// SPDX-License-Identifier: MIT

// A textarea with a line-number gutter that scrolls with it. Lines with an error or a warning
// get a marker with a text label. Tab inserts two spaces; Escape, then Tab, moves focus on.

import { lineCount, offsetOf } from './positions.js';

/** @typedef {import('./render-job.js').Diagnostic} Diagnostic */

export class Editor {
  /**
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLElement} gutter
   * @param {() => void} onChange called after every edit
   */
  constructor(textarea, gutter, onChange) {
    this.textarea = textarea;
    this.gutter = gutter;
    this.onChange = onChange;
    this.rows = 0;
    /** @type {Map<number, 'error' | 'warning'>} */
    this.marks = new Map();
    this.escaped = false;

    textarea.addEventListener('input', () => {
      this.syncRows();
      this.onChange();
    });
    textarea.addEventListener('scroll', () => this.syncScroll());
    textarea.addEventListener('keydown', (e) => this.keydown(e));
    textarea.addEventListener('blur', () => {
      this.escaped = false;
    });
    this.syncRows();
  }

  get value() {
    return this.textarea.value;
  }

  /**
   * Replaces the whole text, as one undoable step where the browser allows it.
   * @param {string} text
   */
  setValue(text) {
    this.textarea.value = text;
    this.textarea.setSelectionRange(0, 0);
    this.textarea.scrollTop = 0;
    this.syncRows();
    this.syncScroll();
    this.onChange();
  }

  /** @param {KeyboardEvent} e */
  keydown(e) {
    if (e.key === 'Escape') {
      this.escaped = true;
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !this.escaped) {
      e.preventDefault();
      this.insert('  ');
      return;
    }
    if (e.key !== 'Shift') this.escaped = false;
  }

  /**
   * Inserts text at the selection, keeping the browser's undo history where it can.
   * @param {string} text
   */
  insert(text) {
    const ta = this.textarea;
    // execCommand keeps the edit in the undo history. Where it isn't supported, fall back.
    const done =
      typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!done) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Marks the lines that have diagnostics. An error outranks a warning on the same line.
   * @param {Diagnostic[]} diagnostics
   */
  setMarks(diagnostics) {
    /** @type {Map<number, 'error' | 'warning'>} */
    const marks = new Map();
    for (const d of diagnostics) {
      if (d.severity === 'error' || !marks.has(d.line)) marks.set(d.line, d.severity);
    }
    this.marks = marks;
    this.renderGutter();
  }

  syncRows() {
    const rows = lineCount(this.textarea.value);
    if (rows !== this.rows) {
      this.rows = rows;
      this.renderGutter();
    }
  }

  renderGutter() {
    const fragment = document.createDocumentFragment();
    for (let line = 1; line <= this.rows; line++) {
      const row = document.createElement('div');
      row.className = 'gutter-row';
      row.dataset.line = String(line);
      const mark = this.marks.get(line);
      const number = document.createElement('span');
      number.className = 'line-number';
      number.textContent = String(line);
      number.setAttribute('aria-hidden', 'true');
      row.append(number);
      if (mark) {
        row.classList.add(`has-${mark}`);
        const marker = document.createElement('span');
        marker.className = `marker marker-${mark}`;
        marker.textContent = mark === 'error' ? 'Error' : 'Warning';
        marker.title = `${mark === 'error' ? 'Error' : 'Warning'} on line ${line}`;
        row.append(marker);
      }
      fragment.append(row);
    }
    this.gutter.replaceChildren(fragment);
    this.syncScroll();
  }

  syncScroll() {
    this.gutter.scrollTop = this.textarea.scrollTop;
  }

  /**
   * Puts the caret at a diagnostic's position, focuses the editor and scrolls the line into view.
   * @param {number} line
   * @param {number} column counted in code points
   */
  selectPosition(line, column) {
    const ta = this.textarea;
    const offset = offsetOf(ta.value, line, column);
    ta.focus();
    ta.setSelectionRange(offset, offset);
    const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const top = (line - 1) * lineHeight;
    if (top < ta.scrollTop || top + lineHeight > ta.scrollTop + ta.clientHeight) {
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    }
    this.syncScroll();
  }
}
