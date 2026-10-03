import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { ItemStack } from '../../item/ItemStack';
import { World } from '../../world/World';
import { diffMetadata, netEntityName, spawnData, trackingParams, type TrackingParams } from '../EntityNetData';
import type { MetaValue, Packet } from '../protocol/Packets';
import type { NetServerHandler } from './NetServerHandler';

/** Position in 1/32 blocks, angles in 1/256 turns (Packet31-35). */
const scaled = (v: number) => MathHelper.floor_double(v * 32);
const angle = (deg: number) => MathHelper.floor_float((deg * 256) / 360);
/** Smallest change sent, in those units (1.5.2: 4; smaller here because guests only interpolate). */
const MOVE_THRESHOLD = 2;
const LOOK_THRESHOLD = 3;

/** A player's feet (EntityPlayerSP keeps posY at eye level). */
export function netPosY(e: Entity): number {
  return e.isPlayerEntity ? e.boundingBox.minY : e.posY;
}

function equipmentOf(e: Entity): (ItemStack | null)[] | null {
  if (!e.isLivingEntity) return null;
  if (e.isPlayerEntity) {
    const p = e as EntityPlayer;
    return [p.inventory.getCurrentItem(), ...p.inventory.armorInventory.slice(0, 4)];
  }
  const l = e as EntityLiving;
  return [0, 1, 2, 3, 4].map((i) => l.getCurrentItemOrArmor(i));
}

const sameStack = (a: ItemStack | null, b: ItemStack | null) => ItemStack.areItemStacksEqual(a, b);

/**
 * One tracked entity (EntityTrackerEntry): who sees it, and the spawn, movement, look, head,
 * velocity, metadata, equipment and riding packets that keep their copies in step.
 */
class EntityTrackerEntry {
  readonly trackingPlayers = new Set<NetServerHandler>();
  private lastX: number;
  private lastY: number;
  private lastZ: number;
  private lastYaw: number;
  private lastPitch: number;
  private lastHead: number;
  private motionX = 0;
  private motionY = 0;
  private motionZ = 0;
  private ticks = 0;
  private ticksSinceLastForcedTeleport = 0;
  private wasRiding = false;
  private lastRidden: Entity | null = null;
  private lastMeta: MetaValue[] | null = null;
  private lastEquipment: (ItemStack | null)[] | null = null;

  constructor(
    readonly entity: Entity,
    readonly params: TrackingParams,
  ) {
    this.lastX = scaled(entity.posX);
    this.lastY = scaled(netPosY(entity));
    this.lastZ = scaled(entity.posZ);
    this.lastYaw = angle(entity.rotationYaw);
    this.lastPitch = angle(entity.rotationPitch);
    this.lastHead = angle(entity.getRotationYawHead());
  }

  /** The packets that make the entity appear on a guest (getPacketForThisEntity + extras). */
  spawnPackets(): Packet[] {
    const e = this.entity;
    const meta = diffMetadata(e, null).entries;
    const out: Packet[] = [];
    const y = netPosY(e);
    if (e.isPlayerEntity) {
      const p = e as EntityPlayer;
      out.push({ type: 'NamedEntitySpawn', entityId: e.entityId, name: p.getEntityName(), x: e.posX, y, z: e.posZ, yaw: e.rotationYaw, pitch: e.rotationPitch, headYaw: e.getRotationYawHead(), currentItem: p.inventory.getCurrentItem(), metadata: meta });
    } else {
      out.push({
        type: 'SpawnEntity',
        entityId: e.entityId,
        name: netEntityName(e) ?? '',
        x: e.posX,
        y,
        z: e.posZ,
        yaw: e.rotationYaw,
        pitch: e.rotationPitch,
        headYaw: e.getRotationYawHead(),
        motionX: e.motionX,
        motionY: e.motionY,
        motionZ: e.motionZ,
        data: spawnData(e),
        metadata: meta,
      });
    }
    const eq = equipmentOf(e);
    if (eq) for (let i = 0; i < eq.length; i++) if (eq[i] && !(e.isPlayerEntity && i === 0)) out.push({ type: 'PlayerInventory', entityId: e.entityId, slot: i, item: eq[i] });
    if (e.ridingEntity) out.push({ type: 'AttachEntity', entityId: e.entityId, vehicleEntityId: e.ridingEntity.entityId });
    if (e.isPlayerEntity && (e as EntityPlayer).isPlayerSleeping()) {
      const bed = (e as EntityPlayer).playerLocation;
      if (bed) out.push({ type: 'Sleep', entityId: e.entityId, x: bed.posX, y: bed.posY, z: bed.posZ });
    }
    return out;
  }

