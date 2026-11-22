// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SOURCE_BYTES, RenderClient, sizeDiagnostic } from '../../src/render-client.js';
import { validate } from '../helpers/core.mjs';

/** A worker that records what it is sent and answers only when told to. */
class FakeWorker {
  constructor() {
    /** @type {any[]} */
    this.sent = [];
    this.terminated = false;
    /** @type {((e: { data: any }) => void) | null} */
    this.onmessage = null;
    /** @type {((e: unknown) => void) | null} */
    this.onerror = null;
  }
  /** @param {any} m */
  postMessage(m) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  /** @param {any} data */
  answer(data) {
    this.onmessage?.({ data });
  }
}

/** @param {number} seq */
const result = (seq) => ({
  seq,
  svg: `<svg>${seq}</svg>`,
  diagnostics: [],
  outline: null,
  screenReset: false,
});

function setup() {
  /** @type {FakeWorker[]} */
  const workers = [];
  const onResult = vi.fn();
  const onTimeout = vi.fn();
  const client = new RenderClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    onResult,
    onTimeout,
  });
  return { client, workers, onResult, onTimeout };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the render client', () => {
  it('debounces typing by about 120 ms', () => {
    const { client, workers } = setup();
    client.update('a', {});
    vi.advanceTimersByTime(60);
    client.update('ab', {});
    vi.advanceTimersByTime(119);
    expect(workers).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(workers[0]?.sent).toEqual([{ seq: 1, source: 'ab', options: {} }]);
  });

  it('terminates a worker that never answers, after 2,000 ms, and starts a new one', () => {
    const { client, workers, onResult, onTimeout } = setup();
    client.now('hostile', {});
    vi.advanceTimersByTime(1999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(workers[0]?.terminated).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
    // A late answer from the terminated worker is ignored.
    workers[0]?.answer(result(1));
    expect(onResult).not.toHaveBeenCalled();
    // The next request gets a fresh worker.
    client.now('fine', {});
    expect(workers).toHaveLength(2);
    workers[1]?.answer(result(2));
    expect(onResult).toHaveBeenCalledWith(result(2));
  });

  it('does not time out an answer that arrives in time', () => {
    const { client, workers, onResult, onTimeout } = setup();
    client.now('a', {});
    vi.advanceTimersByTime(1500);
    workers[0]?.answer(result(1));
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledOnce();
  });

  it('shows only the newest answer and drops stale ones', () => {
    const { client, workers, onResult } = setup();
    client.now('one', {});
    client.now('two', {});
    client.now('three', {});
    const w = workers[0];
    expect(w?.sent.map((m) => m.seq)).toEqual([1, 2, 3]);
    w?.answer(result(1));
    w?.answer(result(3));
    w?.answer(result(2));
    expect(onResult.mock.calls).toEqual([[result(3)]]);
  });

  it('never posts a source over 65,536 bytes, and reports it as core would', () => {
    const { client, workers, onResult } = setup();
    const head = 'screen "A"\n// ';
    const over = `${head}${'é'.repeat(40000)}`;
    client.now(over, {});
    expect(workers).toHaveLength(0);
    const bytes = new TextEncoder().encode(over).length;
    expect(onResult).toHaveBeenCalledWith({
      seq: 1,
      svg: null,
      diagnostics: [sizeDiagnostic(bytes)],
      outline: null,
      screenReset: false,
    });
    expect(validate(over)).toEqual([sizeDiagnostic(bytes)]);
    // Exactly at the cap is posted.
    const at = `${head}${'x'.repeat(MAX_SOURCE_BYTES - head.length)}`;
    client.now(at, {});
    expect(workers[0]?.sent).toHaveLength(1);
  });

  it('reports a worker that fails to start', () => {
    const { client, workers, onResult } = setup();
    client.now('a', {});
    workers[0]?.onerror?.({});
    expect(workers[0]?.terminated).toBe(true);
    expect(onResult.mock.calls[0]?.[0]).toMatchObject({ seq: 1, svg: null, error: expect.any(String) });
  });
});
