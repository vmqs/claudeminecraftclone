import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAIAvoidEntity } from './ai/EntityAIAvoidEntity';
import { EntityAIFollowOwner } from './ai/EntityAIFollowOwner';
import { EntityAILeapAtTarget } from './ai/EntityAILeapAtTarget';
import { EntityAIMate } from './ai/EntityAIMate';
import { EntityAIOcelotAttack } from './ai/EntityAIOcelotAttack';
import { EntityAIOcelotSit } from './ai/EntityAIOcelotSit';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAITargetNonTamed } from './ai/EntityAITargetNonTamed';
import { EntityAITempt } from './ai/EntityAITempt';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import type { EntityAgeable } from './EntityAgeable';
import type { EntityAnimal } from './EntityAnimal';
import type { EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import { EntityTameable } from './EntityTameable';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;
const isChicken = (e: Entity): e is EntityLiving => EntityList.getEntityString(e) === 'Chicken';

/**
 * The ocelot (EntityOcelot): 10 health, shy (runs from players unless tamed), tempted with raw
 * fish (it gives up when the player moves), tamed by feeding fish while tempted (1 in 3) into a
 * black, red or Siamese cat that follows, sits on chests, furnaces and beds, and hunts chickens
 * while wild. Creepers avoid ocelots. Spawns in jungles above y 63 on grass or leaves.
 */
export class EntityOcelot extends EntityTameable {
  private readonly aiTempt: EntityAITempt;
  /** DataWatcher 18: 0 ocelot, 1 black, 2 red, 3 Siamese. */
  private tameSkin = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/ozelot.png';
    this.setSize(f(0.6), f(0.8));
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(1, new EntityAISwimming(this));
    this.tasks.addTask(2, this.aiSit);
    this.tasks.addTask(3, (this.aiTempt = new EntityAITempt(this, f(0.18), ItemIds.fishRaw, true)));
    this.tasks.addTask(4, new EntityAIAvoidEntity(this, 'player', 16, f(0.23), f(0.4)));
    this.tasks.addTask(5, new EntityAIFollowOwner(this, f(0.3), 10, 5));
    this.tasks.addTask(6, new EntityAIOcelotSit(this, f(0.4)));
    this.tasks.addTask(7, new EntityAILeapAtTarget(this, f(0.3)));
    this.tasks.addTask(8, new EntityAIOcelotAttack(this));
    this.tasks.addTask(9, new EntityAIMate(this, f(0.23)));
    this.tasks.addTask(10, new EntityAIWander(this, f(0.23)));
    this.tasks.addTask(11, new EntityAIWatchClosest(this, 'player', 10));
    this.targetTasks.addTask(1, new EntityAITargetNonTamed(this, isChicken, 14, 750, false));
  }

  /** Sneaks while creeping up (speed 0.18), sprints when pouncing (0.4). */
  protected override updateAITick(): void {
    const mh = this.getMoveHelper();
    if (mh.isUpdating()) {
      const speed = mh.getSpeed();
      if (speed === f(0.18)) {
        this.setSneaking(true);
        this.setSprinting(false);
      } else if (speed === f(0.4)) {
        this.setSneaking(false);
        this.setSprinting(true);
      } else {
        this.setSneaking(false);
        this.setSprinting(false);
      }
    } else {
      this.setSneaking(false);
      this.setSprinting(false);
    }
  }

  protected override canDespawn(): boolean {
    return !this.isTamed();
  }

  override getTexture(): string {
    switch (this.getTameSkin()) {
      case 0:
        return '/mob/ozelot.png';
      case 1:
        return '/mob/cat_black.png';
      case 2:
        return '/mob/cat_red.png';
      case 3:
        return '/mob/cat_siamese.png';
      default:
        return super.getTexture();
    }
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 10;
  }

  protected override fall(_dist: number): void {}

  /** Wild ocelots are silent (an empty sound name in 1.5.2). */
  protected override getLivingSound(): string | null {
    if (!this.isTamed()) return null;
    if (this.isInLove()) return 'mob.cat.purr';
    return this.rand.nextInt(4) === 0 ? 'mob.cat.purreow' : 'mob.cat.meow';
  }

  protected override getHurtSound(): string | null {
    return 'mob.cat.hitt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.cat.hitt';
  }

  protected override getSoundVolume(): number {
    return f(0.4);
  }

  protected override getDropItemId(): number {
    return ItemIds.leather;
  }

  override attackEntityAsMob(e: Entity): boolean {
    return e.attackEntityFrom(DamageSource.causeMobDamage(this), 3);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.aiSit.setSitting(false);
    return super.attackEntityFrom(src, amount);
  }

  /** Ocelots drop nothing. */
  protected override dropFewItems(_recentlyHit: boolean, _looting: number): void {}

  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (this.isTamed()) {
      if (player.username.toLowerCase() === this.getOwnerName().toLowerCase() && !(held && this.isBreedingItem(held))) this.aiSit.setSitting(!this.isSitting());
    } else if (this.aiTempt.isRunningTask() && held && held.itemID === ItemIds.fishRaw && player.getDistanceSqToEntity(this) < 9) {
      if (!player.capabilities.isCreativeMode) held.stackSize--;
      if (held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      if (this.rand.nextInt(3) === 0) {
        this.setTamed(true);
        this.setTameSkin(1 + this.worldObj.rand.nextInt(3));
        this.setOwner(player.username);
        this.aiSit.setSitting(true);
        this.worldObj.setEntityState(this, 7);
      } else {
        this.worldObj.setEntityState(this, 6);
      }
      return true;
    }
    return super.interact(player);
  }

  createChild(_mate: EntityAgeable): EntityAgeable {
    const kitten = new EntityOcelot(this.worldObj);
    if (this.isTamed()) {
      kitten.setOwner(this.getOwnerName());
      kitten.setTamed(true);
      kitten.setTameSkin(this.getTameSkin());
    }
    return kitten;
  }

  override isBreedingItem(stack: ItemStack): boolean {
    return stack != null && stack.itemID === ItemIds.fishRaw;
  }

  override canMateWith(other: EntityAnimal): boolean {
    if (other === this || !this.isTamed() || !(other instanceof EntityOcelot)) return false;
    return other.isTamed() ? this.isInLove() && other.isInLove() : false;
  }

  getTameSkin(): number {
    return this.tameSkin;
  }

  setTameSkin(v: number): void {
    this.tameSkin = v;
  }

  /** One in three tries fails outright; then above y 63 on grass or leaves, in free space. */
  override getCanSpawnHere(): boolean {
    if (this.worldObj.rand.nextInt(3) === 0) return false;
    if (this.worldObj.checkNoEntityCollision(this.boundingBox) && this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox).length === 0 && !this.worldObj.isAnyLiquid(this.boundingBox)) {
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.boundingBox.minY);
      const z = MathHelper.floor_double(this.posZ);
      if (y < 63) return false;
      const below = this.worldObj.getBlockId(x, y - 1, z);
      if (below === BlockIds.grass || below === BlockIds.leaves) return true;
    }
    return false;
  }

  /** A tamed one is a cat (the untranslated key, as 1.5.2 returns it). */
  override getEntityName(): string {
    if (this.hasCustomName()) return this.getCustomNameTag();
    return this.isTamed() ? 'entity.Cat.name' : super.getEntityName();
  }

  /** One in seven ocelots spawns with two kittens. */
  override initCreature(): void {
    if (this.worldObj.rand.nextInt(7) !== 0) return;
    for (let i = 0; i < 2; i++) {
      const kitten = new EntityOcelot(this.worldObj);
      kitten.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, 0);
      kitten.setGrowingAge(-24000);
      this.worldObj.spawnEntityInWorld(kitten);
    }
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'CatType', this.getTameSkin());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setTameSkin(NBT.getInteger(tag, 'CatType'));
  }
}
