import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { GL } from './gl/GL';

/**
 * ClippingHelperImpl + Frustrum: the six planes of projection * modelview captured after
 * the camera transform, tested against boxes relative to the camera position.
 */
export class Frustum {
  private readonly planes = new Float64Array(24);
  private x = 0;
  private y = 0;
  private z = 0;

  /** Captures the planes from the current GL matrices (ClippingHelperImpl.getInstance). */
  capture(): void {
    const p = GL.projection.top;
    const m = GL.modelview.top;
    const c = new Float64Array(16);
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += p[k * 4 + row] * m[col * 4 + k];
        c[col * 4 + row] = s;
      }
    const pl = this.planes;
    const set = (i: number, a: number, b: number, cc: number, d: number) => {
      const len = Math.sqrt(a * a + b * b + cc * cc) || 1;
      pl[i * 4] = a / len;
      pl[i * 4 + 1] = b / len;
      pl[i * 4 + 2] = cc / len;
      pl[i * 4 + 3] = d / len;
    };
    const r = (row: number, col: number) => c[col * 4 + row];
    for (let i = 0; i < 3; i++) {
      set(i * 2, r(3, 0) + r(i, 0), r(3, 1) + r(i, 1), r(3, 2) + r(i, 2), r(3, 3) + r(i, 3));
      set(i * 2 + 1, r(3, 0) - r(i, 0), r(3, 1) - r(i, 1), r(3, 2) - r(i, 2), r(3, 3) - r(i, 3));
    }
  }

  setPosition(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  isBoxInFrustum(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    minX -= this.x;
    maxX -= this.x;
    minY -= this.y;
    maxY -= this.y;
    minZ -= this.z;
    maxZ -= this.z;
    const pl = this.planes;
    for (let i = 0; i < 6; i++) {
      const a = pl[i * 4];
      const b = pl[i * 4 + 1];
      const c = pl[i * 4 + 2];
      const d = pl[i * 4 + 3];
      // The corner furthest along the plane normal must be inside.
      const px = a >= 0 ? maxX : minX;
      const py = b >= 0 ? maxY : minY;
      const pz = c >= 0 ? maxZ : minZ;
      if (a * px + b * py + c * pz + d <= 0) return false;
    }
    return true;
  }

  isBoundingBoxInFrustum(bb: AxisAlignedBB): boolean {
    return this.isBoxInFrustum(bb.minX, bb.minY, bb.minZ, bb.maxX, bb.maxY, bb.maxZ);
  }
}
