import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { IconRegister } from '../render/texture/Icon';
import { EnumSkyBlock, type IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { noteHarvest } from './HarvestModifiers';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Snow layer (78): meta & 7 = extra layers. */
export class BlockSnow extends Block {
  constructor(id: number) {
    super(id, Material.snow);
    this.setBlockBounds(0, 0, 0, 1, 0.125, 1);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabDecorations);
    this.setBlockBoundsForSnowDepth(0);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('snow');
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const layers = w.getBlockMetadata(x, y, z) & 7;
    return AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, Math.fround(y + layers * 0.125), z + this.maxZ);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBoundsForSnowDepth(0);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.setBlockBoundsForSnowDepth(w.getBlockMetadata(x, y, z));
  }

  protected setBlockBoundsForSnowDepth(meta: number): void {
    const layers = meta & 7;
    this.setBlockBounds(0, 0, 0, 1, (2 * (1 + layers)) / 16, 1);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    const below = w.getBlockId(x, y - 1, z);
    if (below === 0) return false;
    if (below === this.blockID && (w.getBlockMetadata(x, y - 1, z) & 7) === 7) return true;
    if (below !== BlockIds.leaves && !Block.blocksList[below]!.isOpaqueCube()) return false;
    return w.getBlockMaterial(x, y - 1, z).blocksMovement();
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    this.canSnowStay(w, x, y, z);
  }

  private canSnowStay(w: IWorld, x: number, y: number, z: number): boolean {
    if (!this.canPlaceBlockAt(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
      return false;
    }
    return true;
  }

  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    this.dropBlockAsItem_do(w, x, y, z, new ItemStack(ItemIds.snowball, (meta & 7) + 1, 0));
    w.setBlockToAir(x, y, z);
    noteHarvest(p, this.blockID, false);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.snowball;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.getSavedLightValue(EnumSkyBlock.Block, x, y, z) > 11) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  override hasSolidTopSurface(meta: number): boolean {
    return (meta & 7) === 7;
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    return side === 1 ? true : super.shouldSideBeRendered(w, x, y, z, side);
  }
}
