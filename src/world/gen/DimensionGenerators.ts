import type { WorldProviderInfo } from '../IWorld';
import type { ChunkGenerator } from './ChunkProviderGenerate';

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
 * WorldProvider.createChunkGenerator for the world-generation workers: the generators of the
 * dimensions other than the overworld (-1 the Nether, 1 the End) by dimension id. Generator
 * modules register themselves when imported; worker-safe. The overworld's generators are chosen
 * by WorldGenServer.
 */
export const DimensionGenerators = {
  register(dimension: number, factory: DimensionGeneratorFactory): void {
    factories.set(dimension, factory);
  },

  has(dimension: number): boolean {
    return factories.has(dimension);
  },

  /** The generator registered for `dimension`, or null. */
  create(dimension: number, o: DimensionGeneratorOptions): ChunkGenerator | null {
    const make = factories.get(dimension);
    return make ? make(o) : null;
  },
};
