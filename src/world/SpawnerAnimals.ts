import { MathHelper } from '../core/MathHelper';
import { WeightedRandom } from '../core/WeightedRandom';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import { EntityList } from '../entity/EntityList';
import { CREATURE_TYPES, EnumCreatureType, type SpawnListEntry } from './biome/SpawnListEntry';
import { Material } from '../block/Material';
import { canCreatureTypeSpawnAtLocation } from './SpawnRules';
import type { World } from './World';

const f = Math.fround;

/** Which loaded entities count against a category's cap (the creatureClass of EnumCreatureType). */
const CATEGORY_TEST: Record<EnumCreatureType, (e: Entity) => boolean> = {
  [EnumCreatureType.monster]: (e) => e.isIMob,
  [EnumCreatureType.creature]: (e) => e.creatureType === EnumCreatureType.creature,
  [EnumCreatureType.ambient]: (e) => e.creatureType === EnumCreatureType.ambient,
  [EnumCreatureType.waterCreature]: (e) => e.creatureType === EnumCreatureType.waterCreature,
};

/**
 * Natural mob spawning (SpawnerAnimals.findChunksForSpawning), installed as World.mobSpawner:
 * for each category under its cap, one random point in every chunk within 7 of a player starts
 * up to 3 packs of 4 tries, at least 24 blocks from players and the world spawn. Species come
 * from the biome's spawn lists by EntityList name; unregistered species are skipped.
 */
export const SpawnerAnimals = {
  findChunksForSpawning(w: World, hostile: boolean, peaceful: boolean, animals: boolean): number {
    if (!hostile && !peaceful) return 0;
    const eligible = new Map<number, [cx: number, cz: number, edge: boolean]>();
    for (const p of w.playerEntities) {
      const pcx = MathHelper.floor_double(p.posX / 16);
      const pcz = MathHelper.floor_double(p.posZ / 16);
      const r = 8;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const edge = dx === -r || dx === r || dz === -r || dz === r;
          const k = (pcx + dx) * 65536 + (pcz + dz);
          if (!edge) eligible.set(k, [pcx + dx, pcz + dz, false]);
          else if (!eligible.has(k)) eligible.set(k, [pcx + dx, pcz + dz, true]);
        }
      }
    }
    let total = 0;
    const spawn = w.getSpawnPoint();
    for (const type of [EnumCreatureType.monster, EnumCreatureType.creature, EnumCreatureType.ambient, EnumCreatureType.waterCreature]) {
      const info = CREATURE_TYPES[type];
      if ((info.isPeacefulCreature && !peaceful) || (!info.isPeacefulCreature && !hostile) || (info.isAnimal && !animals)) continue;
      if (w.countEntities(CATEGORY_TEST[type]) > (info.maxNumberOfCreature * eligible.size) / 256) continue;
      const material = info.inWater ? Material.water : Material.air;
      for (const [cx, cz, edge] of eligible.values()) {
        if (edge) continue;
        const [x0, y0, z0] = SpawnerAnimals.getRandomSpawningPointInChunk(w, cx, cz);
        if (w.isBlockNormalCube(x0, y0, z0) || w.getBlockMaterial(x0, y0, z0) !== material) continue;
        let spawned = 0;
        packs: for (let pack = 0; pack < 3; pack++) {
          let x = x0;
          let y = y0;
          let z = z0;
          const spread = 6;
          let entry: SpawnListEntry | null = null;
          for (let tries = 0; tries < 4; tries++) {
            x += w.rand.nextInt(spread) - w.rand.nextInt(spread);
            y += w.rand.nextInt(1) - w.rand.nextInt(1);
            z += w.rand.nextInt(spread) - w.rand.nextInt(spread);
            if (!canCreatureTypeSpawnAtLocation(type, w, x, y, z)) continue;
            const ex = f(x + f(0.5));
            const ey = y;
            const ez = f(z + f(0.5));
            if (w.getClosestPlayer(ex, ey, ez, 24) !== null) continue;
            const sx = f(ex - spawn.x);
            const sy = f(ey - spawn.y);
            const sz = f(ez - spawn.z);
            if (f(sx * sx + sy * sy + sz * sz) < 576) continue;
            if (!entry) {
              entry = SpawnerAnimals.spawnRandomCreature(w, type, x, y, z);
              if (!entry) break;
            }
            const e = EntityList.createEntityByName(entry.entityName, w) as EntityLiving | null;
            if (!e) continue;
            e.setLocationAndAngles(ex, ey, ez, f(w.rand.nextFloat() * 360), 0);
            if (e.getCanSpawnHere()) {
              spawned++;
              w.spawnEntityInWorld(e);
              e.initCreature();
              if (spawned >= e.getMaxSpawnedInChunk()) break packs;
            }
            total += spawned;
          }
        }
      }
    }
    return total;
  },

  getRandomSpawningPointInChunk(w: World, cx: number, cz: number): [number, number, number] {
    const c = w.chunkExists(cx, cz) ? w.getChunkFromChunkCoords(cx, cz) : null;
    const x = cx * 16 + w.rand.nextInt(16);
    const z = cz * 16 + w.rand.nextInt(16);
    const y = w.rand.nextInt(c ? c.getTopFilledSegment() + 16 - 1 : 256);
    return [x, y, z];
  },

  /** World.spawnRandomCreature: a weighted pick from the biome's list at (x, z). */
  spawnRandomCreature(w: World, type: EnumCreatureType, x: number, _y: number, z: number): SpawnListEntry | null {
    const list = w.getBiomeGenForCoords(x, z).getSpawnableList(type);
    return list.length > 0 ? WeightedRandom.getRandomItem(w.rand, list) : null;
  },
};
