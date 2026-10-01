import type { JavaRandom } from '../core/JavaRandom';
import type { IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockFlower } from './BlockFlower';

export class BlockMushroom extends BlockFlower {
  constructor(
    id: number,
    private readonly textureName: string,
  ) {
    super(id);
    const f = 0.2;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, f * 2, 0.5 + f);
    this.setTickRandomly(true);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (rand.nextInt(25) !== 0) return;
    const r = 4;
    let limit = 5;
    for (let ix = x - r; ix <= x + r; ix++) {
      for (let iz = z - r; iz <= z + r; iz++) {
        for (let iy = y - 1; iy <= y + 1; iy++) {
          if (w.getBlockId(ix, iy, iz) === this.blockID && --limit <= 0) return;
        }
      }
    }
    let tx = x + rand.nextInt(3) - 1;
    let ty = y + rand.nextInt(2) - rand.nextInt(2);
    let tz = z + rand.nextInt(3) - 1;
    for (let i = 0; i < 4; i++) {
      if (w.isAirBlock(tx, ty, tz) && this.canBlockStay(w, tx, ty, tz)) {
        x = tx;
        y = ty;
        z = tz;
      }
      tx = x + rand.nextInt(3) - 1;
      ty = y + rand.nextInt(2) - rand.nextInt(2);
      tz = z + rand.nextInt(3) - 1;
    }
    if (w.isAirBlock(tx, ty, tz) && this.canBlockStay(w, tx, ty, tz)) w.setBlock(tx, ty, tz, this.blockID);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return super.canPlaceBlockAt(w, x, y, z) && this.canBlockStay(w, x, y, z);
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return Block.opaqueCubeLookup[id];
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    if (y < 0 || y >= 256) return false;
    const below = w.getBlockId(x, y - 1, z);
    return below === BlockIds.mycelium || (w.getFullBlockLightValue(x, y, z) < 13 && this.canThisPlantGrowOnThisBlockID(below));
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.textureName);
  }
}
