import { MathHelper } from '../core/MathHelper';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IInventory } from '../gui/inventory/IInventory';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { getChestInventory, TileEntityChest } from '../world/tileentity/TileEntityChest';
import { Block } from './Block';
import { BlockContainer, calcRedstoneFromInventory } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { Material } from './Material';

/**
 * Chests (54, trapped 146; render type 22, drawn by the chest renderer). Two chests of the
 * same kind side by side form a double chest; meta 2-5 = facing (both halves agree).
 */
export class BlockChest extends BlockContainer {
  private readonly random = BlockContainer.newRandom();

  constructor(
    id: number,
    readonly isTrapped: number,
  ) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabDecorations);
    this.setBlockBounds(0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 22;
  }

  /** A double chest's half reaches the shared edge. */
  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    if (w.getBlockId(x, y, z - 1) === this.blockID) this.setBlockBounds(0.0625, 0, 0, 0.9375, 0.875, 0.9375);
    else if (w.getBlockId(x, y, z + 1) === this.blockID) this.setBlockBounds(0.0625, 0, 0.0625, 0.9375, 0.875, 1);
    else if (w.getBlockId(x - 1, y, z) === this.blockID) this.setBlockBounds(0, 0, 0.0625, 0.9375, 0.875, 0.9375);
    else if (w.getBlockId(x + 1, y, z) === this.blockID) this.setBlockBounds(0.0625, 0, 0.0625, 1, 0.875, 0.9375);
    else this.setBlockBounds(0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    this.unifyAdjacentChests(w, x, y, z);
    if (w.getBlockId(x, y, z - 1) === this.blockID) this.unifyAdjacentChests(w, x, y, z - 1);
    if (w.getBlockId(x, y, z + 1) === this.blockID) this.unifyAdjacentChests(w, x, y, z + 1);
    if (w.getBlockId(x - 1, y, z) === this.blockID) this.unifyAdjacentChests(w, x - 1, y, z);
    if (w.getBlockId(x + 1, y, z) === this.blockID) this.unifyAdjacentChests(w, x + 1, y, z);
  }

  /** Faces the placer; a second half takes the first half's facing when it fits the pair. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    const n = w.getBlockId(x, y, z - 1);
    const s = w.getBlockId(x, y, z + 1);
    const west = w.getBlockId(x - 1, y, z);
    const east = w.getBlockId(x + 1, y, z);
    const facing = [2, 5, 3, 4][Block.yawToDirection(e)];
    const id = this.blockID;
    if (n !== id && s !== id && west !== id && east !== id) {
      w.setBlockMetadataWithNotify(x, y, z, facing, 3);
    } else {
      if ((n === id || s === id) && (facing === 4 || facing === 5)) {
        if (n === id) w.setBlockMetadataWithNotify(x, y, z - 1, facing, 3);
        else w.setBlockMetadataWithNotify(x, y, z + 1, facing, 3);
        w.setBlockMetadataWithNotify(x, y, z, facing, 3);
      }
      if ((west === id || east === id) && (facing === 2 || facing === 3)) {
        if (west === id) w.setBlockMetadataWithNotify(x - 1, y, z, facing, 3);
        else w.setBlockMetadataWithNotify(x + 1, y, z, facing, 3);
        w.setBlockMetadataWithNotify(x, y, z, facing, 3);
      }
    }
    if (stack.hasDisplayName()) {
      const te = w.getBlockTileEntity(x, y, z);
      if (te instanceof TileEntityChest) te.setChestGuiName(stack.getDisplayName());
    }
  }

  /** Points a chest (and its partner) away from solid blocks. */
  unifyAdjacentChests(w: IWorld, x: number, y: number, z: number): void {
    if (w.isRemote) return;
    const id = this.blockID;
    const n = w.getBlockId(x, y, z - 1);
    const s = w.getBlockId(x, y, z + 1);
    const west = w.getBlockId(x - 1, y, z);
    const east = w.getBlockId(x + 1, y, z);
    const opaque = Block.opaqueCubeLookup;
    let facing = 4;
    if (n === id || s === id) {
      const pz = n === id ? z - 1 : z + 1;
      const westP = w.getBlockId(x - 1, y, pz);
      const eastP = w.getBlockId(x + 1, y, pz);
      facing = 5;
      const partnerMeta = w.getBlockMetadata(x, y, pz);
      if (partnerMeta === 4) facing = 4;
      if ((opaque[west] || opaque[westP]) && !opaque[east] && !opaque[eastP]) facing = 5;
      if ((opaque[east] || opaque[eastP]) && !opaque[west] && !opaque[westP]) facing = 4;
    } else if (west !== id && east !== id) {
      facing = 3;
      if (opaque[n] && !opaque[s]) facing = 3;
      if (opaque[s] && !opaque[n]) facing = 2;
      if (opaque[west] && !opaque[east]) facing = 5;
      if (opaque[east] && !opaque[west]) facing = 4;
    } else {
      const px = west === id ? x - 1 : x + 1;
      const northP = w.getBlockId(px, y, z - 1);
      const southP = w.getBlockId(px, y, z + 1);
      facing = 3;
      const partnerMeta = w.getBlockMetadata(px, y, z);
      if (partnerMeta === 2) facing = 2;
      if ((opaque[n] || opaque[northP]) && !opaque[s] && !opaque[southP]) facing = 3;
      if ((opaque[s] || opaque[southP]) && !opaque[n] && !opaque[northP]) facing = 2;
    }
    w.setBlockMetadataWithNotify(x, y, z, facing, 3);
  }

  /** No more than two chests in a row, and never next to a double chest. */
  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    let n = 0;
    if (w.getBlockId(x - 1, y, z) === this.blockID) n++;
    if (w.getBlockId(x + 1, y, z) === this.blockID) n++;
    if (w.getBlockId(x, y, z - 1) === this.blockID) n++;
    if (w.getBlockId(x, y, z + 1) === this.blockID) n++;
    if (n > 1) return false;
    return !this.isThereANeighborChest(w, x - 1, y, z) && !this.isThereANeighborChest(w, x + 1, y, z) && !this.isThereANeighborChest(w, x, y, z - 1) && !this.isThereANeighborChest(w, x, y, z + 1);
  }

  private isThereANeighborChest(w: IWorld, x: number, y: number, z: number): boolean {
    if (w.getBlockId(x, y, z) !== this.blockID) return false;
    return w.getBlockId(x - 1, y, z) === this.blockID || w.getBlockId(x + 1, y, z) === this.blockID || w.getBlockId(x, y, z - 1) === this.blockID || w.getBlockId(x, y, z + 1) === this.blockID;
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    super.onNeighborBlockChange(w, x, y, z, id);
    w.getBlockTileEntity(x, y, z)?.updateContainingBlockInfo();
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityChest) {
      BlockContainer.dropInventory(w, x, y, z, te, this.random);
      w.notifyComparatorsOfChange(x, y, z, id);
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const inv = this.getInventory(w, x, y, z);
    if (inv) BlockGuiHooks.open({ kind: 'chest', player: p, world: w, x, y, z, inventory: inv, tileEntity: w.getBlockTileEntity(x, y, z) });
    return true;
  }

  /** The single or double chest inventory, or null when blocked from above. */
  getInventory(w: IWorld, x: number, y: number, z: number): IInventory | null {
    return getChestInventory(w, x, y, z);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityChest();
  }

  override canProvidePower(): boolean {
    return this.isTrapped === 1;
  }

  /** A trapped chest gives power by the number of players looking in. */
  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    if (!this.canProvidePower()) return 0;
    const te = (w as unknown as { getBlockTileEntity?: (x: number, y: number, z: number) => TileEntity | null }).getBlockTileEntity?.(x, y, z);
    return te instanceof TileEntityChest ? MathHelper.clamp_int(te.numUsingPlayers, 0, 15) : 0;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    return side === 1 ? this.isProvidingWeakPower(w, x, y, z, side) : 0;
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    return calcRedstoneFromInventory(this.getInventory(w, x, y, z));
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('wood');
  }
}
