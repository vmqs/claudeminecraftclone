import { NBTError, gzipInflate, zlibInflate } from './NBT';

/**
 * Anvil region files (RegionFile, `region/r.<rx>.<rz>.mca`): 32x32 chunks, a 4 KiB table of
 * sector offsets (offset << 8 | sector count), a 4 KiB table of timestamps (seconds), then each
 * chunk in whole 4 KiB sectors as a big-endian length, a compression byte (1 gzip, 2 zlib) and
 * the compressed NBT. Chunks of 256 sectors or more cannot be stored (the original drops them).
 */

const SECTOR = 4096;

/** One chunk of a region: local coordinates 0..31, its zlib-compressed NBT and the save time. */
export interface RegionChunk {
  x: number;
  z: number;
  /** Zlib-compressed chunk NBT (compression type 2), as the original writes it. */
  data: Uint8Array;
  /** Seconds since the epoch. */
  timestamp: number;
}

/** Region coordinates and local index of a chunk. */
export function regionOf(cx: number, cz: number): { rx: number; rz: number; lx: number; lz: number } {
  return { rx: cx >> 5, rz: cz >> 5, lx: cx & 31, lz: cz & 31 };
}

export function regionFileName(rx: number, rz: number): string {
  return `r.${rx}.${rz}.mca`;
}

/** Parses "r.-1.2.mca" (null for other names). */
export function parseRegionFileName(name: string): { rx: number; rz: number } | null {
  const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(name);
  if (!m) return null;
  const rx = Number(m[1]);
  const rz = Number(m[2]);
  if (!Number.isSafeInteger(rx) || !Number.isSafeInteger(rz) || Math.abs(rx) > 1 << 20 || Math.abs(rz) > 1 << 20) return null;
  return { rx, rz };
}

/** Builds a region file the way RegionFile lays one out when its chunks are written in order. */
export function encodeRegion(chunks: RegionChunk[]): Uint8Array {
  const sorted = [...chunks].sort((a, b) => a.x + a.z * 32 - (b.x + b.z * 32));
  let sectors = 2;
  const placed: { c: RegionChunk; sector: number; count: number }[] = [];
  for (const c of sorted) {
    if (c.x < 0 || c.x > 31 || c.z < 0 || c.z > 31) continue;
    const count = Math.floor((c.data.length + 5) / SECTOR) + 1;
    if (count >= 256) continue;
    placed.push({ c, sector: sectors, count });
    sectors += count;
  }
  const out = new Uint8Array(sectors * SECTOR);
  const view = new DataView(out.buffer);
  for (const { c, sector, count } of placed) {
    const i = c.x + c.z * 32;
    view.setInt32(i * 4, (sector << 8) | count);
    view.setInt32(SECTOR + i * 4, c.timestamp | 0);
    const at = sector * SECTOR;
    view.setInt32(at, c.data.length + 1);
    out[at + 4] = 2;
    out.set(c.data, at + 5);
  }
  return out;
}

/**
 * Reads every chunk of a region file (RegionFile.getChunkDataInputStream for each slot) and
 * returns the decompressed NBT bytes. Slots pointing outside the file, with bad lengths or an
 * unknown compression are skipped, as the original returns no stream for them.
 */
export function decodeRegion(bytes: Uint8Array): { x: number; z: number; nbt: Uint8Array; timestamp: number }[] {
  if (bytes.length < 2 * SECTOR) {
    if (bytes.length === 0) return [];
    throw new NBTError('Region file is too short');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalSectors = Math.floor(bytes.length / SECTOR) + (bytes.length % SECTOR ? 1 : 0);
  const out: { x: number; z: number; nbt: Uint8Array; timestamp: number }[] = [];
  for (let i = 0; i < 1024; i++) {
    const off = view.getInt32(i * 4);
    if (off === 0) continue;
    const sector = off >>> 8;
    const count = off & 255;
    if (sector < 2 || sector + count > totalSectors) continue;
    const at = sector * SECTOR;
    if (at + 5 > bytes.length) continue;
    const len = view.getInt32(at);
    if (len <= 0 || len > SECTOR * count || at + 4 + len > bytes.length) continue;
    const kind = bytes[at + 4];
    const payload = bytes.subarray(at + 5, at + 4 + len);
    let nbt: Uint8Array;
    try {
      if (kind === 2) nbt = zlibInflate(payload);
      else if (kind === 1) nbt = gzipInflate(payload);
      else continue;
    } catch {
      // A damaged chunk is left out; the game regenerates it.
      continue;
    }
    out.push({ x: i & 31, z: i >> 5, nbt, timestamp: view.getInt32(SECTOR + i * 4) });
  }
  return out;
}
