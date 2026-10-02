import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityHopper } from '../world/tileentity/TileEntityHopper';
import { Block } from './Block';
import { BlockContainer, calcRedstoneFromInventory } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Hopper (154, render type 38): meta & 7 = output side (0 down or 2-5 sideways, never up),
 * bit 8 = locked by redstone. Collision is the bowl: a 10/16 base and four 2/16 walls.
 */
export class BlockHopper extends BlockContainer {
  private readonly random = BlockContainer.newRandom();
  private hopperIcon: Icon | null = null;
  private hopperTopIcon: Icon | null = null;
  private hopperInsideIcon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.iron);
    this.setCreativeTab(CreativeTabs.tabRedstone);
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    const t = 0.125;
    this.setBlockBounds(0, 0, 0, 1, 0.625, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, t, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, 1, 1, t);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  /** Outputs into the clicked block (down when placed on a floor). */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, _hy: number, _hz: number, _meta: number): number {
    let out = Facing.oppositeSide[side];
    if (out === 1) out = 0;
    return out;
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityHopper();
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    super.onBlockPlacedBy(w, x, y, z, e, stack);
    if (stack.hasDisplayName()) BlockHopper.getHopperTile(w, x, y, z)?.setInventoryName(stack.getDisplayName());
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    this.updateMetadata(w, x, y, z);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = BlockHopper.getHopperTile(w, x, y, z);
    if (te) BlockGuiHooks.open({ kind: 'hopper', player: p, world: w, x, y, z, inventory: te, tileEntity: te });
    return true;
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    this.updateMetadata(w, x, y, z);
  }

  /** Bit 8 follows redstone power (never set while redstone is out of scope). */
  private updateMetadata(w: IWorld, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const out = BlockHopper.getDirectionFromMetadata(meta);
    const notPowered = !Block.isPowered(w, x, y, z);
    if (notPowered !== BlockHopper.getIsBlockNotPoweredFromMetadata(meta)) w.setBlockMetadataWithNotify(x, y, z, out | (notPowered ? 0 : 8), 4);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityHopper) {
      BlockContainer.dropInventory(w, x, y, z, te, this.random);
      w.notifyComparatorsOfChange(x, y, z, id);
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  override getRenderType(): number {
    return 38;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): boolean {
    return true;
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side === 1 ? this.hopperTopIcon : this.hopperIcon;
  }

  static getDirectionFromMetadata(meta: number): number {
    return meta & 7;
  }

  static getIsBlockNotPoweredFromMetadata(meta: number): boolean {
    return (meta & 8) !== 8;
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    return calcRedstoneFromInventory(BlockHopper.getHopperTile(w, x, y, z));
  }

  override registerIcons(reg: IconRegister): void {
    this.hopperIcon = reg.registerIcon('hopper');
    this.hopperTopIcon = reg.registerIcon('hopper_top');
    this.hopperInsideIcon = reg.registerIcon('hopper_inside');
  }

  /** The hopper textures by name, for the renderer. */
  static getHopperIcon(name: string): Icon | null {
    const b = Block.blocksList[BlockIds.hopperBlock] as BlockHopper | null;
    if (!b) return null;
    if (name === 'hopper') return b.hopperIcon;
    return name === 'hopper_inside' ? b.hopperInsideIcon : null;
  }

  override getItemIconName(): string | null {
    return 'hopper';
  }

  /** A hopper always has a solid top (World.isBlockTopFacingSurfaceSolid). */
  override hasSolidTopSurface(_meta: number): boolean {
    return true;
  }

  static getHopperTile(w: IBlockAccess, x: number, y: number, z: number): TileEntityHopper | null {
    const te = w.getBlockTileEntity?.(x, y, z) ?? null;
    return te instanceof TileEntityHopper ? te : null;
  }
}