  private sendToTracking(p: Packet): void {
    for (const h of this.trackingPlayers) h.sendPacket(p);
  }

  /** Also to the entity itself when it is a guest's player (sendPacketToAllAssociatedPlayers). */
  sendToAssociated(p: Packet, self: NetServerHandler | null): void {
    this.sendToTracking(p);
    self?.sendPacket(p);
  }

  /** Starts or stops tracking for one guest (tryStartWachingThis / removeFromWatchingList). */
  updatePlayer(h: NetServerHandler, viewBlocks: number): void {
    const player = h.player;
    const e = this.entity;
    if (!player || e === player) return;
    const range = Math.min(this.params.range, viewBlocks);
    const dx = player.posX - this.lastX / 32;
    const dz = player.posZ - this.lastZ / 32;
    const inRange = dx >= -range && dx <= range && dz >= -range && dz <= range && !e.isDead;
    const watched = h.loadedChunks.has(World.chunkKey(MathHelper.floor_double(e.posX) >> 4, MathHelper.floor_double(e.posZ) >> 4));
    if (inRange && (watched || e.isPlayerEntity)) {
      if (this.trackingPlayers.has(h)) return;
      this.trackingPlayers.add(h);
      for (const p of this.spawnPackets()) h.sendPacket(p);
    } else if (this.trackingPlayers.has(h)) {
      this.trackingPlayers.delete(h);
      h.sendPacket({ type: 'DestroyEntity', entityIds: [e.entityId] });
    }
  }

  /** sendLocationToAllClients: movement, look, head, velocity, metadata, equipment, riding. */
  update(self: NetServerHandler | null): void {
    const e = this.entity;
    if (this.lastRidden !== e.ridingEntity || (e.ridingEntity && this.ticks % 60 === 0)) {
      this.lastRidden = e.ridingEntity;
      this.sendToAssociated({ type: 'AttachEntity', entityId: e.entityId, vehicleEntityId: e.ridingEntity ? e.ridingEntity.entityId : -1 }, self);
    }
    const meta = diffMetadata(e, this.lastMeta);
    const metaChanged = this.lastMeta !== null && meta.entries.length > 0;
    if (this.lastMeta === null) this.lastMeta = meta.values;
    if (this.trackingPlayers.size > 0 && (this.ticks % this.params.frequency === 0 || e.isAirBorne || metaChanged)) {
      if (!e.ridingEntity) {
        this.ticksSinceLastForcedTeleport++;
        const x = scaled(e.posX);
        const y = scaled(netPosY(e));
        const z = scaled(e.posZ);
        const yaw = angle(e.rotationYaw);
        const pitch = angle(e.rotationPitch);
        const dx = x - this.lastX;
        const dy = y - this.lastY;
        const dz = z - this.lastZ;
        const moved = Math.abs(dx) >= MOVE_THRESHOLD || Math.abs(dy) >= MOVE_THRESHOLD || Math.abs(dz) >= MOVE_THRESHOLD || this.ticks % 60 === 0;
        const looked = Math.abs(yaw - this.lastYaw) >= LOOK_THRESHOLD || Math.abs(pitch - this.lastPitch) >= LOOK_THRESHOLD;
        let packet: Packet | null = null;
        if (dx < -128 || dx >= 128 || dy < -128 || dy >= 128 || dz < -128 || dz >= 128 || this.ticksSinceLastForcedTeleport > 400 || this.wasRiding) {
          this.ticksSinceLastForcedTeleport = 0;
          packet = { type: 'EntityTeleport', entityId: e.entityId, x, y, z, yaw, pitch };
        } else if (moved && looked) {
          packet = { type: 'RelEntityMoveLook', entityId: e.entityId, dx, dy, dz, yaw, pitch };
        } else if (moved) {
          packet = { type: 'RelEntityMove', entityId: e.entityId, dx, dy, dz };
        } else if (looked) {
          packet = { type: 'EntityLook', entityId: e.entityId, yaw, pitch };
        }
        if (this.params.velocity) {
          const vx = e.motionX - this.motionX;
          const vy = e.motionY - this.motionY;
          const vz = e.motionZ - this.motionZ;
          const d = vx * vx + vy * vy + vz * vz;
          if (d > 0.02 * 0.02 || (d > 0 && e.motionX === 0 && e.motionY === 0 && e.motionZ === 0)) {
            this.motionX = e.motionX;
            this.motionY = e.motionY;
            this.motionZ = e.motionZ;
            this.sendToTracking(velocityPacket(e));
          }
        }
        if (packet) this.sendToTracking(packet);
        if (moved || packet?.type === 'EntityTeleport') {
          this.lastX = x;
          this.lastY = y;
          this.lastZ = z;
        }
        if (looked || packet?.type === 'EntityTeleport') {
          this.lastYaw = yaw;
          this.lastPitch = pitch;
        }
        this.wasRiding = false;
      } else {
        const yaw = angle(e.rotationYaw);
        const pitch = angle(e.rotationPitch);
        if (Math.abs(yaw - this.lastYaw) >= LOOK_THRESHOLD || Math.abs(pitch - this.lastPitch) >= LOOK_THRESHOLD) {
          this.sendToTracking({ type: 'EntityLook', entityId: e.entityId, yaw, pitch });
          this.lastYaw = yaw;
          this.lastPitch = pitch;
        }
        this.lastX = scaled(e.posX);
        this.lastY = scaled(netPosY(e));
        this.lastZ = scaled(e.posZ);
        this.wasRiding = true;
      }
      const head = angle(e.getRotationYawHead());
      if (Math.abs(head - this.lastHead) >= LOOK_THRESHOLD) {
        this.sendToTracking({ type: 'EntityHeadRotation', entityId: e.entityId, headYaw: head });
        this.lastHead = head;
      }
      e.isAirBorne = false;
    }
    if (metaChanged) {
      this.lastMeta = meta.values;
      this.sendToAssociated({ type: 'EntityMetadata', entityId: e.entityId, metadata: meta.entries }, self);
    }
    this.updateEquipment();
    this.ticks++;
    if (e.velocityChanged) {
      this.sendToAssociated(velocityPacket(e), self);
      e.velocityChanged = false;
    }
  }

