/**
 * Main-thread time budgets for background work done between frames: adding streamed chunks,
 * uploading section meshes, idle tasks (see IdleTasks). A fixed number of milliseconds per frame
 * ties loading speed to the frame rate (4 ms is a quarter of a 60 fps frame but 1% of a frame
 * on a slow GPU), so the budget is a share of the measured frame interval instead, never less
 * than the caller's base. While a loading screen covers the world nothing else needs the frame,
 * so the share is larger.
 */
export class FrameBudget {
  /** Smoothed milliseconds between the starts of the last frames. */
  static frameInterval = 1000 / 60;
  /** A screen hides the world (Downloading terrain, the loading screens). */
  static worldHidden = false;
  private static lastFrame = 0;

  /** Called at the start of every frame of the game loop. */
  static beginFrame(now: number, worldHidden: boolean): void {
    if (FrameBudget.lastFrame > 0) {
      // A hidden tab or a breakpoint must not inflate the budget.
      const dt = Math.min(250, Math.max(0, now - FrameBudget.lastFrame));
      FrameBudget.frameInterval = FrameBudget.frameInterval * 0.75 + dt * 0.25;
    }
    FrameBudget.lastFrame = now;
    FrameBudget.worldHidden = worldHidden;
  }

  /** Milliseconds one kind of background work may take this frame (at least `base`). */
  static ms(base: number): number {
    const share = FrameBudget.worldHidden ? 0.5 : 0.25;
    const cap = FrameBudget.worldHidden ? 120 : 40;
    return Math.max(base, Math.min(cap, FrameBudget.frameInterval * share));
  }
}
