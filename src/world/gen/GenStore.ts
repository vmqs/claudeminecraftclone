import type { TagCompound } from '../../item/ItemStack';
import { Chunk, type ChunkHost } from '../Chunk';
import { ChunkSection } from '../ChunkSection';
import type { EntitySpawnDescriptor } from './WorldGenSpawning';

/**
 * Generated chunks moved out of the worker's working set, kept compressed (the original saves
 * them to the region files and never generates a chunk twice). Only blocks, metadata, biomes,
 * generated tile entities, pending ticks and entity descriptors are kept; light is recomputed
 * when the chunk is finalized.
 */
interface StoredChunk {
  sections: { y: number; data: Uint8Array }[];
  biomes: Uint8Array;
  tiles: TagCompound[];
  pendingTicks: number[][];
  pendingSpawns: EntitySpawnDescriptor[];
}

let scratch = new Uint8Array(65536);

/** Run-length encodes `src` as (count, value) byte pairs. */
export function rleEncode(src: Uint8Array): Uint8Array {
  if (scratch.length < src.length * 2) scratch = new Uint8Array(src.length * 2);
  let o = 0;
  let i = 0;
  while (i < src.length) {
    const v = src[i];
    let n = 1;
    while (i + n < src.length && src[i + n] === v && n < 255) n++;
    scratch[o++] = n;
    scratch[o++] = v;
    i += n;
  }
  return scratch.slice(0, o);
}

export function rleDecode(src: Uint8Array, out: Uint8Array): void {
  let o = 0;
  for (let i = 0; i < src.length; i += 2) {
    out.fill(src[i + 1], o, o + src[i]);
    o += src[i];
  }
}

export class GenStore {
  private readonly chunks = new Map<number, StoredChunk>();
  private bytes = 0;

  get size(): number {
    return this.chunks.size;
  }

  get storedBytes(): number {
    return this.bytes;
  }

  has(key: number): boolean {
    return this.chunks.has(key);
  }

  /** Compresses a chunk (and its generated tile-entity tags) into the store. */
  put(key: number, c: Chunk, tiles: Map<number, TagCompound> | undefined): void {
    const sections: StoredChunk['sections'] = [];
    const buf = new Uint8Array(8192);
    for (const s of c.sections) {
      if (!s || s.isEmpty()) continue;
      buf.set(s.blocks, 0);
      buf.set(s.meta, 4096);
      const data = rleEncode(buf);
      sections.push({ y: s.yBase, data });
      this.bytes += data.length;
    }
    const tags: TagCompound[] = tiles ? [...tiles.values()] : [];
    for (const te of c.chunkTileEntityMap.values()) {
      if (te.isInvalid()) continue;
      const k = Chunk.teKey(te.xCoord & 15, te.yCoord, te.zCoord & 15);
      if (tiles?.has(k)) continue;
      const t: TagCompound = {};
      te.writeToNBT(t);
      tags.push(t);
    }
    this.chunks.set(key, { sections, biomes: c.biomes.slice(), tiles: tags, pendingTicks: c.pendingTicks, pendingSpawns: c.pendingSpawns });
  }

  /** Rebuilds a stored chunk (removing it from the store); tile entities come back as tags. */
  take(key: number, host: ChunkHost, cx: number, cz: number): { chunk: Chunk; tiles: TagCompound[] } | null {
    const s = this.chunks.get(key);
    if (!s) return null;
    this.chunks.delete(key);
    const c = new Chunk(host, cx, cz);
    const buf = new Uint8Array(8192);
    for (const sec of s.sections) {
      this.bytes -= sec.data.length;
      rleDecode(sec.data, buf);
      const cs = new ChunkSection(sec.y);
      cs.blocks.set(buf.subarray(0, 4096));
      cs.meta.set(buf.subarray(4096));
      cs.recount();
      c.sections[sec.y >> 4] = cs;
    }
    c.biomes.set(s.biomes);
    c.pendingTicks = s.pendingTicks;
    c.pendingSpawns = s.pendingSpawns;
    c.generateSkylightMap();
    return { chunk: c, tiles: s.tiles };
  }
}