  /** EntityLiving's equipment check (Packet5PlayerInventory when a slot changed). */
  private updateEquipment(): void {
    const now = equipmentOf(this.entity);
    if (!now) return;
    const last = this.lastEquipment;
    for (let i = 0; i < now.length; i++) {
      if (last && sameStack(last[i], now[i])) continue;
      if (last) this.sendToTracking({ type: 'PlayerInventory', entityId: this.entity.entityId, slot: i, item: now[i] });
    }
    this.lastEquipment = now.map((s) => (s ? s.copy() : null));
  }

  removeAll(): void {
    for (const h of this.trackingPlayers) h.sendPacket({ type: 'DestroyEntity', entityIds: [this.entity.entityId] });
    this.trackingPlayers.clear();
  }
}

function velocityPacket(e: Entity): Packet {
  const clamp = (v: number) => Math.max(-3.9, Math.min(3.9, v));
  return { type: 'EntityVelocity', entityId: e.entityId, motionX: Math.round(clamp(e.motionX) * 8000), motionY: Math.round(clamp(e.motionY) * 8000), motionZ: Math.round(clamp(e.motionZ) * 8000) };
}

/**
 * The host's EntityTracker: every entity of the world that guests can see, and for each guest
 * the ones within range on chunks it has.
 */
export class EntityTracker {
  private readonly entries = new Map<number, EntityTrackerEntry>();

  constructor(private readonly handlerOf: (e: Entity) => NetServerHandler | null) {}

  addEntity(e: Entity): void {
    if (this.entries.has(e.entityId)) return;
    const params = trackingParams(e);
    if (!params) return;
    this.entries.set(e.entityId, new EntityTrackerEntry(e, params));
  }

  removeEntity(e: Entity): void {
    const entry = this.entries.get(e.entityId);
    if (!entry || entry.entity !== e) return;
    entry.removeAll();
    this.entries.delete(e.entityId);
  }

  getEntity(id: number): Entity | null {
    return this.entries.get(id)?.entity ?? null;
  }

  /** updateTrackedEntities: who sees what, then each entity's updates. */
  update(handlers: readonly NetServerHandler[], viewBlocks: number): void {
    for (const entry of this.entries.values()) {
      for (const h of handlers) if (h.state === 'play') entry.updatePlayer(h, viewBlocks);
      entry.update(this.handlerOf(entry.entity));
    }
  }

  /** A guest left: forget it everywhere (no packets, the connection is gone). */
  removePlayer(h: NetServerHandler): void {
    for (const entry of this.entries.values()) entry.trackingPlayers.delete(h);
  }

  /** sendPacketToAllPlayersTrackingEntity (and the entity's own guest when `self`). */
  sendToTracking(e: Entity, p: Packet, self: boolean): void {
    const entry = this.entries.get(e.entityId);
    if (!entry) return;
    entry.sendToAssociated(p, self ? this.handlerOf(e) : null);
  }

  /** Guests that see this entity. */
  trackersOf(e: Entity): ReadonlySet<NetServerHandler> {
    return this.entries.get(e.entityId)?.trackingPlayers ?? new Set();
  }

  get size(): number {
    return this.entries.size;
  }
}
