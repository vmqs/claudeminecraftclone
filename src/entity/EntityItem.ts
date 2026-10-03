import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';
import { AchievementIds } from '../stats/StatIds';

const f = Math.fround;

/**
 * A dropped item stack (EntityItem): falls and bounces, floats out of lava, merges with equal
 * stacks within half a block, vanishes after 6000 ticks or 5 damage, and is picked up by
 * players once its pickup delay ran out.
 */
export class EntityItem extends Entity {
  age = 0;
  delayBeforeCanPickup = 0;
  private health = 5;
  /** Bobbing phase of the renderer. */
  hoverStart = f(Math.random() * Math.PI * 2);
  private stack: ItemStack | null = null;

  constructor(world: World, x?: number, y?: number, z?: number, stack?: ItemStack) {
    super(world);
    this.setSize(0.25, 0.25);
    this.yOffset = f(this.height / 2);
    if (x === undefined || y === undefined || z === undefined) return;
    this.setPosition(x, y, z);
    this.rotationYaw = f(Math.random() * 360);
    this.motionX = f(f(Math.random() * f(0.2)) - f(0.1));
    this.motionY = f(0.2);
    this.motionZ = f(f(Math.random() * f(0.2)) - f(0.1));
    if (stack) this.setEntityItemStack(stack);
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.delayBeforeCanPickup > 0) this.delayBeforeCanPickup--;
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY -= f(0.04);
    this.noClip = this.pushOutOfBlocks(this.posX, (this.boundingBox.minY + this.boundingBox.maxY) / 2, this.posZ);
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    const moved = Math.trunc(this.prevPosX) !== Math.trunc(this.posX) || Math.trunc(this.prevPosY) !== Math.trunc(this.posY) || Math.trunc(this.prevPosZ) !== Math.trunc(this.posZ);
    if (moved || this.ticksExisted % 25 === 0) {
      if (this.worldObj.getBlockMaterial(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ)) === Material.lava) {
        this.motionY = f(0.2);
        this.motionX = f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2));
        this.motionZ = f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2));
        this.playSoundEchoed('random.fizz', f(0.4), () => f(2 + f(this.rand.nextFloat() * f(0.4))));
      }
      this.searchForOtherItemsNearby();
    }
    let slip = f(0.98);
    if (this.onGround) {
      slip = f(0.58800006);
      const id = this.worldObj.getBlockId(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.boundingBox.minY) - 1, MathHelper.floor_double(this.posZ));
      const b = id > 0 ? Block.blocksList[id] : null;
      if (b) slip = f(f(b.slipperiness) * f(0.98));
    }
    this.motionX *= slip;
    this.motionY *= f(0.98);
    this.motionZ *= slip;
    if (this.onGround) this.motionY *= -0.5;
    this.age++;
    if (this.age >= 6000) this.setDead();
  }

  private searchForOtherItemsNearby(): void {
    for (const other of this.worldObj.getEntitiesWithinAABB((e): e is EntityItem => e instanceof EntityItem, this.boundingBox.expand(0.5, 0, 0.5))) this.combineItems(other);
  }

  /** Merges this stack into `other` (the larger one absorbs the smaller). */
  combineItems(other: EntityItem): boolean {
    if (other === this || !other.isEntityAlive() || !this.isEntityAlive()) return false;
    const mine = this.getEntityItem();
    const theirs = other.getEntityItem();
    if (theirs.getItem() !== mine.getItem()) return false;
    if (theirs.hasTagCompound() !== mine.hasTagCompound()) return false;
    if (theirs.hasTagCompound() && JSON.stringify(theirs.getTagCompound()) !== JSON.stringify(mine.getTagCompound())) return false;
    if (theirs.getItem().getHasSubtypes() && theirs.getItemDamage() !== mine.getItemDamage()) return false;
    if (theirs.stackSize < mine.stackSize) return other.combineItems(this);
    if (theirs.stackSize + mine.stackSize > theirs.getMaxStackSize()) return false;
    theirs.stackSize += mine.stackSize;
    other.delayBeforeCanPickup = Math.max(other.delayBeforeCanPickup, this.delayBeforeCanPickup);
    other.age = Math.min(other.age, this.age);
    other.setEntityItemStack(theirs);
    this.setDead();
    return true;
  }

  /** Items thrown out of the creative inventory live one minute. */
  setAgeToCreativeDespawnTime(): void {
    this.age = 4800;
  }

  /** Pushed by water without becoming "in water" (no splash, no extinguish), as in 1.5.2. */
  override handleWaterMovement(): boolean {
    return this.worldObj.handleMaterialAcceleration(this.boundingBox, Material.water, this);
  }

  protected override dealFireDamage(amount: number): void {
    this.attackEntityFrom(DamageSource.inFire, amount);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.stack && this.stack.itemID === ItemIds.netherStar && src.isExplosion()) return false;
    this.setBeenAttacked();
    this.health -= amount;
    if (this.health <= 0) this.setDead();
    return false;
  }

  override onCollideWithPlayer(player: EntityPlayer): void {
    const stack = this.getEntityItem();
    const count = stack.stackSize;
    if (this.delayBeforeCanPickup !== 0 || !player.inventory.addItemStackToInventory(stack)) return;
    if (stack.itemID === BlockIds.wood) player.triggerAchievement(AchievementIds.mineWood);
    if (stack.itemID === ItemIds.leather) player.triggerAchievement(AchievementIds.killCow);
    if (stack.itemID === ItemIds.diamond) player.triggerAchievement(AchievementIds.diamonds);
    if (stack.itemID === ItemIds.blazeRod) player.triggerAchievement(AchievementIds.blazeRod);
    this.playSound('random.pop', f(0.2), f(f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.7)) + 1) * 2));
    player.onItemPickup(this, count);
    if (stack.stackSize <= 0) this.setDead();
  }

  override getEntityName(): string {
    return I18n.translateToLocal(`item.${this.getEntityItem().getItemName()}`);
  }

  override canAttackWithItem(): boolean {
    return false;
  }

  getEntityItem(): ItemStack {
    return this.stack ?? new ItemStack(BlockIds.stone, 1, 0);
  }

  setEntityItemStack(stack: ItemStack): void {
    this.stack = stack;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setShort(tag, 'Health', (this.health << 24) >> 24);
    NBT.setShort(tag, 'Age', this.age);
    const s = this.getEntityItem();
    if (s) NBT.setCompoundTag(tag, 'Item', s.writeToNBT());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.health = NBT.getShort(tag, 'Health') & 255;
    this.age = NBT.getShort(tag, 'Age');
    const s = ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(tag, 'Item'));
    if (s) this.setEntityItemStack(s);
    else this.setDead();
  }
}

World.itemDropFactory = (w, x, y, z, stack) => new EntityItem(w, x, y, z, stack);
