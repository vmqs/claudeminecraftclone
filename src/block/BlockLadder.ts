import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/** Ladder (65, render type 8): meta 2-5 = the face it is on (the wall is on the opposite side). */
export class BlockLadder extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.updateLadderBounds(w.getBlockMetadata(x, y, z));
  }

  /** 1/8 thick against the wall; other metadata keeps the previous bounds (as in 1.5.2). */
  updateLadderBounds(meta: number): void {
    const t = 0.125;
    if (meta === 2) this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
    if (meta === 3) this.setBlockBounds(0, 0, 0, 1, 1, t);
    if (meta === 4) this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
    if (meta === 5) this.setBlockBounds(0, 0, 0, t, 1, 1);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 8;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.isBlockNormalCube(x - 1, y, z) || w.isBlockNormalCube(x + 1, y, z) || w.isBlockNormalCube(x, y, z - 1) || w.isBlockNormalCube(x, y, z + 1);
  }

  /** On the clicked face when it has a wall behind it, else on the first wall found. */
  override onBlockPlaced(w: IWorld, x: number, y: number, z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    let m = meta;
    if ((meta === 0 || side === 2) && w.isBlockNormalCube(x, y, z + 1)) m = 2;
    if ((m === 0 || side === 3) && w.isBlockNormalCube(x, y, z - 1)) m = 3;
    if ((m === 0 || side === 4) && w.isBlockNormalCube(x + 1, y, z)) m = 4;
    if ((m === 0 || side === 5) && w.isBlockNormalCube(x - 1, y, z)) m = 5;
    return m;
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    let held = false;
    if (meta === 2 && w.isBlockNormalCube(x, y, z + 1)) held = true;
    if (meta === 3 && w.isBlockNormalCube(x, y, z - 1)) held = true;
    if (meta === 4 && w.isBlockNormalCube(x + 1, y, z)) held = true;
    if (meta === 5 && w.isBlockNormalCube(x - 1, y, z)) held = true;
    if (!held) {
      this.dropBlockAsItem(w, x, y, z, meta, 0);
      w.setBlockToAir(x, y, z);
    }
    super.onNeighborBlockChange(w, x, y, z, id);
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }
}
