import { ItemIds } from '../block/BlockIds';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { EntityLiving } from './EntityLiving';
import { EntityThrowable } from './EntityThrowable';
import { isInstantPotion, PotionHooks } from './PotionEffects';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A thrown splash potion (EntityPotion): applies its effects to living things within 4 blocks,
 * scaled by distance (full strength on a direct hit), then the 2002 splash effect.
 */
export class EntityPotion extends EntityThrowable {
  /** The thrown potion stack (1.5.2's field name; item code sets it directly). */
  potionDamage: ItemStack | null = null;

  constructor(world: World);
  constructor(world: World, thrower: EntityLiving, potion: number | ItemStack);
  constructor(world: World, x: number, y: number, z: number, potion: number | ItemStack);
  constructor(world: World, a?: EntityLiving | number, b?: number | ItemStack, c?: number, d?: number | ItemStack) {
    if (a === undefined) super(world);
    else if (typeof a === 'number') super(world, a, b as number, c!);
    else super(world, a);
    const p = typeof a === 'number' ? d : b;
    if (p !== undefined) this.potionDamage = typeof p === 'number' ? new ItemStack(ItemIds.potion, 1, p) : p;
  }

  protected override getGravityVelocity(): number {
    return f(0.05);
  }

  protected override getThrowVelocity(): number {
    return f(0.5);
  }

  protected override getThrowPitchOffset(): number {
    return -20;
  }

  setPotionDamage(damage: number): void {
    this.potionDamage ??= new ItemStack(ItemIds.potion, 1, 0);
    this.potionDamage.setItemDamage(damage);
  }

  getPotionDamage(): number {
    this.potionDamage ??= new ItemStack(ItemIds.potion, 1, 0);
    return this.potionDamage.getItemDamage();
  }

  protected onImpact(hit: MovingObjectPosition): void {
    this.getPotionDamage();
    const effects = PotionHooks.effectsOf?.(this.potionDamage!) ?? null;
    if (effects && effects.length > 0) {
      const box = this.boundingBox.expand(4, 2, 4);
      for (const e of this.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (x) => x.isLivingEntity)) {
        const living = e as EntityLiving;
        const d2 = this.getDistanceSqToEntity(living);
        if (d2 >= 16) continue;
        let scale = 1 - Math.sqrt(d2) / 4;
        if (living === hit.entityHit) scale = 1;
        for (const effect of effects) {
          const id = effect.getPotionID();
          if (isInstantPotion(id)) {
            PotionHooks.affectEntity?.(id, this.getThrower(), living, effect.getAmplifier(), scale);
          } else {
            const duration = Math.trunc(scale * effect.getDuration() + 0.5);
            if (duration > 20 && PotionHooks.createEffect) living.addPotionEffect(PotionHooks.createEffect(id, duration, effect.getAmplifier()));
          }
        }
      }
    }
    this.worldObj.playAuxSFX(2002, Math.round(this.posX), Math.round(this.posY), Math.round(this.posZ), this.getPotionDamage());
    this.setDead();
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    if (this.potionDamage) NBT.setCompoundTag(tag, 'Potion', this.potionDamage.writeToNBT());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    if (NBT.hasKey(tag, 'Potion')) this.potionDamage = ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(tag, 'Potion'));
    else this.setPotionDamage(NBT.getInteger(tag, 'potionValue'));
    if (!this.potionDamage) this.setDead();
  }
}
