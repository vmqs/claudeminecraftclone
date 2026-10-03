import { JavaRandom } from '../core/JavaRandom';
import { WeightedRandom } from '../core/WeightedRandom';
import type { DamageSource } from '../entity/DamageSource';
import type { EntityLiving } from '../entity/EntityLiving';
import type { ItemStack, TagCompound } from '../item/ItemStack';
import { Enchantment, type EnchantmentTag } from './Enchantment';

const f = Math.fround;
const BOOK_ID = 340;
const ENCHANTED_BOOK_ID = 403;

/** An enchantment with a level (EnchantmentData); its weight is the enchantment's. */
export class EnchantmentData {
  readonly itemWeight: number;
  constructor(
    readonly enchantmentobj: Enchantment,
    readonly enchantmentLevel: number,
  ) {
    this.itemWeight = enchantmentobj.getWeight();
  }
  static of(id: number, level: number): EnchantmentData {
    return new EnchantmentData(Enchantment.enchantmentsList[id]!, level);
  }
}

const enchantmentRand = new JavaRandom();

function tagList(stack: ItemStack | null): EnchantmentTag[] | null {
  return stack ? stack.getEnchantmentTagList() : null;
}

/** The "StoredEnchantments" list of an enchanted book (ItemEnchantedBook.func_92110_g). */
export function getStoredEnchantments(stack: ItemStack): EnchantmentTag[] {
  const l = stack.stackTagCompound?.StoredEnchantments;
  return Array.isArray(l) ? (l as EnchantmentTag[]) : [];
}

/** Adds (or raises) a stored enchantment on a book (ItemEnchantedBook.func_92115_a). */
export function addStoredEnchantment(stack: ItemStack, data: EnchantmentData): void {
  const list = getStoredEnchantments(stack).slice();
  let add = true;
  for (const t of list) {
    if (t.id === data.enchantmentobj.effectId) {
      if (t.lvl < data.enchantmentLevel) t.lvl = data.enchantmentLevel;
      add = false;
      break;
    }
  }
  if (add) list.push({ id: data.enchantmentobj.effectId, lvl: data.enchantmentLevel });
  stack.stackTagCompound ??= {};
  stack.stackTagCompound.StoredEnchantments = list;
}

/** The iteration order of a java.util.HashMap with small Integer keys (bucket order, then insertion). */
function javaHashMapOrder<V>(entries: [number, V][]): [number, V][] {
  let cap = 16;
  while (entries.length > cap * 0.75) cap *= 2;
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e[0] & (cap - 1)) - (b.e[0] & (cap - 1)) || a.i - b.i)
    .map((x) => x.e);
}

