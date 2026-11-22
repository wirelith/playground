// SPDX-License-Identifier: MIT

// Wires the page together: editor, render client, problems, preview, examples and footer.

import { askInline } from './confirm.js';
import { disclosure } from './disclosure.js';
import { Editor } from './editor.js';
import { REJECTED, showSvg } from './preview.js';
import { renderProblems } from './problems.js';
import { RenderClient } from './render-client.js';
import { BUILD, EXAMPLES } from './site-data.js';
import { workerScriptURL } from './trusted-types.js';

/** @typedef {import('./render-job.js').RenderOptions} RenderOptions */
/** @typedef {import('./render-job.js').RenderResult} RenderResult */

export const TIMED_OUT = 'Rendering took too long and was stopped.';

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return /** @type {T} */ (el);
}

const textarea = /** @type {HTMLTextAreaElement} */ (byId('source'));
const preview = byId('preview');
const status = byId('status');
const problems = /** @type {HTMLOListElement} */ (byId('problems'));
const problemCount = byId('problem-count');
const examplesButton = /** @type {HTMLButtonElement} */ (byId('examples-button'));
const examplesList = byId('examples-list');
const confirmBox = byId('confirm');

/** The text as it was last loaded; the editor holds edited text when it differs. */
let loaded = '';

/** @returns {RenderOptions} */
function options() {
  return {};
}

const client = new RenderClient({
  createWorker: () =>
    /** @type {any} */ (new Worker(/** @type {any} */ (workerScriptURL()), { type: 'module' })),
  onResult: show,
  onTimeout: () => {
    preview.replaceChildren();
    say(TIMED_OUT, 'error');
  },
});

const editor = new Editor(textarea, byId('gutter'), () => client.update(editor.value, options()));

/**
 * @param {string} message
 * @param {'info' | 'error'} kind
 */
function say(message, kind) {
  status.textContent = message;
  status.dataset.kind = kind;
}

/** @param {RenderResult} r */
function show(r) {
  editor.setMarks(r.diagnostics);
  renderProblems(problems, problemCount, r.diagnostics, (d) => editor.selectPosition(d.line, d.column));
  if (r.error) {
    preview.replaceChildren();
    say(`Rendering failed: ${r.error}`, 'error');
  } else if (r.svg === null) {
    preview.replaceChildren();
    say('Fix the errors to see the drawing.', 'info');
  } else if (showSvg(preview, r.svg)) {
    say('', 'info');
  } else {
    say(REJECTED, 'error');
  }
}

/**
 * Loads a source into the editor, asking first if that would replace edited text.
 * @param {string} source
 * @param {string} what for the question
 */
export async function load(source, what) {
  if (editor.value !== loaded && editor.value !== source) {
    const replace = await askInline(confirmBox, `Replace your source with ${what}?`, 'Replace', 'Keep mine');
    if (!replace) return false;
  }
  loaded = source;
  editor.setValue(source);
  client.now(source, options());
  return true;
}

const examplesMenu = disclosure(examplesButton, examplesList);
for (const ex of EXAMPLES) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.example = ex.id;
  button.textContent = ex.title;
  button.addEventListener('click', async () => {
    examplesMenu.close();
    await load(ex.source, `the example “${ex.title}”`);
  });
  item.append(button);
  examplesList.append(item);
}

// The footer: what this page renders with.
const commitLink = /** @type {HTMLAnchorElement} */ (byId('upstream-commit'));
byId('core-version').textContent = BUILD.coreVersion;
byId('spec-version').textContent = BUILD.specVersion;
commitLink.textContent = BUILD.upstreamCommit.slice(0, 7);
commitLink.href = `${BUILD.repository}/commit/${BUILD.upstreamCommit}`;

const first = EXAMPLES.find((e) => e.id === 'readme-example') ?? EXAMPLES[0];
if (first) await load(first.source, first.title);
