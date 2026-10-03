import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import { EnumArt } from '../entity/EntityPainting';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { MetaEntry, MetaValue } from './protocol/Packets';

/**
 * What the network knows about each kind of entity, shared by host and guest so both build the
 * same tables:
 * - tracking (EntityTracker.addEntityToTracker): range, how often positions go out, velocity;
 * - the name a spawn packet carries and the class-specific spawn data (a painting's motive, an
 *   orb's value, a falling block's id...);
 * - metadata (DataWatcher): the fields that show on the guest (flags, health, a sheep's colour,
 *   a creeper's swelling...), read and written by index.
 */

// ---------------------------------------------------------------------- tracking

export interface TrackingParams {
  /** Blocks from the guest within which it is tracked (capped by the view distance). */
  range: number;
  /** Ticks between position updates. Guests only interpolate, so moving things go out often. */
  frequency: number;
  /** Whether velocity changes are sent (Packet28). */
  velocity: boolean;
}

type AnyEntity = Entity & Record<string, unknown>;

/** EntityTracker's table by EntityList name; null for entities that are not tracked. */
export function trackingParams(e: Entity): TrackingParams | null {
  if (e.isPlayerEntity) return { range: 512, frequency: 1, velocity: false };
  const name = netEntityName(e);
  if (!name) return null;
  switch (name) {
    case 'FishHook':
      return { range: 64, frequency: 2, velocity: true };
    case 'Arrow':
    case 'Snowball':
    case 'Egg':
    case 'ThrownEnderpearl':
    case 'ThrownPotion':
    case 'ThrownExpBottle':
    case 'FireworksRocketEntity':
    case 'Fireball':
    case 'SmallFireball':
    case 'WitherSkull':
    case 'EyeOfEnderSignal':
      return { range: 64, frequency: 1, velocity: true };
    case 'Item':
      return { range: 64, frequency: 2, velocity: true };
    case 'Boat':
    case 'MinecartRideable':
    case 'MinecartChest':
    case 'MinecartFurnace':
    case 'MinecartTNT':
    case 'MinecartHopper':
    case 'MinecartSpawner':
      return { range: 80, frequency: 1, velocity: true };
    case 'PrimedTnt':
    case 'FallingSand':
      return { range: 160, frequency: 2, velocity: true };
    case 'XPOrb':
      return { range: 160, frequency: 2, velocity: true };
    case 'Painting':
    case 'ItemFrame':
      return { range: 160, frequency: Number.POSITIVE_INFINITY, velocity: false };
    case 'EnderCrystal':
      return { range: 256, frequency: Number.POSITIVE_INFINITY, velocity: false };
    case 'LightningBolt':
      return null;
    default:
      // Mobs (IAnimals): 80 blocks, every 3 ticks in 1.5.2; every 2 here (no client simulation).
      return e.isLivingEntity ? { range: 80, frequency: 2, velocity: true } : null;
  }
}

/** The name a spawn packet uses: the EntityList name, or the unsaved classes' labels. */
export function netEntityName(e: Entity): string | null {
  return EntityList.getEntityString(e) ?? EntityList.getDebugName(e);
}

// ---------------------------------------------------------------------- spawn data