/** EnchantmentHelper: reading enchantment levels off stacks and the random enchanting rolls. */
export const EnchantmentHelper = {
  getEnchantmentLevel(id: number, stack: ItemStack | null): number {
    const list = tagList(stack);
    if (!list) return 0;
    for (const t of list) if (t.id === id) return t.lvl;
    return 0;
  },

  /** id -> level, in list order; enchanted books report their stored enchantments. */
  getEnchantments(stack: ItemStack): Map<number, number> {
    const out = new Map<number, number>();
    const list = stack.itemID === ENCHANTED_BOOK_ID ? getStoredEnchantments(stack) : stack.getEnchantmentTagList();
    if (list) for (const t of list) out.set(t.id, t.lvl);
    return out;
  },

  setEnchantments(map: Map<number, number>, stack: ItemStack): void {
    const list: EnchantmentTag[] = [];
    for (const [id, lvl] of map) {
      list.push({ id, lvl });
      if (stack.itemID === ENCHANTED_BOOK_ID) addStoredEnchantment(stack, EnchantmentData.of(id, lvl));
    }
    if (list.length > 0) {
      if (stack.itemID !== ENCHANTED_BOOK_ID) {
        stack.stackTagCompound ??= {};
        stack.stackTagCompound.ench = list;
      }
    } else if (stack.stackTagCompound) {
      delete (stack.stackTagCompound as TagCompound).ench;
    }
  },

  getMaxEnchantmentLevel(id: number, stacks: readonly (ItemStack | null)[] | null): number {
    if (!stacks) return 0;
    let best = 0;
    for (const s of stacks) {
      const l = EnchantmentHelper.getEnchantmentLevel(id, s);
      if (l > best) best = l;
    }
    return best;
  },

  /** Protection points of the worn armour against `src` (capped at 25, then randomised). */
  getEnchantmentModifierDamage(stacks: readonly (ItemStack | null)[], src: DamageSource): number {
    let mod = 0;
    for (const s of stacks) {
      for (const t of tagList(s) ?? []) {
        const e = Enchantment.enchantmentsList[t.id];
        if (e) mod += e.calcModifierDamage(t.lvl, src);
      }
    }
    if (mod > 25) mod = 25;
    return ((mod + 1) >> 1) + enchantmentRand.nextInt((mod >> 1) + 1);
  },

  /** Extra melee damage of the attacker's held item against `target`. */
  getEnchantmentModifierLiving(attacker: EntityLiving, target: EntityLiving): number {
    let mod = 0;
    for (const t of tagList(attacker.getHeldItem()) ?? []) {
      const e = Enchantment.enchantmentsList[t.id];
      if (e) mod += e.calcModifierLiving(t.lvl, target);
    }
    return mod > 0 ? 1 + enchantmentRand.nextInt(mod) : 0;
  },

  getKnockbackModifier(attacker: EntityLiving, _target: EntityLiving): number {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.knockback.effectId, attacker.getHeldItem());
  },
  getFireAspectModifier(e: EntityLiving): number {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.fireAspect.effectId, e.getHeldItem());
  },
  getRespiration(e: EntityLiving): number {
    return EnchantmentHelper.getMaxEnchantmentLevel(Enchantment.respiration.effectId, e.getLastActiveItems());
  },
  getEfficiencyModifier(e: EntityLiving): number {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.efficiency.effectId, e.getHeldItem());
  },
  getSilkTouchModifier(e: EntityLiving): boolean {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.silkTouch.effectId, e.getHeldItem()) > 0;
  },
  getFortuneModifier(e: EntityLiving): number {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.fortune.effectId, e.getHeldItem());
  },
  getLootingModifier(e: EntityLiving): number {
    return EnchantmentHelper.getEnchantmentLevel(Enchantment.looting.effectId, e.getHeldItem());
  },
  getAquaAffinityModifier(e: EntityLiving): boolean {
    return EnchantmentHelper.getMaxEnchantmentLevel(Enchantment.aquaAffinity.effectId, e.getLastActiveItems()) > 0;
  },
  /** func_92098_i: the best thorns level worn. */
  getThornsModifier(e: EntityLiving): number {
    return EnchantmentHelper.getMaxEnchantmentLevel(Enchantment.thorns.effectId, e.getLastActiveItems());
  },
  /** func_92099_a: the first worn/held stack carrying `ench`. */
  getEnchantedItem(ench: Enchantment, e: EntityLiving): ItemStack | null {
    for (const s of e.getLastActiveItems()) if (s && EnchantmentHelper.getEnchantmentLevel(ench.effectId, s) > 0) return s;
    return null;
  },

  /** The enchantment level offered in slot `slot` of an enchanting table with `bookshelves`. */
  calcItemStackEnchantability(rand: JavaRandom, slot: number, bookshelves: number, stack: ItemStack): number {
    const ench = stack.getItem().getItemEnchantability();
    if (ench <= 0) return 0;
    if (bookshelves > 15) bookshelves = 15;
    const v = rand.nextInt(8) + 1 + (bookshelves >> 1) + rand.nextInt(bookshelves + 1);
    if (slot === 0) return Math.max(Math.trunc(v / 3), 1);
    return slot === 1 ? Math.trunc((v * 2) / 3) + 1 : Math.max(v, bookshelves * 2);
  },

  /** Enchants `stack` for `level` (a book becomes an enchanted book). */
  addRandomEnchantment(rand: JavaRandom, stack: ItemStack, level: number): ItemStack {
    const list = EnchantmentHelper.buildEnchantmentList(rand, stack, level);
    const isBook = stack.itemID === BOOK_ID;
    if (isBook) stack.itemID = ENCHANTED_BOOK_ID;
    if (list) {
      for (const d of list) {
        if (isBook) addStoredEnchantment(stack, d);
        else stack.addEnchantment(d.enchantmentobj, d.enchantmentLevel);
      }
    }
    return stack;
  },

  buildEnchantmentList(rand: JavaRandom, stack: ItemStack, level: number): EnchantmentData[] | null {
    let ench = stack.getItem().getItemEnchantability();
    if (ench <= 0) return null;
    ench = Math.trunc(ench / 2);
    ench = 1 + rand.nextInt((ench >> 1) + 1) + rand.nextInt((ench >> 1) + 1);
    const total = ench + level;
    const spread = f(f(f(rand.nextFloat() + rand.nextFloat()) - 1) * f(0.15));
    let modified = Math.trunc(f(f(total * f(1 + spread)) + f(0.5)));
    if (modified < 1) modified = 1;
    let out: EnchantmentData[] | null = null;
    const map = EnchantmentHelper.mapEnchantmentData(modified, stack);
    if (map && map.size > 0) {
      const first = WeightedRandom.getRandomItem(rand, [...map.values()]);
      if (first) {
        out = [first];
        for (let k = modified; rand.nextInt(50) <= k; k >>= 1) {
          for (const id of [...map.keys()]) {
            const ok = out.every((d) => d.enchantmentobj.canApplyTogether(Enchantment.enchantmentsList[id]!));
            if (!ok) map.delete(id);
          }
          if (map.size > 0) out.push(WeightedRandom.getRandomItem(rand, [...map.values()])!);
        }
      }
    }
    return out;
  },

  /** Every enchantment (at its best fitting level) available at enchantability `level`, in HashMap order. */
  mapEnchantmentData(level: number, stack: ItemStack): Map<number, EnchantmentData> | null {
    const item = stack.getItem();
    const isBook = stack.itemID === BOOK_ID;
    const found = new Map<number, EnchantmentData>();
    for (const e of Enchantment.enchantmentsList) {
      if (!e || !(e.type.canEnchantItem(item) || isBook)) continue;
      for (let l = e.getMinLevel(); l <= e.getMaxLevel(); l++) {
        if (level >= e.getMinEnchantability(l) && level <= e.getMaxEnchantability(l)) found.set(e.effectId, new EnchantmentData(e, l));
      }
    }
    if (found.size === 0) return null;
    return new Map(javaHashMapOrder([...found.entries()]));
  },
};
