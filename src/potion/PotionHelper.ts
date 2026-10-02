import { Potion } from './Potion';
import { PotionEffect } from './PotionEffect';

const f = Math.fround;

/** Java's Math.round(double) cast to int. */
function javaRound(v: number): number {
  return Math.floor(v + 0.5) | 0;
}

/**
 * PotionHelper: the brewing bit language of 1.5.2. A potion's damage value is a 15-bit field;
 * `potionRequirements` say which bit patterns produce which effect (and how strongly),
 * `potionAmplifiers` which bits raise the level. Ingredients rewrite the bits with
 * `applyIngredient` (their strings are the `*Effect` constants below).
 */
export const PotionHelper = {
  sugarEffect: '-0+1-2-3&4-4+13',
  ghastTearEffect: '+0-1-2-3&4-4+13',
  spiderEyeEffect: '-0-1+2-3&4-4+13',
  fermentedSpiderEyeEffect: '-0+3-4+13',
  speckledMelonEffect: '+0-1+2-3&4-4+13',
  blazePowderEffect: '+0-1-2+3&4-4+13',
  magmaCreamEffect: '+0+1-2-3&4-4+13',
  redstoneEffect: '-5+6-7',
  glowstoneEffect: '+5-6-7',
  gunpowderEffect: '+14&13-13',
  goldenCarrotEffect: '-0+1+2-3+13&4-4',
  /** Nether wart (set on the item itself in Item's static block). */
  netherWartEffect: '+4',

  checkFlag(damage: number, bit: number): boolean {
    return (damage & (1 << bit)) !== 0;
  },

  /** func_77909_a: the 5-bit index into the prefix names (bits 5,4,3,2,1). */
  getPrefixIndex(damage: number): number {
    return PotionHelper.packBits(damage, 5, 4, 3, 2, 1);
  },

  /** func_77908_a */
  packBits(d: number, a: number, b: number, c: number, e: number, g: number): number {
    const k = PotionHelper.checkFlag;
    return (k(d, a) ? 16 : 0) | (k(d, b) ? 8 : 0) | (k(d, c) ? 4 : 0) | (k(d, e) ? 2 : 0) | (k(d, g) ? 1 : 0);
  },

  /** The bottle colour of a set of effects (amplifiers count once per level); water blue when empty. */
  calcPotionLiquidColor(effects: readonly PotionEffect[] | null): number {
    if (!effects || effects.length === 0) return 3694022;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const e of effects) {
      const c = Potion.potionTypes[e.getPotionID()]!.getLiquidColor();
      for (let i = 0; i <= e.getAmplifier(); i++) {
        r = f(r + f(((c >> 16) & 255) / 255));
        g = f(g + f(((c >> 8) & 255) / 255));
        b = f(b + f((c & 255) / 255));
        n = f(n + 1);
      }
    }
    r = f(f(r / n) * 255);
    g = f(f(g / n) * 255);
    b = f(f(b / n) * 255);
    return (Math.trunc(r) << 16) | (Math.trunc(g) << 8) | Math.trunc(b);
  },

  /** func_82817_b: true when every effect is ambient (beacon). */
  areAllAmbient(effects: readonly PotionEffect[]): boolean {
    return effects.every((e) => e.getIsAmbient());
  },

  /** func_77915_a: the liquid colour of a damage value (cached unless usable effects are included). */
  getLiquidColor(damage: number, includeUsable: boolean): number {
    if (includeUsable) return PotionHelper.calcPotionLiquidColor(PotionHelper.getPotionEffects(damage, true));
    let c = colorCache.get(damage);
    if (c === undefined) {
      c = PotionHelper.calcPotionLiquidColor(PotionHelper.getPotionEffects(damage, false));
      colorCache.set(damage, c);
    }
    return c;
  },

  /** func_77905_c: the lang key of the prefix of an effect-less potion ("potion.prefix.awkward"...). */
  getPotionPrefix(damage: number): string {
    return potionPrefixes[PotionHelper.getPrefixIndex(damage)];
  },

  /** The effects a damage value brews into, or null when there are none. */
  getPotionEffects(damage: number, includeUsable: boolean): PotionEffect[] | null {
    let out: PotionEffect[] | null = null;
    for (const potion of Potion.potionTypes) {
      if (!potion || (potion.isUsable() && !includeUsable)) continue;
      const req = potionRequirements.get(potion.getId());
      if (req === undefined) continue;
      let v = parsePotionEffects(req, 0, req.length, damage);
      if (v <= 0) continue;
      let amp = 0;
      const ampStr = potionAmplifiers.get(potion.getId());
      if (ampStr !== undefined) {
        amp = parsePotionEffects(ampStr, 0, ampStr.length, damage);
        if (amp < 0) amp = 0;
      }
      if (potion.isInstant()) {
        v = 1;
      } else {
        v = 1200 * (v * 3 + (v - 1) * 2);
        v >>= amp;
        v = javaRound(v * potion.getEffectiveness());
        if ((damage & 16384) !== 0) v = javaRound(v * 0.75 + 0.5);
      }
      out ??= [];
      const e = new PotionEffect(potion.getId(), v, amp);
      if ((damage & 16384) !== 0) e.setSplashPotion(true);
      out.push(e);
    }
    return out;
  },

  /** Rewrites the damage bits with an ingredient's effect string (brewing stand). */
  applyIngredient(damage: number, effect: string): number {
    let hasNum = false;
    let toggle = false;
    let clear = false;
    let require = false;
    let bit = 0;
    for (let i = 0; i < effect.length; i++) {
      const ch = effect.charAt(i);
      if (ch >= '0' && ch <= '9') {
        bit = bit * 10 + (ch.charCodeAt(0) - 48);
        hasNum = true;
        continue;
      }
      if (ch === '!' || ch === '-' || ch === '+' || ch === '&') {
        if (hasNum) {
          damage = brewBitOperations(damage, bit, clear, toggle, require);
          require = toggle = clear = hasNum = false;
          bit = 0;
        }
        if (ch === '!') toggle = true;
        else if (ch === '-') clear = true;
        else if (ch === '&') require = true;
      }
    }
    if (hasNum) damage = brewBitOperations(damage, bit, clear, toggle, require);
    return damage & 32767;
  },
};

