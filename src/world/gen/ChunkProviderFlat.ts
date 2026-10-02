import { BlockIds } from '../../block/BlockIds';
import { BlockSand } from '../../block/BlockSand';
import { JavaRandom } from '../../core/JavaRandom';
import { BiomeGenBase, Biomes } from '../biome/BiomeGenBase';
import type { IWorld } from '../IWorld';
import { BiomeDecorator } from './BiomeDecorator';
import type { BiomeSource, ChunkGenerator, GeneratedChunk } from './ChunkProviderGenerate';
import { FlatGeneratorInfo } from './FlatGeneratorInfo';
import { WorldGenLakes } from './WorldGenLakes';

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
 * The superflat generator (ChunkProviderFlat): every column is the preset's layer stack.
 * Villages and other structures are not generated yet; lakes and biome decoration run when
 * the preset asks for them. Unlike the default generator it places no animals.
 */
export class ChunkProviderFlat implements ChunkGenerator {
  private readonly random: JavaRandom;
  private readonly info: FlatGeneratorInfo;
  private readonly layerIds = new Uint8Array(256);
  private readonly layerMeta = new Uint8Array(256);
  readonly biomeSource: SingleBiomeSource;
  private readonly decorate: boolean;
  private readonly waterLakes: WorldGenLakes | null;
  private readonly lavaLakes: WorldGenLakes | null;

  constructor(
    readonly seed: bigint,
    generatorOptions: string | null,
  ) {
    this.random = new JavaRandom(seed);
    this.info = FlatGeneratorInfo.createFlatGeneratorFromString(generatorOptions);
    const features = this.info.worldFeatures;
    this.decorate = features.has('decoration');
    this.waterLakes = features.has('lake') ? new WorldGenLakes(BlockIds.waterStill) : null;
    this.lavaLakes = features.has('lava_lake') ? new WorldGenLakes(BlockIds.lavaStill) : null;
    for (const l of this.info.flatLayers) {
      for (let y = l.minY; y < l.minY + l.count; y++) {
        this.layerIds[y] = l.blockId;
        this.layerMeta[y] = l.meta;
      }
    }
    this.biomeSource = new SingleBiomeSource(BiomeGenBase.biomeList[this.info.biome] ?? Biomes.plains);
  }

  /** WorldProvider.getAverageGroundLevel for FLAT worlds: the spawn height. */
  getAverageGroundLevel(): number {
    return 4;
  }

  provideChunk(_cx: number, _cz: number): GeneratedChunk {
    const blocks = new Uint8Array(16 * 16 * 128);
    const meta = new Uint8Array(16 * 16 * 128);
    for (let y = 0; y < 128; y++) {
      const id = this.layerIds[y];
      if (id === 0) continue;
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          blocks[(x << 11) | (z << 7) | y] = id;
          meta[(x << 11) | (z << 7) | y] = this.layerMeta[y];
        }
      }
    }
    return { blocks, meta, biomes: new Uint8Array(256).fill(this.biomeSource.biome.biomeID) };
  }

  populate(world: IWorld, cx: number, cz: number): void {
    BlockSand.fallInstantly = true;
    const x = cx * 16;
    const z = cz * 16;
    const biome = world.getBiomeGenForCoords(x + 16, z + 16);
    this.random.setSeed(this.seed);
    const a = (this.random.nextLong() / 2n) * 2n + 1n;
    const b = (this.random.nextLong() / 2n) * 2n + 1n;
    this.random.setSeed((BigInt(cx) * a + BigInt(cz) * b) ^ this.seed);
    const village = false;
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
    if (this.info.worldFeatures.has('dungeon')) {
      // Dungeons are not ported; their coordinate rolls keep decoration in step.
      for (let i = 0; i < 8; i++) {
        this.random.nextInt(16);
        this.random.nextInt(128);
        this.random.nextInt(16);
      }
    }
    if (this.decorate) new BiomeDecorator(biome).decorate(world, this.random, x, z);
    BlockSand.fallInstantly = false;
  }
}
