import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { ItemStack } from '../item/ItemStack';
import { EnumCreatureType } from '../world/biome/SpawnListEntry';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityAgeable } from './EntityAgeable';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * A breedable animal (EntityAnimal): fed its breeding item it is "in love" for 600 ticks, two
 * in-love animals of the same kind make a baby, it follows players holding the item, flees for
 * 60 ticks when hurt, spawns on lit grass and never despawns.
 */
export abstract class EntityAnimal extends EntityAgeable {
  private inLove = 0;
  private breeding = 0;

  constructor(world: World) {
    super(world);
  }

  override get creatureType(): EnumCreatureType {
    return EnumCreatureType.creature;
  }

  protected override updateAITick(): void {
    if (this.getGrowingAge() !== 0) this.inLove = 0;
    super.updateAITick();
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    if (this.getGrowingAge() !== 0) this.inLove = 0;
    if (this.inLove > 0) {
      this.inLove--;
      if (this.inLove % 10 === 0) this.spawnHeart(this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02);
    } else {
      this.breeding = 0;
    }
  }

  private spawnHeart(vx: number, vy: number, vz: number): void {
    this.worldObj.spawnParticle(
      'heart',
      this.posX + f(this.rand.nextFloat() * this.width * 2) - this.width,
      this.posY + 0.5 + f(this.rand.nextFloat() * this.height),
      this.posZ + f(this.rand.nextFloat() * this.width * 2) - this.width,
      vx,
      vy,
      vz,
    );
  }

  /** Old AI: face players holding food, follow adults, court a partner and breed after 60 ticks. */
  protected override attackEntity(target: Entity, dist: number): void {
    if (target.isPlayerEntity) {
      if (dist < 3) {
        this.rotationYaw = f(f((Math.atan2(target.posZ - this.posZ, target.posX - this.posX) * 180) / f(Math.PI)) - 90);
        this.hasAttacked = true;
      }
      const held = (target as EntityPlayer).getCurrentEquippedItem();
      if (!held || !this.isBreedingItem(held)) this.entityToAttack = null;
    } else if (target instanceof EntityAnimal) {
      if (this.getGrowingAge() > 0 && target.getGrowingAge() < 0) {
        if (dist < 2.5) this.hasAttacked = true;
      } else if (this.inLove > 0 && target.inLove > 0) {
        if (target.entityToAttack === null) target.entityToAttack = this;
        if (target.entityToAttack === this && dist < 3.5) {
          target.inLove++;
          this.inLove++;
          this.breeding++;
          if (this.breeding % 4 === 0) this.spawnHeart(0, 0, 0);
          if (this.breeding === 60) this.procreate(target);
        } else {
          this.breeding = 0;
        }
      } else {
        this.breeding = 0;
        this.entityToAttack = null;
      }
    }
  }

  private procreate(mate: EntityAnimal): void {
    const child = this.createChild(mate);
    if (!child) return;
    this.setGrowingAge(6000);
    mate.setGrowingAge(6000);
    this.inLove = 0;
    this.breeding = 0;
    this.entityToAttack = null;
    mate.entityToAttack = null;
    mate.breeding = 0;
    mate.inLove = 0;
    child.setGrowingAge(-24000);
    child.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
    for (let i = 0; i < 7; i++) this.spawnHeart(this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02);
    this.worldObj.spawnEntityInWorld(child);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.fleeingTick = 60;
    this.entityToAttack = null;
    this.inLove = 0;
    return super.attackEntityFrom(src, amount);
  }

  override getBlockPathWeight(x: number, y: number, z: number): number {
    return this.worldObj.getBlockId(x, y - 1, z) === BlockIds.grass ? 10 : f(this.worldObj.getLightBrightness(x, y, z) - f(0.5));
  }

  protected override findPlayerToAttack(): Entity | null {
    if (this.fleeingTick > 0) return null;
    const r = 8;
    const box = this.boundingBox.expand(r, r, r);
    const sameKind = (e: Entity): e is EntityAnimal => e.constructor === this.constructor;
    if (this.inLove > 0) {
      for (const a of this.worldObj.getEntitiesWithinAABB(sameKind, box)) if (a !== this && a.inLove > 0) return a;
    } else if (this.getGrowingAge() === 0) {
      for (const e of this.worldObj.getEntitiesWithinAABB((e): e is EntityPlayer => e.isPlayerEntity, box)) {
        const held = e.getCurrentEquippedItem();
        if (held && this.isBreedingItem(held)) return e;
      }
    } else if (this.getGrowingAge() > 0) {
      for (const a of this.worldObj.getEntitiesWithinAABB(sameKind, box)) if (a !== this && a.getGrowingAge() < 0) return a;
    }
    return null;
  }

  /** Spawns on grass with block light above 8. */
  override getCanSpawnHere(): boolean {
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_double(this.boundingBox.minY);
    const z = MathHelper.floor_double(this.posZ);
    return this.worldObj.getBlockId(x, y - 1, z) === BlockIds.grass && this.worldObj.getFullBlockLightValue(x, y, z) > 8 && super.getCanSpawnHere();
  }

  override getTalkInterval(): number {
    return 120;
  }

  protected override canDespawn(): boolean {
    return false;
  }

  protected override getExperiencePoints(_p: EntityPlayer | null): number {
    return 1 + this.worldObj.rand.nextInt(3);
  }

  isBreedingItem(stack: ItemStack): boolean {
    return stack.itemID === ItemIds.wheat;
  }

  /** Feeding the breeding item (not consumed in Creative) starts love mode. */
  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && this.isBreedingItem(held) && this.getGrowingAge() === 0 && this.inLove <= 0) {
      if (!player.capabilities.isCreativeMode && --held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      this.inLove = 600;
      this.entityToAttack = null;
      for (let i = 0; i < 7; i++) this.spawnHeart(this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02, this.rand.nextGaussian() * 0.02);
      return true;
    }
    return super.interact(player);
  }

  isInLove(): boolean {
    return this.inLove > 0;
  }

  resetInLove(): void {
    this.inLove = 0;
  }

  canMateWith(other: EntityAnimal): boolean {
    return other !== this && other.constructor === this.constructor && this.isInLove() && other.isInLove();
  }
}
