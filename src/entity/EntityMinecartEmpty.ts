import type { World } from '../world/World';
import { EntityMinecart } from './EntityMinecart';
import type { EntityPlayer } from './EntityPlayer';

/** A rideable minecart (EntityMinecartEmpty, "MinecartRideable"): right click gets in or out. */
export class EntityMinecartEmpty extends EntityMinecart {
  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  override interact(player: EntityPlayer): boolean {
    const rider = this.riddenByEntity;
    if (rider && rider.isPlayerEntity && rider !== player) return true;
    if (rider && rider !== player) return false;
    player.mountEntity(this);
    return true;
  }

  getMinecartType(): number {
    return 0;
  }
}

EntityMinecart.minecartTypes.set(0, EntityMinecartEmpty);
