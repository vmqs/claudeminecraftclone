import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

const fround = Math.fround;

/**
 * Dragon egg (122): hops to a random free spot within 16 x 8 x 16 blocks when used or punched,
 * leaving a trail of portal particles; falls like sand.
 */
export class BlockDragonEgg extends Block {
  constructor(id: number) {
    super(id, Material.dragonEgg);
    this.setBlockBounds(0.0625, 0, 0.0625, 0.9375, 1, 0.9375);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): fall like sand when unsupported (an EntityFallingSand of this id with
    // metadata 0; with BlockSand.fallInstantly or unloaded chunks, drop straight down instead).
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer, _side: number, _hx: number, _hy: number, _hz: number): boolean {
    this.teleportNearby(w, x, y, z);
    return true;
  }

  override onBlockClicked(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): void {
    this.teleportNearby(w, x, y, z);
  }

  /**
   * Moves the egg to the first air block of up to 1000 random tries. The original server moves
   * the block while the client draws the particle trail; this single world does both, with
   * the trail toward the new spot.
   */
  private teleportNearby(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockId(x, y, z) !== this.blockID) return;
    for (let i = 0; i < 1000; i++) {
      const tx = x + w.rand.nextInt(16) - w.rand.nextInt(16);
      const ty = y + w.rand.nextInt(8) - w.rand.nextInt(8);
      const tz = z + w.rand.nextInt(16) - w.rand.nextInt(16);
      if (w.getBlockId(tx, ty, tz) !== 0) continue;
      w.setBlock(tx, ty, tz, this.blockID, w.getBlockMetadata(x, y, z), 2);
      w.setBlockToAir(x, y, z);
      for (let j = 0; j < 128; j++) {
        const t = w.rand.nextDouble();
        const vx = fround(fround(w.rand.nextFloat() - 0.5) * 0.2);
        const vy = fround(fround(w.rand.nextFloat() - 0.5) * 0.2);
        const vz = fround(fround(w.rand.nextFloat() - 0.5) * 0.2);
        const px = tx + (x - tx) * t + (w.rand.nextDouble() - 0.5) * 1 + 0.5;
        const py = ty + (y - ty) * t + w.rand.nextDouble() * 1 - 0.5;
        const pz = tz + (z - tz) * t + (w.rand.nextDouble() - 0.5) * 1 + 0.5;
        w.spawnParticle('portal', px, py, pz, vx, vy, vz);
      }
      return;
    }
  }

  override tickRate(_w: IWorld): number {
    return 5;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): boolean {
    return true;
  }

  override getRenderType(): number {
    return 27;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }
}
