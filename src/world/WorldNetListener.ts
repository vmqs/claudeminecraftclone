import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Explosion } from './Explosion';

/**
 * Server-side world events a multiplayer host forwards to its guests, for the ones IWorldAccess
 * does not carry (WorldServer sent these packets directly: block changes through PlayerManager,
 * Packet18Animation, Packet38EntityStatus, Packet22Collect, Packet60Explosion,
 * Packet54PlayNoteBlock, Packet71Weather, Packet17Sleep). `World.netEvents` is null unless a LAN
 * game is open, so single player pays one null check per event.
 */
export interface WorldNetListener {
  /** A block id or metadata changed (any setBlock flags). */
  blockChanged(x: number, y: number, z: number): void;
  /** markBlockForUpdate: a tile entity's data may have changed too (signs, spawners, skulls). */
  tileEntityChanged(x: number, y: number, z: number): void;
  /** An entity started swinging its arm (1) or another animation. */
  entityAnimation(e: Entity, animation: number): void;
  /** World.setEntityState (handleHealthUpdate status). */
  entityStatus(e: Entity, status: number): void;
  /** onItemPickup: an item, arrow or orb flies into the collector. */
  itemCollected(item: Entity, collector: Entity): void;
  /** An explosion finished (affected blocks and player knockback are on the object). */
  explosion(e: Explosion): void;
  /** A block event was delivered (note blocks, pistons, chest lids). */
  blockEvent(x: number, y: number, z: number, blockId: number, eventId: number, param: number): void;
  /** A lightning bolt was added as a weather effect. */
  lightning(bolt: Entity): void;
  /** A player lay down in a bed. */
  playerSleep(p: EntityPlayer, x: number, y: number, z: number): void;
  /** A sleeping player got up. */
  playerWake(p: EntityPlayer): void;
  /** A sound of the host's own player, which only the host's client played (EntityPlayerSP.playSound). */
  playerSound(p: EntityPlayer, name: string, x: number, y: number, z: number, volume: number, pitch: number): void;
  /**
   * An entity's tick threw while the LAN game is open (the world catches it so the rest of the
   * tick and the guests' updates still run): the listener removes the entity or its guest.
   */
  entityTickFailed(e: Entity, err: unknown): void;
}
