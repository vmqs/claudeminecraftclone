import type { Block } from '../block/Block';
import { Block as Blocks } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { Explosion } from '../world/Explosion';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EntityMinecart, isRailBlock, isRailBlockAt } from './EntityMinecart';

const f = Math.fround;

/**
 * A TNT minecart (EntityMinecartTNT, "MinecartTNT"): explodes (strength 4 plus up to 1.5 x speed)
 * when it crashes at speed, falls 3+ blocks, burns, is blown up, or 80 ticks after an
 * activator rail lit it; lit carts spare the rails they explode on.
 */
export class EntityMinecartTNT extends EntityMinecart {
  private minecartTNTFuse = -1;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  getMinecartType(): number {
    return 3;
  }

  override getDefaultDisplayTile(): Block | null {
    return Blocks.blocksList[BlockIds.tnt];
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.minecartTNTFuse > 0) {
      this.minecartTNTFuse--;
      this.worldObj.spawnParticle('smoke', this.posX, this.posY + 0.5, this.posZ, 0, 0, 0);
    } else if (this.minecartTNTFuse === 0) {
      this.explodeCart(this.motionX * this.motionX + this.motionZ * this.motionZ);
    }
    if (this.isCollidedHorizontally) {
      const v = this.motionX * this.motionX + this.motionZ * this.motionZ;
      if (v >= f(0.01)) this.explodeCart(v);
    }
  }

  override killMinecart(src: DamageSource): void {
    super.killMinecart(src);
    const v = this.motionX * this.motionX + this.motionZ * this.motionZ;
    if (!src.isExplosion()) this.entityDropItem(new ItemStack(BlockIds.tnt, 1, 0), 0);
    if (src.isFireDamage() || src.isExplosion() || v >= f(0.01)) this.explodeCart(v);
  }

  protected explodeCart(speedSq: number): void {
    let s = Math.sqrt(speedSq);
    if (s > 5) s = 5;
    this.worldObj.createExplosion(this, this.posX, this.posY, this.posZ, f(4 + this.rand.nextDouble() * 1.5 * s), true);
    this.setDead();
  }

  protected override fall(dist: number): void {
    if (dist >= 3) {
      const k = f(dist / 10);
      this.explodeCart(k * k);
    }
    super.fall(dist);
  }

  override onActivatorRailPass(_x: number, _y: number, _z: number, powered: boolean): void {
    if (powered && this.minecartTNTFuse < 0) this.ignite();
  }

  override handleHealthUpdate(status: number): void {
    if (status === 10) this.minecartTNTFuse = 80;
    else super.handleHealthUpdate(status);
  }

  ignite(): void {
    this.minecartTNTFuse = 80;
    this.worldObj.setEntityState(this, 10);
    this.worldObj.playSoundAtEntity(this, 'random.fuse', 1, 1);
  }

  getFuseTicks(): number {
    return this.minecartTNTFuse;
  }

  isIgnited(): boolean {
    return this.minecartTNTFuse > -1;
  }

  override getBlockExplosionResistance(e: Explosion, w: World, x: number, y: number, z: number, block: Block): number {
    if (this.isIgnited() && (isRailBlock(block.blockID) || isRailBlockAt(w, x, y + 1, z))) return 0;
    return super.getBlockExplosionResistance(e, w, x, y, z, block);
  }

  override canExplosionDestroyBlock(e: Explosion, w: World, x: number, y: number, z: number, id: number, strength: number): boolean {
    if (this.isIgnited() && (isRailBlock(id) || isRailBlockAt(w, x, y + 1, z))) return false;
    return super.canExplosionDestroyBlock(e, w, x, y, z, id, strength);
  }
}

EntityMinecart.minecartTypes.set(3, EntityMinecartTNT);
