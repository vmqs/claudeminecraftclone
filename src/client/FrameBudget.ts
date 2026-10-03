/**
 * Main-thread time budgets for background work done between frames: adding streamed chunks,
 * uploading section meshes, idle tasks (see IdleTasks). A fixed number of milliseconds per frame
 * ties loading speed to the frame rate: on a slow GPU (or a software renderer) frames take far
 * longer than the game loop's own work and the main thread sits idle in between, so the budget
 * grows with that idle time instead. A frame that is slow because of the game loop itself gets
 * no more than the base, so loading never slows a CPU-bound game down further. While a loading
 * screen covers the world nothing else needs the frame, so the share is larger.
 */
export class FrameBudget {
  /** Smoothed milliseconds between the starts of the last frames. */
  static frameInterval = 1000 / 60;
  /** Smoothed milliseconds of each frame not spent in the game loop. */
  static idle = 1000 / 60;
  /** A screen hides the world (Downloading terrain, the loading screens). */
  static worldHidden = false;
  private static lastFrame = 0;
  private static frameStart = 0;
  private static loopTime = 0;

  /** Called at the start of every frame of the game loop. */
  static beginFrame(now: number, worldHidden: boolean): void {
    if (FrameBudget.lastFrame > 0) {
      // A hidden tab or a breakpoint must not inflate the budget.
      const dt = Math.min(250, Math.max(0, now - FrameBudget.lastFrame));
      FrameBudget.frameInterval = FrameBudget.frameInterval * 0.75 + dt * 0.25;
      FrameBudget.idle = FrameBudget.idle * 0.75 + Math.max(0, dt - FrameBudget.loopTime) * 0.25;
    }
    FrameBudget.lastFrame = now;
    FrameBudget.frameStart = now;
    FrameBudget.worldHidden = worldHidden;
  }

  /** Called when the frame's work is done. */
  static endFrame(now: number): void {
    FrameBudget.loopTime = Math.max(0, now - FrameBudget.frameStart);
  }

  /** Milliseconds one kind of background work may take this frame (at least `base`). */
  static ms(base: number): number {
    if (FrameBudget.worldHidden) return Math.max(base, Math.min(50, FrameBudget.frameInterval * 0.35));
    return Math.max(base, Math.min(40, FrameBudget.idle * 0.4));
  }
}
