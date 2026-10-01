import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Sugar cane. */
export class BlockReed extends Block {
  constructor(id: number) {
    super(id, Material.plants);
    const f = 0.375;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, 1, 0.5 + f);
    this.setTickRandomly(true);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isAirBlock(x, y + 1, z)) return;
    let h = 1;
    while (w.getBlockId(x, y - h, z) === this.blockID) h++;
    if (h < 3) {
      const meta = w.getBlockMetadata(x, y, z);
      if (meta === 15) {
        w.setBlock(x, y + 1, z, this.blockID);
        w.setBlockMetadataWithNotify(x, y, z, 0, 4);
      } else {
        w.setBlockMetadataWithNotify(x, y, z, meta + 1, 4);
      }
    }
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    const below = w.getBlockId(x, y - 1, z);
    if (below === this.blockID) return true;
    if (below !== BlockIds.grass && below !== BlockIds.dirt && below !== BlockIds.sand) return false;
    return (
      w.getBlockMaterial(x - 1, y - 1, z) === Material.water ||
      w.getBlockMaterial(x + 1, y - 1, z) === Material.water ||
      w.getBlockMaterial(x, y - 1, z - 1) === Material.water ||
      w.getBlockMaterial(x, y - 1, z + 1) === Material.water
    );
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    this.checkBlockCoordValid(w, x, y, z);
  }

  protected checkBlockCoordValid(w: IWorld, x: number, y: number, z: number): void {
    if (!this.canBlockStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    return this.canPlaceBlockAt(w, x, y, z);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.reed;
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

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.reed;
  }
}
