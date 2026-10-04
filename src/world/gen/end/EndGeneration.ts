import { DimensionGenerators } from '../DimensionGenerators';
import { ChunkProviderEnd } from './ChunkProviderEnd';

/** WorldProviderEnd.createChunkGenerator: dimension 1 generates with ChunkProviderEnd. */
DimensionGenerators.register(1, (o) => new ChunkProviderEnd(o.seed));
