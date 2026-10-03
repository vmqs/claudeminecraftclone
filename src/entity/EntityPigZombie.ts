import { ItemIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';
import { EntityZombie } from './EntityZombie';
import { tagNumber } from './HostileMobUtil';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A zombie pigman (EntityPigZombie): a fire-immune zombie on the old AI that is neutral until a
 * player hurts it or a pigman within 32 blocks; then every pigman in that range turns on the
 * player for 400-799 ticks (angry grunt after up to 2 s). Holds a gold sword.
 */
export class EntityPigZombie extends EntityZombie {
  private angerLevel = 0;
  private randomSoundDelay = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/pigzombie.png';
    this.moveSpeed = f(0.5);
    this.isImmuneToFire_ = true;
  }

  protected override isAIEnabled(): boolean {
    return false;
  }

  override onUpdate(): void {
    this.moveSpeed = this.entityToAttack ? f(0.95) : f(0.5);
    if (this.randomSoundDelay > 0 && --this.randomSoundDelay === 0) {
      this.playSound('mob.zombiepig.zpigangry', f(this.getSoundVolume() * 2), f(f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1) * f(1.8)));
    }
    super.onUpdate();
  }

  override getTexture(): string {
    return '/mob/pigzombie.png';
  }

  override getCanSpawnHere(): boolean {
    return (
      this.worldObj.difficultySetting > 0 &&
      this.worldObj.checkNoEntityCollision(this.boundingBox) &&
      this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox).length === 0 &&
      !this.worldObj.isAnyLiquid(this.boundingBox)
    );
  }

  protected override findPlayerToAttack(): Entity | null {
    return this.angerLevel === 0 ? null : super.findPlayerToAttack();
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    const attacker = src.getEntity();
    if (attacker && attacker.isPlayerEntity) {
      for (const e of this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(32, 32, 32))) {
        if (e instanceof EntityPigZombie) e.becomeAngryAt(attacker);
      }
      this.becomeAngryAt(attacker);
    }
    return super.attackEntityFrom(src, amount);
  }

  private becomeAngryAt(e: Entity): void {
    this.entityToAttack = e;
    this.angerLevel = 400 + this.rand.nextInt(400);
    this.randomSoundDelay = this.rand.nextInt(40);
  }

  /** Anger: whether this pigman is currently hostile (for tests and debugging). */
  getAngerLevel(): number {
    return this.angerLevel;
  }

  protected override getLivingSound(): string | null {
    return 'mob.zombiepig.zpig';
  }

  protected override getHurtSound(): string | null {
    return 'mob.zombiepig.zpighurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.zombiepig.zpigdeath';
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    let n = this.rand.nextInt(2 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.rottenFlesh, 1);
    n = this.rand.nextInt(2 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.goldNugget, 1);
  }

  override interact(_p: EntityPlayer): boolean {
    return false;
  }

  protected override dropRareDrop(_kind: number): void {
    this.dropItem(ItemIds.ingotGold, 1);
  }

  protected override getDropItemId(): number {
    return ItemIds.rottenFlesh;
  }

  protected override addRandomArmor(): void {
    this.setCurrentItemOrArmor(0, new ItemStack(ItemIds.swordGold, 1, 0));
  }

  override initCreature(): void {
    super.initCreature();
    this.setVillager(false);
  }

  override getAttackStrength(_target: Entity): number {
    const held = this.getHeldItem();
    let dmg = 5;
    if (held) dmg += held.getDamageVsEntity(this);
    return dmg;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setShort(tag, 'Anger', this.angerLevel);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.angerLevel = NBT.getShort(tag, 'Anger');
  }
}
