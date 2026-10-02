import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import { ColorizerFoliage } from '../world/biome/Colorizer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Vines (106, render type 20): meta bits 1 south, 2 west, 4 north, 8 east say which faces hang
 * on a wall; 0 hangs under the block above. No collision; climbable; foliage-coloured.
 */
export class BlockVine extends Block {
  constructor(id: number) {
    super(id, Material.vine);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override getRenderType(): number {
    return 20;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    let minX = 1;
    let minY = 1;
    let minZ = 1;
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    let any = meta > 0;
    if ((meta & 2) !== 0) {
      maxX = Math.max(maxX, 0.0625);
      minX = 0;
      minY = 0;
      maxY = 1;
      minZ = 0;
      maxZ = 1;
      any = true;
    }
    if ((meta & 8) !== 0) {
      minX = Math.min(minX, 0.9375);
      maxX = 1;
      minY = 0;
      maxY = 1;
      minZ = 0;
      maxZ = 1;
      any = true;
    }
    if ((meta & 4) !== 0) {
      maxZ = Math.max(maxZ, 0.0625);
      minZ = 0;
      minX = 0;
      maxX = 1;
      minY = 0;
      maxY = 1;
      any = true;
    }
    if ((meta & 1) !== 0) {
      minZ = Math.min(minZ, 0.9375);
      maxZ = 1;
      minX = 0;
      maxX = 1;
      minY = 0;
      maxY = 1;
      any = true;
    }
    if (!any && this.canBePlacedOn(w.getBlockId(x, y + 1, z))) {
      minY = Math.min(minY, 0.9375);
      maxY = 1;
      minX = 0;
      maxX = 1;
      minZ = 0;
      maxZ = 1;
    }
    this.setBlockBounds(minX, minY, minZ, maxX, maxY, maxZ);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  /** Needs a full solid block behind the clicked face (or above for the bottom face of a block). */
  override canPlaceBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number): boolean {
    switch (side) {
      case 1:
        return this.canBePlacedOn(w.getBlockId(x, y + 1, z));
      case 2:
        return this.canBePlacedOn(w.getBlockId(x, y, z + 1));
      case 3:
        return this.canBePlacedOn(w.getBlockId(x, y, z - 1));
      case 4:
        return this.canBePlacedOn(w.getBlockId(x + 1, y, z));
      case 5:
        return this.canBePlacedOn(w.getBlockId(x - 1, y, z));
      default:
        return false;
    }
  }

  private canBePlacedOn(id: number): boolean {
    if (id === 0) return false;
    const b = Block.blocksList[id]!;
    return b.renderAsNormalBlock() && b.blockMaterial.blocksMovement();
  }

  /** Drops the faces that lost their support; false when nothing holds the vine any more. */
  private canVineStay(w: IWorld, x: number, y: number, z: number): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    let kept = meta;
    if (meta > 0) {
      for (let d = 0; d <= 3; d++) {
        const bit = 1 << d;
        if ((meta & bit) !== 0 && !this.canBePlacedOn(w.getBlockId(x + Direction.offsetX[d], y, z + Direction.offsetZ[d])) && (w.getBlockId(x, y + 1, z) !== this.blockID || (w.getBlockMetadata(x, y + 1, z) & bit) === 0)) {
          kept &= ~bit;
        }
      }
    }
    if (kept === 0 && !this.canBePlacedOn(w.getBlockId(x, y + 1, z))) return false;
    if (kept !== meta) w.setBlockMetadataWithNotify(x, y, z, kept, 2);
    return true;
  }

  override getBlockColor(): number {
    return ColorizerFoliage.getFoliageColorBasic();
  }

  override getRenderColor(_meta: number): number {
    return ColorizerFoliage.getFoliageColorBasic();
  }

  override colorMultiplier(w: IBlockAccess, x: number, _y: number, z: number): number {
    return w.getBiomeGenForCoords(x, z).getBiomeFoliageColor();
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!w.isRemote && !this.canVineStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): spreading up, sideways around corners and down (1 in 4 ticks, at most 5 vines nearby).
  }

  /** The face the vine hangs on is the one opposite the clicked face. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    const bits = [0, 0, 1, 4, 8, 2][side] ?? 0;
    return bits !== 0 ? bits : meta;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  /** Only shears collect vines. */
  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    const held = p.getCurrentEquippedItem();
    if (!w.isRemote && held && held.itemID === ItemIds.shears) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(BlockIds.vine, 1, 0));
    else super.harvestBlock(w, p, x, y, z, meta);
  }
}
