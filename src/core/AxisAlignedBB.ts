import { MovingObjectPosition } from './MovingObjectPosition';
import type { Vec3 } from './Vec3';

/**
 * Axis-aligned box with the original's API. The original pooled instances; here
 * the "pool" methods simply allocate. Methods that the original implemented by
 * mutating (`offset`, `setBounds`, `setBB`) still mutate; everything else
 * returns a new box.
 */
export class AxisAlignedBB {
  constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  static getBoundingBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AxisAlignedBB {
    return new AxisAlignedBB(minX, minY, minZ, maxX, maxY, maxZ);
  }

  setBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): this {
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
    return this;
  }

  /** Box swept by moving (dx, dy, dz). */
  addCoord(dx: number, dy: number, dz: number): AxisAlignedBB {
    let minX = this.minX;
    let minY = this.minY;
    let minZ = this.minZ;
    let maxX = this.maxX;
    let maxY = this.maxY;
    let maxZ = this.maxZ;
    if (dx < 0) minX += dx;
    if (dx > 0) maxX += dx;
    if (dy < 0) minY += dy;
    if (dy > 0) maxY += dy;
    if (dz < 0) minZ += dz;
    if (dz > 0) maxZ += dz;
    return new AxisAlignedBB(minX, minY, minZ, maxX, maxY, maxZ);
  }

  expand(x: number, y: number, z: number): AxisAlignedBB {
    return new AxisAlignedBB(this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z);
  }

  contract(x: number, y: number, z: number): AxisAlignedBB {
    return new AxisAlignedBB(this.minX + x, this.minY + y, this.minZ + z, this.maxX - x, this.maxY - y, this.maxZ - z);
  }

  getOffsetBoundingBox(x: number, y: number, z: number): AxisAlignedBB {
    return new AxisAlignedBB(this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z);
  }

  /** Mutates this box. */
  offset(x: number, y: number, z: number): this {
    this.minX += x;
    this.minY += y;
    this.minZ += z;
    this.maxX += x;
    this.maxY += y;
    this.maxZ += z;
    return this;
  }

  copy(): AxisAlignedBB {
    return new AxisAlignedBB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  setBB(o: AxisAlignedBB): void {
    this.setBounds(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ);
  }

  /** Clamps a movement `dx` of box `other` so it doesn't enter this box along X. */
  calculateXOffset(other: AxisAlignedBB, dx: number): number {
    if (other.maxY <= this.minY || other.minY >= this.maxY) return dx;
    if (other.maxZ <= this.minZ || other.minZ >= this.maxZ) return dx;
    if (dx > 0 && other.maxX <= this.minX) {
      const d = this.minX - other.maxX;
      if (d < dx) dx = d;
    }
    if (dx < 0 && other.minX >= this.maxX) {
      const d = this.maxX - other.minX;
      if (d > dx) dx = d;
    }
    return dx;
  }

  calculateYOffset(other: AxisAlignedBB, dy: number): number {
    if (other.maxX <= this.minX || other.minX >= this.maxX) return dy;
    if (other.maxZ <= this.minZ || other.minZ >= this.maxZ) return dy;
    if (dy > 0 && other.maxY <= this.minY) {
      const d = this.minY - other.maxY;
      if (d < dy) dy = d;
    }
    if (dy < 0 && other.minY >= this.maxY) {
      const d = this.maxY - other.minY;
      if (d > dy) dy = d;
    }
    return dy;
  }

  calculateZOffset(other: AxisAlignedBB, dz: number): number {
    if (other.maxX <= this.minX || other.minX >= this.maxX) return dz;
    if (other.maxY <= this.minY || other.minY >= this.maxY) return dz;
    if (dz > 0 && other.maxZ <= this.minZ) {
      const d = this.minZ - other.maxZ;
      if (d < dz) dz = d;
    }
    if (dz < 0 && other.minZ >= this.maxZ) {
      const d = this.maxZ - other.minZ;
      if (d > dz) dz = d;
    }
    return dz;
  }

  intersectsWith(o: AxisAlignedBB): boolean {
    if (o.maxX <= this.minX || o.minX >= this.maxX) return false;
    if (o.maxY <= this.minY || o.minY >= this.maxY) return false;
    return !(o.maxZ <= this.minZ) && !(o.minZ >= this.maxZ);
  }

  isVecInside(v: Vec3): boolean {
    if (v.xCoord <= this.minX || v.xCoord >= this.maxX) return false;
    if (v.yCoord <= this.minY || v.yCoord >= this.maxY) return false;
    return !(v.zCoord <= this.minZ) && !(v.zCoord >= this.maxZ);
  }

  getAverageEdgeLength(): number {
    return (this.maxX - this.minX + (this.maxY - this.minY) + (this.maxZ - this.minZ)) / 3;
  }

  calculateIntercept(start: Vec3, end: Vec3): MovingObjectPosition | null {
    let v0 = start.getIntermediateWithXValue(end, this.minX);
    let v1 = start.getIntermediateWithXValue(end, this.maxX);
    let v2 = start.getIntermediateWithYValue(end, this.minY);
    let v3 = start.getIntermediateWithYValue(end, this.maxY);
    let v4 = start.getIntermediateWithZValue(end, this.minZ);
    let v5 = start.getIntermediateWithZValue(end, this.maxZ);
    if (!this.isVecInYZ(v0)) v0 = null;
    if (!this.isVecInYZ(v1)) v1 = null;
    if (!this.isVecInXZ(v2)) v2 = null;
    if (!this.isVecInXZ(v3)) v3 = null;
    if (!this.isVecInXY(v4)) v4 = null;
    if (!this.isVecInXY(v5)) v5 = null;
    const candidates = [v0, v1, v2, v3, v4, v5];
    const sides = [4, 5, 0, 1, 2, 3];
    let best: Vec3 | null = null;
    let side = -1;
    for (let i = 0; i < 6; i++) {
      const c = candidates[i];
      if (c && (best === null || start.squareDistanceTo(c) < start.squareDistanceTo(best))) {
        best = c;
        side = sides[i];
      }
    }
    if (!best) return null;
    return MovingObjectPosition.forBlock(0, 0, 0, side, best);
  }

  private isVecInYZ(v: Vec3 | null): boolean {
    return v !== null && v.yCoord >= this.minY && v.yCoord <= this.maxY && v.zCoord >= this.minZ && v.zCoord <= this.maxZ;
  }

  private isVecInXZ(v: Vec3 | null): boolean {
    return v !== null && v.xCoord >= this.minX && v.xCoord <= this.maxX && v.zCoord >= this.minZ && v.zCoord <= this.maxZ;
  }

  private isVecInXY(v: Vec3 | null): boolean {
    return v !== null && v.xCoord >= this.minX && v.xCoord <= this.maxX && v.yCoord >= this.minY && v.yCoord <= this.maxY;
  }

  toString(): string {
    return `box[${this.minX}, ${this.minY}, ${this.minZ} -> ${this.maxX}, ${this.maxY}, ${this.maxZ}]`;
  }
}
