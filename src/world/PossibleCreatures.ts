import type { EnumCreatureType, SpawnListEntry } from './biome/SpawnListEntry';
import type { IWorld } from './IWorld';

/** IChunkProvider.getPossibleCreatures of a dimension: the spawn list at a position, or null for the biome's. */
export type PossibleCreaturesFn = (w: IWorld & { getSeed(): bigint }, type: EnumCreatureType, x: number, y: number, z: number) => readonly SpawnListEntry[] | null;

const byDimension = new Map<number, PossibleCreaturesFn>();

/**
 * Spawn lists that depend on the dimension's chunk generator rather than the biome (Nether
 * fortresses), by dimension id. SpawnerAnimals asks here first (WorldServer.spawnRandomCreature).
 */
export const PossibleCreatures = {
  register(dimension: number, fn: PossibleCreaturesFn): void {
    byDimension.set(dimension, fn);
  },

  /** The generator's list at (x, y, z), or null when the biome's list applies. */
  get(w: IWorld & { getSeed(): bigint }, type: EnumCreatureType, x: number, y: number, z: number): readonly SpawnListEntry[] | null {
    const fn = byDimension.get(w.provider.dimensionId);
    return fn ? fn(w, type, x, y, z) : null;
  },
};
