// SPDX-License-Identifier: MIT

// "Ask your AI": a panel that copies text for the person's AI assistant, and the paste handler
// that keeps only the wirelith block of a pasted reply. It never calls a model, holds no key and
// makes no request. It never reads the clipboard: pasted text comes from the paste event.

import { AI_SPEC } from '../vendor/wirelith/core/ai-spec.js';
import { extractBlocks, MAX_PASTE_BYTES, preamble, problemsText, promptText } from './ai.js';
import { EVAL_TASKS_SHOWN } from './config.js';
import { utf8Length } from './positions.js';
import { BUILD, PROMPTS } from './site-data.js';

/** @typedef {import('./render-job.js').Diagnostic} Diagnostic */
/** @typedef {import('./ai.js').Block} Block */

export const PASTE_TOO_LARGE = 'That paste is over 1 MB, so it was not inserted.';

/**
 * The prompts the library shows: the eval tasks listed in config.js, in that order, then the
 * playground's own.
 */
export function shownPrompts() {
  const byId = new Map(PROMPTS.map((p) => [p.id, p]));
  return [
    ...EVAL_TASKS_SHOWN.flatMap((id) => {
      const p = byId.get(id);
      return p && p.kind === 'eval' ? [p] : [];
    }),
    ...PROMPTS.filter((p) => p.kind === 'playground'),
  ];
}

/**
 * @param {object} o
 * @param {HTMLButtonElement} o.toggle
 * @param {HTMLElement} o.panel
 * @param {HTMLTextAreaElement} o.textarea the editor
 * @param {HTMLElement} o.blocks where to offer the other blocks of a reply
 * @param {(source: string, what: string) => Promise<boolean>} o.load loads a source, asking first over edited text
 * @param {() => { source: string, diagnostics: Diagnostic[] }} o.current
 * @param {(message: string, kind: 'info' | 'error') => void} o.tell
 */
export function setUpAiPanel({ toggle, panel, textarea, blocks, load, current, tell }) {
  const pre = preamble({ specVersion: BUILD.specVersion, coreVersion: BUILD.coreVersion, aiSpec: AI_SPEC });
  const fallback = /** @type {HTMLTextAreaElement} */ (panel.querySelector('#copy-fallback'));
  const list = /** @type {HTMLElement} */ (panel.querySelector('#prompt-list'));
  const copyPreamble = /** @type {HTMLButtonElement} */ (panel.querySelector('#copy-preamble'));
  const copyProblems = /** @type {HTMLButtonElement} */ (panel.querySelector('#copy-problems'));

  /** @param {boolean} open */
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  setOpen(false);
  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));

  /**
   * @param {string} text
   * @param {string} done what to say once copied
   */
  async function copy(text, done) {
    fallback.hidden = true;
    try {
      await navigator.clipboard.writeText(text);
      tell(done, 'info');
    } catch {
      fallback.value = text;
      fallback.hidden = false;
      fallback.select();
      tell(
        'The text could not be copied automatically. It is selected below the panel; copy it from there.',
        'error',
      );
    }
  }

  copyPreamble.addEventListener('click', () =>
    copy(pre, 'Preamble copied. Paste it into your AI assistant, then describe the wireframe you want.'),
  );
  copyProblems.addEventListener('click', () => {
    const { source, diagnostics } = current();
    if (diagnostics.length > 0) {
      copy(problemsText(source, diagnostics), 'Problems copied. Paste them into your AI assistant.');
    }
  });

  for (const p of shownPrompts()) {
    const item = document.createElement('li');
    const title = document.createElement('h3');
    title.textContent = p.title;
    const request = document.createElement('p');
    request.textContent = p.request;
    const buttons = document.createElement('div');
    buttons.className = 'prompt-buttons';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.dataset.prompt = p.id;
    copyButton.textContent = 'Copy prompt';
    copyButton.addEventListener('click', () =>
      copy(promptText(pre, p), `Prompt copied. Paste it into your AI assistant.`),
    );
    buttons.append(copyButton);
    const answer = p.answer;
    if (answer !== undefined) {
      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.dataset.answer = p.id;
      loadButton.textContent = 'Load the example answer';
      loadButton.addEventListener('click', () => load(answer, `the example answer to “${p.title}”`));
      buttons.append(loadButton);
    }
    item.append(title, request, buttons);
    list.append(item);
  }

  /** @param {Block[]} found */
  async function useBlocks(found) {
    const [first, ...others] = found;
    if (!first) return;
    blocks.replaceChildren();
    blocks.hidden = true;
    if (!(await load(first.source, 'the wirelith block from the pasted reply'))) return;
    const unclosed = first.closed
      ? ''
      : ' It had no closing fence, so everything after its opening fence was kept.';
    if (others.length === 0) {
      tell(`Kept only the wirelith block from the pasted reply.${unclosed}`, 'info');
      return;
    }
    tell(
      `The pasted reply had ${found.length} wirelith blocks. The first is in the editor.${unclosed}`,
      'info',
    );
    const label = document.createElement('span');
    label.textContent = 'Use another block instead:';
    blocks.append(
      label,
      ...found.map((b, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.block = String(i + 1);
        button.textContent = `Block ${i + 1} (line ${b.line})`;
        button.addEventListener('click', () => load(b.source, `block ${i + 1} from the pasted reply`));
        return button;
      }),
    );
    blocks.hidden = false;
  }

  textarea.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.length > MAX_PASTE_BYTES || utf8Length(text) > MAX_PASTE_BYTES) {
      e.preventDefault();
      tell(PASTE_TOO_LARGE, 'error');
      return;
    }
    const found = extractBlocks(text);
    if (found.length === 0) return; // an ordinary paste
    e.preventDefault();
    useBlocks(found);
  });

  return {
    /** @param {boolean} enabled */
    setProblemsEnabled(enabled) {
      copyProblems.disabled = !enabled;
    },
  };
}
