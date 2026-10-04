import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { JavaRandom } from '../../core/JavaRandom';
import { EnumSkyBlock } from '../IBlockAccess';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Surface and underground lakes of water or lava (WorldGenLakes). */
export class WorldGenLakes extends WorldGenerator {
  constructor(private readonly blockIndex: number) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    x -= 8;
    z -= 8;
    while (y > 5 && w.isAirBlock(x, y, z)) y--;
    if (y <= 4) return false;
    y -= 4;
    const shape = new Uint8Array(2048);
    const blobs = rand.nextInt(4) + 4;
    for (let n = 0; n < blobs; n++) {
      const sx = rand.nextDouble() * 6 + 3;
      const sy = rand.nextDouble() * 4 + 2;
      const sz = rand.nextDouble() * 6 + 3;
      const cx = rand.nextDouble() * (16 - sx - 2) + 1 + sx / 2;
      const cy = rand.nextDouble() * (8 - sy - 4) + 2 + sy / 2;
      const cz = rand.nextDouble() * (16 - sz - 2) + 1 + sz / 2;
      for (let i = 1; i < 15; i++) {
        for (let k = 1; k < 15; k++) {
          for (let j = 1; j < 7; j++) {
            const dx = (i - cx) / (sx / 2);
            const dy = (j - cy) / (sy / 2);
            const dz = (k - cz) / (sz / 2);
            if (dx * dx + dy * dy + dz * dz < 1) shape[(i * 16 + k) * 8 + j] = 1;
          }
        }
      }
    }
    const at = (i: number, k: number, j: number) => shape[(i * 16 + k) * 8 + j] === 1;
    const isEdge = (i: number, k: number, j: number) =>
      !at(i, k, j) &&
      ((i < 15 && at(i + 1, k, j)) ||
        (i > 0 && at(i - 1, k, j)) ||
        (k < 15 && at(i, k + 1, j)) ||
        (k > 0 && at(i, k - 1, j)) ||
        (j < 7 && at(i, k, j + 1)) ||
        (j > 0 && at(i, k, j - 1)));
    for (let i = 0; i < 16; i++) {
      for (let k = 0; k < 16; k++) {
        for (let j = 0; j < 8; j++) {
          if (!isEdge(i, k, j)) continue;
          const m = w.getBlockMaterial(x + i, y + j, z + k);
          if (j >= 4 && m.isLiquid()) return false;
          if (j < 4 && !m.isSolid() && w.getBlockId(x + i, y + j, z + k) !== this.blockIndex) return false;
        }
      }
    }
    for (let i = 0; i < 16; i++)
      for (let k = 0; k < 16; k++)
        for (let j = 0; j < 8; j++) if (at(i, k, j)) w.setBlock(x + i, y + j, z + k, j >= 4 ? 0 : this.blockIndex, 0, 2);
    for (let i = 0; i < 16; i++) {
      for (let k = 0; k < 16; k++) {
        for (let j = 4; j < 8; j++) {
          if (at(i, k, j) && w.getBlockId(x + i, y + j - 1, z + k) === BlockIds.dirt && w.getSavedLightValue(EnumSkyBlock.Sky, x + i, y + j, z + k) > 0) {
            const biome = w.getBiomeGenForCoords(x + i, z + k);
            w.setBlock(x + i, y + j - 1, z + k, biome.topBlock === BlockIds.mycelium ? BlockIds.mycelium : BlockIds.grass, 0, 2);
          }
        }
      }
    }
    const mat = Block.blocksList[this.blockIndex]?.blockMaterial;
    if (mat === Material.lava) {
      for (let i = 0; i < 16; i++)
        for (let k = 0; k < 16; k++)
          for (let j = 0; j < 8; j++) {
            if (isEdge(i, k, j) && (j < 4 || rand.nextInt(2) !== 0) && w.getBlockMaterial(x + i, y + j, z + k).isSolid()) {
              w.setBlock(x + i, y + j, z + k, BlockIds.stone, 0, 2);
            }
          }
    }
    if (mat === Material.water) {
      for (let i = 0; i < 16; i++)
        for (let k = 0; k < 16; k++) if (w.isBlockFreezable(x + i, y + 4, z + k)) w.setBlock(x + i, y + 4, z + k, BlockIds.ice, 0, 2);
    }
    return true;
  }
}
