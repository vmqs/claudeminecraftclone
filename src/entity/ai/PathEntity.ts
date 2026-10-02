import { Vec3 } from '../../core/Vec3';
import type { Entity } from '../Entity';
import type { PathPoint } from './PathPoint';

/** A found path and the walker's progress along it (PathEntity). */
export class PathEntity {
  private currentPathIndex = 0;
  private pathLength: number;

  constructor(private readonly points: PathPoint[]) {
    this.pathLength = points.length;
  }

  incrementPathIndex(): void {
    this.currentPathIndex++;
  }

  isFinished(): boolean {
    return this.currentPathIndex >= this.pathLength;
  }

  getFinalPathPoint(): PathPoint | null {
    return this.pathLength > 0 ? this.points[this.pathLength - 1] : null;
  }

  getPathPointFromIndex(i: number): PathPoint {
    return this.points[i];
  }

  getCurrentPathLength(): number {
    return this.pathLength;
  }

  setCurrentPathLength(n: number): void {
    this.pathLength = n;
  }

  getCurrentPathIndex(): number {
    return this.currentPathIndex;
  }

  setCurrentPathIndex(i: number): void {
    this.currentPathIndex = i;
  }

  /** Centre of the point for an entity of this width. */
  getVectorFromIndex(e: Entity, i: number): Vec3 {
    const half = Math.trunc(Math.fround(e.width + 1)) * 0.5;
    return new Vec3(this.points[i].xCoord + half, this.points[i].yCoord, this.points[i].zCoord + half);
  }

  getPosition(e: Entity): Vec3 {
    return this.getVectorFromIndex(e, this.currentPathIndex);
  }

  isSamePath(o: PathEntity | null): boolean {
    if (!o || o.points.length !== this.points.length) return false;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i];
      const b = o.points[i];
      if (a.xCoord !== b.xCoord || a.yCoord !== b.yCoord || a.zCoord !== b.zCoord) return false;
    }
    return true;
  }

  isDestinationSame(v: Vec3): boolean {
    const p = this.getFinalPathPoint();
    return p !== null && p.xCoord === Math.trunc(v.xCoord) && p.zCoord === Math.trunc(v.zCoord);
  }
}
