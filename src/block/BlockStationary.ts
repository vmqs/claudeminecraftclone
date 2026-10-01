import type { JavaRandom } from '../core/JavaRandom';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockFluid } from './BlockFluid';
import { Material } from './Material';

/** Still water (9) / lava (11): becomes flowing (id - 1) when a neighbour changes. */
export class BlockStationary extends BlockFluid {
  constructor(id: number, material: Material) {
    super(id, material);
    this.setTickRandomly(material === Material.lava);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    super.onNeighborBlockChange(w, x, y, z, id);
    if (w.getBlockId(x, y, z) === this.blockID) this.setNotStationary(w, x, y, z);
  }

  private setNotStationary(w: IWorld, x: number, y: number, z: number): void {
    const m = w.getBlockMetadata(x, y, z);
    w.setBlock(x, y, z, this.blockID - 1, m, 2);
    w.scheduleBlockUpdate(x, y, z, this.blockID - 1, this.tickRate(w));
  }

  /** Lava sets fire to flammable blocks nearby. */
  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (this.blockMaterial !== Material.lava) return;
    const n = rand.nextInt(3);
    for (let i = 0; i < n; i++) {
      x += rand.nextInt(3) - 1;
      y++;
      z += rand.nextInt(3) - 1;
      const id = w.getBlockId(x, y, z);
      if (id === 0) {
        if (
          this.isFlammable(w, x - 1, y, z) ||
          this.isFlammable(w, x + 1, y, z) ||
          this.isFlammable(w, x, y, z - 1) ||
          this.isFlammable(w, x, y, z + 1) ||
          this.isFlammable(w, x, y - 1, z) ||
          this.isFlammable(w, x, y + 1, z)
        ) {
          w.setBlock(x, y, z, BlockIds.fire);
          return;
        }
      } else if (Block.blocksList[id]!.blockMaterial.blocksMovement()) {
        return;
      }
    }
    if (n === 0) {
      const ox = x;
      const oz = z;
      for (let i = 0; i < 3; i++) {
        x = ox + rand.nextInt(3) - 1;
        z = oz + rand.nextInt(3) - 1;
        if (w.isAirBlock(x, y + 1, z) && this.isFlammable(w, x, y, z)) w.setBlock(x, y + 1, z, BlockIds.fire);
      }
    }
  }

  private isFlammable(w: IWorld, x: number, y: number, z: number): boolean {
    return w.getBlockMaterial(x, y, z).getCanBurn();
  }
}