const colorCache = new Map<number, number>();

const potionPrefixes = [
  'potion.prefix.mundane',
  'potion.prefix.uninteresting',
  'potion.prefix.bland',
  'potion.prefix.clear',
  'potion.prefix.milky',
  'potion.prefix.diffuse',
  'potion.prefix.artless',
  'potion.prefix.thin',
  'potion.prefix.awkward',
  'potion.prefix.flat',
  'potion.prefix.bulky',
  'potion.prefix.bungling',
  'potion.prefix.buttered',
  'potion.prefix.smooth',
  'potion.prefix.suave',
  'potion.prefix.debonair',
  'potion.prefix.thick',
  'potion.prefix.elegant',
  'potion.prefix.fancy',
  'potion.prefix.charming',
  'potion.prefix.dashing',
  'potion.prefix.refined',
  'potion.prefix.cordial',
  'potion.prefix.sparkling',
  'potion.prefix.potent',
  'potion.prefix.foul',
  'potion.prefix.odorless',
  'potion.prefix.rank',
  'potion.prefix.harsh',
  'potion.prefix.acrid',
  'potion.prefix.gross',
  'potion.prefix.stinky',
];

/** Which bits give an effect; the value of the expression scales its duration. */
const potionRequirements = new Map<number, string>([
  [Potion.regeneration.getId(), '0 & !1 & !2 & !3 & 0+6'],
  [Potion.moveSpeed.getId(), '!0 & 1 & !2 & !3 & 1+6'],
  [Potion.fireResistance.getId(), '0 & 1 & !2 & !3 & 0+6'],
  [Potion.heal.getId(), '0 & !1 & 2 & !3'],
  [Potion.poison.getId(), '!0 & !1 & 2 & !3 & 2+6'],
  [Potion.weakness.getId(), '!0 & !1 & !2 & 3 & 3+6'],
  [Potion.harm.getId(), '!0 & !1 & 2 & 3'],
  [Potion.moveSlowdown.getId(), '!0 & 1 & !2 & 3 & 3+6'],
  [Potion.damageBoost.getId(), '0 & !1 & !2 & 3 & 3+6'],
  [Potion.nightVision.getId(), '!0 & 1 & 2 & !3 & 2+6'],
  [Potion.invisibility.getId(), '!0 & 1 & 2 & 3 & 2+6'],
]);

