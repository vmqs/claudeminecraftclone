import { MathHelper } from '../../core/MathHelper';

const f = Math.fround;

/** A block position in the A* search (PathPoint), with its heap index and costs. */
export class PathPoint {
  readonly hash: number;
  /** Position in the open-set heap, -1 when not queued. */
  index = -1;
  totalPathDistance = 0;
  distanceToNext = 0;
  distanceToTarget = 0;
  previous: PathPoint | null = null;
  /** Already expanded (closed set). */
  isFirst = false;

  constructor(
    readonly xCoord: number,
    readonly yCoord: number,
    readonly zCoord: number,
  ) {
    this.hash = PathPoint.makeHash(xCoord, yCoord, zCoord);
  }

  static makeHash(x: number, y: number, z: number): number {
    return (y & 255) | ((x & 32767) << 8) | ((z & 32767) << 24) | (x < 0 ? -2147483648 : 0) | (z < 0 ? 32768 : 0);
  }

  distanceTo(p: PathPoint): number {
    const dx = p.xCoord - this.xCoord;
    const dy = p.yCoord - this.yCoord;
    const dz = p.zCoord - this.zCoord;
    return MathHelper.sqrt_float(f(dx * dx + dy * dy + dz * dz));
  }

  /** func_75832_b: squared distance (the heuristic). */
  distanceToSquared(p: PathPoint): number {
    const dx = p.xCoord - this.xCoord;
    const dy = p.yCoord - this.yCoord;
    const dz = p.zCoord - this.zCoord;
    return f(dx * dx + dy * dy + dz * dz);
  }

  equals(p: PathPoint): boolean {
    return this.hash === p.hash && this.xCoord === p.xCoord && this.yCoord === p.yCoord && this.zCoord === p.zCoord;
  }

  isAssigned(): boolean {
    return this.index >= 0;
  }

  toString(): string {
    return `${this.xCoord}, ${this.yCoord}, ${this.zCoord}`;
  }
}

/** Binary min-heap of path points by distanceToTarget (Path). */
export class Path {
  private points: PathPoint[] = [];
  private count = 0;

  addPoint(p: PathPoint): PathPoint {
    if (p.index >= 0) throw new Error('PathPoint already queued');
    this.points[this.count] = p;
    p.index = this.count;
    this.sortBack(this.count++);
    return p;
  }

  clearPath(): void {
    this.count = 0;
  }

  dequeue(): PathPoint {
    const top = this.points[0];
    this.points[0] = this.points[--this.count];
    if (this.count > 0) this.sortForward(0);
    top.index = -1;
    return top;
  }

  changeDistance(p: PathPoint, d: number): void {
    const old = p.distanceToTarget;
    p.distanceToTarget = d;
    if (d < old) this.sortBack(p.index);
    else this.sortForward(p.index);
  }

  isPathEmpty(): boolean {
    return this.count === 0;
  }

  private sortBack(i: number): void {
    const p = this.points[i];
    const d = p.distanceToTarget;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const q = this.points[parent];
      if (!(d < q.distanceToTarget)) break;
      this.points[i] = q;
      q.index = i;
      i = parent;
    }
    this.points[i] = p;
    p.index = i;
  }

  private sortForward(i: number): void {
    const p = this.points[i];
    const d = p.distanceToTarget;
    for (;;) {
      const l = 1 + (i << 1);
      const r = l + 1;
      if (l >= this.count) break;
      const lp = this.points[l];
      const ld = lp.distanceToTarget;
      const rp = r < this.count ? this.points[r] : null;
      const rd = rp ? rp.distanceToTarget : Number.POSITIVE_INFINITY;
      if (ld < rd) {
        if (!(ld < d)) break;
        this.points[i] = lp;
        lp.index = i;
        i = l;
      } else {
        if (!(rd < d)) break;
        this.points[i] = rp!;
        rp!.index = i;
        i = r;
      }
    }
    this.points[i] = p;
    p.index = i;
  }
}
