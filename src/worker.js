// SPDX-License-Identifier: MIT

// The module worker that runs core. The page never calls core on its own thread, so a source
// that takes too long can be stopped by terminating this worker.
//
// The handler is set before core has loaded: a message that arrived while a static import was
// still loading would find no handler and be lost. Each message waits for core instead, and
// messages are answered in the order they came.

const job = import('./render-job.js');

const scope =
  /** @type {{ onmessage: ((e: MessageEvent) => void) | null, postMessage(message: unknown): void }} */ (
    /** @type {unknown} */ (globalThis)
  );

scope.onmessage = async (e) => {
  const { seq, source, options } = e.data ?? {};
  if (typeof seq !== 'number' || typeof source !== 'string') return;
  const { renderJob } = await job;
  scope.postMessage({ seq, ...renderJob({ source, options: options ?? {} }) });
};
