// SPDX-License-Identifier: MIT

// Wires the page together: editor, render client, problems, preview, examples, render options,
// download, share links and footer.

import { askInline } from './confirm.js';
import { disclosure } from './disclosure.js';
import { Editor } from './editor.js';
import { REJECTED, showSvg } from './preview.js';
import { renderProblems } from './problems.js';
import { RenderClient } from './render-client.js';
import { ScreenMenu } from './screen-menu.js';
import { decodeShare, encodeShare, ShareError } from './share.js';
import { BUILD, EXAMPLES } from './site-data.js';
import { workerScriptURL } from './trusted-types.js';

/** @typedef {import('./render-job.js').RenderOptions} RenderOptions */
/** @typedef {import('./render-job.js').RenderResult} RenderResult */

export const TIMED_OUT = 'Rendering took too long and was stopped.';
export const SHARED = 'Link copied. Anyone with the link can read the source.';
export const SHARED_NOT_COPIED =
  'The link is in the address bar; copy it from there. Anyone with the link can read the source.';

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
const notice = byId('notice');
const notesBox = /** @type {HTMLInputElement} */ (byId('opt-notes'));
const flowsBox = /** @type {HTMLInputElement} */ (byId('opt-flows'));
const downloadButton = /** @type {HTMLButtonElement} */ (byId('download'));
const shareButton = /** @type {HTMLButtonElement} */ (byId('share'));

/** The text as it was last loaded; the editor holds edited text when it differs. */
let loaded = '';
/** core's SVG for the current source and options, exactly, for Download SVG. */
let lastSvg = /** @type {string | null} */ (null);

const screens = new ScreenMenu(
  /** @type {HTMLButtonElement} */ (byId('screen-button')),
  byId('screen-list'),
  () => rerender(),
);

/** @returns {RenderOptions} */
function options() {
  /** @type {RenderOptions} */
  const o = { notes: notesBox.checked, flows: flowsBox.checked };
  if (screens.value) o.screen = screens.value;
  return o;
}

function rerender() {
  client.now(editor.value, options());
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

/**
 * @param {string} message
 * @param {'info' | 'error'} kind
 */
function tell(message, kind) {
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = message === '';
}

/** @param {RenderResult} r */
function show(r) {
  if (r.outline) screens.update(r.outline);
  if (r.screenReset) screens.set('');
  lastSvg = r.svg;
  downloadButton.disabled = r.svg === null;
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

notesBox.addEventListener('change', rerender);
flowsBox.addEventListener('change', rerender);

// Download SVG: core's string, exactly, with the source embedded (core's default).
downloadButton.addEventListener('click', () => {
  if (lastSvg === null) return;
  const url = URL.createObjectURL(new Blob([lastSvg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wireframe.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// Share: write the fragment without adding a history entry, then copy the link. Typing never
// changes the URL.
shareButton.addEventListener('click', async () => {
  const fragment = await encodeShare({
    source: editor.value,
    notes: notesBox.checked,
    flows: flowsBox.checked,
    screen: screens.value,
  });
  history.replaceState(null, '', `#${fragment}`);
  try {
    await navigator.clipboard.writeText(location.href);
    tell(SHARED, 'info');
  } catch {
    tell(SHARED_NOT_COPIED, 'info');
  }
});

/**
 * Opens the share link in the URL, if there is one. Returns false when there is none or it
 * could not be opened.
 * @param {boolean} ask whether to ask before replacing edited text
 */
async function openFragment(ask) {
  let shared;
  try {
    shared = await decodeShare(location.hash);
  } catch (e) {
    tell(e instanceof ShareError ? e.message : 'This link could not be opened.', 'error');
    return false;
  }
  if (!shared) return false;
  if (ask && editor.value !== loaded && editor.value !== shared.source) {
    const replace = await askInline(
      confirmBox,
      'Replace your source with the one in this link?',
      'Replace',
      'Keep mine',
    );
    if (!replace) return true;
  }
  notesBox.checked = shared.notes;
  flowsBox.checked = shared.flows;
  screens.set(shared.screen);
  tell('', 'info');
  loaded = shared.source;
  editor.setValue(shared.source);
  client.now(shared.source, options());
  return true;
}

window.addEventListener('hashchange', () => openFragment(true));

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

// Every font face now, so that nothing is fetched later when a drawing first uses one.
await Promise.allSettled([...document.fonts].map((f) => f.load()));

// A share link in the URL, or else the README example.
if (!(await openFragment(false))) {
  const first = EXAMPLES.find((e) => e.id === 'readme-example') ?? EXAMPLES[0];
  if (first) await load(first.source, first.title);
}
document.documentElement.dataset.ready = 'true';
