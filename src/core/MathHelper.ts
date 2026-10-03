import type { JavaRandom } from './JavaRandom';

const f = Math.fround;

/** The original's 65536-entry float sine table. */
const SIN_TABLE = new Float32Array(65536);
for (let i = 0; i < 65536; i++) SIN_TABLE[i] = Math.sin((i * Math.PI * 2) / 65536);

const SIN_SCALE = f(10430.378);

/** Java (int) cast of a float/double: truncation toward zero, saturating at int range. */
function javaInt(v: number): number {
  if (v !== v) return 0;
  if (v >= 2147483647) return 2147483647;
  if (v <= -2147483648) return -2147483648;
  return v < 0 ? Math.ceil(v) : Math.floor(v);
}

export const MathHelper = {
  SIN_TABLE,

  sin(x: number): number {
    return SIN_TABLE[javaInt(f(f(x) * SIN_SCALE)) & 65535];
  },

  cos(x: number): number {
    return SIN_TABLE[javaInt(f(f(f(x) * SIN_SCALE) + 16384)) & 65535];
  },

  sqrt_float(x: number): number {
    return f(Math.sqrt(x));
  },

  sqrt_double(x: number): number {
    return f(Math.sqrt(x));
  },

  floor_float(x: number): number {
    const i = javaInt(x);
    return x < i ? i - 1 : i;
  },

  truncateDoubleToInt(x: number): number {
    return javaInt(x + 1024) - 1024;
  },

  floor_double(x: number): number {
    const i = javaInt(x);
    return x < i ? i - 1 : i;
  },

  /** floor() for values outside int range (returns a JS number). */
  floor_double_long(x: number): number {
    return Math.floor(x);
  },

  abs(x: number): number {
    return x >= 0 ? x : -x;
  },

  abs_int(x: number): number {
    return x >= 0 ? x : -x;
  },

  ceiling_float_int(x: number): number {
    const i = javaInt(x);
    return x > i ? i + 1 : i;
  },

  ceiling_double_int(x: number): number {
    const i = javaInt(x);
    return x > i ? i + 1 : i;
  },

  clamp_int(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
  },

  clamp_float(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
  },

  abs_max(a: number, b: number): number {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    return a > b ? a : b;
  },

  bucketInt(v: number, bucket: number): number {
    return v < 0 ? -(((-v - 1) / bucket) | 0) - 1 : (v / bucket) | 0;
  },

  getRandomIntegerInRange(rand: JavaRandom, min: number, max: number): number {
    return min >= max ? min : rand.nextInt(max - min + 1) + min;
  },

  getRandomDoubleInRange(rand: JavaRandom, min: number, max: number): number {
    return min >= max ? min : rand.nextDouble() * (max - min) + min;
  },

  wrapAngleTo180_float(a: number): number {
    a = f(a % 360);
    if (a >= 180) a -= 360;
    if (a < -180) a += 360;
    return f(a);
  },

  wrapAngleTo180_double(a: number): number {
    a %= 360;
    if (a >= 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  },

  parseIntWithDefault(s: string, def: number): number {
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) || String(n) !== s.trim() ? def : n;
  },

  parseIntWithDefaultAndMax(s: string, def: number, min: number): number {
    let n = MathHelper.parseIntWithDefault(s, def);
    if (n < min) n = min;
    return n;
  },

  javaInt,
};

export default MathHelper;
