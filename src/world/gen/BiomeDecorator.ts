import { BlockIds } from '../../block/BlockIds';
import type { JavaRandom } from '../../core/JavaRandom';
import type { BiomeGenBase } from '../biome/BiomeGenBase';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';
import { WorldGenFlowers } from './WorldGenFlowers';
import { WorldGenMinable } from './WorldGenMinable';
import { WorldGenCactus, WorldGenClay, WorldGenDeadBush, WorldGenLiquids, WorldGenSand } from './WorldGenPlants';
import { WorldGenReed } from './WorldGenReed';
import { WorldGenTallGrass } from './WorldGenTallGrass';
import { WorldGenTrees } from './WorldGenTrees';

/** Per-biome tree and grass generators; world/gen can register biome-specific ones by id. */
export const biomeFeatures = {
  trees: new Map<number, (rand: JavaRandom) => WorldGenerator>(),
  grass: new Map<number, (rand: JavaRandom) => WorldGenerator>(),
};

const defaultTrees = new WorldGenTrees(false);

/** BiomeGenBase.getRandomWorldGenForTrees default: 1 in 10 big oak (big oak not ported yet). */
function randomTreeGen(biome: BiomeGenBase, rand: JavaRandom): WorldGenerator {
  const custom = biomeFeatures.trees.get(biome.biomeID);
  if (custom) return custom(rand);
  rand.nextInt(10);
  return defaultTrees;
}

function randomGrassGen(biome: BiomeGenBase, rand: JavaRandom): WorldGenerator {
  const custom = biomeFeatures.grass.get(biome.biomeID);
  return custom ? custom(rand) : new WorldGenTallGrass(BlockIds.tallGrass, 1);
}

/**
 * BiomeDecorator.decorate: ores, sand/clay discs, trees, flowers, grass, mushrooms, reeds,
 * cacti and springs, in the original order. Big mushrooms, lily pads and pumpkins are not
 * placed yet (their blocks are not registered).
 */
export class BiomeDecorator {
  private world!: IWorld;
  private rand!: JavaRandom;
  private chunkX = 0;
  private chunkZ = 0;
  private readonly sandGen = new WorldGenSand(7, BlockIds.sand);
  private readonly clayGen = new WorldGenClay(4);
  private readonly dirtGen = new WorldGenMinable(BlockIds.dirt, 32);
  private readonly gravelGen = new WorldGenMinable(BlockIds.gravel, 32);
  private readonly coalGen = new WorldGenMinable(BlockIds.oreCoal, 16);
  private readonly ironGen = new WorldGenMinable(BlockIds.oreIron, 8);
  private readonly goldGen = new WorldGenMinable(BlockIds.oreGold, 8);
  private readonly redstoneGen = new WorldGenMinable(BlockIds.oreRedstone, 7);
  private readonly diamondGen = new WorldGenMinable(BlockIds.oreDiamond, 7);
  private readonly lapisGen = new WorldGenMinable(BlockIds.oreLapis, 6);
  private readonly plantYellowGen = new WorldGenFlowers(BlockIds.plantYellow);
  private readonly plantRedGen = new WorldGenFlowers(BlockIds.plantRed);
  private readonly mushroomBrownGen = new WorldGenFlowers(BlockIds.mushroomBrown);
  private readonly mushroomRedGen = new WorldGenFlowers(BlockIds.mushroomRed);
  private readonly reedGen = new WorldGenReed();
  private readonly cactusGen = new WorldGenCactus();

  constructor(readonly biome: BiomeGenBase) {}

  decorate(world: IWorld, rand: JavaRandom, x: number, z: number): void {
    this.world = world;
    this.rand = rand;
    this.chunkX = x;
    this.chunkZ = z;
    this.decorateChunk();
  }

  private rx(): number {
    return this.chunkX + this.rand.nextInt(16) + 8;
  }
  private rz(): number {
    return this.chunkZ + this.rand.nextInt(16) + 8;
  }

