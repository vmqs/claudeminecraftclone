import type { ChunkGenerator } from './ChunkProviderGenerate';

/** What a dimension's generator is built from (the world's options, WorldProvider.createChunkGenerator). */
export interface DimensionGeneratorOptions {
  seed: bigint;
  worldType: string;
  mapFeatures: boolean;
  generatorOptions?: string | null;
}

export type DimensionGeneratorFactory = (options: DimensionGeneratorOptions) => ChunkGenerator;

const factories = new Map<number, DimensionGeneratorFactory>();

/**
 * Chunk generators by dimension id (WorldProvider.createChunkGenerator for the providers that
 * do not use the overworld's): -1 the Nether, 1 the End. Dimension 0 keeps the world type's
 * generator. Worker-safe; registration modules are imported by `./Dimensions`.
 */
export const DimensionGenerators = {
  register(dimension: number, factory: DimensionGeneratorFactory): void {
    factories.set(dimension, factory);
  },

  /** The registered generator of `dimension`, or null (the overworld's generator applies). */
  create(dimension: number, options: DimensionGeneratorOptions): ChunkGenerator | null {
    const factory = dimension !== 0 ? factories.get(dimension) : undefined;
    return factory ? factory(options) : null;
  },
};
