import { Block } from '../../block/Block';
import type { Chunk } from '../Chunk';

const W = 48;
const PLANE = W * W;
const QUEUE_SIZE = 1 << 21;

let opacity = new Uint8Array(0);
let sky = new Uint8Array(0);
let blk = new Uint8Array(0);
const queue = new Int32Array(QUEUE_SIZE);
const heights = new Int32Array(PLANE);

function ensure(size: number): void {
  if (opacity.length < size) {
    opacity = new Uint8Array(size);
    sky = new Uint8Array(size);
    blk = new Uint8Array(size);
  }
}

/** BFS increase with the original rule: neighbour = max(neighbour, value - max(1, opacity)). */
function spread(light: Uint8Array, head0: number, tail0: number, topY: number): void {
  let head = head0;
  let tail = tail0;
  const maxIdx = topY * PLANE;
  while (head !== tail) {
    const i = queue[head];
    head = (head + 1) & (QUEUE_SIZE - 1);
    const v = light[i];
    if (v <= 1) continue;
    const lx = i % W;
    const lz = ((i / W) | 0) % W;
    for (let d = 0; d < 6; d++) {
      let n: number;
      if (d === 0) {
        if (lx === 0) continue;
        n = i - 1;
      } else if (d === 1) {
        if (lx === W - 1) continue;
        n = i + 1;
      } else if (d === 2) {
        if (lz === 0) continue;
        n = i - W;
      } else if (d === 3) {
        if (lz === W - 1) continue;
        n = i + W;
      } else if (d === 4) {
        if (i < PLANE) continue;
        n = i - PLANE;
      } else {
        n = i + PLANE;
        if (n >= maxIdx) continue;
      }
      const op = opacity[n];
      const nv = v - (op > 1 ? op : 1);
      if (nv > light[n]) {
        light[n] = nv;
        queue[tail] = n;
        tail = (tail + 1) & (QUEUE_SIZE - 1);
      }
    }
  }
}

/**
 * Computes the final sky and block light of `center` from its populated 3x3 neighbourhood
 * (`around[(dz + 1) * 3 + (dx + 1)]`). Sky light is 15 at and above the height map and spreads
 * from there; block light spreads from Block.lightValue sources. Results are written into the
 * center chunk's sections, or into the arrays `out` gives for each existing section (the chunk's own
 * light is then left as it is).
 */
export function computeChunkLight(around: Chunk[], center: Chunk, out?: (sy: number) => { skyLight: Uint8Array; blockLight: Uint8Array } | null): void {
  let topY = 0;
  for (const c of around) topY = Math.max(topY, c.getTopFilledSegment() + 16);
  topY = Math.min(256, Math.max(topY, 16));
  ensure(topY * PLANE);
  const size = topY * PLANE;
  sky.fill(0, 0, size);
  blk.fill(0, 0, size);
  let tail = 0;
  const lightValue = Block.lightValue;
  const lightOpacity = Block.lightOpacity;
  for (let cz = 0; cz < 3; cz++) {
    for (let cx = 0; cx < 3; cx++) {
      const c = around[cz * 3 + cx];
      for (let sy = 0; sy < topY >> 4; sy++) {
        const s = c.sections[sy];
        const yBase = sy << 4;
        if (!s) {
          for (let y = 0; y < 16; y++)
            for (let z = 0; z < 16; z++) opacity.fill(0, ((yBase + y) * W + cz * 16 + z) * W + cx * 16, ((yBase + y) * W + cz * 16 + z) * W + cx * 16 + 16);
          continue;
        }
        const ids = s.blocks;
        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            const row = ((yBase + y) * W + cz * 16 + z) * W + cx * 16;
            const src = (y << 8) | (z << 4);
            for (let x = 0; x < 16; x++) {
              const id = ids[src | x];
              opacity[row + x] = lightOpacity[id];
              const lv = lightValue[id];
              if (lv > 0) {
                blk[row + x] = lv;
                queue[tail++] = row + x;
              }
            }
          }
        }
      }
    }
  }
  spread(blk, 0, tail, topY);

  // Sky: full light down to the height map of each column, then spread sideways and down.
  for (let lz = 0; lz < W; lz++) {
    for (let lx = 0; lx < W; lx++) {
      let y = topY;
      while (y > 0 && opacity[((y - 1) * W + lz) * W + lx] === 0) y--;
      heights[lz * W + lx] = y;
      for (let yy = y; yy < topY; yy++) sky[(yy * W + lz) * W + lx] = 15;
    }
  }
  tail = 0;
  for (let lz = 0; lz < W; lz++) {
    for (let lx = 0; lx < W; lx++) {
      const h = heights[lz * W + lx];
      let maxN = h;
      if (lx > 0) maxN = Math.max(maxN, heights[lz * W + lx - 1]);
      if (lx < W - 1) maxN = Math.max(maxN, heights[lz * W + lx + 1]);
      if (lz > 0) maxN = Math.max(maxN, heights[(lz - 1) * W + lx]);
      if (lz < W - 1) maxN = Math.max(maxN, heights[(lz + 1) * W + lx]);
      const lo = h;
      const hi = Math.min(maxN, topY - 1);
      for (let y = lo; y <= hi; y++) {
        if (y >= topY) break;
        queue[tail] = (y * W + lz) * W + lx;
        tail = (tail + 1) & (QUEUE_SIZE - 1);
      }
    }
  }
  spread(sky, 0, tail, topY);

  for (let sy = 0; sy < 16; sy++) {
    const s = out ? (center.sections[sy] ? out(sy) : null) : center.sections[sy];
    if (!s) continue;
    const yBase = sy << 4;
    if (yBase >= topY) {
      s.skyLight.fill(15);
      s.blockLight.fill(0);
      continue;
    }
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        const row = ((yBase + y) * W + 16 + z) * W + 16;
        const dst = (y << 8) | (z << 4);
        s.skyLight.set(sky.subarray(row, row + 16), dst);
        s.blockLight.set(blk.subarray(row, row + 16), dst);
      }
    }
  }
}