  protected decorateChunk(): void {
    const d = this.biome.decorator;
    const w = this.world;
    const r = this.rand;
    this.generateOres();
    for (let i = 0; i < d.sandPerChunk2; i++) {
      const x = this.rx();
      const z = this.rz();
      this.sandGen.generate(w, r, x, w.getTopSolidOrLiquidBlock(x, z), z);
    }
    for (let i = 0; i < d.clayPerChunk; i++) {
      const x = this.rx();
      const z = this.rz();
      this.clayGen.generate(w, r, x, w.getTopSolidOrLiquidBlock(x, z), z);
    }
    for (let i = 0; i < d.sandPerChunk; i++) {
      const x = this.rx();
      const z = this.rz();
      this.sandGen.generate(w, r, x, w.getTopSolidOrLiquidBlock(x, z), z);
    }
    let trees = d.treesPerChunk;
    if (r.nextInt(10) === 0) trees++;
    for (let i = 0; i < trees; i++) {
      const x = this.rx();
      const z = this.rz();
      const gen = randomTreeGen(this.biome, r);
      gen.setScale(1, 1, 1);
      gen.generate(w, r, x, w.getHeightValue(x, z), z);
    }
    for (let i = 0; i < d.bigMushroomsPerChunk; i++) {
      this.rx();
      this.rz();
    }
    for (let i = 0; i < d.flowersPerChunk; i++) {
      let x = this.rx();
      let y = r.nextInt(128);
      let z = this.rz();
      this.plantYellowGen.generate(w, r, x, y, z);
      if (r.nextInt(4) === 0) {
        x = this.rx();
        y = r.nextInt(128);
        z = this.rz();
        this.plantRedGen.generate(w, r, x, y, z);
      }
    }
    for (let i = 0; i < d.grassPerChunk; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      randomGrassGen(this.biome, r).generate(w, r, x, y, z);
    }
    for (let i = 0; i < d.deadBushPerChunk; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      new WorldGenDeadBush(BlockIds.deadBush).generate(w, r, x, y, z);
    }
    for (let i = 0; i < d.waterlilyPerChunk; i++) {
      this.rx();
      this.rz();
      r.nextInt(128);
    }
    for (let i = 0; i < d.mushroomsPerChunk; i++) {
      if (r.nextInt(4) === 0) {
        const x = this.rx();
        const z = this.rz();
        this.mushroomBrownGen.generate(w, r, x, w.getHeightValue(x, z), z);
      }
      if (r.nextInt(8) === 0) {
        const x = this.rx();
        const z = this.rz();
        this.mushroomRedGen.generate(w, r, x, r.nextInt(128), z);
      }
    }
    if (r.nextInt(4) === 0) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      this.mushroomBrownGen.generate(w, r, x, y, z);
    }
    if (r.nextInt(8) === 0) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      this.mushroomRedGen.generate(w, r, x, y, z);
    }
    for (let i = 0; i < d.reedsPerChunk; i++) {
      const x = this.rx();
      const z = this.rz();
      this.reedGen.generate(w, r, x, r.nextInt(128), z);
    }
    for (let i = 0; i < 10; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      this.reedGen.generate(w, r, x, y, z);
    }
    if (r.nextInt(32) === 0) {
      this.rx();
      r.nextInt(128);
      this.rz();
    }
    for (let i = 0; i < d.cactiPerChunk; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      this.cactusGen.generate(w, r, x, y, z);
    }
    if (d.generateLakes) {
      for (let i = 0; i < 50; i++) {
        const x = this.rx();
        const y = r.nextInt(r.nextInt(120) + 8);
        const z = this.rz();
        new WorldGenLiquids(BlockIds.waterMoving).generate(w, r, x, y, z);
      }
      for (let i = 0; i < 20; i++) {
        const x = this.rx();
        const y = r.nextInt(r.nextInt(r.nextInt(112) + 8) + 8);
        const z = this.rz();
        new WorldGenLiquids(BlockIds.lavaMoving).generate(w, r, x, y, z);
      }
    }
  }

  private genStandardOre1(count: number, gen: WorldGenerator, min: number, max: number): void {
    for (let i = 0; i < count; i++) {
      const x = this.chunkX + this.rand.nextInt(16);
      const y = this.rand.nextInt(max - min) + min;
      const z = this.chunkZ + this.rand.nextInt(16);
      gen.generate(this.world, this.rand, x, y, z);
    }
  }

  private genStandardOre2(count: number, gen: WorldGenerator, centre: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const x = this.chunkX + this.rand.nextInt(16);
      const y = this.rand.nextInt(spread) + this.rand.nextInt(spread) + (centre - spread);
      const z = this.chunkZ + this.rand.nextInt(16);
      gen.generate(this.world, this.rand, x, y, z);
    }
  }

  protected generateOres(): void {
    this.genStandardOre1(20, this.dirtGen, 0, 128);
    this.genStandardOre1(10, this.gravelGen, 0, 128);
    this.genStandardOre1(20, this.coalGen, 0, 128);
    this.genStandardOre1(20, this.ironGen, 0, 64);
    this.genStandardOre1(2, this.goldGen, 0, 32);
    this.genStandardOre1(8, this.redstoneGen, 0, 16);
    this.genStandardOre1(1, this.diamondGen, 0, 16);
    this.genStandardOre2(1, this.lapisGen, 16, 16);
  }
}