/** Class-specific data of a spawn packet (Packet23's extra int, Packet25's motive...). */
export function spawnData(e: Entity): Record<string, unknown> | null {
  const a = e as AnyEntity;
  switch (netEntityName(e)) {
    case 'XPOrb':
      return { value: a.xpValue as number };
    case 'FallingSand':
      return { id: a.blockID as number, meta: a.metadata as number };
    case 'Painting':
      return { title: (a.art as { title: string }).title, dir: a.hangingDirection as number, x: a.xPosition as number, y: a.yPosition as number, z: a.zPosition as number };
    case 'ItemFrame':
      return { dir: a.hangingDirection as number, x: a.xPosition as number, y: a.yPosition as number, z: a.zPosition as number };
    case 'PrimedTnt':
      return { fuse: a.fuse as number };
    case 'ThrownPotion': {
      const p = a.potionDamage as ItemStack | null;
      return { damage: p ? p.getItemDamage() : 0 };
    }
    case 'FishHook': {
      const angler = a.angler as Entity | null;
      return { angler: angler ? angler.entityId : -1 };
    }
    case 'Arrow': {
      const shooter = a.shootingEntity as Entity | null;
      return { shooter: shooter ? shooter.entityId : -1 };
    }
    default:
      return null;
  }
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * A guest's copy of an entity from a spawn packet (NetClientHandler.handleVehicleSpawn /
 * handleMobSpawn / handleEntityPainting / handleEntityExpOrb). `byId` finds related entities
 * (a fishing hook's angler). Null for names this game does not know.
 */
export function createFromSpawn(world: World, name: string, x: number, y: number, z: number, data: unknown, byId: (id: number) => Entity | null): Entity | null {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const cls = EntityList.getClassForDebug(name);
  if (!cls) return null;
  const e = new cls(world) as AnyEntity;
  switch (name) {
    case 'XPOrb':
      e.xpValue = num(d.value);
      break;
    case 'FallingSand':
      e.blockID = num(d.id) & 4095;
      e.metadata = num(d.meta) & 15;
      break;
    case 'Painting': {
      e.xPosition = num(d.x);
      e.yPosition = num(d.y);
      e.zPosition = num(d.z);
      const art = EnumArt.find((a) => a.title === String(d.title ?? ''));
      if (art) e.art = art;
      (e as unknown as { setDirection(dir: number): void }).setDirection(num(d.dir) & 3);
      return e;
    }
    case 'ItemFrame':
      e.xPosition = num(d.x);
      e.yPosition = num(d.y);
      e.zPosition = num(d.z);
      (e as unknown as { setDirection(dir: number): void }).setDirection(num(d.dir) & 3);
      return e;
    case 'PrimedTnt':
      e.fuse = num(d.fuse, 80);
      break;
    case 'ThrownPotion':
      (e as unknown as { setPotionDamage(n: number): void }).setPotionDamage(num(d.damage));
      break;
    case 'FishHook': {
      const angler = byId(num(d.angler, -1));
      if (angler && angler.isPlayerEntity) {
        e.angler = angler;
        (angler as AnyEntity).fishEntity = e;
      }
      break;
    }
    case 'Arrow':
      e.shootingEntity = byId(num(d.shooter, -1));
      break;
  }
  e.setPosition(x, y, z);
  return e;
}

// ---------------------------------------------------------------------- metadata

interface MetaSlot {
  get(e: AnyEntity): MetaValue;
  set(e: AnyEntity, v: MetaValue): void;
}

const field = (name: string): MetaSlot => ({
  get: (e) => {
    const v = e[name];
    return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : null;
  },
  set: (e, v) => {
    if (v !== null && typeof v !== 'object') e[name] = v;
  },
});

const itemField = (name: string): MetaSlot => ({
  get: (e) => {
    const v = e[name];
    return v instanceof ItemStack ? v : null;
  },
  set: (e, v) => {
    e[name] = v instanceof ItemStack ? v.copy() : null;
  },
});

const call = (getter: string, setter: string): MetaSlot => ({
  get: (e) => (e[getter] as () => MetaValue).call(e),
  set: (e, v) => {
    const cur = (e[getter] as () => MetaValue).call(e);
    if (cur !== v) (e[setter] as (v: MetaValue) => void).call(e, v);
  },
});

/**
 * Slots of every entity: the flags byte (burning, sneaking, riding, sprinting, eating,
 * invisible), read through the getters because the local player keeps some of them elsewhere
 * (EntityPlayerSP's sneaking comes from its movement input).
 */
const FLAGS: MetaSlot = {
  get: (e) => (e.isBurning() ? 1 : 0) | (e.isSneaking() ? 2 : 0) | (e.isRiding() ? 4 : 0) | (e.isSprinting() ? 8 : 0) | (e.isEating() ? 16 : 0) | (e.isInvisible() ? 32 : 0),
  set: (e, v) => {
    if (typeof v === 'number') (e as Record<string, unknown>).watcherFlags = v & 63;
  },
};
const BASE: MetaSlot[] = [FLAGS];
/** Living entities: health (death animation, wolf tails), the potion swirl colour and arrows stuck in the body. */
const LIVING: MetaSlot[] = [field('health'), field('potionSwirlColor'), field('potionSwirlAmbient'), field('arrowCount')];
const MINECART: MetaSlot[] = [field('rollingAmplitude'), field('rollingDirection'), field('damage'), field('displayTile'), field('displayTileOffset'), field('hasCustomDisplayTile')];

const BY_NAME: Record<string, MetaSlot[]> = {
  Item: [itemField('stack')],
  ItemFrame: [itemField('displayed'), field('itemRotation')],
  FireworksRocketEntity: [itemField('fireworkItem')],
  ThrownPotion: [itemField('potionDamage')],
  Arrow: [field('critical')],
  WitherSkull: [field('invulnerableSkull')],
  Boat: [field('timeSinceHit'), field('forwardDirection'), field('damageTaken')],
  MinecartRideable: MINECART,
  MinecartChest: MINECART,
  MinecartTNT: MINECART,
  MinecartHopper: MINECART,
  MinecartSpawner: MINECART,
  MinecartFurnace: [...MINECART, field('powered')],
  Creeper: [field('creeperState'), field('powered')],
  Skeleton: [call('getSkeletonType', 'setSkeletonType')],
  Spider: [field('climbFlags')],
  CaveSpider: [field('climbFlags')],
  Zombie: [field('childFlag'), field('villagerFlag'), field('convertingFlag')],
  PigZombie: [field('childFlag'), field('villagerFlag'), field('convertingFlag')],
  Slime: [call('getSlimeSize', 'setSlimeSize')],
  LavaSlime: [call('getSlimeSize', 'setSlimeSize')],
  Ghast: [field('charging')],
  Enderman: [field('carried'), field('carriedData'), field('screaming')],
  Blaze: [field('blazeFlags')],
  Witch: [field('aggressive')],
  Bat: [field('hanging')],
  Pig: [field('saddled')],
  Sheep: [field('woolFlags')],
  Wolf: [field('angry'), field('dataHealth'), field('begging'), field('collarColor')],
  Ozelot: [field('tameSkin')],
  Villager: [field('profession')],
  VillagerGolem: [field('playerCreated')],
};

const AGEABLE: MetaSlot[] = [call('getGrowingAge', 'setGrowingAge')];
const TAMEABLE: MetaSlot[] = [call('isTamed', 'setTamed'), call('isSitting', 'setSitting'), call('getOwnerName', 'setOwner')];

const slotCache = new Map<Function, MetaSlot[]>();

/** The metadata slots of an entity, by index: base, then the class's, then the living ones. */
function slotsOf(e: Entity): MetaSlot[] {
  const cls = e.constructor;
  let slots = slotCache.get(cls);
  if (slots) return slots;
  const a = e as AnyEntity;
  slots = [...BASE];
  const name = netEntityName(e);
  if (name && BY_NAME[name]) slots.push(...BY_NAME[name]);
  if (typeof a.getGrowingAge === 'function' && typeof a.setGrowingAge === 'function') slots.push(...AGEABLE);
  if (typeof a.isTamed === 'function' && typeof a.setTamed === 'function') slots.push(...TAMEABLE);
  if (e.isLivingEntity) slots.push(...LIVING);
  slotCache.set(cls, slots);
  return slots;
}

/** The current metadata values, by slot index. */
export function readMetadata(e: Entity): MetaValue[] {
  return slotsOf(e).map((s) => s.get(e as AnyEntity));
}

function sameValue(a: MetaValue, b: MetaValue): boolean {
  if (a instanceof ItemStack || b instanceof ItemStack) {
    if (!(a instanceof ItemStack) || !(b instanceof ItemStack)) return false;
    return ItemStack.areItemStacksEqual(a, b);
  }
  return a === b;
}

/** Entries whose value differs from `last` (all of them when `last` is null); updates `last`. */
export function diffMetadata(e: Entity, last: MetaValue[] | null): { entries: MetaEntry[]; values: MetaValue[] } {
  const now = readMetadata(e);
  const entries: MetaEntry[] = [];
  for (let i = 0; i < now.length; i++) {
    if (last && sameValue(last[i], now[i])) continue;
    const v = now[i];
    entries.push([i, v instanceof ItemStack ? v.copy() : v]);
  }
  return { entries, values: now.map((v) => (v instanceof ItemStack ? v.copy() : v)) };
}

/** Applies metadata entries on a guest's copy; unknown indices and wrong types are ignored. */
export function applyMetadata(e: Entity, entries: MetaEntry[]): void {
  const slots = slotsOf(e);
  for (const [i, v] of entries) {
    const s = slots[i];
    if (!s) continue;
    try {
      s.set(e as AnyEntity, v);
    } catch {
      /* a malformed value for this slot */
    }
  }
}
