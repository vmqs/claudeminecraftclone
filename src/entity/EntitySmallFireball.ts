import { BlockIds } from '../block/BlockIds';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { DamageSource as Sources } from './DamageSource';
import { EntityFireball } from './EntityFireball';
import type { EntityLiving } from './EntityLiving';

/** Offsets of the six faces (Facing order: down, up, north, south, west, east). */
const FACE_OFFSETS = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

/**
 * A blaze or fire-charge fireball (EntitySmallFireball): sets what it hits on fire for 5 s
 * (5 damage), or lights the air block in front of the face it hit. Cannot be punched back.
 */
export class EntitySmallFireball extends EntityFireball {
  constructor(world: World);
  constructor(world: World, shooter: EntityLiving, ax: number, ay: number, az: number);
  constructor(world: World, x: number, y: number, z: number, ax: number, ay: number, az: number);
  constructor(world: World, a?: number | EntityLiving, b?: number, c?: number, d?: number, e?: number, g?: number) {
    if (a === undefined) super(world);
    else if (typeof a === 'number') super(world, a, b!, c!, d!, e!, g!);
    else super(world, a, b!, c!, d!);
    this.setSize(0.3125, 0.3125);
  }

  protected onImpact(hit: MovingObjectPosition): void {
    const target = hit.entityHit;
    if (target) {
      if (!target.isImmuneToFire() && target.attackEntityFrom(Sources.causeFireballDamage(this, this.shootingEntity), 5)) target.setFire(5);
    } else {
      const o = FACE_OFFSETS[hit.sideHit] ?? [0, 0, 0];
      const x = hit.blockX + o[0];
      const y = hit.blockY + o[1];
      const z = hit.blockZ + o[2];
      if (this.worldObj.isAirBlock(x, y, z)) this.worldObj.setBlock(x, y, z, BlockIds.fire);
    }
    this.setDead();
  }

  override canBeCollidedWith(): boolean {
    return false;
  }

  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    return false;
  }
}
