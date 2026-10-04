import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Base of flowers, saplings, mushrooms, tall grass: cross-rendered, no collision. */
export class BlockFlower extends Block {
  constructor(id: number, material: Material = Material.plants) {
    super(id, material);
    this.setTickRandomly(true);
    const f = 0.2;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, f * 3, 0.5 + f);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return super.canPlaceBlockAt(w, x, y, z) && this.canThisPlantGrowOnThisBlockID(w.getBlockId(x, y - 1, z));
  }

  protected canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.grass || id === BlockIds.dirt || id === BlockIds.tilledField;
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    super.onNeighborBlockChange(w, x, y, z, id);
    this.checkFlowerChange(w, x, y, z);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    this.checkFlowerChange(w, x, y, z);
  }

  protected checkFlowerChange(w: IWorld, x: number, y: number, z: number): void {
    if (!this.canBlockStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    return (w.getFullBlockLightValue(x, y, z) >= 8 || w.canBlockSeeTheSky(x, y, z)) && this.canThisPlantGrowOnThisBlockID(w.getBlockId(x, y - 1, z));
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

  override getRenderType(): number {
    return 1;
  }
}
