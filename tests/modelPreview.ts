// Node-side helpers for custom player models: an image codec without a DOM (PNG only) and a
// small software rasteriser that draws a model posed by ModelBiped, for tests and for looking
// at conversions without a browser.
import { decodeKnown, encodePng, type RgbaImage } from '../src/client/model/ImageCodecs';
import type { ImageCodec } from '../src/client/model/ModelBuilder';
import { partMatrices, bipedPivots, toBipedSpace, type PartPose } from '../src/client/model/ModelPose';
import type { PlayerModelData } from '../src/client/model/PlayerModelFormat';

export const nodeCodec: ImageCodec = {
  async decode(bytes, name) {
    return decodeKnown(bytes, name);
  },
  async encode(img, _opaque) {
    return { mime: 'image/png', bytes: encodePng(img) };
  },
};

export interface View {
  /** Camera yaw in degrees (0 = looking at the model's front). */
  yaw: number;
  pitch?: number;
  parts: PartPose[];
}

/** Draws views side by side (each `size` px square) and returns the PNG. */
export function renderViews(m: PlayerModelData, views: View[], size = 256): Uint8Array {
  const W = size * views.length;
  const H = size;
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = 40;
    rgba[i * 4 + 1] = 44;
    rgba[i * 4 + 2] = 52;
    rgba[i * 4 + 3] = 255;
  }
  const depth = new Float32Array(W * H).fill(Infinity);
  const tex: (RgbaImage | null)[] = m.textures.map((t) => decodeKnown(t.bytes, 'x.png'));
  const vc = m.positions.length / 3;
  const pivots = bipedPivots(m.rig);
  const bones = new Float32Array(16 * 6);
  const bp = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) {
    const b = toBipedSpace(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    bp[i * 3] = b[0];
    bp[i * 3 + 1] = b[1];
    bp[i * 3 + 2] = b[2];
  }
  views.forEach((view, vi) => {
    partMatrices(pivots, view.parts, bones);
    const sp = new Float32Array(vc * 3);
    const sn = new Float32Array(vc * 3);
    for (let i = 0; i < vc; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const px = bp[i * 3];
      const py = bp[i * 3 + 1];
      const pz = bp[i * 3 + 2];
      const n0 = m.normals[i * 3] / 127;
      const n1 = -m.normals[i * 3 + 1] / 127;
      const n2 = -m.normals[i * 3 + 2] / 127;
      for (let k = 0; k < 4; k++) {
        const wt = m.weights[i * 4 + k] / 255;
        if (!wt) continue;
        const o = m.joints[i * 4 + k] * 16;
        x += (bones[o] * px + bones[o + 4] * py + bones[o + 8] * pz + bones[o + 12]) * wt;
        y += (bones[o + 1] * px + bones[o + 5] * py + bones[o + 9] * pz + bones[o + 13]) * wt;
        z += (bones[o + 2] * px + bones[o + 6] * py + bones[o + 10] * pz + bones[o + 14]) * wt;
        nx += (bones[o] * n0 + bones[o + 4] * n1 + bones[o + 8] * n2) * wt;
        ny += (bones[o + 1] * n0 + bones[o + 5] * n1 + bones[o + 9] * n2) * wt;
        nz += (bones[o + 2] * n0 + bones[o + 6] * n1 + bones[o + 10] * n2) * wt;
      }
      // Back to world-like axes (y up, front +z), then the camera.
      const wx = x * 0.9375;
      const wy = (1.5 - y) * 0.9375;
      const wz = -z * 0.9375;
      const yaw = (view.yaw * Math.PI) / 180;
      const pitch = ((view.pitch ?? 0) * Math.PI) / 180;
      const cx = Math.cos(yaw) * wx + Math.sin(yaw) * wz;
      const cz0 = -Math.sin(yaw) * wx + Math.cos(yaw) * wz;
      const cy = Math.cos(pitch) * (wy - 0.95) - Math.sin(pitch) * cz0;
      const cz = Math.sin(pitch) * (wy - 0.95) + Math.cos(pitch) * cz0;
      const s = size / 2.2;
      sp[i * 3] = vi * size + size / 2 + cx * s;
      sp[i * 3 + 1] = size / 2 - cy * s;
      sp[i * 3 + 2] = -cz;
      const wnx = nx;
      const wny = -ny;
      const wnz = -nz;
      sn[i * 3] = Math.cos(yaw) * wnx + Math.sin(yaw) * wnz;
      sn[i * 3 + 1] = wny;
      sn[i * 3 + 2] = -Math.sin(yaw) * wnx + Math.cos(yaw) * wnz;
    }
    for (const g of m.groups) {
      const mat = m.materials[g.material];
      const t = mat.texture >= 0 ? tex[mat.texture] : null;
      for (let j = g.start; j < g.start + g.count; j += 3) {
        const a = m.indices[j];
        const b = m.indices[j + 1];
        const c = m.indices[j + 2];
        drawTri(rgba, depth, W, H, vi * size, (vi + 1) * size, sp, sn, m.uvs, a, b, c, t, mat.color, mat.alpha === 1);
      }
    }
  });
  return encodePng({ width: W, height: H, rgba });
}

function drawTri(rgba: Uint8Array, depth: Float32Array, W: number, H: number, x0c: number, x1c: number, sp: Float32Array, sn: Float32Array, uv: Float32Array, a: number, b: number, c: number, t: RgbaImage | null, color: number[], cutout: boolean): void {
  const ax = sp[a * 3], ay = sp[a * 3 + 1], az = sp[a * 3 + 2];
  const bx = sp[b * 3], by = sp[b * 3 + 1], bz = sp[b * 3 + 2];
  const cx = sp[c * 3], cy = sp[c * 3 + 1], cz = sp[c * 3 + 2];
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(x0c, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(x1c - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      const di = y * W + x;
      if (z >= depth[di]) continue;
      let r = color[0];
      let g = color[1];
      let bl = color[2];
      if (t) {
        let u = w0 * uv[a * 2] + w1 * uv[b * 2] + w2 * uv[c * 2];
        let v = w0 * uv[a * 2 + 1] + w1 * uv[b * 2 + 1] + w2 * uv[c * 2 + 1];
        u -= Math.floor(u);
        v -= Math.floor(v);
        const ti = (Math.min(t.height - 1, Math.floor(v * t.height)) * t.width + Math.min(t.width - 1, Math.floor(u * t.width))) * 4;
        if (cutout && t.rgba[ti + 3] < 26) continue;
        r = (r * t.rgba[ti]) / 255;
        g = (g * t.rgba[ti + 1]) / 255;
        bl = (bl * t.rgba[ti + 2]) / 255;
      }
      const nx = w0 * sn[a * 3] + w1 * sn[b * 3] + w2 * sn[c * 3];
      const ny = w0 * sn[a * 3 + 1] + w1 * sn[b * 3 + 1] + w2 * sn[c * 3 + 1];
      const nz = w0 * sn[a * 3 + 2] + w1 * sn[b * 3 + 2] + w2 * sn[c * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      const lit = 0.45 + 0.55 * Math.abs((nx * 0.3 + ny * 0.5 + nz * 0.8) / l / Math.hypot(0.3, 0.5, 0.8));
      depth[di] = z;
      rgba[di * 4] = Math.min(255, r * lit);
      rgba[di * 4 + 1] = Math.min(255, g * lit);
      rgba[di * 4 + 2] = Math.min(255, bl * lit);
    }
  }
}
