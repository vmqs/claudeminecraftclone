import { GL } from '../render/gl/GL';
import { FrameBudget } from './FrameBudget';
import { IdleTasks } from './IdleTasks';
import type { Minecraft } from './Minecraft';

/** Performance helpers on `window.mc.dev.perf` (scripts/perf/, scripts/scenarios/perf.json). */
export class PerfDevTools {
  private probeRuns = 0;

  constructor(private readonly mc: Minecraft) {}

  /** Frame budget, draw calls and the streaming and meshing queues. */
  stats(): Record<string, unknown> {
    const mc = this.mc;
    return {
      frameInterval: +FrameBudget.frameInterval.toFixed(2),
      idle: +FrameBudget.idle.toFixed(2),
      budgetMs: +FrameBudget.ms(4).toFixed(2),
      worldHidden: FrameBudget.worldHidden,
      drawCalls: GL.drawCalls,
      render: mc.renderGlobal.queueStats(),
      chunks: mc.chunkProvider ? { loaded: mc.theWorld?.loadedChunkCount ?? 0, ...mc.chunkProvider.queueStats() } : null,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  }

  /** Sections within `radius` of the player that never had a mesh (-1 without a player). */
  unmeshed(radius = 2): number {
    const p = this.mc.thePlayer;
    return p ? this.mc.renderGlobal.unmeshedNear(p, radius) : -1;
  }

  /** Every chunk within `radius` is loaded and every section in it has been meshed once. */
  areaShown(radius = 2): boolean {
    const p = this.mc.thePlayer;
    const cp = this.mc.chunkProvider;
    if (!p) return false;
    return (!cp || cp.areaLoaded(p.posX, p.posZ, radius)) && this.mc.renderGlobal.unmeshedNear(p, radius) === 0;
  }

  /** Registers an idle task that runs `slices` times; idleRuns() counts the runs so far. */
  idleProbe(slices = 5): void {
    this.probeRuns = 0;
    IdleTasks.add('perf-probe', () => ++this.probeRuns < slices);
  }

  idleRuns(): number {
    return this.probeRuns;
  }
}
