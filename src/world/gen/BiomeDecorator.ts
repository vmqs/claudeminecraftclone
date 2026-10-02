import { BlockIds } from '../../block/BlockIds';
import type { JavaRandom } from '../../core/JavaRandom';
import { Biomes, type BiomeGenBase } from '../biome/BiomeGenBase';
import type { IWorld } from '../IWorld';
import { WorldGenBigMushroom } from './feature/WorldGenBigMushroom';
import { WorldGenBigTree } from './feature/WorldGenBigTree';
import { WorldGenForest } from './feature/WorldGenForest';
import { WorldGenHugeTrees } from './feature/WorldGenHugeTrees';
import { WorldGenShrub } from './feature/WorldGenShrub';
import { WorldGenDesertWells, WorldGenPumpkin, WorldGenVines, WorldGenWaterlily } from './feature/WorldGenSmallFeatures';
import { WorldGenSwamp } from './feature/WorldGenSwamp';
import { WorldGenTaiga1 } from './feature/WorldGenTaiga1';
import { WorldGenTaiga2 } from './feature/WorldGenTaiga2';
import { WorldGenerator } from './WorldGenerator';
import { WorldGenFlowers } from './WorldGenFlowers';
import { WorldGenMinable } from './WorldGenMinable';
import { WorldGenCactus, WorldGenClay, WorldGenDeadBush, WorldGenLiquids, WorldGenSand } from './WorldGenPlants';
import { WorldGenReed } from './WorldGenReed';
import { WorldGenTallGrass } from './WorldGenTallGrass';
import { WorldGenTrees } from './WorldGenTrees';

/**
 * The tree generators every BiomeGenBase owns (worldGeneratorTrees, worldGeneratorBigTree,
 * worldGeneratorForest, worldGeneratorSwamp). They are per biome and per world because the big
 * oak keeps its height between trees, as in 1.5.2.
 */
class BiomeTreeGenerators {
  readonly trees = new WorldGenTrees(false);
  readonly bigTree = new WorldGenBigTree(false);
  readonly forest = new WorldGenForest(false);
  readonly swamp = new WorldGenSwamp();
}

const is = (b: BiomeGenBase, ...list: BiomeGenBase[]) => list.includes(b);

/** BiomeGenBase.getRandomWorldGenForTrees with the overrides of the biome subclasses. */
function getRandomWorldGenForTrees(biome: BiomeGenBase, gens: BiomeTreeGenerators, rand: JavaRandom): WorldGenerator {
  if (is(biome, Biomes.forest, Biomes.forestHills)) {
    if (rand.nextInt(5) === 0) return gens.forest;
    return rand.nextInt(10) === 0 ? gens.bigTree : gens.trees;
  }
  if (is(biome, Biomes.taiga, Biomes.taigaHills)) return rand.nextInt(3) === 0 ? new WorldGenTaiga1() : new WorldGenTaiga2(false);
  if (biome === Biomes.swampland) return gens.swamp;
  if (is(biome, Biomes.jungle, Biomes.jungleHills)) {
    if (rand.nextInt(10) === 0) return gens.bigTree;
    if (rand.nextInt(2) === 0) return new WorldGenShrub(3, 0);
    if (rand.nextInt(3) === 0) return new WorldGenHugeTrees(false, 10 + rand.nextInt(20), 3, 3);
    return new WorldGenTrees(false, 4 + rand.nextInt(7), 3, 3, true);
  }
  return rand.nextInt(10) === 0 ? gens.bigTree : gens.trees;
}

/** BiomeGenBase.getRandomWorldGenForGrass (jungles add ferns). */
function getRandomWorldGenForGrass(biome: BiomeGenBase, rand: JavaRandom): WorldGenerator {
  if (is(biome, Biomes.jungle, Biomes.jungleHills)) {
    return rand.nextInt(4) === 0 ? new WorldGenTallGrass(BlockIds.tallGrass, 2) : new WorldGenTallGrass(BlockIds.tallGrass, 1);
  }
  return new WorldGenTallGrass(BlockIds.tallGrass, 1);
}

/**
 * BiomeDecorator.decorate: ores, sand/clay discs, trees, huge mushrooms, flowers, grass, dead
 * bushes, lily pads, mushrooms, sugar cane, pumpkins, cacti and springs, in the original order
 * and with the per-biome counts of BiomeGenBase.decorator.
 */
export class BiomeDecorator {
  private world!: IWorld;
  private rand!: JavaRandom;
  private chunkX = 0;
  private chunkZ = 0;
  private readonly clayGen = new WorldGenClay(4);
  private readonly sandGen = new WorldGenSand(7, BlockIds.sand);
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
  private readonly bigMushroomGen = new WorldGenBigMushroom();
  private readonly reedGen = new WorldGenReed();
  private readonly cactusGen = new WorldGenCactus();
  private readonly waterlilyGen = new WorldGenWaterlily();
  readonly treeGens = new BiomeTreeGenerators();

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

