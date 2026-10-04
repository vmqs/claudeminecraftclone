import { EnumCreatureType } from '../world/biome/SpawnListEntry';
import type { World } from '../world/World';
import { EntityLiving } from './EntityLiving';

/** Ambient creatures (bats): counted separately by natural spawning. */
export abstract class EntityAmbientCreature extends EntityLiving {
  constructor(world: World) {
    super(world);
  }

  override get creatureType(): EnumCreatureType {
    return EnumCreatureType.ambient;
  }
}
