import { PART_COUNT, type ModelRig } from './PlayerModelFormat';

/**
 * Posing a custom model with ModelBiped's animation. ModelBiped works in "biped space": 1/16
 * block units scaled by 1/16 (so blocks), +Y down, the face towards -Z, the neck at the origin
 * and the feet at y = 1.5 (24 px); RenderPlayer then scales it by 0.9375. Model files are in
 * world-like space (see PlayerModelFormat), converted once when a model is loaded.
 *
 * Each part's bone matrix is T(pivot + delta) * Rz * Ry * Rx * T(-pivot), where pivot is the
 * part's joint on this body and delta is how far ModelBiped moved the part's rotation point from
 * Steve's rest position (sneaking lowers the head and moves the legs back, attacking swings
 * the shoulders around the body) -- the same transform ModelRenderer.render applies to a box.
 */

/** Steve's rotation points at rest (ModelBiped's constructor), in pixels. */
export const STEVE_REST: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [0, 0, 0],
  [-5, 2, 0],
  [5, 2, 0],
  [-1.9, 12, 0],
  [1.9, 12, 0],
];

/** RenderPlayer's renderPlayerScale. */
export const PLAYER_SCALE = 0.9375;

/** The fields of a ModelRenderer that pose a part. */
export interface PartPose {
  rotationPointX: number;
  rotationPointY: number;
  rotationPointZ: number;
  rotateAngleX: number;
  rotateAngleY: number;
  rotateAngleZ: number;
}

/** Model space (blocks, +Y up, +Z front, feet at 0) to biped space. */
export function toBipedSpace(x: number, y: number, z: number): [number, number, number] {
  return [x / PLAYER_SCALE, 1.5 - y / PLAYER_SCALE, -z / PLAYER_SCALE];
}

/** The rig's pivots in biped space. */
export function bipedPivots(rig: ModelRig): [number, number, number][] {
  return rig.pivots.map((p) => toBipedSpace(p[0], p[1], p[2]));
}

/**
 * Writes the six part matrices (column-major 4x4, 16 floats each) for `parts` (ModelBiped's
 * head, body, right arm, left arm, right leg, left leg) into `out` at `offset`.
 */
export function partMatrices(pivots: readonly (readonly [number, number, number])[], parts: readonly PartPose[], out: Float32Array, offset = 0): void {
  for (let k = 0; k < PART_COUNT; k++) {
    const p = parts[k];
    const pv = pivots[k];
    const rest = STEVE_REST[k];
    const qx = pv[0] + (p.rotationPointX - rest[0]) / 16;
    const qy = pv[1] + (p.rotationPointY - rest[1]) / 16;
    const qz = pv[2] + (p.rotationPointZ - rest[2]) / 16;
    writeMatrix(out, offset + k * 16, qx, qy, qz, p.rotateAngleX, p.rotateAngleY, p.rotateAngleZ, pv[0], pv[1], pv[2]);
  }
}

/** T(q) * Rz(az) * Ry(ay) * Rx(ax) * T(-pv), column-major. */
export function writeMatrix(out: Float32Array, o: number, qx: number, qy: number, qz: number, ax: number, ay: number, az: number, px: number, py: number, pz: number): void {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  // R = Rz * Ry * Rx (row-major r[row][col]).
  const r00 = cz * cy;
  const r01 = cz * sy * sx - sz * cx;
  const r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy;
  const r11 = sz * sy * sx + cz * cx;
  const r12 = sz * sy * cx - cz * sx;
  const r20 = -sy;
  const r21 = cy * sx;
  const r22 = cy * cx;
  out[o] = r00;
  out[o + 1] = r10;
  out[o + 2] = r20;
  out[o + 3] = 0;
  out[o + 4] = r01;
  out[o + 5] = r11;
  out[o + 6] = r21;
  out[o + 7] = 0;
  out[o + 8] = r02;
  out[o + 9] = r12;
  out[o + 10] = r22;
  out[o + 11] = 0;
  out[o + 12] = qx - (r00 * px + r01 * py + r02 * pz);
  out[o + 13] = qy - (r10 * px + r11 * py + r12 * pz);
  out[o + 14] = qz - (r20 * px + r21 * py + r22 * pz);
  out[o + 15] = 1;
}

/** A part at rest. */
export function restPose(k: number): PartPose {
  const r = STEVE_REST[k];
  return { rotationPointX: r[0], rotationPointY: r[1], rotationPointZ: r[2], rotateAngleX: 0, rotateAngleY: 0, rotateAngleZ: 0 };
}
