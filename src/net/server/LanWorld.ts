import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { Chunk } from '../../world/Chunk';
import type { Explosion } from '../../world/Explosion';
import type { IWorldAccess } from '../../world/IWorldAccess';
import { World } from '../../world/World';
import type { WorldNetListener } from '../../world/WorldNetListener';
import { describeTileEntity, encodeChunkData } from '../protocol/ChunkCodec';
import type { Packet } from '../protocol/Packets';
import { EntityPlayerMP } from './EntityPlayerMP';
import { EntityTracker } from './EntityTracker';
import type { NetServerHandler } from './NetServerHandler';

const PARTICLES_PER_TICK = 200;

/** What a world's view needs from the LAN server. */
export interface LanWorldServer {
  readonly handlers: readonly NetServerHandler[];
  /** The host's own player (it hears nothing through the network). */
  hostPlayer(): EntityPlayer | null;
  /** Packets to every guest (whatever its dimension). */
  broadcast(p: Packet, except?: NetServerHandler | null): void;
  /** Particles collected for a guest this tick (sent together at the end of the tick). */
  addParticle(h: NetServerHandler, name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void;
  /** Server ticks so far (chunk cache ages). */
  readonly ticks: number;
}

/**
 * One of the host's worlds as the LAN game sees it: a WorldServer's EntityTracker, the block and
 * tile entity changes PlayerInstance sends, the chunk cache of Packet51MapChunk and the
 * WorldManager that forwards sounds and particles. Every dimension the host runs has one; its
 * events only reach the guests whose players are in that world.
 */
export class LanWorld implements WorldNetListener, IWorldAccess {
  readonly tracker: EntityTracker;
  readonly changedBlocks = new Map<number, Set<number>>();
  readonly changedTiles = new Set<string>();
  readonly chunkCache = new Map<number, { data: Uint8Array; tick: number }>();
  /** Chunk compression this tick (shared budget, see LanServer). */
  encodeMs = 0;
  encodedThisTick = 0;

  constructor(
    readonly server: LanWorldServer,
    readonly world: World,
  ) {
    this.tracker = new EntityTracker((e) => (e instanceof EntityPlayerMP ? e.handler ?? null : null));
  }

  /** Starts listening to the world (netEvents and an IWorldAccess) and tracks what is in it. */
  attach(): void {
    const w = this.world;
    w.netEvents = this;
    w.addWorldAccess(this);
    for (const e of w.loadedEntityList) this.tracker.addEntity(e);
  }

  detach(): void {
    const w = this.world;
    if (w.netEvents === this) w.netEvents = null;
    w.removeWorldAccess(this);
  }

  /** Guests playing in this world. */
  handlersHere(): NetServerHandler[] {
    return this.server.handlers.filter((h) => h.state === 'play' && h.player?.worldObj === this.world);
  }

  /** sendToAllNearExcept: guests in this world whose player is within `range` of the point. */
  sendNear(x: number, y: number, z: number, range: number, p: Packet, except: EntityPlayer | null = null): void {
    const r2 = range * range;
    for (const h of this.server.handlers) {
      const pl = h.player;
      if (h.state !== 'play' || !pl || pl === except || pl.worldObj !== this.world) continue;
      const dx = pl.posX - x;
      const dy = pl.posY - y;
      const dz = pl.posZ - z;
      if (dx * dx + dy * dy + dz * dz < r2) h.sendPacket(p);
    }
  }

