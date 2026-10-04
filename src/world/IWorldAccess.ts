import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';

/** World event listener (RenderGlobal implements it on the client). */
export interface IWorldAccess {
  markBlockForUpdate(x: number, y: number, z: number): void;
  markBlockForRenderUpdate(x: number, y: number, z: number): void;
  markBlockRangeForRenderUpdate(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void;
  /**
   * Client-only sound (World.playSound, WorldClient.playSound in 1.5.2), with the far-away delay
   * (fireworks). Only listeners that play sounds implement it; a server-side listener (LanWorld)
   * must not, since every client makes these sounds itself.
   */
  playSoundWithDistanceDelay?(name: string, x: number, y: number, z: number, volume: number, pitch: number, distanceDelay: boolean): void;
  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void;
  onEntityCreate(e: Entity): void;
  onEntityDestroy(e: Entity): void;
  playAuxSFX(player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void;
  /** A jukebox starts (or, with null, stops) a record. */
  playRecord?(name: string | null, x: number, y: number, z: number): void;
  /** Sounds every player hears from the direction of (x, y, z): wither spawn, dragon death. */
  broadcastSound?(type: number, x: number, y: number, z: number, data: number): void;
  destroyBlockPartially(entityId: number, x: number, y: number, z: number, progress: number): void;
  onChunkLoaded?(cx: number, cz: number): void;
  onChunkUnloaded?(cx: number, cz: number): void;
}
