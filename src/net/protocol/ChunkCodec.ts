import { deflateSync, inflateSync } from 'fflate';
import type { TagCompound } from '../../item/ItemStack';
import { ProtocolError } from './PacketBuffer';

/**
 * Packet51MapChunk's data: which of the 16 sections are present, then per section the block ids
 * (one byte each) and metadata, sky light and block light (two values per byte, as the
 * original's NibbleArrays), then the 256 biome ids, deflated with fflate.
 */

export interface ChunkSectionData {
  /** Section index 0-15 (y >> 4). */
  index: number;
  blocks: Uint8Array;
  meta: Uint8Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
}

export interface ChunkData {
  sections: ChunkSectionData[];
  biomes: Uint8Array;
}

const SECTION_BYTES = 4096 + 2048 * 3;
/** The largest inflated chunk: every section present plus the mask and the biomes. */
const MAX_RAW = 2 + 16 * SECTION_BYTES + 256;

function packNibbles(src: Uint8Array, out: Uint8Array, off: number): void {
  for (let i = 0; i < 2048; i++) out[off + i] = (src[2 * i] & 15) | ((src[2 * i + 1] & 15) << 4);
}

function unpackNibbles(src: Uint8Array, off: number): Uint8Array {
  const out = new Uint8Array(4096);
  for (let i = 0; i < 2048; i++) {
    const b = src[off + i];
    out[2 * i] = b & 15;
    out[2 * i + 1] = b >> 4;
  }
  return out;
}

/** Packs and deflates a chunk's sections and biomes. */
export function encodeChunkData(d: ChunkData): Uint8Array {
  let mask = 0;
  for (const s of d.sections) mask |= 1 << s.index;
  const sorted = [...d.sections].sort((a, b) => a.index - b.index);
  const raw = new Uint8Array(2 + sorted.length * SECTION_BYTES + 256);
  raw[0] = mask >> 8;
  raw[1] = mask & 255;
  let off = 2;
  for (const s of sorted) {
    raw.set(s.blocks, off);
    off += 4096;
    packNibbles(s.meta, raw, off);
    off += 2048;
    packNibbles(s.skyLight, raw, off);
    off += 2048;
    packNibbles(s.blockLight, raw, off);
    off += 2048;
  }
  raw.set(d.biomes.subarray(0, 256), off);
  return deflateSync(raw, { level: 4 });
}

/** Inflates and unpacks chunk data; the size is checked before and after inflating. */
export function decodeChunkData(data: Uint8Array): ChunkData {
  let raw: Uint8Array;
  try {
    raw = inflateSync(data, { out: new Uint8Array(MAX_RAW + 1) });
  } catch {
    throw new ProtocolError('bad chunk data');
  }
  if (raw.length > MAX_RAW || raw.length < 2 + 256) throw new ProtocolError('bad chunk data size');
  const mask = (raw[0] << 8) | raw[1];
  let count = 0;
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) count++;
  if (raw.length !== 2 + count * SECTION_BYTES + 256) throw new ProtocolError('chunk data does not match its sections');
  const sections: ChunkSectionData[] = [];
  let off = 2;
  for (let i = 0; i < 16; i++) {
    if (!(mask & (1 << i))) continue;
    const blocks = raw.slice(off, off + 4096);
    off += 4096;
    const meta = unpackNibbles(raw, off);
    off += 2048;
    const skyLight = unpackNibbles(raw, off);
    off += 2048;
    const blockLight = unpackNibbles(raw, off);
    off += 2048;
    sections.push({ index: i, blocks, meta, skyLight, blockLight });
  }
  return { sections, biomes: raw.slice(off, off + 256) };
}

/**
 * What the guest learns of a tile entity (its description packet): everything but container
 * contents, which only travel in window packets.
 */
export function describeTileEntity(tag: TagCompound): TagCompound {
  const out: TagCompound = { ...tag };
  delete out.Items;
  return out;
}
