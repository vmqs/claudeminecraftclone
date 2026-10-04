import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';
import { spawnGenEntity } from '../WorldGenSpawning';

const f = Math.fround;

/**
 * The End's obsidian pillars (WorldGenSpikes): on a spot of `replaceId` (end stone) with
 * room around it, a disc of radius 1-4 (r^2 + 1 rule) and 6-37 high, capped with bedrock under an
 * ender crystal. The crystal keeps a fire burning on the bedrock.
 */
export class WorldGenSpikes extends WorldGenerator {
  constructor(private readonly replaceId: number = BlockIds.whiteStone) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    if (!w.isAirBlock(x, y, z) || w.getBlockId(x, y - 1, z) !== this.replaceId) return false;
    const height = rand.nextInt(32) + 6;
    const radius = rand.nextInt(4) + 1;
    const r2 = radius * radius + 1;
    for (let bx = x - radius; bx <= x + radius; bx++) {
      for (let bz = z - radius; bz <= z + radius; bz++) {
        const dx = bx - x;
        const dz = bz - z;
        if (dx * dx + dz * dz <= r2 && w.getBlockId(bx, y - 1, bz) !== this.replaceId) return false;
      }
    }
    for (let by = y; by < y + height && by < 128; by++) {
      for (let bx = x - radius; bx <= x + radius; bx++) {
        for (let bz = z - radius; bz <= z + radius; bz++) {
          const dx = bx - x;
          const dz = bz - z;
          if (dx * dx + dz * dz <= r2) w.setBlock(bx, by, bz, BlockIds.obsidian, 0, 2);
        }
      }
    }
    spawnGenEntity(w, { name: 'EnderCrystal', x: f(x + f(0.5)), y: y + height, z: f(z + f(0.5)), yaw: f(rand.nextFloat() * 360), init: false });
    w.setBlock(x, y + height, z, BlockIds.bedrock, 0, 2);
    return true;
  }
}
