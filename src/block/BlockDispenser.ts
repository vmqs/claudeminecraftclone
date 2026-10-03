import { Facing } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityDispenser, TileEntityDropper } from '../world/tileentity/TileEntityDispenser';
import { TileEntityHopper } from '../world/tileentity/TileEntityHopper';
import { Block } from './Block';
import { BlockContainer, calcRedstoneFromInventory } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockPistonBase } from './BlockPistonBase';
import { Material } from './Material';

/**
 * Dispenses one item from a dispenser or dropper (IBehaviorDispenseItem.dispense): returns
 * what is left of the stack. The item code registers behaviours by item id.
 */
export type DispenseBehavior = (w: IWorld, x: number, y: number, z: number, facing: number, stack: ItemStack) => ItemStack;

/**
 * Dispenser (23) and dropper (158): meta & 7 = facing (6-way, from the placer), bit 8 =
 * triggered. Firing needs redstone (out of scope); the behaviours plug in through
 * {@link BlockDispenser.dispenseBehaviors} and {@link BlockDispenser.defaultBehavior}.
 */
export class BlockDispenser extends BlockContainer {
  /** dispenseBehaviorRegistry: item id -> behaviour. */
  static readonly dispenseBehaviors = new Map<number, DispenseBehavior>();
  /** BehaviorDefaultDispenseItem (spits the item out), installed by the item code. */
  static defaultBehavior: DispenseBehavior | null = null;

  protected readonly random = BlockContainer.newRandom();
  protected iconTop: Icon | null = null;
  protected iconFront: Icon | null = null;
  protected iconFrontVertical: Icon | null = null;

  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override tickRate(_w: IWorld): number {
    return 4;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    if (w.isRemote) return;
    const n = w.getBlockId(x, y, z - 1);
    const s = w.getBlockId(x, y, z + 1);
    const west = w.getBlockId(x - 1, y, z);
    const east = w.getBlockId(x + 1, y, z);
    const o = Block.opaqueCubeLookup;
    let facing = 3;
    if (o[n] && !o[s]) facing = 3;
    if (o[s] && !o[n]) facing = 2;
    if (o[west] && !o[east]) facing = 5;
    if (o[east] && !o[west]) facing = 4;
    w.setBlockMetadataWithNotify(x, y, z, facing, 2);
  }

  override getIcon(side: number, meta: number): Icon | null {
    const facing = meta & 7;
    if (side === facing) return facing !== 1 && facing !== 0 ? this.iconFront : this.iconFrontVertical;
    if (facing === 1 || facing === 0) return this.iconTop;
    return side !== 1 && side !== 0 ? this.blockIcon : this.iconTop;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('furnace_side');
    this.iconTop = reg.registerIcon('furnace_top');
    this.iconFront = reg.registerIcon('dispenser_front');
    this.iconFrontVertical = reg.registerIcon('dispenser_front_vertical');
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityDispenser) BlockGuiHooks.open({ kind: te instanceof TileEntityDropper ? 'dropper' : 'dispenser', player: p, world: w, x, y, z, inventory: te, tileEntity: te });
    return true;
  }

  /** Fires one random stack (click 1001 when empty). */
  protected dispense(w: IWorld, x: number, y: number, z: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (!(te instanceof TileEntityDispenser)) return;
    const slot = te.getRandomStackFromInventory();
    if (slot < 0) {
      w.playAuxSFX(1001, x, y, z, 0);
      return;
    }
    const stack = te.getStackInSlot(slot)!;
    const behavior = this.getBehaviorForItemStack(stack);
    if (!behavior) return;
    const rest = behavior(w, x, y, z, w.getBlockMetadata(x, y, z) & 7, stack);
    te.setInventorySlotContents(slot, rest.stackSize === 0 ? null : rest);
  }

  protected getBehaviorForItemStack(stack: ItemStack): DispenseBehavior | null {
    return BlockDispenser.dispenseBehaviors.get(stack.itemID) ?? BlockDispenser.defaultBehavior;
  }

  /** A rising redstone edge (above or at the block) fires it after 4 ticks. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    const powered = Block.isPowered(w, x, y, z) || Block.isPowered(w, x, y + 1, z);
    const meta = w.getBlockMetadata(x, y, z);
    const triggered = (meta & 8) !== 0;
    if (powered && !triggered) {
      w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
      w.setBlockMetadataWithNotify(x, y, z, meta | 8, 4);
    } else if (!powered && triggered) {
      w.setBlockMetadataWithNotify(x, y, z, meta & -9, 4);
    }
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isRemote) this.dispense(w, x, y, z);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityDispenser();
  }

  /** Faces the placer in all six directions, like a piston. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, BlockPistonBase.determineOrientation(w, x, y, z, e), 2);
    if (stack.hasDisplayName()) {
      const te = w.getBlockTileEntity(x, y, z);
      if (te instanceof TileEntityDispenser) te.setCustomName(stack.getDisplayName());
    }
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityDispenser) {
      BlockContainer.dropInventory(w, x, y, z, te, this.random);
      w.notifyComparatorsOfChange(x, y, z, id);
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  /** The point 0.7 blocks out of the front face (getIPositionFromBlockSource). */
  static getDispensePosition(x: number, y: number, z: number, facing: number): [number, number, number] {
    return [x + 0.5 + 0.7 * Facing.offsetsXForSide[facing], y + 0.5 + 0.7 * Facing.offsetsYForSide[facing], z + 0.5 + 0.7 * Facing.offsetsZForSide[facing]];
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    return calcRedstoneFromInventory(te instanceof TileEntityDispenser ? te : null);
  }
}

/** Dropper (158): drops items, or moves them into the inventory it faces. */
export class BlockDropper extends BlockDispenser {
  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('furnace_side');
    this.iconTop = reg.registerIcon('furnace_top');
    this.iconFront = reg.registerIcon('dropper_front');
    this.iconFrontVertical = reg.registerIcon('dropper_front_vertical');
  }

  protected override getBehaviorForItemStack(_stack: ItemStack): DispenseBehavior | null {
    return BlockDispenser.defaultBehavior;
  }

  override createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityDropper();
  }

  protected override dispense(w: IWorld, x: number, y: number, z: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (!(te instanceof TileEntityDispenser)) return;
    const slot = te.getRandomStackFromInventory();
    if (slot < 0) {
      w.playAuxSFX(1001, x, y, z, 0);
      return;
    }
    const stack = te.getStackInSlot(slot)!;
    const facing = w.getBlockMetadata(x, y, z) & 7;
    const target = TileEntityHopper.getInventoryAtLocation(w, x + Facing.offsetsXForSide[facing], y + Facing.offsetsYForSide[facing], z + Facing.offsetsZForSide[facing]);
    let rest: ItemStack | null;
    if (target) {
      rest = TileEntityHopper.insertStack(target, stack.copy().splitStack(1), Facing.oppositeSide[facing]);
      if (rest === null) {
        rest = stack.copy();
        if (--rest.stackSize === 0) rest = null;
      } else {
        rest = stack.copy();
      }
    } else {
      const behavior = BlockDispenser.defaultBehavior;
      rest = behavior ? behavior(w, x, y, z, facing, stack) : stack;
      if (rest && rest.stackSize === 0) rest = null;
    }
    te.setInventorySlotContents(slot, rest);
  }
}
