/**
 * Bit-exact port of java.util.Random (48-bit LCG).
 *
 * The 48-bit seed is kept as two 24-bit halves so every intermediate product stays
 * below 2^53 and plain doubles are exact. BigInt is only used for the 64-bit
 * `nextLong`/`setSeed(bigint)` helpers, which world generation calls a few times
 * per chunk (never in hot paths).
 */
const TWO_24 = 16777216;
const MASK_24 = 0xffffff;
// 0x5DEECE66D split into 24-bit halves.
const MUL_HI = 0x5de;
const MUL_LO = 0xece66d;
const MASK_48 = (1n << 48n) - 1n;

let seedUniquifier = 8682522807148012n;

export class JavaRandom {
  private hi = 0;
  private lo = 0;
  private nextNextGaussian = 0;
  private haveNextNextGaussian = false;

  constructor(seed?: number | bigint) {
    if (seed === undefined) {
      seedUniquifier = BigInt.asIntN(64, seedUniquifier * 181783497276652981n);
      const t = BigInt(Math.floor(Math.random() * 2 ** 52)) ^ BigInt(Date.now()) * 1000003n;
      this.setSeed(seedUniquifier ^ t);
    } else {
      this.setSeed(seed);
    }
  }

  /** Accepts any integer (number must be a safe integer) or a 64-bit bigint. Only the low 48 bits matter. */
  setSeed(seed: number | bigint): void {
    let s: bigint;
    if (typeof seed === 'bigint') s = seed;
    else s = BigInt(Math.trunc(seed));
    s = (s ^ 0x5deece66dn) & MASK_48;
    this.hi = Number(s >> 24n);
    this.lo = Number(s & 0xffffffn);
    this.haveNextNextGaussian = false;
  }

  /** Fast path for seeds that fit in 32 bits (sign-extended like Java's int -> long). */
  setSeedInt(seed: number): void {
    seed |= 0;
    // Low 48 bits of the sign-extended long, XOR the multiplier.
    const lo24 = (seed & MASK_24) ^ MUL_LO;
    const hi24 = ((seed >> 24) & MASK_24) ^ MUL_HI; // arithmetic shift keeps the sign bits
    this.hi = hi24 & MASK_24;
    this.lo = lo24 & MASK_24;
    this.haveNextNextGaussian = false;
  }

  /**
   * setSeed for a 64-bit value given as signed 32-bit halves (only the low 48 bits matter);
   * world generation uses it to avoid BigInt in per-chunk seeding.
   */
  setSeedHiLo(hi: number, lo: number): void {
    const h = (hi ^ 0x5) & 0xffff;
    const l = (lo ^ 0xdeece66d) >>> 0;
    this.lo = l & MASK_24;
    this.hi = ((h << 8) | (l >>> 24)) & MASK_24;
    this.haveNextNextGaussian = false;
  }

  /** Returns the current internal 48-bit seed (for debugging / cloning). */
  getSeed48(): bigint {
    return (BigInt(this.hi) << 24n) | BigInt(this.lo);
  }

  protected next(bits: number): number {
    const p0 = this.lo * MUL_LO + 0xb;
    const carry = Math.floor(p0 / TWO_24);
    const newLo = p0 - carry * TWO_24;
    const p1 = this.hi * MUL_LO + this.lo * MUL_HI + carry;
    const newHi = p1 % TWO_24;
    this.hi = newHi;
    this.lo = newLo;
    // (int)(seed >>> (48 - bits))
    if (bits <= 24) {
      return Math.floor(newHi / 2 ** (24 - bits));
    }
    const shift = 48 - bits; // 16..23
    return (newHi * 2 ** (bits - 24) + Math.floor(newLo / 2 ** shift)) | 0;
  }

  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) {
      // power of two: (int)((bound * (long)next(31)) >> 31)
      const r = this.next(31);
      return Math.floor((r * bound) / 2147483648);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }

  /** java.util.Random.nextLong as a signed 64-bit bigint. */
  nextLong(): bigint {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32));
    return BigInt.asIntN(64, (hi << 32n) + lo);
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  nextFloat(): number {
    return this.next(24) / TWO_24;
  }

  nextDouble(): number {
    return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
  }

  nextGaussian(): number {
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    let v1: number;
    let v2: number;
    let s: number;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const multiplier = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextNextGaussian = v2 * multiplier;
    this.haveNextNextGaussian = true;
    return v1 * multiplier;
  }

  nextBytes(out: Uint8Array): void {
    for (let i = 0; i < out.length; ) {
      for (let rnd = this.nextInt(), n = Math.min(out.length - i, 4); n-- > 0; rnd >>= 8) {
        out[i++] = rnd & 0xff;
      }
    }
  }
}

/** Java `long` arithmetic helpers for the few places that need exact 64-bit math. */
export const JLong = {
  of(n: number | bigint): bigint {
    return BigInt.asIntN(64, typeof n === 'bigint' ? n : BigInt(Math.trunc(n)));
  },
  mul(a: bigint, b: bigint): bigint {
    return BigInt.asIntN(64, a * b);
  },
  add(a: bigint, b: bigint): bigint {
    return BigInt.asIntN(64, a + b);
  },
  /** Java's truncating long division. */
  div(a: bigint, b: bigint): bigint {
    return BigInt.asIntN(64, a / b);
  },
  xor(a: bigint, b: bigint): bigint {
    return BigInt.asIntN(64, a ^ b);
  },
};

/** Java String.hashCode, used for text seeds. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
