import { BlockIds } from '../block/BlockIds';
import { EnumCreatureType } from './biome/SpawnListEntry';
import type { IWorld } from './IWorld';

/**
 * SpawnerAnimals.canCreatureTypeSpawnAtLocation (worker-safe): water creatures need water two
 * deep with no solid block above; others need a solid top below (not bedrock), and no solid
 * block or liquid at the feet and no solid block at the head.
 */
export function canCreatureTypeSpawnAtLocation(type: EnumCreatureType, w: IWorld, x: number, y: number, z: number): boolean {
  if (type === EnumCreatureType.waterCreature) {
    return w.getBlockMaterial(x, y, z).isLiquid() && w.getBlockMaterial(x, y - 1, z).isLiquid() && !w.isBlockNormalCube(x, y + 1, z);
  }
  if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z)) return false;
  return (
    w.getBlockId(x, y - 1, z) !== BlockIds.bedrock && !w.isBlockNormalCube(x, y, z) && !w.getBlockMaterial(x, y, z).isLiquid() && !w.isBlockNormalCube(x, y + 1, z)
  );
}

