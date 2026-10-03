import type { Chunk } from '../world/Chunk';
import { SNAPSHOT_PAD, SNAPSHOT_SIZE, type SectionSnapshot } from '../world/ChunkCache';

const S = SNAPSHOT_SIZE;
const PAD = SNAPSHOT_PAD;

/** What the snapshot copy reads: the client World (or any chunk source). */
export interface SnapshotSource {
  getChunkFromChunkCoords(cx: number, cz: number): Chunk;
}

/**
 * Copies the padded block data around section (sx, sy, sz) into a mesher snapshot: ids,
 * metadata, sky and block light of every cell (air with column sky light where a chunk has no
 * section there; nothing below 0 or above 255) and the biome of every column. Rows are copied
 * per chunk run: x0 - 2 .. x0 + 17 spans the section's chunk and two columns of each x
 * neighbour. Worker-safe (no DOM), so Node benchmarks can call it.
 */
export function fillSectionSnapshot(w: SnapshotSource, snap: SectionSnapshot, sx: number, sy: number, sz: number): void {
  const x0 = sx * 16 - PAD;
  const y0 = sy * 16 - PAD;
  const z0 = sz * 16 - PAD;
  snap.x0 = x0;
  snap.y0 = y0;
  snap.z0 = z0;
  const center = w.getChunkFromChunkCoords(sx, sz).sections[sy];
  snap.empty = !center || center.isEmpty();
  if (snap.empty) return;
  const ids = snap.ids;
  const meta = snap.meta;
  const sky = snap.sky;
  const blk = snap.blk;
  const biomes = snap.biomes;
  for (let lz = 0; lz < S; lz++) {
    const wz = z0 + lz;
    const bz = wz & 15;
    const czk = wz >> 4;
    // Three runs along x: [0, PAD) in chunk sx - 1, [PAD, PAD + 16) in sx, the rest in sx + 1.
    for (let run = 0; run < 3; run++) {
      const lxStart = run === 0 ? 0 : run === 1 ? PAD : PAD + 16;
      const lxEnd = run === 0 ? PAD : run === 1 ? PAD + 16 : S;
      const chunk = w.getChunkFromChunkCoords(sx - 1 + run, czk);
      const bxStart = (x0 + lxStart) & 15;
      const colBase = bz << 4;
      for (let lx = lxStart, bx = bxStart; lx < lxEnd; lx++, bx++) biomes[lz * S + lx] = chunk.biomes[colBase | bx];
      const sections = chunk.sections;
      for (let ly = 0; ly < S; ly++) {
        const wy = y0 + ly;
        const row = (ly * S + lz) * S;
        if (wy < 0 || wy >= 256) {
          for (let lx = lxStart; lx < lxEnd; lx++) {
            ids[row + lx] = 0;
            meta[row + lx] = 0;
            sky[row + lx] = 15;
            blk[row + lx] = 0;
          }
          continue;
        }
        const sec = sections[wy >> 4];
        if (sec) {
          const sb = sec.blocks;
          const sm = sec.meta;
          const ss = sec.skyLight;
          const sl = sec.blockLight;
          const j0 = ((wy & 15) << 8) | colBase;
          for (let lx = lxStart, bx = bxStart; lx < lxEnd; lx++, bx++) {
            const i = row + lx;
            const j = j0 | bx;
            ids[i] = sb[j];
            meta[i] = sm[j];
            sky[i] = ss[j];
            blk[i] = sl[j];
          }
        } else {
          for (let lx = lxStart, bx = bxStart; lx < lxEnd; lx++, bx++) {
            const i = row + lx;
            ids[i] = 0;
            meta[i] = 0;
            sky[i] = chunk.getSavedLightValue(0, bx, wy, bz);
            blk[i] = 0;
          }
        }
      }
    }
  }
}
