import { MathHelper } from './MathHelper';

/** Float literal 1.0E-7F promoted to double, as the original compares against it. */
const EPS = Math.fround(1e-7);

export class Vec3 {
  xCoord: number;
  yCoord: number;
  zCoord: number;

  constructor(x: number, y: number, z: number) {
    // The original normalises -0.0 to 0.0.
    this.xCoord = x === 0 ? 0 : x;
    this.yCoord = y === 0 ? 0 : y;
    this.zCoord = z === 0 ? 0 : z;
  }

  static createVectorHelper(x: number, y: number, z: number): Vec3 {
    return new Vec3(x, y, z);
  }

  setComponents(x: number, y: number, z: number): Vec3 {
    this.xCoord = x;
    this.yCoord = y;
    this.zCoord = z;
    return this;
  }

  /** Note the original's argument order: returns `other - this`. */
  subtract(other: Vec3): Vec3 {
    return new Vec3(other.xCoord - this.xCoord, other.yCoord - this.yCoord, other.zCoord - this.zCoord);
  }

  normalize(): Vec3 {
    const len = MathHelper.sqrt_double(this.xCoord * this.xCoord + this.yCoord * this.yCoord + this.zCoord * this.zCoord);
    return len < 1.0e-4 ? new Vec3(0, 0, 0) : new Vec3(this.xCoord / len, this.yCoord / len, this.zCoord / len);
  }

  dotProduct(v: Vec3): number {
    return this.xCoord * v.xCoord + this.yCoord * v.yCoord + this.zCoord * v.zCoord;
  }

  crossProduct(v: Vec3): Vec3 {
    return new Vec3(
      this.yCoord * v.zCoord - this.zCoord * v.yCoord,
      this.zCoord * v.xCoord - this.xCoord * v.zCoord,
      this.xCoord * v.yCoord - this.yCoord * v.xCoord,
    );
  }

  addVector(x: number, y: number, z: number): Vec3 {
    return new Vec3(this.xCoord + x, this.yCoord + y, this.zCoord + z);
  }

  distanceTo(v: Vec3): number {
    const dx = v.xCoord - this.xCoord;
    const dy = v.yCoord - this.yCoord;
    const dz = v.zCoord - this.zCoord;
    return MathHelper.sqrt_double(dx * dx + dy * dy + dz * dz);
  }

  squareDistanceTo(v: Vec3): number {
    const dx = v.xCoord - this.xCoord;
    const dy = v.yCoord - this.yCoord;
    const dz = v.zCoord - this.zCoord;
    return dx * dx + dy * dy + dz * dz;
  }

  squareDistanceToXYZ(x: number, y: number, z: number): number {
    const dx = x - this.xCoord;
    const dy = y - this.yCoord;
    const dz = z - this.zCoord;
    return dx * dx + dy * dy + dz * dz;
  }

  lengthVector(): number {
    return MathHelper.sqrt_double(this.xCoord * this.xCoord + this.yCoord * this.yCoord + this.zCoord * this.zCoord);
  }

  /** Point on the segment this->end whose x equals `x`, or null if outside the segment. */
  getIntermediateWithXValue(end: Vec3, x: number): Vec3 | null {
    const dx = end.xCoord - this.xCoord;
    const dy = end.yCoord - this.yCoord;
    const dz = end.zCoord - this.zCoord;
    if (dx * dx < EPS) return null;
    const t = (x - this.xCoord) / dx;
    return t >= 0 && t <= 1 ? new Vec3(this.xCoord + dx * t, this.yCoord + dy * t, this.zCoord + dz * t) : null;
  }

  getIntermediateWithYValue(end: Vec3, y: number): Vec3 | null {
    const dx = end.xCoord - this.xCoord;
    const dy = end.yCoord - this.yCoord;
    const dz = end.zCoord - this.zCoord;
    if (dy * dy < EPS) return null;
    const t = (y - this.yCoord) / dy;
    return t >= 0 && t <= 1 ? new Vec3(this.xCoord + dx * t, this.yCoord + dy * t, this.zCoord + dz * t) : null;
  }

  getIntermediateWithZValue(end: Vec3, z: number): Vec3 | null {
    const dx = end.xCoord - this.xCoord;
    const dy = end.yCoord - this.yCoord;
    const dz = end.zCoord - this.zCoord;
    if (dz * dz < EPS) return null;
    const t = (z - this.zCoord) / dz;
    return t >= 0 && t <= 1 ? new Vec3(this.xCoord + dx * t, this.yCoord + dy * t, this.zCoord + dz * t) : null;
  }

  rotateAroundX(angle: number): void {
    const c = MathHelper.cos(angle);
    const s = MathHelper.sin(angle);
    const y = this.yCoord * c + this.zCoord * s;
    const z = this.zCoord * c - this.yCoord * s;
    this.yCoord = y;
    this.zCoord = z;
  }

  rotateAroundY(angle: number): void {
    const c = MathHelper.cos(angle);
    const s = MathHelper.sin(angle);
    const x = this.xCoord * c + this.zCoord * s;
    const z = this.zCoord * c - this.xCoord * s;
    this.xCoord = x;
    this.zCoord = z;
  }

  rotateAroundZ(angle: number): void {
    const c = MathHelper.cos(angle);
    const s = MathHelper.sin(angle);
    const x = this.xCoord * c + this.yCoord * s;
    const y = this.yCoord * c - this.xCoord * s;
    this.xCoord = x;
    this.yCoord = y;
  }

  toString(): string {
    return `(${this.xCoord}, ${this.yCoord}, ${this.zCoord})`;
  }
}
