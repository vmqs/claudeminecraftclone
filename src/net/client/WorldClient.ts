import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { EntityOtherPlayerMP } from '../../entity/EntityOtherPlayerMP';
import { World, type WorldInfo } from '../../world/World';
import { tickRemoteEntity } from './RemoteEntityTick';

/**
 * A guest's world (WorldClient): its chunks, entities and time come from the host. It is
 * `isRemote`, so blocks skip their server halves (onBlockAdded, breakBlock, scheduled and random
 * ticks), and nothing here generates terrain, spawns mobs or runs entity logic: the local player
 * moves itself, other players interpolate (EntityOtherPlayerMP), and every other entity follows
 * the host's packets (RemoteEntityTick). Entities only appear when the network handler adds them.
 */
export class WorldClient extends World {
  override readonly isRemote: boolean = true;
  /** The local player (simulated here and reported to the host). */
  localPlayer: Entity | null = null;
  /** Set by the network handler while it adds an entity the host announced. */
  private acceptingSpawn = false;

  constructor(info: WorldInfo) {
    super(info);
    this.mobSpawner = null;
  }

  /** Adds an entity the host announced (the only way entities enter a guest's world). */
  addEntityFromHost(e: Entity): boolean {
    this.acceptingSpawn = true;
    try {
      return super.spawnEntityInWorld(e);
    } finally {
      this.acceptingSpawn = false;
    }
  }

  /**
   * Client code may try to spawn entities as a prediction (thrown items, drops); in a guest's
   * world only the host's entities and the local player exist, so those are refused.
   */
  override spawnEntityInWorld(e: Entity): boolean {
    if (this.acceptingSpawn || e === this.localPlayer) return super.spawnEntityInWorld(e);
    return false;
  }

  /** WorldClient.tick: the clock between the host's time packets, the client weather, mood sounds and light. */
  override tick(): void {
    this.clientWeather.remoteTick();
    const sub = this.calculateSkylightSubtracted(1);
    if (sub !== this.skylightSubtracted) this.skylightSubtracted = sub;
    this.worldInfo.totalTime++;
    this.worldInfo.worldTime++;
    this.runNaturally(() => this.tickBlocksAndAmbiance());
  }

  /**
   * The local player and other players run their own (client) updates; everything else follows
   * the host. No chunk-loaded check: entities at the edge of the view still glide to the host's
   * positions.
   */
  override updateEntityWithOptionalForce(e: Entity, force: boolean): void {
    if (e === this.localPlayer || e instanceof EntityOtherPlayerMP) {
      super.updateEntityWithOptionalForce(e, force);
      return;
    }
    e.lastTickPosX = e.posX;
    e.lastTickPosY = e.posY;
    e.lastTickPosZ = e.posZ;
    e.prevRotationYaw = e.rotationYaw;
    e.prevRotationPitch = e.rotationPitch;
    if (force) {
      if (e.ridingEntity) e.updateRidden();
      else {
        e.ticksExisted++;
        tickRemoteEntity(e);
      }
    }
    const cx = MathHelper.floor_double(e.posX / 16);
    const cy = MathHelper.floor_double(e.posY / 16);
    const cz = MathHelper.floor_double(e.posZ / 16);
    if (!e.addedToChunk || e.chunkCoordX !== cx || e.chunkCoordY !== cy || e.chunkCoordZ !== cz) {
      if (e.addedToChunk && this.chunkExists(e.chunkCoordX, e.chunkCoordZ)) this.getChunkFromChunkCoords(e.chunkCoordX, e.chunkCoordZ).removeEntityAtIndex(e, e.chunkCoordY);
      if (this.chunkExists(cx, cz)) {
        e.addedToChunk = true;
        this.getChunkFromChunkCoords(cx, cz).addEntity(e);
      } else {
        e.addedToChunk = false;
      }
    }
    if (force && e.riddenByEntity) {
      if (!e.riddenByEntity.isDead && e.riddenByEntity.ridingEntity === e) this.updateEntity(e.riddenByEntity);
      else {
        e.riddenByEntity.ridingEntity = null;
        e.riddenByEntity = null;
      }
    }
  }
}
