import { DimensionGenerators } from '../DimensionGenerators';
import { ChunkProviderEnd } from './ChunkProviderEnd';

/**
 * Registers the End's generator for dimension 1 (WorldProviderEnd.createChunkGenerator). Kept
 * out of ChunkProviderEnd.ts so that a registry which finds generator classes by file name does
 * not import itself back through it. Imported by WorldGenServer (the world-generation worker).
 */
DimensionGenerators.register(1, (o) => new ChunkProviderEnd(o.seed, o));
