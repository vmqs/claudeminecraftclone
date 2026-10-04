/**
 * The biome layer stack (GenLayer). Every layer is a pure function of absolute coordinates:
 * `getInts(x, z, w, h)` returns the w*h cell values of an area, asking its parent for a
 * (usually larger) area first. Randomness is a 64-bit LCG per cell (initChunkSeed + nextInt),
 * ported bit-exactly with 32-bit halves (no BigInt in the hot path).
 */

// 6364136223846793005 and 1442695040888963407 as (high, low) 32-bit halves.
const MUL_HI = 0x5851f42d | 0;
const MUL_LO = 0x4c957f2d | 0;
const ADD_HI = 0x14057b7e | 0;
const ADD_LO = 0xf767814f | 0;

/** Result registers of the 64-bit helpers (high and low halves, both int32). */
let rh = 0;
let rl = 0;

/** rh:rl = a * b (mod 2^64). */
function mul64(ah: number, al: number, bh: number, bl: number): void {
  const a0 = al & 0xffff;
  const a1 = al >>> 16;
  const b0 = bl & 0xffff;
  const b1 = bl >>> 16;
  const p00 = a0 * b0;
  const mid = a0 * b1 + a1 * b0 + Math.floor(p00 / 65536);
  const lo = ((mid & 0xffff) << 16) | (p00 & 0xffff);
  const hi = a1 * b1 + Math.floor(mid / 65536);
  rh = (hi + Math.imul(ah, bl) + Math.imul(al, bh)) | 0;
  rl = lo;
}

/** rh:rl = a + b (mod 2^64). */
function add64(ah: number, al: number, bh: number, bl: number): void {
  const lo = (al >>> 0) + (bl >>> 0);
  rl = lo | 0;
  rh = (ah + bh + (lo >= 4294967296 ? 1 : 0)) | 0;
}

/** rh:rl = s * (s * 6364136223846793005 + 1442695040888963407) + a. */
function lcgStep(sh: number, sl: number, ah: number, al: number): void {
  mul64(sh, sl, MUL_HI, MUL_LO);
  add64(rh, rl, ADD_HI, ADD_LO);
  mul64(sh, sl, rh, rl);
  add64(rh, rl, ah, al);
}

/** Splits a JS integer (|v| < 2^53) or bigint into 32-bit halves of its 64-bit two's complement. */
export function splitLong(v: number | bigint): [number, number] {
  const b = BigInt.asIntN(64, typeof v === 'bigint' ? v : BigInt(v));
  return [Number(BigInt.asIntN(32, b >> 32n)), Number(BigInt.asIntN(32, b))];
}

export abstract class GenLayer {
  private worldGenSeedHi = 0;
  private worldGenSeedLo = 0;
  private chunkSeedHi = 0;
  private chunkSeedLo = 0;
  private readonly baseSeedHi: number;
  private readonly baseSeedLo: number;
  protected parent: GenLayer | null = null;

  constructor(baseSeed: number) {
    const [h, l] = splitLong(baseSeed);
    let sh = h;
    let sl = l;
    for (let i = 0; i < 3; i++) {
      lcgStep(sh, sl, h, l);
      sh = rh;
      sl = rl;
    }
    this.baseSeedHi = sh;
    this.baseSeedLo = sl;
  }

  /** initWorldGenSeed: mixes the world seed into this layer and its parents. */
  initWorldGenSeed(seed: bigint): void {
    this.parent?.initWorldGenSeed(seed);
    const [h, l] = splitLong(seed);
    let sh = h;
    let sl = l;
    for (let i = 0; i < 3; i++) {
      lcgStep(sh, sl, this.baseSeedHi, this.baseSeedLo);
      sh = rh;
      sl = rl;
    }
    this.worldGenSeedHi = sh;
    this.worldGenSeedLo = sl;
  }

  /** initChunkSeed: the per-cell random state for absolute cell (x, z). */
  protected initChunkSeed(x: number, z: number): void {
    const xh = x >> 31;
    const zh = z >> 31;
    lcgStep(this.worldGenSeedHi, this.worldGenSeedLo, xh, x | 0);
    lcgStep(rh, rl, zh, z | 0);
    lcgStep(rh, rl, xh, x | 0);
    lcgStep(rh, rl, zh, z | 0);
    this.chunkSeedHi = rh;
    this.chunkSeedLo = rl;
  }

  /** nextInt: (chunkSeed >> 24) mod bound (non-negative), then advance the state. */
  protected nextInt(bound: number): number {
    const v = this.chunkSeedHi * 256 + (this.chunkSeedLo >>> 24);
    let r = v % bound;
    if (r < 0) r += bound;
    lcgStep(this.chunkSeedHi, this.chunkSeedLo, this.worldGenSeedHi, this.worldGenSeedLo);
    this.chunkSeedHi = rh;
    this.chunkSeedLo = rl;
    return r;
  }

  abstract getInts(x: number, z: number, w: number, h: number): Int32Array;

  setParent(parent: GenLayer): void {
    this.parent = parent;
  }
}

const TILE = 16;
const TILE_LIMIT = 4096;

/**
 * A cache in front of a layer: areas are assembled from 16x16-cell tiles computed once. The
 * layers are pure functions of position, so this changes speed, not results.
 */
export class GenLayerCache extends GenLayer {
  private readonly tiles = new Map<number, Int32Array>();

  constructor(private readonly inner: GenLayer) {
    super(0);
  }

  override initWorldGenSeed(seed: bigint): void {
    this.inner.initWorldGenSeed(seed);
    this.tiles.clear();
  }

  private tile(tx: number, tz: number): Int32Array {
    const k = (tx + 0x100000) * 0x200000 + (tz + 0x100000);
    let t = this.tiles.get(k);
    if (t) return t;
    t = this.inner.getInts(tx * TILE, tz * TILE, TILE, TILE);
    this.tiles.set(k, t);
    if (this.tiles.size > TILE_LIMIT) this.tiles.delete(this.tiles.keys().next().value!);
    return t;
  }

  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const out = new Int32Array(w * h);
    const tx0 = Math.floor(x / TILE);
    const tz0 = Math.floor(z / TILE);
    const tx1 = Math.floor((x + w - 1) / TILE);
    const tz1 = Math.floor((z + h - 1) / TILE);
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tile(tx, tz);
        const ax = Math.max(x, tx * TILE);
        const bx = Math.min(x + w, tx * TILE + TILE);
        const az = Math.max(z, tz * TILE);
        const bz = Math.min(z + h, tz * TILE + TILE);
        for (let zz = az; zz < bz; zz++) {
          const src = (zz - tz * TILE) * TILE + (ax - tx * TILE);
          out.set(t.subarray(src, src + (bx - ax)), (zz - z) * w + (ax - x));
        }
      }
    }
    return out;
  }
}

/** BigInt reference of the LCG, for checks (not used by generation). */
export const GenLayerReference = {
  step(s: bigint, a: bigint): bigint {
    return BigInt.asIntN(64, s * BigInt.asIntN(64, s * 6364136223846793005n + 1442695040888963407n) + a);
  },
  fast(s: bigint, a: bigint): bigint {
    const [sh, sl] = splitLong(s);
    const [ah, al] = splitLong(a);
    lcgStep(sh, sl, ah, al);
    return BigInt.asIntN(64, (BigInt(rh) << 32n) | BigInt(rl >>> 0));
  },
};
