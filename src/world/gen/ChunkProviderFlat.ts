import { BlockIds } from '../../block/BlockIds';
import { JavaRandom } from '../../core/JavaRandom';
import { BiomeGenBase, Biomes } from '../biome/BiomeGenBase';
import type { IWorld } from '../IWorld';
import { BiomeDecoration } from './BiomeDecorator';
import { WorldGenDungeons } from './feature/WorldGenDungeons';
import type { BiomeSource, ChunkGenerator, GeneratedChunk } from './ChunkProviderGenerate';
import { FlatGeneratorInfo } from './FlatGeneratorInfo';
import { WorldGenLakes } from './WorldGenLakes';
import type { MapGenStructure } from './structure/MapGenStructure';
import { MapGenMineshaft } from './structure/Mineshaft';
import { MapGenScatteredFeature } from './structure/ScatteredFeatures';
import { MapGenStronghold } from './structure/Stronghold';
import { MapGenVillage } from './structure/Village';

/** WorldChunkManagerHell: one biome everywhere (superflat, the Nether, the End). */
export class SingleBiomeSource implements BiomeSource {
  constructor(readonly biome: BiomeGenBase) {}

  getBiomeGenAt(): BiomeGenBase {
    return this.biome;
  }

  getBiomesForGeneration(_x: number, _z: number, w: number, h: number): BiomeGenBase[] {
    return new Array<BiomeGenBase>(w * h).fill(this.biome);
  }

  loadBlockGeneratorData(_x: number, _z: number, w: number, h: number): BiomeGenBase[] {
    return new Array<BiomeGenBase>(w * h).fill(this.biome);
  }

  /** Any spot in range when the biome is allowed. */
  findBiomePosition(x: number, z: number, range: number, allowed: readonly BiomeGenBase[], rand: JavaRandom): [number, number] | null {
    if (!allowed.includes(this.biome)) return null;
    return [x - range + rand.nextInt(range * 2 + 1), z - range + rand.nextInt(range * 2 + 1)];
  }

  areBiomesViable(_x: number, _z: number, _radius: number, allowed: readonly BiomeGenBase[]): boolean {
    return allowed.includes(this.biome);
  }
}

/**
 * The superflat generator (ChunkProviderFlat): every column is the preset's layer stack (up to
 * 256 high). With "Generate Structures" on, the preset's village, biome_1 (temples), mineshaft
 * and stronghold features run; lakes, dungeons and biome decoration run when the preset asks
 * for them. Unlike the default generator it places no animals and no snow.
 */
export class ChunkProviderFlat implements ChunkGenerator {
  private readonly random: JavaRandom;
  readonly info: FlatGeneratorInfo;
  private readonly layerIds = new Uint8Array(256);
  private readonly layerMeta = new Uint8Array(256);
  private readonly topY: number;
  readonly biomeSource: SingleBiomeSource;
  private readonly decorate: boolean;
  private readonly dungeons: boolean;
  private readonly decoration = new BiomeDecoration();
  private readonly waterLakes: WorldGenLakes | null;
  private readonly lavaLakes: WorldGenLakes | null;
  private readonly structureGenerators: MapGenStructure[] = [];
  private villageGenerator: MapGenVillage | null = null;
  private strongholdGenerator: MapGenStronghold | null = null;

