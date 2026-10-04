import { Chunk, type ChunkHost } from '../Chunk';
import { ChunkSection } from '../ChunkSection';
import type { GeneratedChunk } from './ChunkProviderGenerate';

/**
 * Raw terrain of one chunk in section layout (`y << 8 | z << 4 | x`, 16 sections, null where
 * empty), as the terrain worker sends it: the generator's column layout converted once, off the
 * populating thread.
 */
export interface TerrainChunk {
  cx: number;
  cz: number;
  blocks: (Uint8Array | null)[];
  /** Section metadata; null for an all-zero section or when the generator writes none. */
  meta: (Uint8Array | null)[];
  biomes: Uint8Array;
}

/** Converts a generator's column-major chunk (x << 11 | z << 7 | y, or 256-high) into sections. */
export function toTerrainChunk(cx: number, cz: number, gen: GeneratedChunk): TerrainChunk {
  const src = gen.blocks;
  const meta = gen.meta;
  const height = gen.height ?? 128;
  const xs = height === 256 ? 12 : 11;
  const zs = height === 256 ? 8 : 7;
  const blocks: (Uint8Array | null)[] = [];
  const metas: (Uint8Array | null)[] = [];
  for (let sy = 0; sy < 16; sy++) {
    blocks.push(null);
    metas.push(null);
  }
  for (let sy = 0; sy < height >> 4; sy++) {
    let b: Uint8Array | null = null;
    let m: Uint8Array | null = null;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const base = (x << xs) | (z << zs) | (sy << 4);
        const dst = (z << 4) | x;
        for (let y = 0; y < 16; y++) {
          const id = src[base + y];
          if (id === 0) continue;
          if (!b) b = new Uint8Array(4096);
          b[(y << 8) | dst] = id;
          if (meta && meta[base + y] !== 0) {
            if (!m) m = new Uint8Array(4096);
            m[(y << 8) | dst] = meta[base + y] & 15;
          }
        }
      }
    }
    blocks[sy] = b;
    metas[sy] = b ? m : null;
  }
  return { cx, cz, blocks, meta: metas, biomes: gen.biomes };
}

/** The buffers of a terrain chunk, for postMessage transfer. */
export function terrainTransferables(t: TerrainChunk): Transferable[] {
  const out: Transferable[] = [t.biomes.buffer];
  for (const b of t.blocks) if (b) out.push(b.buffer);
  for (const m of t.meta) if (m) out.push(m.buffer);
  return out;
}

/** A Chunk holding the terrain, with its column sky light (Chunk.generateSkylightMap). */
export function chunkFromTerrain(host: ChunkHost, t: TerrainChunk): Chunk {
  const c = new Chunk(host, t.cx, t.cz);
  for (let sy = 0; sy < 16; sy++) {
    const b = t.blocks[sy];
    if (!b) continue;
    c.sections[sy] = new ChunkSection(sy << 4, { blocks: b, meta: t.meta[sy] ?? new Uint8Array(4096), skyLight: new Uint8Array(4096), blockLight: new Uint8Array(4096) });
  }
  c.biomes.set(t.biomes);
  c.generateSkylightMap();
  return c;
}
