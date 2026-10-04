import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import type { WorldGenerator } from '../WorldGenerator';
import { WorldGenMinable } from '../WorldGenMinable';
import { spawnGenEntity } from '../WorldGenSpawning';
import { WorldGenSpikes } from './WorldGenSpikes';

const f = Math.fround;

/**
 * BiomeEndDecorator (the Sky biome's decorator): the standard ore pass (which finds no stone in
 * the End but still draws its random numbers), a spike in one chunk out of five, and the Ender
 * Dragon at (0, 128, 0) when chunk (0, 0) is decorated, which happens once per End world.
 */
export class BiomeEndDecorator {
  private readonly spikeGen = new WorldGenSpikes(BlockIds.whiteStone);
  private readonly ores: [WorldGenerator, number, number, number][] = [
    [new WorldGenMinable(BlockIds.dirt, 32), 20, 0, 128],
    [new WorldGenMinable(BlockIds.gravel, 32), 10, 0, 128],
    [new WorldGenMinable(BlockIds.oreCoal, 16), 20, 0, 128],
    [new WorldGenMinable(BlockIds.oreIron, 8), 20, 0, 64],
    [new WorldGenMinable(BlockIds.oreGold, 8), 2, 0, 32],
    [new WorldGenMinable(BlockIds.oreRedstone, 7), 8, 0, 16],
    [new WorldGenMinable(BlockIds.oreDiamond, 7), 1, 0, 16],
  ];
  private readonly lapisGen = new WorldGenMinable(BlockIds.oreLapis, 6);

  decorate(w: IWorld, rand: JavaRandom, chunkX: number, chunkZ: number): void {
    this.generateOres(w, rand, chunkX, chunkZ);
    if (rand.nextInt(5) === 0) {
      const x = chunkX + rand.nextInt(16) + 8;
      const z = chunkZ + rand.nextInt(16) + 8;
      const y = w.getTopSolidOrLiquidBlock(x, z);
      this.spikeGen.generate(w, rand, x, y, z);
    }
    if (chunkX === 0 && chunkZ === 0) {
      spawnGenEntity(w, { name: 'EnderDragon', x: 0, y: 128, z: 0, yaw: f(rand.nextFloat() * 360), init: false });
    }
  }

  /** BiomeDecorator.generateOres (genStandardOre1 x7, genStandardOre2 for lapis). */
  private generateOres(w: IWorld, rand: JavaRandom, chunkX: number, chunkZ: number): void {
    for (const [gen, count, min, max] of this.ores) {
      for (let i = 0; i < count; i++) {
        const x = chunkX + rand.nextInt(16);
        const y = rand.nextInt(max - min) + min;
        const z = chunkZ + rand.nextInt(16);
        gen.generate(w, rand, x, y, z);
      }
    }
    const x = chunkX + rand.nextInt(16);
    const y = rand.nextInt(16) + rand.nextInt(16) + (16 - 16);
    const z = chunkZ + rand.nextInt(16);
    this.lapisGen.generate(w, rand, x, y, z);
  }
}