  private decorateChunk(): void {
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
      const gen = getRandomWorldGenForTrees(this.biome, this.treeGens, r);
      gen.setScale(1, 1, 1);
      gen.generate(w, r, x, w.getHeightValue(x, z), z);
    }
    for (let i = 0; i < d.bigMushroomsPerChunk; i++) {
      const x = this.rx();
      const z = this.rz();
      this.bigMushroomGen.generate(w, r, x, w.getHeightValue(x, z), z);
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
      getRandomWorldGenForGrass(this.biome, r).generate(w, r, x, y, z);
    }
    for (let i = 0; i < d.deadBushPerChunk; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      new WorldGenDeadBush(BlockIds.deadBush).generate(w, r, x, y, z);
    }
    for (let i = 0; i < d.waterlilyPerChunk; i++) {
      const x = this.rx();
      const z = this.rz();
      let y = r.nextInt(128);
      while (y > 0 && w.getBlockId(x, y - 1, z) === 0) y--;
      this.waterlilyGen.generate(w, r, x, y, z);
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
        const y = r.nextInt(128);
        this.mushroomRedGen.generate(w, r, x, y, z);
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
      const y = r.nextInt(128);
      this.reedGen.generate(w, r, x, y, z);
    }
    for (let i = 0; i < 10; i++) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      this.reedGen.generate(w, r, x, y, z);
    }
    if (r.nextInt(32) === 0) {
      const x = this.rx();
      const y = r.nextInt(128);
      const z = this.rz();
      new WorldGenPumpkin().generate(w, r, x, y, z);
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

  /** Lapis: the sum of two uniform rolls, a triangle centred on `centre`. */
  private genStandardOre2(count: number, gen: WorldGenerator, centre: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const x = this.chunkX + this.rand.nextInt(16);
      const y = this.rand.nextInt(spread) + this.rand.nextInt(spread) + (centre - spread);
      const z = this.chunkZ + this.rand.nextInt(16);
      gen.generate(this.world, this.rand, x, y, z);
    }
  }

  private generateOres(): void {
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

const silverfishGen = new WorldGenMinable(BlockIds.silverfish, 8);
const vinesGen = new WorldGenVines();

/**
 * BiomeGenBase.decorate for every biome of a world: the shared decorator plus the extras of
 * BiomeGenDesert (wells), BiomeGenHills (emerald ore, silverfish stone) and BiomeGenJungle
 * (vines). One instance per world, since the decorators keep state.
 */
export class BiomeDecoration {
  private readonly decorators = new Map<number, BiomeDecorator>();

  decorator(biome: BiomeGenBase): BiomeDecorator {
    let d = this.decorators.get(biome.biomeID);
    if (!d) this.decorators.set(biome.biomeID, (d = new BiomeDecorator(biome)));
    return d;
  }

  decorate(biome: BiomeGenBase, w: IWorld, rand: JavaRandom, x: number, z: number): void {
    this.decorator(biome).decorate(w, rand, x, z);
    if (is(biome, Biomes.desert, Biomes.desertHills)) {
      if (rand.nextInt(1000) === 0) {
        const wx = x + rand.nextInt(16) + 8;
        const wz = z + rand.nextInt(16) + 8;
        new WorldGenDesertWells().generate(w, rand, wx, w.getHeightValue(wx, wz) + 1, wz);
      }
    } else if (is(biome, Biomes.extremeHills, Biomes.extremeHillsEdge)) {
      const n = 3 + rand.nextInt(6);
      for (let i = 0; i < n; i++) {
        const ex = x + rand.nextInt(16);
        const ey = rand.nextInt(28) + 4;
        const ez = z + rand.nextInt(16);
        if (w.getBlockId(ex, ey, ez) === BlockIds.stone) w.setBlock(ex, ey, ez, BlockIds.oreEmerald, 0, 2);
      }
      for (let i = 0; i < 7; i++) {
        const sx = x + rand.nextInt(16);
        const sy = rand.nextInt(64);
        const sz = z + rand.nextInt(16);
        silverfishGen.generate(w, rand, sx, sy, sz);
      }
    } else if (is(biome, Biomes.jungle, Biomes.jungleHills)) {
      for (let i = 0; i < 50; i++) {
        const vx = x + rand.nextInt(16) + 8;
        const vz = z + rand.nextInt(16) + 8;
        vinesGen.generate(w, rand, vx, 64, vz);
      }
    }
  }
}
