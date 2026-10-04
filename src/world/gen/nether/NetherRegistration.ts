import { DimensionGenerators } from '../DimensionGenerators';
import { ChunkProviderHell } from './ChunkProviderHell';

/**
 * Registers the Nether's generator for dimension -1 (WorldProviderHell.createChunkGenerator).
 * Kept out of ChunkProviderHell.ts so that a registry which finds the generator class by file
 * name does not import itself back through it.
 */
DimensionGenerators.register(-1, (o) => new ChunkProviderHell(o.seed, o));
