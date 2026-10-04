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

const factories = new Map<number, DimensionGeneratorFactory>();

/**
 * Chunk generators by dimension id (WorldProvider.createChunkGenerator for the providers that
 * do not use the overworld's): -1 the Nether, 1 the End. Dimension 0 keeps the world type's
 * generator. Worker-safe; registrations live in modules the world-generation worker imports
 * (`end/EndRegistration.ts`).
 */
export const DimensionGenerators = {
  register(dimension: number, factory: DimensionGeneratorFactory): void {
    factories.set(dimension, factory);
  },

  has(dimension: number): boolean {
    return dimension === 0 || factories.has(dimension);
  },

  /** The registered generator of `dimension`, or null (the overworld's generator applies). */
  create(dimension: number, o: DimensionGeneratorOptions): ChunkGenerator | null {
    const factory = dimension !== 0 ? factories.get(dimension) : undefined;
    return factory ? factory(o) : null;
  },
};
