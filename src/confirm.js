// SPDX-License-Identifier: MIT

// An inline question with two buttons, in place of a browser dialog.

/**
 * Shows the question in the container and resolves to true if the first button is chosen. A new
 * question replaces any open one, which then resolves to false.
 * @param {HTMLElement} container
 * @param {string} question
 * @param {string} yes
 * @param {string} no
 * @returns {Promise<boolean>}
 */
export function askInline(container, question, yes, no) {
  cancelOpen?.();
  return new Promise((resolve) => {
    const text = document.createElement('p');
    text.textContent = question;
    const yesButton = document.createElement('button');
    yesButton.type = 'button';
    yesButton.className = 'primary';
    yesButton.textContent = yes;
    const noButton = document.createElement('button');
    noButton.type = 'button';
    noButton.textContent = no;
    /** @param {boolean} answer */
    const done = (answer) => {
      cancelOpen = null;
      container.replaceChildren();
      container.hidden = true;
      resolve(answer);
    };
    cancelOpen = () => done(false);
    yesButton.addEventListener('click', () => done(true));
    noButton.addEventListener('click', () => done(false));
    container.replaceChildren(text, yesButton, noButton);
    container.hidden = false;
    yesButton.focus();
  });
}

/** @type {(() => void) | null} */
let cancelOpen = null;
