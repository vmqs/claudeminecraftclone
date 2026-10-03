/**
 * The world-generation worker is started ahead of need: loading its module (and the terrain
 * workers it starts at once) takes a noticeable moment, which then overlaps the menus instead
 * of the "Building terrain" screen. One spare is kept; ChunkProviderClient takes it.
 */
let spare: Worker | null = null;

function create(): Worker {
  return new Worker(new URL('../workers/worldgen.worker.ts', import.meta.url), { type: 'module' });
}

export const WorldGenWorkers = {
  /** Starts the spare worker if there is none (cheap to call again). */
  prewarm(): void {
    if (spare || typeof Worker === 'undefined') return;
    try {
      spare = create();
    } catch {
      spare = null;
    }
  },

  /** The spare worker, or a new one. */
  take(): Worker {
    const w = spare ?? create();
    spare = null;
    return w;
  },
};