  /** Packet51MapChunk of a whole chunk (cached until a block in it changes). */
  mapChunkPacket(c: Chunk): Packet {
    const k = World.chunkKey(c.xPosition, c.zPosition);
    let cached = this.chunkCache.get(k);
    if (!cached) {
      const t0 = performance.now();
      const sections = [];
      for (let i = 0; i < 16; i++) {
        const s = c.sections[i];
        if (s && !s.isEmpty()) sections.push({ index: i, blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
      }
      cached = { data: encodeChunkData({ sections, biomes: c.biomes }), tick: this.server.ticks };
      this.chunkCache.set(k, cached);
      this.encodeMs += performance.now() - t0;
      this.encodedThisTick++;
    }
    const tiles = [...c.chunkTileEntityMap.values()].filter((te) => !te.isInvalid()).map((te) => describeTileEntity(te.toDescriptor()));
    return { type: 'MapChunk', cx: c.xPosition, cz: c.zPosition, data: cached.data, tileEntities: tiles };
  }

  /** PlayerInstance.sendChunkUpdate: one change, a few, or the whole chunk again. */
  flushBlockChanges(): void {
    const w = this.world;
    const here = this.handlersHere();
    for (const [k, set] of this.changedBlocks) {
      const kx = Math.floor(k / 0x400000) - 0x200000;
      const kz = (k % 0x400000) - 0x200000;
      const watchers = here.filter((h) => h.loadedChunks.has(k));
      if (watchers.length === 0 || !w.chunkExists(kx, kz)) continue;
      let packet: Packet;
      if (set.size === 1) {
        const pos = set.values().next().value!;
        const x = (kx << 4) + ((pos >> 12) & 15);
        const z = (kz << 4) + ((pos >> 8) & 15);
        const y = pos & 255;
        packet = { type: 'BlockChange', x, y, z, id: w.getBlockId(x, y, z), meta: w.getBlockMetadata(x, y, z) };
      } else if (set.size < 64) {
        const records: number[] = [];
        for (const pos of set) {
          const lx = (pos >> 12) & 15;
          const lz = (pos >> 8) & 15;
          const y = pos & 255;
          const x = (kx << 4) + lx;
          const z = (kz << 4) + lz;
          records.push((lx << 28) | (lz << 24) | (y << 16) | ((w.getBlockId(x, y, z) & 4095) << 4) | (w.getBlockMetadata(x, y, z) & 15));
        }
        packet = { type: 'MultiBlockChange', cx: kx, cz: kz, records };
      } else {
        packet = this.mapChunkPacket(w.getChunkFromChunkCoords(kx, kz));
      }
      for (const h of watchers) h.sendPacket(packet);
    }
    this.changedBlocks.clear();
    for (const key of this.changedTiles) {
      const [x, y, z] = key.split(',').map(Number);
      const te = w.getBlockTileEntity(x, y, z);
      if (!te) continue;
      const k = World.chunkKey(x >> 4, z >> 4);
      const tag = describeTileEntity(te.toDescriptor());
      for (const h of here) if (h.loadedChunks.has(k)) h.sendPacket({ type: 'TileEntityData', x, y, z, tag });
    }
    this.changedTiles.clear();
  }

  /** Drops cached chunk packets nobody asked for in a while. */
  pruneCache(ticks: number): void {
    for (const [k, v] of this.chunkCache) if (ticks - v.tick > 200) this.chunkCache.delete(k);
  }

  // ------------------------------------------------------------------ WorldNetListener

  blockChanged(x: number, y: number, z: number): void {
    if (y < 0 || y >= 256) return;
    const k = World.chunkKey(x >> 4, z >> 4);
    // The light of a change spreads up to 15 blocks, into the neighbouring chunks too.
    if (this.chunkCache.size > 0) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.chunkCache.delete(World.chunkKey((x >> 4) + dx, (z >> 4) + dz));
    let set = this.changedBlocks.get(k);
    if (!set) this.changedBlocks.set(k, (set = new Set()));
    set.add(((x & 15) << 12) | ((z & 15) << 8) | y);
  }

  tileEntityChanged(x: number, y: number, z: number): void {
    if (this.world.getBlockTileEntity(x, y, z)) this.changedTiles.add(`${x},${y},${z}`);
  }

  entityAnimation(e: Entity, animation: number): void {
    this.tracker.sendToTracking(e, { type: 'Animation', entityId: e.entityId, animate: animation }, false);
  }

  entityStatus(e: Entity, status: number): void {
    this.tracker.sendToTracking(e, { type: 'EntityStatus', entityId: e.entityId, status }, true);
  }

  itemCollected(item: Entity, collector: Entity): void {
    this.tracker.sendToTracking(item, { type: 'Collect', collectedEntityId: item.entityId, collectorEntityId: collector.entityId }, false);
  }

  explosion(e: Explosion): void {
    const records: number[] = [];
    const bx = MathHelper.floor_double(e.explosionX);
    const by = MathHelper.floor_double(e.explosionY);
    const bz = MathHelper.floor_double(e.explosionZ);
    for (const [x, y, z] of e.affectedBlockPositions.slice(0, 16384)) records.push(((x - bx) & 255) | (((y - by) & 255) << 8) | (((z - bz) & 255) << 16));
    for (const h of this.handlersHere()) {
      const p = h.player!;
      if (p.getDistanceSq(e.explosionX, e.explosionY, e.explosionZ) >= 4096) continue;
      const push = e.getPlayerKnockbackMap().get(p);
      if (push) h.allowPush(push.xCoord, push.yCoord, push.zCoord);
      // The sound is the server's (Packet62 within 16 x 4 blocks); the guest's copy is silent.
      h.sendPacket(levelSound('random.explode', e.explosionX, e.explosionY, e.explosionZ, 4, e.soundPitch));
      h.sendPacket({ type: 'Explosion', x: e.explosionX, y: e.explosionY, z: e.explosionZ, size: e.explosionSize, records, motionX: push?.xCoord ?? 0, motionY: push?.yCoord ?? 0, motionZ: push?.zCoord ?? 0 });
    }
  }

  blockEvent(x: number, y: number, z: number, blockId: number, eventId: number, param: number): void {
    this.sendNear(x, y, z, 64, { type: 'BlockEvent', x, y, z, blockId, eventId, param });
  }

  lightning(bolt: Entity): void {
    this.sendNear(bolt.posX, bolt.posY, bolt.posZ, 512, { type: 'Weather', entityId: bolt.entityId, x: MathHelper.floor_double(bolt.posX * 32), y: MathHelper.floor_double(bolt.posY * 32), z: MathHelper.floor_double(bolt.posZ * 32) });
  }

  playerSleep(p: EntityPlayer, x: number, y: number, z: number): void {
    const pk: Packet = { type: 'Sleep', entityId: p.entityId, x, y, z };
    this.tracker.sendToTracking(p, pk, true);
    if (p instanceof EntityPlayerMP) p.handler?.setPlayerLocation(p.posX, p.posY, p.posZ, p.rotationYaw, p.rotationPitch);
  }

  playerWake(p: EntityPlayer): void {
    this.tracker.sendToTracking(p, { type: 'Animation', entityId: p.entityId, animate: 3 }, true);
  }

  playerSound(p: EntityPlayer, name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (this.world.localEffectsOnly) return;
    this.sendNear(x, y, z, volume > 1 ? 16 * volume : 16, levelSound(name, x, y, z, volume, pitch), p);
  }

  entityTickFailed(e: Entity, err: unknown): void {
    console.error('[lan] ticking entity failed', e, err);
    if (e instanceof EntityPlayerMP) e.handler?.kick('Internal server error');
    else if (e !== this.server.hostPlayer()) e.setDead();
  }

  // ------------------------------------------------------------------ IWorldAccess (WorldManager)

  markBlockForUpdate(): void {}
  markBlockForRenderUpdate(): void {}
  markBlockRangeForRenderUpdate(): void {}

  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (this.world.localEffectsOnly) return;
    this.sendNear(x, y, z, volume > 1 ? 16 * volume : 16, levelSound(name, x, y, z, volume, pitch), this.world.soundExcept);
  }

  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const w = this.world;
    if (w.localEffectsOnly || this.server.handlers.length === 0) return;
    const source = w.tickingEntity;
    // Guests make these themselves: every client runs its own copy of each player (sprinting,
    // potion swirls, eating, a death's poof), of each tile entity (a spawner's flames) and of
    // each block event (a note block's note).
    if (source?.isPlayerEntity || w.replicatedEffects) return;
    for (const h of this.server.handlers) {
      const p = h.player;
      if (h.state !== 'play' || !p || p === source || p.worldObj !== w) continue;
      const dx = p.posX - x;
      const dy = p.posY - y;
      const dz = p.posZ - z;
      if (dx * dx + dy * dy + dz * dz > 1024) continue;
      this.server.addParticle(h, name, x, y, z, vx, vy, vz);
    }
  }

