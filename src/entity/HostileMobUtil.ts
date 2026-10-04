import { BlockIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';

const f = Math.fround;

/**
 * The undead daylight check of zombies and skeletons: in daytime, with brightness above 0.5,
 * a (brightness - 0.4) * 2 / 30 chance per tick under open sky; a helmet takes 0-1 damage
 * instead (breaking when worn out), otherwise the mob burns for 8 seconds.
 */
export function burnInDaylight(mob: EntityLiving, rand: { nextFloat(): number; nextInt(n: number): number }): void {
  const w = mob.worldObj;
  if (!w.isDaytime()) return;
  const b = mob.getBrightness(1);
  if (!(b > 0.5) || !(f(rand.nextFloat() * 30) < f(f(b - f(0.4)) * 2))) return;
  if (!w.canBlockSeeTheSky(MathHelper.floor_double(mob.posX), MathHelper.floor_double(mob.posY), MathHelper.floor_double(mob.posZ))) return;
  const helmet = mob.getCurrentItemOrArmor(4);
  if (helmet) {
    if (helmet.isItemStackDamageable()) {
      helmet.setItemDamage(helmet.getItemDamageForDisplay() + rand.nextInt(2));
      if (helmet.getItemDamageForDisplay() >= helmet.getMaxDamage()) {
        mob.renderBrokenItemStack(helmet);
        mob.setCurrentItemOrArmor(4, null);
      }
    }
    return;
  }
  mob.setFire(8);
}

/** On 31 October a quarter of zombies and skeletons without a helmet wear a pumpkin (10% lit). */
export function maybeHalloweenHelmet(mob: EntityLiving, rand: { nextFloat(): number }, dropChances: number[]): void {
  if (mob.getCurrentItemOrArmor(4)) return;
  const now = new Date();
  if (now.getMonth() + 1 === 10 && now.getDate() === 31 && rand.nextFloat() < f(0.25)) {
    mob.setCurrentItemOrArmor(4, new ItemStack(rand.nextFloat() < f(0.1) ? BlockIds.pumpkinLantern : BlockIds.pumpkin, 1, 0));
    dropChances[4] = 0;
  }
}

/** instanceof for classes owned elsewhere: the entity's EntityList name. */
export function isEntityNamed(e: Entity, name: string): boolean {
  return EntityList.getEntityString(e) === name;
}

/** Reads a savegame-style number field (descriptor data / NBT stand-in). */
export function tagNumber(tag: Record<string, unknown>, key: string): number | undefined {
  const v = tag[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}

/** Reads a savegame-style boolean field. */
export function tagBool(tag: Record<string, unknown>, key: string): boolean {
  const v = tag[key];
  return v === true || v === 1;
}
