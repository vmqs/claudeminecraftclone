import { BlockIds } from '../../block/BlockIds';
import { Biomes } from '../biome/BiomeGenBase';
import type { IWorld, WorldProviderInfo } from '../IWorld';
import { SingleBiomeSource } from './ChunkProviderFlat';
import { type ChunkGenerator, ChunkProviderGenerate, type GeneratedChunk } from './ChunkProviderGenerate';
import { ChunkProviderFlat } from './ChunkProviderFlat';

/** What a dimension's generator is made from (the world's settings; WorldProvider.createChunkGenerator). */
export interface DimensionGeneratorOptions {
  seed: bigint;
  /** The overworld's type: 'default', 'flat', 'largeBiomes'. */
  worldType: string;
  mapFeatures: boolean;
  generatorOptions: string | null;
}

export type DimensionGeneratorFactory = (o: DimensionGeneratorOptions) => ChunkGenerator;

/** The flags a dimension's worlds report through `provider` (worker-safe WorldProviderInfo). */
export function providerInfoFor(dimension: number): WorldProviderInfo {
  return { dimensionId: dimension, isHellWorld: dimension === -1, hasNoSky: dimension !== 0 };
}

const factories = new Map<number, DimensionGeneratorFactory>();

/**
 * The chunk generators of the dimensions (WorldProvider.createChunkGenerator), worker-safe: the
 * world-generation and terrain workers build the generator of the dimension they serve from
 * here. The overworld uses ChunkProviderGenerate / ChunkProviderFlat. The Nether and the End
 * come from `register` (call it from a module the worker imports) or, without a registration,
 * from the 1.5.2 classes found by file name: `nether/ChunkProviderHell.ts` exporting
 * `ChunkProviderHell` and `end/ChunkProviderEnd.ts` exporting `ChunkProviderEnd`, constructed as
 * `new ChunkProviderHell(seed, options)` (any ChunkGenerator). Until those exist, simple
 * placeholder generators stand in (a netherrack cave layer, an end-stone island).
 */
export const DimensionGenerators = {
  register(dimension: number, factory: DimensionGeneratorFactory): void {
    factories.set(dimension, factory);
  },

  has(dimension: number): boolean {
    return factories.has(dimension) || dimension === 0 || findClass(dimension) !== null;
  },

  create(dimension: number, o: DimensionGeneratorOptions): ChunkGenerator {
    const registered = factories.get(dimension);
    if (registered) return registered(o);
    if (dimension === 0) return o.worldType === 'flat' ? new ChunkProviderFlat(o.seed, o.generatorOptions, o.mapFeatures) : new ChunkProviderGenerate(o.seed, o.mapFeatures, o.worldType);
    const cls = findClass(dimension);
    if (cls) return new cls(o.seed, o);
    return dimension === -1 ? new PlaceholderNetherGenerator() : new PlaceholderEndGenerator();
  },
};

type GeneratorClass = new (seed: bigint, options: DimensionGeneratorOptions) => ChunkGenerator;
type Module = Record<string, unknown>;

let found: Record<string, Module> | null = null;

/** The Nether and End generator classes of this build (Vite resolves the glob at build time). */
function findClass(dimension: number): GeneratorClass | null {
  if (!found) {
    found = {};
    try {
      found = import.meta.glob<Module>(['./nether/ChunkProviderHell.ts', './end/ChunkProviderEnd.ts', './ChunkProviderHell.ts', './ChunkProviderEnd.ts'], { eager: true });
    } catch {
      // Not built by Vite (Node checks): register() is the way in.
    }
  }
  const name = dimension === -1 ? 'ChunkProviderHell' : dimension === 1 ? 'ChunkProviderEnd' : null;
  if (!name) return null;
  for (const mod of Object.values(found)) {
    const cls = mod[name];
    if (typeof cls === 'function') return cls as GeneratorClass;
  }
  return null;
}

/** Raw chunk storage of GeneratedChunk: x << 11 | z << 7 | y, 128 high. */
function index(x: number, y: number, z: number): number {
  return (x << 11) | (z << 7) | y;
}

/**
 * Stand-in for ChunkProviderHell until the Nether generator is present: bedrock at 0 and 127,
 * a netherrack floor up to y 31 with lava below 32 in its dips, a netherrack ceiling from
 * y 100, so portals, travel and the sky rules can be tried.
 */
export class PlaceholderNetherGenerator implements ChunkGenerator {
  readonly biomeSource = new SingleBiomeSource(Biomes.hell);

  provideChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint8Array(32768);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const wx = cx * 16 + x;
        const wz = cz * 16 + z;
        const floor = 30 + Math.round(3 * Math.sin(wx / 9) + 3 * Math.cos(wz / 11));
        const ceiling = 100 + Math.round(4 * Math.sin(wz / 7 + wx / 13));
        for (let y = 0; y < 128; y++) {
          let id = 0;
          if (y === 0 || y === 127) id = BlockIds.bedrock;
          else if (y <= floor || y >= ceiling) id = BlockIds.netherrack;
          else if (y < 32) id = BlockIds.lavaStill;
          blocks[index(x, y, z)] = id;
        }
      }
    }
    return { blocks, height: 128, biomes: new Uint8Array(256).fill(Biomes.hell.biomeID) };
  }

  populate(_w: IWorld, _cx: number, _cz: number): void {}

  getAverageGroundLevel(): number {
    return 64;
  }
}

/**
 * Stand-in for ChunkProviderEnd until the End generator is present: a round end-stone island
 * around (0, 0), its top at y 56 in the middle sloping down to its edge 80 blocks out.
 */
export class PlaceholderEndGenerator implements ChunkGenerator {
  readonly biomeSource = new SingleBiomeSource(Biomes.sky);

  provideChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint8Array(32768);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const wx = cx * 16 + x;
        const wz = cz * 16 + z;
        const d = Math.sqrt(wx * wx + wz * wz);
        if (d >= 80) continue;
        const top = 56 - Math.floor(d / 8);
        const bottom = 30 + Math.floor((d * d) / 400);
        for (let y = bottom; y <= top; y++) blocks[index(x, y, z)] = BlockIds.whiteStone;
      }
    }
    return { blocks, height: 128, biomes: new Uint8Array(256).fill(Biomes.sky.biomeID) };
  }

  populate(_w: IWorld, _cx: number, _cz: number): void {}

  getAverageGroundLevel(): number {
    return 50;
  }
}
