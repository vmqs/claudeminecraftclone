import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EntityMinecart } from './EntityMinecart';
import { EntityMinecartContainer } from './EntityMinecartContainer';

/** A storage minecart (EntityMinecartChest, "MinecartChest"): 27 slots, drops a chest when broken. */
export class EntityMinecartChest extends EntityMinecartContainer {
  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  override killMinecart(src: DamageSource): void {
    super.killMinecart(src);
    this.dropItemWithOffset(BlockIds.chest, 1, 0);
  }

  getSizeInventory(): number {
    return 27;
  }

  getMinecartType(): number {
    return 1;
  }

  override getDefaultDisplayTile(): Block | null {
    return Block.blocksList[BlockIds.chest];
  }

  override getDefaultDisplayTileOffset(): number {
    return 8;
  }
}

EntityMinecart.minecartTypes.set(1, EntityMinecartChest);
