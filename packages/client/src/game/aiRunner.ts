import type { AiRunner, TurnWork } from '@cx/host';

/**
 * An `AiRunner` backed by a Web Worker (`ai.worker.ts`), or undefined where workers aren't
 * available (the game then plays AI turns on the page, as before).
 */
export function createAiRunner(): AiRunner | undefined {
  if (typeof Worker !== 'function') return undefined;
  let worker: Worker;
  // The single-file build (scripts/build-artifact.mjs) inlines the worker as a blob URL.
  const inlined = (globalThis as { cxAiWorker?: string }).cxAiWorker;
  try {
    worker = inlined
      ? new Worker(inlined, { type: 'module' })
      : new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return undefined;
  }
  // A worker that failed (couldn't load, crashed) answers nothing: later turns go to the page.
  let dead = false;
  let next = 0;
  const waiting = new Map<number, { resolve: (w: TurnWork) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<{ id: number; error?: string } & Partial<TurnWork>>) => {
    const job = waiting.get(e.data.id);
    if (!job) return;
    waiting.delete(e.data.id);
    if (e.data.error || !e.data.state) job.reject(new Error(e.data.error ?? 'No state'));
    else job.resolve({ state: e.data.state, events: e.data.events ?? [] });
  };
  worker.onerror = () => {
    dead = true;
    for (const job of waiting.values()) job.reject(new Error('The AI worker stopped'));
    waiting.clear();
  };
  return (state, action) =>
    new Promise<TurnWork>((resolve, reject) => {
      if (dead) return reject(new Error('The AI worker stopped'));
      const id = next++;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, state, action });
    });
}
