// SPDX-License-Identifier: MIT

// Sends sources to the worker and hands back only the newest answer. Requests are debounced
// while typing and numbered; an older answer is dropped. A source over the size cap is never
// posted. If an answer takes longer than the time limit, the worker is terminated and the next
// request starts a new one.

import { utf8Length } from './positions.js';

/** @typedef {import('./render-job.js').RenderOptions} RenderOptions */
/** @typedef {import('./render-job.js').RenderResult} RenderResult */
/** @typedef {import('./render-job.js').Diagnostic} Diagnostic */

export const DEBOUNCE_MS = 120;
export const TIME_LIMIT_MS = 2000;
export const MAX_SOURCE_BYTES = 65536;

/**
 * The diagnostic core gives for a source over the size cap.
 * @param {number} bytes
 * @returns {Diagnostic}
 */
export function sizeDiagnostic(bytes) {
  return {
    code: 'E701',
    severity: 'error',
    line: 1,
    column: 1,
    message: `This source is ${bytes.toLocaleString('en-US')} bytes; the limit is ${MAX_SOURCE_BYTES.toLocaleString('en-US')}`,
  };
}

/**
 * @typedef {object} WorkerLike
 * @property {(message: unknown) => void} postMessage
 * @property {() => void} terminate
 * @property {((e: { data: any }) => void) | null} onmessage
 * @property {((e: unknown) => void) | null} onerror
 */

/**
 * @typedef {object} Timers
 * @property {(fn: () => void, ms: number) => unknown} setTimeout
 * @property {(id: any) => void} clearTimeout
 */

export class RenderClient {
  /**
   * @param {object} o
   * @param {() => WorkerLike} o.createWorker
   * @param {(result: RenderResult & { seq: number }) => void} o.onResult
   * @param {() => void} o.onTimeout
   * @param {Timers} [o.timers]
   * @param {number} [o.debounceMs]
   * @param {number} [o.timeLimitMs]
   */
  constructor({ createWorker, onResult, onTimeout, timers, debounceMs, timeLimitMs }) {
    this.createWorker = createWorker;
    this.onResult = onResult;
    this.onTimeout = onTimeout;
    /** @type {Timers} */
    this.timers = timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id),
    };
    this.debounceMs = debounceMs ?? DEBOUNCE_MS;
    this.timeLimitMs = timeLimitMs ?? TIME_LIMIT_MS;
    this.seq = 0;
    /** @type {WorkerLike | null} */
    this.worker = null;
    /** @type {unknown} */
    this.debounceTimer = null;
    /** @type {unknown} */
    this.watchTimer = null;
  }

  /**
   * Renders after a pause in typing.
   * @param {string} source
   * @param {RenderOptions} options
   */
  update(source, options) {
    this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.timers.setTimeout(() => this.now(source, options), this.debounceMs);
  }

  /**
   * Renders straight away.
   * @param {string} source
   * @param {RenderOptions} options
   */
  now(source, options) {
    this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    const seq = ++this.seq;
    const bytes = utf8Length(source);
    if (bytes > MAX_SOURCE_BYTES) {
      this.timers.clearTimeout(this.watchTimer);
      this.watchTimer = null;
      this.onResult({
        seq,
        svg: null,
        diagnostics: [sizeDiagnostic(bytes)],
        outline: null,
        screenReset: false,
      });
      return;
    }
    if (!this.worker) {
      const worker = this.createWorker();
      worker.onmessage = (e) => this.receive(worker, e.data);
      worker.onerror = () => this.fail(worker);
      this.worker = worker;
    }
    this.worker.postMessage({ seq, source, options });
    this.timers.clearTimeout(this.watchTimer);
    this.watchTimer = this.timers.setTimeout(() => this.timeout(seq), this.timeLimitMs);
  }

  /**
   * @param {WorkerLike} worker
   * @param {any} data
   */
  receive(worker, data) {
    if (worker !== this.worker || !data || data.seq !== this.seq) return; // an older answer
    this.timers.clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.onResult(data);
  }

  /** @param {WorkerLike} worker */
  fail(worker) {
    if (worker !== this.worker) return;
    this.stopWorker();
    this.onResult({
      seq: this.seq,
      svg: null,
      diagnostics: [],
      outline: null,
      screenReset: false,
      error: 'The renderer could not start.',
    });
  }

  /** @param {number} seq */
  timeout(seq) {
    if (seq !== this.seq) return;
    this.stopWorker();
    this.onTimeout();
  }

  stopWorker() {
    this.timers.clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.worker?.terminate();
    this.worker = null;
  }
}
