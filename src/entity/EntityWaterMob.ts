import { Material } from '../block/Material';
import { EnumCreatureType } from '../world/biome/SpawnListEntry';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { EntityCreature } from './EntityCreature';
import type { EntityPlayer } from './EntityPlayer';

/** Squid (EntityWaterMob): breathes water and suffocates on land. */
export abstract class EntityWaterMob extends EntityCreature {
  constructor(world: World) {
    super(world);
  }

  override get creatureType(): EnumCreatureType {
    return EnumCreatureType.waterCreature;
  }

  override canBreatheUnderwater(): boolean {
    return true;
  }

  override getCanSpawnHere(): boolean {
    return this.worldObj.checkNoEntityCollision(this.boundingBox);
  }

  override getTalkInterval(): number {
    return 120;
  }

  protected override canDespawn(): boolean {
    return true;
  }

  protected override getExperiencePoints(_p: EntityPlayer | null): number {
    return 1 + this.worldObj.rand.nextInt(3);
  }

  override onEntityUpdate(): void {
    let air = this.getAir();
    super.onEntityUpdate();
    if (this.isEntityAlive() && !this.isInsideOfMaterial(Material.water)) {
      this.setAir(--air);
      if (this.getAir() === -20) {
        this.setAir(0);
        this.attackEntityFrom(DamageSource.drown, 2);
      }
    } else {
      this.setAir(300);
    }
  }
}
