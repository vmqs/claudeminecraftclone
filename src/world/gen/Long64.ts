/**
 * Java `long` arithmetic on signed 32-bit halves for world-generation hot paths (seeding a
 * Random per chunk), where BigInt would be too slow. Results land in `Long64.hi` / `Long64.lo`.
 */
export const Long64 = {
  hi: 0,
  lo: 0,

  /** hi:lo = a * b (mod 2^64). */
  mul(ah: number, al: number, bh: number, bl: number): void {
    const a0 = al & 0xffff;
    const a1 = al >>> 16;
    const b0 = bl & 0xffff;
    const b1 = bl >>> 16;
    const p00 = a0 * b0;
    const mid = a0 * b1 + a1 * b0 + Math.floor(p00 / 65536);
    const lo = ((mid & 0xffff) << 16) | (p00 & 0xffff);
    const hi = a1 * b1 + Math.floor(mid / 65536);
    Long64.hi = (hi + Math.imul(ah, bl) + Math.imul(al, bh)) | 0;
    Long64.lo = lo;
  },

  /** hi:lo = a + b (mod 2^64). */
  add(ah: number, al: number, bh: number, bl: number): void {
    const lo = (al >>> 0) + (bl >>> 0);
    Long64.lo = lo | 0;
    Long64.hi = (ah + bh + (lo >= 4294967296 ? 1 : 0)) | 0;
  },

  /** Splits a 64-bit bigint into signed 32-bit [hi, lo]. */
  split(v: bigint): [number, number] {
    const b = BigInt.asIntN(64, v);
    return [Number(BigInt.asIntN(32, b >> 32n)), Number(BigInt.asIntN(32, b))];
  },

  /** Joins [hi, lo] into a signed 64-bit bigint. */
  join(hi: number, lo: number): bigint {
    return BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo >>> 0));
  },
};

/**
 * The (x * a) ^ (z * b) ^ seed chunk seeding of MapGenBase, ChunkProviderGenerate.populate and
 * friends, with a and b precomputed as halves. Writes the result into Long64.hi / lo.
 */
export function chunkSeedXor(x: number, z: number, aH: number, aL: number, bH: number, bL: number, sH: number, sL: number): void {
  Long64.mul(x >> 31, x | 0, aH, aL);
  const xh = Long64.hi;
  const xl = Long64.lo;
  Long64.mul(z >> 31, z | 0, bH, bL);
  Long64.hi = xh ^ Long64.hi ^ sH;
  Long64.lo = xl ^ Long64.lo ^ sL;
}
