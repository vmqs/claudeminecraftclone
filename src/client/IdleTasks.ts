import { FrameBudget } from './FrameBudget';

/**
 * One slice of background work. `deadline` is a performance.now() time to stop by; the task
 * returns true while it has more to do (it then runs again next frame), false when done.
 */
export type IdleTask = (deadline: number) => boolean;

/**
 * Background work on the main thread spread over frames, so long jobs never stall one: after
 * each frame (and each background tick of a hidden LAN game) the tasks take turns until the
 * frame's share of time (FrameBudget) is used. Meant for incremental saving (serialize a few
 * dirty chunks per frame, then hand the bytes to IndexedDB or a worker) and similar jobs.
 * Tasks are keyed by name; adding a name again replaces the task.
 */
export class IdleTasks {
  private static readonly tasks = new Map<string, IdleTask>();
  /** Where the next round starts, so one busy task cannot starve the others. */
  private static cursor = 0;

  static add(name: string, task: IdleTask): void {
    IdleTasks.tasks.set(name, task);
  }

  static remove(name: string): void {
    IdleTasks.tasks.delete(name);
  }

  static has(name: string): boolean {
    return IdleTasks.tasks.has(name);
  }

  /** Runs tasks in turn for at most `budgetMs` (default: FrameBudget's share, at least 2 ms). */
  static run(budgetMs = FrameBudget.ms(2)): void {
    const tasks = IdleTasks.tasks;
    if (tasks.size === 0) return;
    const deadline = performance.now() + budgetMs;
    const names = [...tasks.keys()];
    const start = IdleTasks.cursor % names.length;
    for (let i = 0; i < names.length; i++) {
      const name = names[(start + i) % names.length];
      const task = tasks.get(name);
      if (!task) continue;
      let more = false;
      try {
        more = task(deadline);
      } catch (e) {
        console.error(`[idle] ${name}`, e);
      }
      if (!more && tasks.get(name) === task) tasks.delete(name);
      if (performance.now() >= deadline) {
        IdleTasks.cursor = start + i + 1;
        return;
      }
    }
    IdleTasks.cursor = start + 1;
  }

  /** Runs every task to completion now (leaving a world, closing the page). */
  static flush(): void {
    for (let guard = 0; IdleTasks.tasks.size > 0 && guard < 100000; guard++) IdleTasks.run(Number.POSITIVE_INFINITY);
  }
}
