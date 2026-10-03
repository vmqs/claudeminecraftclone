/** The fixed-rate game clock (20 ticks per second, at most 10 catch-up ticks per frame). */
export class Timer {
  elapsedTicks = 0;
  renderPartialTicks = 0;
  timerSpeed = 1;
  elapsedPartialTicks = 0;
  private lastHRTime: number;

  constructor(readonly ticksPerSecond: number) {
    this.lastHRTime = performance.now() / 1000;
  }

  updateTimer(): void {
    const now = performance.now() / 1000;
    let dt = now - this.lastHRTime;
    this.lastHRTime = now;
    if (dt < 0) dt = 0;
    if (dt > 1) dt = 1;
    this.elapsedPartialTicks = Math.fround(this.elapsedPartialTicks + dt * this.timerSpeed * this.ticksPerSecond);
    this.elapsedTicks = Math.trunc(this.elapsedPartialTicks);
    this.elapsedPartialTicks = Math.fround(this.elapsedPartialTicks - this.elapsedTicks);
    if (this.elapsedTicks > 10) this.elapsedTicks = 10;
    this.renderPartialTicks = this.elapsedPartialTicks;
  }
}
