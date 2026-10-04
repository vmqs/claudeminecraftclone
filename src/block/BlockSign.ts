import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntitySign } from '../world/tileentity/TileEntitySign';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Signs (63 standing: meta = rotation 0-15; 68 on a wall: meta 2-5 = facing). Drawn only by
 * the sign tile-entity renderer (render type -1); no collision.
 */
export class BlockSign extends BlockContainer {
  constructor(
    id: number,
    private readonly isFreestanding: boolean,
  ) {
    super(id, Material.wood);
    this.setBlockBounds(0.25, 0, 0.25, 0.75, 1, 0.75);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return Block.blocksList[BlockIds.planks]!.getBlockTextureFromSide(side);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    if (this.isFreestanding) return;
    const meta = w.getBlockMetadata(x, y, z);
    const lo = 0.28125;
    const hi = 0.78125;
    const t = 0.125;
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
    if (meta === 2) this.setBlockBounds(0, lo, 1 - t, 1, hi, 1);
    if (meta === 3) this.setBlockBounds(0, lo, 0, 1, hi, t);
    if (meta === 4) this.setBlockBounds(1 - t, lo, 0, 1, hi, 1);
    if (meta === 5) this.setBlockBounds(0, lo, 0, t, hi, 1);
  }

  override getRenderType(): number {
    return -1;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntitySign();
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.sign;
  }

  /** Pops off without a solid block below (standing) or behind (wall sign). */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    let drop = false;
    if (this.isFreestanding) {
      if (!w.getBlockMaterial(x, y - 1, z).isSolid()) drop = true;
    } else {
      const meta = w.getBlockMetadata(x, y, z);
      drop = true;
      if (meta === 2 && w.getBlockMaterial(x, y, z + 1).isSolid()) drop = false;
      if (meta === 3 && w.getBlockMaterial(x, y, z - 1).isSolid()) drop = false;
      if (meta === 4 && w.getBlockMaterial(x + 1, y, z).isSolid()) drop = false;
      if (meta === 5 && w.getBlockMaterial(x - 1, y, z).isSolid()) drop = false;
    }
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
    super.onNeighborBlockChange(w, x, y, z, id);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.sign;
  }

  override registerIcons(_reg: IconRegister): void {}
}
