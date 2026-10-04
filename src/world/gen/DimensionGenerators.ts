import type { WorldProviderInfo } from '../IWorld';
import type { ChunkGenerator } from './ChunkProviderGenerate';

/** The chunk generator of a dimension other than the overworld, with its provider's flags. */
export interface DimensionGenerator extends ChunkGenerator {
  /** isHellWorld / hasNoSky / dimensionId of the world it generates (GenWorld.provider). */
  readonly providerInfo: Readonly<WorldProviderInfo>;
}

export type DimensionGeneratorFactory = (seed: bigint, mapFeatures: boolean) => DimensionGenerator;

const factories = new Map<number, DimensionGeneratorFactory>();

/**
 * WorldProvider.createChunkGenerator for the world-generation worker: generators of the other
 * dimensions by dimension id (-1 the Nether, 1 the End). Generator modules register themselves
 * when imported; worker-safe.
 */
export const DimensionGenerators = {
  register(dimension: number, factory: DimensionGeneratorFactory): void {
    factories.set(dimension, factory);
  },

  has(dimension: number): boolean {
    return factories.has(dimension);
  },

  /** The generator for `dimension`, or null for the overworld and unknown dimensions. */
  create(dimension: number, seed: bigint, mapFeatures: boolean): DimensionGenerator | null {
    const make = factories.get(dimension);
    return make ? make(seed, mapFeatures) : null;
  },
};
