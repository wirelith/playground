// SPDX-License-Identifier: MIT

// The list of problems below the editor. Each is a button; a click jumps to its position.

/** @typedef {import('./render-job.js').Diagnostic} Diagnostic */

/**
 * @param {HTMLOListElement} list
 * @param {HTMLElement} count
 * @param {Diagnostic[]} diagnostics
 * @param {(d: Diagnostic) => void} onPick
 */
export function renderProblems(list, count, diagnostics, onPick) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  count.textContent =
    diagnostics.length === 0
      ? 'none'
      : [plural(errors, 'error'), plural(warnings, 'warning')].filter(Boolean).join(', ');
  list.replaceChildren(
    ...diagnostics.map((d) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `problem problem-${d.severity}`;
      button.dataset.line = String(d.line);
      button.dataset.column = String(d.column);
      const label = document.createElement('span');
      label.className = 'problem-label';
      label.textContent = `${d.severity === 'error' ? 'Error' : 'Warning'} ${d.code}`;
      const where = document.createElement('span');
      where.className = 'problem-where';
      where.textContent = `Line ${d.line}, column ${d.column}`;
      const message = document.createElement('span');
      message.className = 'problem-message';
      message.textContent = d.hint ? `${d.message} ${d.hint}` : d.message;
      button.append(label, where, message);
      button.addEventListener('click', () => onPick(d));
      item.append(button);
      return item;
    }),
  );
}

/**
 * @param {number} n
 * @param {string} word
 */
function plural(n, word) {
  return n === 0 ? '' : `${n} ${word}${n === 1 ? '' : 's'}`;
}
