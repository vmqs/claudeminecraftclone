import type { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Explosion } from '../world/Explosion';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { EntityFireball } from './EntityFireball';
import type { EntityLiving } from './EntityLiving';
import { PotionHooks, PotionId } from './PotionEffects';

const f = Math.fround;

/**
 * A wither skull (EntityWitherSkull): 8 damage (healing the wither 5 on a kill), the Wither
 * effect on Normal and Hard, and a small explosion. Blue "invulnerable" skulls are slower and
 * break blocks as if they had resistance 0.8 at most.
 */
export class EntityWitherSkull extends EntityFireball {
  /** DataWatcher 10. */
  private invulnerableSkull = false;

  constructor(world: World);
  constructor(world: World, shooter: EntityLiving, ax: number, ay: number, az: number);
  constructor(world: World, x: number, y: number, z: number, ax: number, ay: number, az: number);
  constructor(world: World, a?: number | EntityLiving, b?: number, c?: number, d?: number, e?: number, g?: number) {
    if (a === undefined) super(world);
    else if (typeof a === 'number') super(world, a, b!, c!, d!, e!, g!);
    else super(world, a, b!, c!, d!);
    this.setSize(0.3125, 0.3125);
  }

  protected override getMotionFactor(): number {
    return this.isInvulnerable() ? f(0.73) : super.getMotionFactor();
  }

  override isBurning(): boolean {
    return false;
  }

  override getBlockExplosionResistance(explosion: Explosion, w: World, x: number, y: number, z: number, block: Block): number {
    let r = super.getBlockExplosionResistance(explosion, w, x, y, z, block);
    const id = block.blockID;
    if (this.isInvulnerable() && id !== BlockIds.bedrock && id !== BlockIds.endPortal && id !== BlockIds.endPortalFrame) r = Math.min(f(0.8), r);
    return r;
  }

  protected onImpact(hit: MovingObjectPosition): void {
    const target = hit.entityHit;
    if (target) {
      if (this.shootingEntity) {
        if (target.attackEntityFrom(DamageSource.causeMobDamage(this.shootingEntity), 8) && !target.isEntityAlive()) this.shootingEntity.heal(5);
      } else {
        target.attackEntityFrom(DamageSource.magic, 5);
      }
      if (target.isLivingEntity) {
        const diff = this.worldObj.difficultySetting;
        const seconds = diff === 2 ? 10 : diff === 3 ? 40 : 0;
        if (seconds > 0 && PotionHooks.createEffect) (target as EntityLiving).addPotionEffect(PotionHooks.createEffect(PotionId.wither, 20 * seconds, 1));
      }
    }
    this.worldObj.newExplosion(this, this.posX, this.posY, this.posZ, 1, false, this.worldObj.worldInfo.gameRules.mobGriefing);
    this.setDead();
  }

  override canBeCollidedWith(): boolean {
    return false;
  }

  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    return false;
  }

  isInvulnerable(): boolean {
    return this.invulnerableSkull;
  }

  setInvulnerable(v: boolean): void {
    this.invulnerableSkull = v;
  }
}