  onEntityCreate(e: Entity): void {
    this.tracker.addEntity(e);
  }

  onEntityDestroy(e: Entity): void {
    this.tracker.removeEntity(e);
  }

  playAuxSFX(player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void {
    if (this.world.localEffectsOnly && type !== 2001) return;
    this.sendNear(x, y, z, 64, { type: 'AuxSFX', sfxId: type, x, y, z, data, broadcast: false }, player);
  }

  /** As 1.5.2's WorldManager.broadcastSound: every player of the server hears it. */
  broadcastSound(type: number, x: number, y: number, z: number, data: number): void {
    this.server.broadcast({ type: 'AuxSFX', sfxId: type, x, y, z, data, broadcast: true });
  }

  destroyBlockPartially(entityId: number, x: number, y: number, z: number, progress: number): void {
    for (const h of this.handlersHere()) {
      const p = h.player!;
      if (p.entityId === entityId) continue;
      const dx = x - p.posX;
      const dy = y - p.posY;
      const dz = z - p.posZ;
      if (dx * dx + dy * dy + dz * dz < 1024) h.sendPacket({ type: 'BlockDestroy', entityId, x, y, z, progress });
    }
  }
}

/** Packet62LevelSound: position in 1/8 blocks, pitch in 1/63 steps. */
export function levelSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): Packet {
  return { type: 'LevelSound', name, x: Math.trunc(x * 8), y: Math.trunc(y * 8), z: Math.trunc(z * 8), volume, pitch: Math.max(0, Math.min(255, Math.trunc(pitch * 63))) };
}