  constructor(
    readonly seed: bigint,
    generatorOptions: string | null,
    readonly mapFeaturesEnabled = true,
  ) {
    this.random = new JavaRandom(seed);
    this.info = FlatGeneratorInfo.createFlatGeneratorFromString(generatorOptions);
    const features = this.info.worldFeatures;
    if (mapFeaturesEnabled) {
      const village = features.get('village');
      if (village) {
        if (!village.has('size')) village.set('size', '1');
        this.structureGenerators.push((this.villageGenerator = new MapGenVillage(village)));
      }
      const temples = features.get('biome_1');
      if (temples) this.structureGenerators.push(new MapGenScatteredFeature(temples));
      const mineshaft = features.get('mineshaft');
      if (mineshaft) this.structureGenerators.push(new MapGenMineshaft(mineshaft));
      const stronghold = features.get('stronghold');
      if (stronghold) this.structureGenerators.push((this.strongholdGenerator = new MapGenStronghold(stronghold)));
    }
    this.decorate = features.has('decoration');
    this.waterLakes = features.has('lake') ? new WorldGenLakes(BlockIds.waterStill) : null;
    this.lavaLakes = features.has('lava_lake') ? new WorldGenLakes(BlockIds.lavaStill) : null;
    this.dungeons = features.has('dungeon');
    let top = 0;
    for (const l of this.info.flatLayers) {
      for (let y = l.minY; y < l.minY + l.count && y < 256; y++) {
        this.layerIds[y] = l.blockId & 255;
        this.layerMeta[y] = l.meta;
        if (l.blockId !== 0) top = Math.max(top, y + 1);
      }
    }
    this.topY = top;
    this.biomeSource = new SingleBiomeSource(BiomeGenBase.biomeList[this.info.biome] ?? Biomes.plains);
  }

  /** WorldProvider.getAverageGroundLevel for FLAT worlds: the spawn height. */
  getAverageGroundLevel(): number {
    return 4;
  }

  provideChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint8Array(16 * 16 * 256);
    const meta = new Uint8Array(16 * 16 * 256);
    for (let y = 0; y < this.topY; y++) {
      const id = this.layerIds[y];
      if (id === 0) continue;
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          blocks[(x << 12) | (z << 8) | y] = id;
          meta[(x << 12) | (z << 8) | y] = this.layerMeta[y];
        }
      }
    }
    for (const g of this.structureGenerators) g.generate(this, cx, cz, null);
    return { blocks, meta, height: 256, biomes: new Uint8Array(256).fill(this.biomeSource.biome.biomeID) };
  }

  populate(world: IWorld, cx: number, cz: number): void {
    const x = cx * 16;
    const z = cz * 16;
    const biome = world.getBiomeGenForCoords(x + 16, z + 16);
    let village = false;
    this.random.setSeed(this.seed);
    const a = (this.random.nextLong() / 2n) * 2n + 1n;
    const b = (this.random.nextLong() / 2n) * 2n + 1n;
    this.random.setSeed((BigInt(cx) * a + BigInt(cz) * b) ^ this.seed);
    for (const g of this.structureGenerators) {
      const built = g.generateStructuresInChunk(world, this.random, cx, cz);
      if (g === this.villageGenerator) village ||= built;
    }
    if (this.waterLakes && !village && this.random.nextInt(4) === 0) {
      const lx = x + this.random.nextInt(16) + 8;
      const ly = this.random.nextInt(128);
      const lz = z + this.random.nextInt(16) + 8;
      this.waterLakes.generate(world, this.random, lx, ly, lz);
    }
    if (this.lavaLakes && !village && this.random.nextInt(8) === 0) {
      const lx = x + this.random.nextInt(16) + 8;
      const ly = this.random.nextInt(this.random.nextInt(120) + 8);
      const lz = z + this.random.nextInt(16) + 8;
      if (ly < 63 || this.random.nextInt(10) === 0) this.lavaLakes.generate(world, this.random, lx, ly, lz);
    }
    if (this.dungeons) {
      for (let i = 0; i < 8; i++) {
        const dx = x + this.random.nextInt(16) + 8;
        const dy = this.random.nextInt(128);
        const dz = z + this.random.nextInt(16) + 8;
        new WorldGenDungeons().generate(world, this.random, dx, dy, dz);
      }
    }
    if (this.decorate) this.decoration.decorate(biome, world, this.random, x, z);
  }

  findClosestStructure(name: string, x: number, y: number, z: number): [number, number, number] | null {
    return name === 'Stronghold' && this.strongholdGenerator ? this.strongholdGenerator.getNearestInstance(this, x, y, z) : null;
  }
}
