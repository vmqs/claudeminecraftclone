import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { fillChest, type ChestContent } from '../ChestLoot';
import { WorldGenerator } from '../WorldGenerator';

/** The bonus chest next to the spawn, with torches around it (WorldGeneratorBonusChest). */
export class WorldGeneratorBonusChest extends WorldGenerator {
  constructor(
    private readonly content: readonly ChestContent[],
    private readonly itemsToGenerate: number,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    let id: number;
    while (((id = w.getBlockId(x, y, z)) === 0 || id === BlockIds.leaves) && y > 1) y--;
    if (y < 1) return false;
    y++;
    for (let i = 0; i < 4; i++) {
      const cx = x + rand.nextInt(4) - rand.nextInt(4);
      const cy = y + rand.nextInt(3) - rand.nextInt(3);
      const cz = z + rand.nextInt(4) - rand.nextInt(4);
      if (!w.isAirBlock(cx, cy, cz) || !w.doesBlockHaveSolidTopSurface(cx, cy - 1, cz)) continue;
      w.setBlock(cx, cy, cz, BlockIds.chest, 0, 2);
      fillChest(w, rand, cx, cy, cz, this.content, this.itemsToGenerate);
      // The original tests the block under the west torch for all four torches.
      const solidWest = () => w.doesBlockHaveSolidTopSurface(cx - 1, cy - 1, cz);
      if (w.isAirBlock(cx - 1, cy, cz) && solidWest()) w.setBlock(cx - 1, cy, cz, BlockIds.torchWood, 0, 2);
      if (w.isAirBlock(cx + 1, cy, cz) && solidWest()) w.setBlock(cx + 1, cy, cz, BlockIds.torchWood, 0, 2);
      if (w.isAirBlock(cx, cy, cz - 1) && solidWest()) w.setBlock(cx, cy, cz - 1, BlockIds.torchWood, 0, 2);
      if (w.isAirBlock(cx, cy, cz + 1) && solidWest()) w.setBlock(cx, cy, cz + 1, BlockIds.torchWood, 0, 2);
      return true;
    }
    return false;
  }
}
