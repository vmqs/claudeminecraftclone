import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Torch: meta 1-4 attached to a wall (east, west, south, north facing), 5 standing. */
export class BlockTorch extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabDecorations);
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
    return 2;
  }

  private canPlaceTorchOn(w: IWorld, x: number, y: number, z: number): boolean {
    if (w.doesBlockHaveSolidTopSurface(x, y, z)) return true;
    const id = w.getBlockId(x, y, z);
    return id === BlockIds.fence || id === BlockIds.netherFence || id === BlockIds.glass || id === BlockIds.cobblestoneWall;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return (
      w.isBlockNormalCubeDefault(x - 1, y, z, true) ||
      w.isBlockNormalCubeDefault(x + 1, y, z, true) ||
      w.isBlockNormalCubeDefault(x, y, z - 1, true) ||
      w.isBlockNormalCubeDefault(x, y, z + 1, true) ||
      this.canPlaceTorchOn(w, x, y - 1, z)
    );
  }

  override onBlockPlaced(w: IWorld, x: number, y: number, z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    let m = meta;
    if (side === 1 && this.canPlaceTorchOn(w, x, y - 1, z)) m = 5;
    if (side === 2 && w.isBlockNormalCubeDefault(x, y, z + 1, true)) m = 4;
    if (side === 3 && w.isBlockNormalCubeDefault(x, y, z - 1, true)) m = 3;
    if (side === 4 && w.isBlockNormalCubeDefault(x + 1, y, z, true)) m = 2;
    if (side === 5 && w.isBlockNormalCubeDefault(x - 1, y, z, true)) m = 1;
    return m;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.updateTick(w, x, y, z, rand);
    if (w.getBlockMetadata(x, y, z) === 0) this.onBlockAdded(w, x, y, z);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockMetadata(x, y, z) === 0) {
      if (w.isBlockNormalCubeDefault(x - 1, y, z, true)) w.setBlockMetadataWithNotify(x, y, z, 1, 2);
      else if (w.isBlockNormalCubeDefault(x + 1, y, z, true)) w.setBlockMetadataWithNotify(x, y, z, 2, 2);
      else if (w.isBlockNormalCubeDefault(x, y, z - 1, true)) w.setBlockMetadataWithNotify(x, y, z, 3, 2);
      else if (w.isBlockNormalCubeDefault(x, y, z + 1, true)) w.setBlockMetadataWithNotify(x, y, z, 4, 2);
      else if (this.canPlaceTorchOn(w, x, y - 1, z)) w.setBlockMetadataWithNotify(x, y, z, 5, 2);
    }
    this.dropTorchIfCantStay(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    this.func_94397_d(w, x, y, z, id);
  }

  protected func_94397_d(w: IWorld, x: number, y: number, z: number, _id: number): boolean {
    if (!this.dropTorchIfCantStay(w, x, y, z)) return true;
    const m = w.getBlockMetadata(x, y, z);
    let drop = false;
    if (!w.isBlockNormalCubeDefault(x - 1, y, z, true) && m === 1) drop = true;
    if (!w.isBlockNormalCubeDefault(x + 1, y, z, true) && m === 2) drop = true;
    if (!w.isBlockNormalCubeDefault(x, y, z - 1, true) && m === 3) drop = true;
    if (!w.isBlockNormalCubeDefault(x, y, z + 1, true) && m === 4) drop = true;
    if (!this.canPlaceTorchOn(w, x, y - 1, z) && m === 5) drop = true;
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
      return true;
    }
    return false;
  }

  protected dropTorchIfCantStay(w: IWorld, x: number, y: number, z: number): boolean {
    if (!this.canPlaceBlockAt(w, x, y, z)) {
      if (w.getBlockId(x, y, z) === this.blockID) {
        this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
        w.setBlockToAir(x, y, z);
      }
      return false;
    }
    return true;
  }

  override collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    const m = w.getBlockMetadata(x, y, z) & 7;
    let f = 0.15;
    if (m === 1) this.setBlockBounds(0, 0.2, 0.5 - f, f * 2, 0.8, 0.5 + f);
    else if (m === 2) this.setBlockBounds(1 - f * 2, 0.2, 0.5 - f, 1, 0.8, 0.5 + f);
    else if (m === 3) this.setBlockBounds(0.5 - f, 0.2, 0, 0.5 + f, 0.8, f * 2);
    else if (m === 4) this.setBlockBounds(0.5 - f, 0.2, 1 - f * 2, 0.5 + f, 0.8, 1);
    else {
      f = 0.1;
      this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, 0.6, 0.5 + f);
    }
    return super.collisionRayTrace(w, x, y, z, start, end);
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    const m = w.getBlockMetadata(x, y, z);
    const px = x + 0.5;
    const py = y + 0.7;
    const pz = z + 0.5;
    const up = Math.fround(0.22);
    const off = Math.fround(0.27);
    if (m === 1) this.flame(w, px - off, py + up, pz);
    else if (m === 2) this.flame(w, px + off, py + up, pz);
    else if (m === 3) this.flame(w, px, py + up, pz - off);
    else if (m === 4) this.flame(w, px, py + up, pz + off);
    else this.flame(w, px, py, pz);
  }

  private flame(w: IWorld, x: number, y: number, z: number): void {
    w.spawnParticle('smoke', x, y, z, 0, 0, 0);
    w.spawnParticle('flame', x, y, z, 0, 0, 0);
  }
}