/** Which bits raise the amplifier (level II). */
const potionAmplifiers = new Map<number, string>([
  [Potion.moveSpeed.getId(), '5'],
  [Potion.digSpeed.getId(), '5'],
  [Potion.damageBoost.getId(), '5'],
  [Potion.regeneration.getId(), '5'],
  [Potion.harm.getId(), '5'],
  [Potion.heal.getId(), '5'],
  [Potion.resistance.getId(), '5'],
  [Potion.poison.getId(), '5'],
]);

function countSetFlags(v: number): number {
  let n = 0;
  for (; v > 0; n++) v &= v - 1;
  return n;
}

/** One term of a requirement: a (negated / compared / multiplied / subtracted) bit test. */
function evalTerm(not: boolean, hasMul: boolean, negative: boolean, compare: number, bit: number, mul: number, damage: number): number {
  let r = 0;
  if (not) {
    r = PotionHelper.checkFlag(damage, bit) ? 0 : 1;
  } else if (compare !== -1) {
    const n = countSetFlags(damage);
    if ((compare === 0 && n === bit) || (compare === 1 && n > bit) || (compare === 2 && n < bit)) r = 1;
  } else {
    r = PotionHelper.checkFlag(damage, bit) ? 1 : 0;
  }
  if (hasMul) r *= mul;
  if (negative) r *= -1;
  return r;
}

/**
 * Evaluates a requirement string over [start, end): '|' is or (first positive side), '&' is
 * and (0 unless both sides are positive, else the larger), terms are summed.
 */
function parsePotionEffects(s: string, start: number, end: number, damage: number): number {
  if (!(start < s.length && end >= 0 && start < end)) return 0;
  const or = s.indexOf('|', start);
  if (or >= 0 && or < end) {
    const a = parsePotionEffects(s, start, or - 1, damage);
    if (a > 0) return a;
    const b = parsePotionEffects(s, or + 1, end, damage);
    return b > 0 ? b : 0;
  }
  const and = s.indexOf('&', start);
  if (and >= 0 && and < end) {
    const a = parsePotionEffects(s, start, and - 1, damage);
    if (a <= 0) return 0;
    const b = parsePotionEffects(s, and + 1, end, damage);
    if (b <= 0) return 0;
    return a > b ? a : b;
  }
  let inMul = false;
  let hasMul = false;
  let hasNum = false;
  let not = false;
  let negative = false;
  let compare = -1;
  let bit = 0;
  let mul = 0;
  let total = 0;
  const flush = () => {
    total += evalTerm(not, hasMul, negative, compare, bit, mul, damage);
    not = negative = inMul = hasMul = hasNum = false;
    mul = bit = 0;
    compare = -1;
  };
  for (let i = start; i < end; i++) {
    const ch = s.charAt(i);
    if (ch >= '0' && ch <= '9') {
      if (inMul) {
        mul = ch.charCodeAt(0) - 48;
        hasMul = true;
      } else {
        bit = bit * 10 + (ch.charCodeAt(0) - 48);
        hasNum = true;
      }
    } else if (ch === '*') {
      inMul = true;
    } else if (ch === '!') {
      if (hasNum) flush();
      not = true;
    } else if (ch === '-') {
      if (hasNum) flush();
      negative = true;
    } else if (ch === '=' || ch === '<' || ch === '>') {
      if (hasNum) flush();
      compare = ch === '=' ? 0 : ch === '<' ? 2 : 1;
    } else if (ch === '+' && hasNum) {
      flush();
    }
  }
  if (hasNum) total += evalTerm(not, hasMul, negative, compare, bit, mul, damage);
  return total;
}

/** One ingredient operation on a bit: require it (else 0), clear, toggle or set. */
function brewBitOperations(d: number, bit: number, clear: boolean, toggle: boolean, require: boolean): number {
  if (require) {
    if (!PotionHelper.checkFlag(d, bit)) return 0;
  } else if (clear) {
    d &= ~(1 << bit);
  } else if (toggle) {
    d ^= 1 << bit;
  } else {
    d |= 1 << bit;
  }
  return d;
}
