import type { WeightedRandomItem } from '../../core/WeightedRandom';

/**
 * A spawn-list entry (SpawnListEntry): an EntityList name with a weight and a group size.
 * Names instead of classes keep biome data worker-safe; SpawnerAnimals creates the entities
 * through EntityList on the main thread.
 */
export interface SpawnListEntry extends WeightedRandomItem {
  readonly entityName: string;
  readonly minGroupCount: number;
  readonly maxGroupCount: number;
}

export function spawnListEntry(entityName: string, itemWeight: number, minGroupCount: number, maxGroupCount: number): SpawnListEntry {
  return { entityName, itemWeight, minGroupCount, maxGroupCount };
}

/** The four spawn categories of EnumCreatureType with their caps (per 289 chunks) and rules. */
export enum EnumCreatureType {
  monster,
  creature,
  ambient,
  waterCreature,
}

export interface CreatureTypeInfo {
  /** Cap per 17x17 chunks around a player (maxNumberOfCreature). */
  readonly maxNumberOfCreature: number;
  /** Spawns in air, or in water for squid. */
  readonly inWater: boolean;
  readonly isPeacefulCreature: boolean;
  /** Only every 400 ticks (animals). */
  readonly isAnimal: boolean;
}

export const CREATURE_TYPES: Record<EnumCreatureType, CreatureTypeInfo> = {
  [EnumCreatureType.monster]: { maxNumberOfCreature: 70, inWater: false, isPeacefulCreature: false, isAnimal: false },
  [EnumCreatureType.creature]: { maxNumberOfCreature: 10, inWater: false, isPeacefulCreature: true, isAnimal: true },
  [EnumCreatureType.ambient]: { maxNumberOfCreature: 15, inWater: false, isPeacefulCreature: true, isAnimal: false },
  [EnumCreatureType.waterCreature]: { maxNumberOfCreature: 5, inWater: true, isPeacefulCreature: true, isAnimal: false },
};
