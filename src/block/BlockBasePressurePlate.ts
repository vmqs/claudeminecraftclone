import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockFence } from './BlockFence';
import type { Material } from './Material';

const f = Math.fround;

/**
 * Pressure plates (BlockBasePressurePlate): pressed (1/32 high instead of 1/16) while
 * something stands on the sensitive area, with a click on and off; checked again every
 * tickRate ticks while pressed.
 */
export abstract class BlockBasePressurePlate extends Block {
  constructor(
    id: number,
    private readonly pressurePlateIconName: string,
    material: Material,
  ) {
    super(id, material);
    this.setCreativeTab(CreativeTabs.tabRedstone);
    this.setTickRandomly(true);
    this.setPlateBounds(this.getMetaFromWeight(15));
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.setPlateBounds(w.getBlockMetadata(x, y, z));
  }

  /** func_94353_c_ */
  protected setPlateBounds(meta: number): void {
    const inset = 0.0625;
    const pressed = this.getPowerSupply(meta) > 0;
    this.setBlockBounds(inset, 0, inset, 1 - inset, pressed ? 0.03125 : 0.0625, 1 - inset);
  }

  override tickRate(_w: IWorld): number {
    return 20;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.doesBlockHaveSolidTopSurface(x, y - 1, z) || BlockFence.isIdAFence(w.getBlockId(x, y - 1, z));
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && !BlockFence.isIdAFence(w.getBlockId(x, y - 1, z))) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  /** While pressed: is something still on it? */
  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.isRemote) return;
    const power = this.getPowerSupply(w.getBlockMetadata(x, y, z));
    if (power > 0) this.setStateIfMobInteractsWithPlate(w, x, y, z, power);
  }

  override onEntityCollidedWithBlock(w: IWorld, x: number, y: number, z: number, _e: Entity): void {
    if (w.isRemote) return;
    const power = this.getPowerSupply(w.getBlockMetadata(x, y, z));
    if (power === 0) this.setStateIfMobInteractsWithPlate(w, x, y, z, power);
  }

  protected setStateIfMobInteractsWithPlate(w: IWorld, x: number, y: number, z: number, oldPower: number): void {
    const power = this.getPlateState(w, x, y, z);
    const wasOn = oldPower > 0;
    const on = power > 0;
    if (oldPower !== power) {
      w.setBlockMetadataWithNotify(x, y, z, this.getMetaFromWeight(power), 2);
      this.notifyNeighbors(w, x, y, z);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    }
    if (!on && wasOn) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.click', 0.3, 0.5);
    else if (on && !wasOn) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.click', 0.3, 0.6);
    if (on) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  /** The area that senses entities: 1/8 in from the sides, 1/4 high. */
  protected getSensitiveAABB(x: number, y: number, z: number): AxisAlignedBB {
    const inset = 0.125;
    return AxisAlignedBB.getBoundingBox(f(x + inset), y, f(z + inset), f(x + 1 - inset), y + 0.25, f(z + 1 - inset));
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    if (this.getPowerSupply(meta) > 0) this.notifyNeighbors(w, x, y, z);
    super.breakBlock(w, x, y, z, id, meta);
  }

  /** func_94354_b_ */
  protected notifyNeighbors(w: IWorld, x: number, y: number, z: number): void {
    w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return this.getPowerSupply(w.getBlockMetadata(x, y, z));
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    return side === 1 ? this.getPowerSupply(w.getBlockMetadata(x, y, z)) : 0;
  }

  override canProvidePower(): boolean {
    return true;
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0.5 - 0.125, 0, 1, 0.5 + 0.125, 1);
  }

  override getMobilityFlag(): number {
    return 1;
  }

  protected abstract getPlateState(w: IWorld, x: number, y: number, z: number): number;
  protected abstract getPowerSupply(meta: number): number;
  protected abstract getMetaFromWeight(power: number): number;

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.pressurePlateIconName);
  }
}

/** Which entities press a plate (EnumMobType). */
export type EnumMobType = 'everything' | 'mobs' | 'players';

/** Wooden (72, everything) and stone (70, living entities) pressure plates: on or off. */
export class BlockPressurePlate extends BlockBasePressurePlate {
  constructor(
    id: number,
    icon: string,
    material: Material,
    private readonly triggerMobType: EnumMobType,
  ) {
    super(id, icon, material);
  }

  protected getMetaFromWeight(power: number): number {
    return power > 0 ? 1 : 0;
  }

  protected getPowerSupply(meta: number): number {
    return meta === 1 ? 15 : 0;
  }

  protected getPlateState(w: IWorld, x: number, y: number, z: number): number {
    let list = w.getEntitiesWithinAABBExcludingEntity(null, this.getSensitiveAABB(x, y, z));
    if (this.triggerMobType === 'mobs') list = list.filter((e) => e.isLivingEntity);
    else if (this.triggerMobType === 'players') list = list.filter((e) => e.isPlayerEntity);
    for (const e of list) {
      if (!((e as unknown as { doesEntityNotTriggerPressurePlate?: () => boolean }).doesEntityNotTriggerPressurePlate?.() ?? false)) return 15;
    }
    return 0;
  }
}

/** Weighted plates (147 gold: 64 items, 148 iron: 640 items): power grows with the items on them. */
export class BlockPressurePlateWeighted extends BlockBasePressurePlate {
  constructor(
    id: number,
    icon: string,
    material: Material,
    private readonly maxItemsWeighted: number,
  ) {
    super(id, icon, material);
  }

  protected getPlateState(w: IWorld, x: number, y: number, z: number): number {
    let count = 0;
    for (const e of w.getEntitiesWithinAABBExcludingEntity(null, this.getSensitiveAABB(x, y, z))) {
      const stack = (e as unknown as { getEntityItem?: () => ItemStack }).getEntityItem?.();
      if (!stack) continue;
      count += stack.stackSize;
      if (count >= this.maxItemsWeighted) break;
    }
    if (count <= 0) return 0;
    const fraction = f(Math.min(this.maxItemsWeighted, count) / this.maxItemsWeighted);
    return MathHelper.ceiling_float_int(f(fraction * 15));
  }

  protected getPowerSupply(meta: number): number {
    return meta;
  }

  protected getMetaFromWeight(power: number): number {
    return power;
  }

  override tickRate(_w: IWorld): number {
    return 10;
  }
}
