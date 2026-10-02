const f = Math.fround;

/** MouseFilter: eases accumulated mouse movement for the smooth camera (F8). */
export class MouseFilter {
  private target = 0;
  private applied = 0;
  private velocity = 0;

  /** Adds `delta` to the target and returns this tick's eased step towards it. */
  smooth(delta: number, factor: number): number {
    this.target = f(this.target + delta);
    let step = f(f(this.target - this.applied) * factor);
    this.velocity = f(this.velocity + f(f(step - this.velocity) * 0.5));
    if ((step > 0 && step > this.velocity) || (step < 0 && step < this.velocity)) step = this.velocity;
    this.applied = f(this.applied + step);
    return step;
  }
}
