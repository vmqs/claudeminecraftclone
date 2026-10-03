import { Enchantment } from '../../enchantment/Enchantment';
import type { TagCompound } from '../../item/ItemStack';
import { Potion } from '../../potion/Potion';

/**
 * Item tags that cross the network are rebuilt from a whitelist of the keys 1.5.2's items use,
 * each with its type and a size limit, so a guest cannot put a tag into the host's world that
 * game code does not expect (`{"ench":[null]}`, `{"CustomPotionEffects":[null]}`, a level of
 * 32767 ...), and a host cannot do that to its guests. Keys are kept in the order they arrived,
 * so a well-formed tag comes out identical (ItemStack.areItemStacksEqual compares JSON text).
 */

type Schema =
  | { t: 'int'; min: number; max: number }
  | { t: 'bool' }
  | { t: 'str'; max: number }
  | { t: 'list'; of: Schema; max: number }
  | { t: 'obj'; keys: Record<string, Schema>; valid?: (o: TagCompound) => boolean };

const int = (min: number, max: number): Schema => ({ t: 'int', min, max });
const bool: Schema = { t: 'bool' };
const str = (max: number): Schema => ({ t: 'str', max });
const list = (of: Schema, max: number): Schema => ({ t: 'list', of, max });
const obj = (keys: Record<string, Schema>, valid?: (o: TagCompound) => boolean): Schema => ({ t: 'obj', keys, valid });

/** Enchantment levels above vanilla's (5) are possible with commands; far higher ones would let knockback or efficiency run away. */
export const MAX_ENCHANTMENT_LEVEL = 10;
/** Potion amplifiers beyond what /effect and brewing give in play (speed, jump boost) are cut. */
export const MAX_POTION_AMPLIFIER = 9;

const enchantment = obj({ id: int(0, 255), lvl: int(1, MAX_ENCHANTMENT_LEVEL) }, (o) => typeof o.id === 'number' && typeof o.lvl === 'number' && !!Enchantment.enchantmentsList[o.id]);
const potionEffect = obj(
  { Id: int(1, 31), Amplifier: int(0, MAX_POTION_AMPLIFIER), Duration: int(0, 1000000), Ambient: bool },
  (o) => typeof o.Id === 'number' && !!Potion.potionTypes[o.Id],
);
const explosion = obj({ Flicker: bool, Trail: bool, Type: int(0, 4), Colors: list(int(-2147483648, 2147483647), 16), FadeColors: list(int(-2147483648, 2147483647), 16) });

const ITEM_TAG = obj({
  ench: list(enchantment, 64),
  StoredEnchantments: list(enchantment, 64),
  display: obj({ Name: str(256), Lore: list(str(256), 32), color: int(-2147483648, 2147483647) }),
  RepairCost: int(0, 1000000),
  pages: list(str(256), 50),
  title: str(16),
  author: str(16),
  SkullOwner: str(16),
  CustomPotionEffects: list(potionEffect, 32),
  Fireworks: obj({ Flight: int(-128, 127), Explosions: list(explosion, 8) }),
  Explosion: explosion,
  map_is_scaling: bool,
});

const isPlainObject = (v: unknown): v is TagCompound => !!v && typeof v === 'object' && !Array.isArray(v);

/** `undefined` drops the value (and its key or list entry). */
function clean(v: unknown, s: Schema): unknown {
  switch (s.t) {
    case 'int':
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      return Math.max(s.min, Math.min(s.max, Math.trunc(v)));
    case 'bool':
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(-128, Math.min(127, Math.trunc(v)));
      return undefined;
    case 'str':
      return typeof v === 'string' ? v.slice(0, s.max) : undefined;
    case 'list': {
      if (!Array.isArray(v)) return undefined;
      const out: unknown[] = [];
      for (const e of v) {
        if (out.length >= s.max) break;
        const c = clean(e, s.of);
        if (c !== undefined) out.push(c);
      }
      return out;
    }
    case 'obj': {
      if (!isPlainObject(v)) return undefined;
      const out: TagCompound = {};
      for (const k of Object.keys(v)) {
        const ks = Object.prototype.hasOwnProperty.call(s.keys, k) ? s.keys[k] : undefined;
        if (!ks) continue;
        const c = clean(v[k], ks);
        if (c !== undefined) out[k] = c;
      }
      if (s.valid && !s.valid(out)) return undefined;
      return out;
    }
  }
}

/** The item tag rebuilt from the whitelist, or null when `tag` is not an object at all. */
export function sanitizeItemTag(tag: unknown): TagCompound | null {
  return (clean(tag, ITEM_TAG) as TagCompound | undefined) ?? null;
}
