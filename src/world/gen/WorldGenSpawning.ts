import type { JavaRandom } from '../../core/JavaRandom';
import type { TagCompound } from '../../item/ItemStack';
import { WeightedRandom } from '../../core/WeightedRandom';
import type { BiomeGenBase } from '../biome/BiomeGenBase';
import { EnumCreatureType } from '../biome/SpawnListEntry';
import type { IWorld } from '../IWorld';
import { canCreatureTypeSpawnAtLocation } from '../SpawnRules';

/**
 * An entity placed by world generation, created on the main thread through EntityList:
 * animals (performWorldGenSpawning), villagers ({Profession}), witches, chest minecarts
 * ({Items}). `data` is 1.5.2 entity NBT for readEntityFromNBT; `init` (default true) says
 * whether the original called initCreature on it.
 */
export interface EntitySpawnDescriptor {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  data?: TagCompound;
  init?: boolean;
}

/** Receives the entities placed while populating (GenWorld keeps them per chunk). */
export interface SpawnRecorder {
  recordSpawn(d: EntitySpawnDescriptor): void;
}

/** World.spawnEntityInWorld for generation: records the descriptor when the world can. */
export function spawnGenEntity(w: IWorld, d: EntitySpawnDescriptor): void {
  if ('recordSpawn' in w) (w as IWorld & SpawnRecorder).recordSpawn(d);
}

const f = Math.fround;

/**
 * SpawnerAnimals.performWorldGenSpawning for the worker: groups of the biome's creatures on
 * the surface of the populated area, as descriptors (the worker cannot create entities).
 * `world.rand` picks the species and `rand` (the population random) everything else.
 */
export function performWorldGenSpawning(world: IWorld & SpawnRecorder, biome: BiomeGenBase, x0: number, z0: number, w: number, h: number, rand: JavaRandom): void {
  const list = biome.getSpawnableList(EnumCreatureType.creature);
  if (list.length === 0) return;
  while (rand.nextFloat() < biome.getSpawningChance()) {
    const entry = WeightedRandom.getRandomItem(world.rand, list)!;
    const n = entry.minGroupCount + rand.nextInt(1 + entry.maxGroupCount - entry.minGroupCount);
    let x = x0 + rand.nextInt(w);
    let z = z0 + rand.nextInt(h);
    const startX = x;
    const startZ = z;
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let tries = 0; !placed && tries < 4; tries++) {
        const y = world.getTopSolidOrLiquidBlock(x, z);
        if (canCreatureTypeSpawnAtLocation(EnumCreatureType.creature, world, x, y, z)) {
          world.recordSpawn({ name: entry.entityName, x: f(x + f(0.5)), y, z: f(z + f(0.5)), yaw: f(rand.nextFloat() * 360) });
          placed = true;
        }
        x += rand.nextInt(5) - rand.nextInt(5);
        // Like 1.5.2 the z bound uses the width (w) too.
        for (z += rand.nextInt(5) - rand.nextInt(5); x < x0 || x >= x0 + w || z < z0 || z >= z0 + w; z = startZ + rand.nextInt(5) - rand.nextInt(5)) {
          x = startX + rand.nextInt(5) - rand.nextInt(5);
        }
      }
    }
  }
}
