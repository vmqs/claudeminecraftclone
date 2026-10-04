import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EntityMinecart } from './EntityMinecart';
import type { EntityPlayer } from './EntityPlayer';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A powered minecart (EntityMinecartFurnace, "MinecartFurnace"): a lump of coal gives 3600
 * ticks of fuel; it pushes itself away from the player who clicked it, smoking while it burns.
 */
export class EntityMinecartFurnace extends EntityMinecart {
  private fuel = 0;
  pushX = 0;
  pushZ = 0;
  /** DataWatcher 16 bit 0. */
  private powered = false;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  getMinecartType(): number {
    return 2;
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.fuel > 0) this.fuel--;
    if (this.fuel <= 0) this.pushX = this.pushZ = 0;
    this.setMinecartPowered(this.fuel > 0);
    if (this.isMinecartPowered() && this.rand.nextInt(4) === 0) this.worldObj.spawnParticle('largesmoke', this.posX, this.posY + 0.8, this.posZ, 0, 0, 0);
  }

  override killMinecart(src: DamageSource): void {
    super.killMinecart(src);
    if (!src.isExplosion()) this.entityDropItem(new ItemStack(BlockIds.furnaceIdle, 1, 0), 0);
  }

  protected override updateOnTrack(x: number, y: number, z: number, max: number, slope: number, id: number, meta: number): void {
    super.updateOnTrack(x, y, z, max, slope, id, meta);
    let push = this.pushX * this.pushX + this.pushZ * this.pushZ;
    if (push > 1.0e-4 && this.motionX * this.motionX + this.motionZ * this.motionZ > 0.001) {
      push = MathHelper.sqrt_double(push);
      this.pushX /= push;
      this.pushZ /= push;
      if (this.pushX * this.motionX + this.pushZ * this.motionZ < 0) {
        this.pushX = 0;
        this.pushZ = 0;
      } else {
        this.pushX = this.motionX;
        this.pushZ = this.motionZ;
      }
    }
  }

  protected override applyDrag(): void {
    let push = this.pushX * this.pushX + this.pushZ * this.pushZ;
    if (push > 1.0e-4) {
      push = MathHelper.sqrt_double(push);
      this.pushX /= push;
      this.pushZ /= push;
      const k = 0.05;
      this.motionX *= f(0.8);
      this.motionY *= 0;
      this.motionZ *= f(0.8);
      this.motionX += this.pushX * k;
      this.motionZ += this.pushZ * k;
    } else {
      this.motionX *= f(0.98);
      this.motionY *= 0;
      this.motionZ *= f(0.98);
    }
    super.applyDrag();
  }

  /** Coal adds fuel (taken from the held stack, even in Creative); any click sets the push direction. */
  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && held.itemID === ItemIds.coal) {
      if (--held.stackSize === 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      this.fuel += 3600;
    }
    this.pushX = this.posX - player.posX;
    this.pushZ = this.posZ - player.posZ;
    return true;
  }

  protected isMinecartPowered(): boolean {
    return this.powered;
  }

  protected setMinecartPowered(v: boolean): void {
    this.powered = v;
  }

  override getDefaultDisplayTile(): Block | null {
    return Block.blocksList[BlockIds.furnaceBurning];
  }

  override getDefaultDisplayTileData(): number {
    return 2;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setDouble(tag, 'PushX', this.pushX);
    NBT.setDouble(tag, 'PushZ', this.pushZ);
    NBT.setShort(tag, 'Fuel', this.fuel);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.pushX = NBT.getDouble(tag, 'PushX');
    this.pushZ = NBT.getDouble(tag, 'PushZ');
    this.fuel = NBT.getShort(tag, 'Fuel');
  }
}

EntityMinecart.minecartTypes.set(2, EntityMinecartFurnace);
