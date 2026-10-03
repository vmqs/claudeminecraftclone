import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { BlockSand } from '../block/BlockSand';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { TagCompound } from '../item/ItemStack';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A falling block (EntityFallingSand: sand, gravel, anvils, dragon eggs): removes its block on
 * the first tick, falls with gravity 0.04, and on landing places itself again (or drops as an
 * item when it cannot). Anvils hurt what they land on and may get damaged.
 */
export class EntityFallingSand extends Entity {
  blockID = 0;
  metadata = 0;
  fallTime = 0;
  shouldDropItem = true;
  private isBreakingAnvil = false;
  private isAnvil = false;
  private fallHurtMax = 40;
  private fallHurtAmount = 2;
  /** Tile-entity data carried along (command blocks, /summon); merged into the placed block's tile entity. */
  fallingBlockTileEntityData: TagCompound | null = null;

  constructor(world: World, x?: number, y?: number, z?: number, blockID = 0, meta = 0) {
    super(world);
    if (x === undefined || y === undefined || z === undefined) return;
    this.blockID = blockID;
    this.metadata = meta;
    this.preventEntitySpawning = true;
    this.setSize(0.98, 0.98);
    this.yOffset = f(this.height / 2);
    this.setPosition(x, y, z);
    this.motionX = 0;
    this.motionY = 0;
    this.motionZ = 0;
    this.prevPosX = x;
    this.prevPosY = y;
    this.prevPosZ = z;
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  override onUpdate(): void {
    if (this.blockID === 0) {
      this.setDead();
      return;
    }
    const w = this.worldObj;
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.fallTime++;
    this.motionY -= f(0.04);
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.98);
    this.motionY *= f(0.98);
    this.motionZ *= f(0.98);
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_double(this.posY);
    const z = MathHelper.floor_double(this.posZ);
    if (this.fallTime === 1) {
      if (w.getBlockId(x, y, z) !== this.blockID) {
        this.setDead();
        return;
      }
      w.runNaturally(() => w.setBlockToAir(x, y, z));
    }
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
      this.motionY *= -0.5;
      if (w.getBlockId(x, y, z) === BlockIds.pistonMoving) return;
      this.setDead();
      const placed =
        !this.isBreakingAnvil &&
        w.canPlaceEntityOnSide(this.blockID, x, y, z, true, 1, null, null) &&
        !BlockSand.canFallBelow(w, x, y - 1, z) &&
        w.runNaturally(() => w.setBlock(x, y, z, this.blockID, this.metadata, 3));
      if (placed) {
        const block = Block.blocksList[this.blockID];
        if (block instanceof BlockSand) block.onFinishFalling(w, x, y, z, this.metadata);
        if (this.fallingBlockTileEntityData) {
          const te = w.getBlockTileEntity(x, y, z);
          if (te) {
            const tag: TagCompound = {};
            te.writeToNBT(tag);
            for (const [k, v] of Object.entries(this.fallingBlockTileEntityData)) if (k !== 'x' && k !== 'y' && k !== 'z') (tag as Record<string, unknown>)[k] = structuredClone(v);
            te.readFromNBT(tag);
            te.onInventoryChanged();
          }
        }
      } else if (this.shouldDropItem && !this.isBreakingAnvil) {
        this.dropAsItem();
      }
    } else if ((this.fallTime > 100 && (y < 1 || y > 256)) || this.fallTime > 600) {
      if (this.shouldDropItem) this.dropAsItem();
      this.setDead();
    }
  }

  private dropAsItem(): void {
    const block = Block.blocksList[this.blockID];
    this.entityDropItem(new ItemStack(this.blockID, 1, block ? block.damageDropped(this.metadata) : 0), 0);
  }

  /** Anvils (and falling blocks set to hurt) damage everything they land in, and wear out. */
  protected override fall(dist: number): void {
    if (!this.isAnvil) return;
    const n = MathHelper.ceiling_float_int(dist - 1);
    if (n <= 0) return;
    const src = this.blockID === BlockIds.anvil ? DamageSource.anvil : DamageSource.fallingBlock;
    for (const e of [...this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox)]) {
      e.attackEntityFrom(src, Math.min(MathHelper.floor_float(f(n * this.fallHurtAmount)), this.fallHurtMax));
    }
    if (this.blockID === BlockIds.anvil && this.rand.nextFloat() < f(0.05) + n * 0.05) {
      let damage = this.metadata >> 2;
      const facing = this.metadata & 3;
      if (++damage > 2) this.isBreakingAnvil = true;
      else this.metadata = facing | (damage << 2);
    }
  }

  override getShadowSize(): number {
    return 0;
  }

  getWorld(): World {
    return this.worldObj;
  }

  setIsAnvil(v: boolean): void {
    this.isAnvil = v;
  }

  override canRenderOnFire(): boolean {
    return false;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setByte(tag, 'Tile', this.blockID);
    NBT.setInteger(tag, 'TileID', this.blockID);
    NBT.setByte(tag, 'Data', this.metadata);
    NBT.setByte(tag, 'Time', this.fallTime);
    NBT.setBoolean(tag, 'DropItem', this.shouldDropItem);
    NBT.setBoolean(tag, 'HurtEntities', this.isAnvil);
    NBT.setFloat(tag, 'FallHurtAmount', this.fallHurtAmount);
    NBT.setInteger(tag, 'FallHurtMax', this.fallHurtMax);
    if (this.fallingBlockTileEntityData) NBT.setCompoundTag(tag, 'TileEntityData', this.fallingBlockTileEntityData);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.blockID = NBT.hasKey(tag, 'TileID') ? NBT.getInteger(tag, 'TileID') : NBT.getByte(tag, 'Tile') & 255;
    this.metadata = NBT.getByte(tag, 'Data') & 255;
    this.fallTime = NBT.getByte(tag, 'Time') & 255;
    if (NBT.hasKey(tag, 'HurtEntities')) {
      this.isAnvil = NBT.getBoolean(tag, 'HurtEntities');
      this.fallHurtAmount = NBT.getFloat(tag, 'FallHurtAmount');
      this.fallHurtMax = NBT.getInteger(tag, 'FallHurtMax');
    } else if (this.blockID === BlockIds.anvil) {
      this.isAnvil = true;
    }
    if (NBT.hasKey(tag, 'DropItem')) this.shouldDropItem = NBT.getBoolean(tag, 'DropItem');
    if (NBT.hasKey(tag, 'TileEntityData')) this.fallingBlockTileEntityData = NBT.getCompoundTag(tag, 'TileEntityData');
    if (this.blockID === 0) this.blockID = BlockIds.sand;
  }
}

/** Sand and gravel ticking with room below start falling as this entity (BlockSand.tryToFall). */
BlockSand.createFallingEntity = (w, x, y, z, id, meta) => new EntityFallingSand(w as World, x, y, z, id, meta);
