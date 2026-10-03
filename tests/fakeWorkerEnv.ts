/**
 * A stand-in for the browser's worker globals so worker entry points can run under Node:
 * `self` (the worker scope: postMessage collects into `outbox`, `onmessage` is set by the
 * module) and `Worker` (nested workers run the given handler after a random short delay,
 * which shakes out timing assumptions).
 */
import { JavaRandom } from '../src/core/JavaRandom';

export const outbox: unknown[] = [];
export const listeners: ((m: unknown) => void)[] = [];

const scope = {
  postMessage(m: unknown): void {
    outbox.push(m);
    for (const l of listeners) l(m);
  },
  onmessage: null as ((e: { data: unknown }) => void) | null,
};
(globalThis as unknown as { self: typeof scope }).self = scope;

/** Handles one message of a nested worker and returns the reply (or null). */
export type NestedHandler = (m: unknown, worker: FakeWorker) => unknown;
export const nested: { handler: NestedHandler | null; rand: JavaRandom; maxDelay: number } = { handler: null, rand: new JavaRandom(1n), maxDelay: 3 };

export class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  state: Record<string, unknown> = {};
  private dead = false;
  constructor(_url: unknown, _opts?: unknown) {}
  postMessage(m: unknown): void {
    const delay = nested.rand.nextInt(nested.maxDelay + 1);
    setTimeout(() => {
      if (this.dead || !nested.handler) return;
      const reply = nested.handler(m, this);
      if (reply !== null && reply !== undefined) this.onmessage?.({ data: reply });
    }, delay);
  }
  terminate(): void {
    this.dead = true;
  }
}
(globalThis as unknown as { Worker: typeof FakeWorker }).Worker = FakeWorker;

/** Sends a message to the worker module under test. */
export function send(m: unknown): void {
  scope.onmessage?.({ data: m });
}
