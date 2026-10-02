import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { World } from '../world/World';
import type { ItemStack } from './ItemStack';

/**
 * How items create the entities they throw, shoot or place. The entity classes belong to the
 * entities agent. By default the item calls the class bound in EntityList with the original
 * constructor arguments (below); a factory registered here replaces that for one kind.
 */
export const ItemEntityFactories = {
  /** EntityThrowable subclasses and EntityPotion: (world, thrower, stack) by EntityList name. */
  throwable: new Map<string, (w: World, thrower: EntityLiving, stack: ItemStack) => Entity | null>(),
  /** new EntityArrow(world, shooter, velocity). */
  arrow: null as ((w: World, shooter: EntityLiving, velocity: number) => Entity | null) | null,
  /** new EntityFishHook(world, player) (not in EntityList in 1.5.2). */
  fishHook: null as ((w: World, player: EntityPlayer) => Entity | null) | null,
  /** new EntityFireworkRocket(world, x, y, z, stack). */
  firework: null as ((w: World, x: number, y: number, z: number, stack: ItemStack) => Entity | null) | null,
  /** new EntityEnderEye(world, x, y, z). */
  enderEye: null as ((w: World, x: number, y: number, z: number) => Entity | null) | null,
  /** new EntityPainting / EntityItemFrame(world, x, y, z, direction); null when it does not fit. */
  hanging: new Map<string, (w: World, x: number, y: number, z: number, direction: number) => Entity | null>(),
  /** EntityMinecart.createMinecart(world, x, y, z, type). */
  minecart: null as ((w: World, x: number, y: number, z: number, type: number) => Entity | null) | null,
  /** new EntityBoat(world, x, y, z). */
  boat: null as ((w: World, x: number, y: number, z: number) => Entity | null) | null,
};

/**
 * The class bound to an EntityList name, called with the original constructor arguments. The
 * entity classes implement the 1.5.2 overloads (`new EntityPotion(world, thrower, stack)`,
 * `new EntityPainting(world, x, y, z, direction)`...), so passing the same arguments gives the
 * original set-up: heading and inaccuracy, the painting's random art that fits, the rocket's
 * lifetime. Thrown eggs and fishing hooks have no savegame name in 1.5.2; the entity code labels
 * them 'Egg' and 'FishHook' outside the saved names (EntityList.getClassForDebug).
 */
type EntityCtor = new (world: World, ...args: never[]) => Entity;
type ArgsCtor<A extends unknown[]> = new (world: World, ...args: A) => Entity;

const UNSAVED_LABELS: Record<string, string> = { ThrownEgg: 'Egg', FishHook: 'FishHook' };

function entityClass(name: string): EntityCtor | null {
  const id = EntityList.getIDFromString(name);
  const cls = id !== 0 ? EntityList.getClassFromID(id) : null;
  if (cls) return cls as unknown as EntityCtor;
  const label = UNSAVED_LABELS[name];
  const list = EntityList as unknown as { getClassForDebug?(label: string): EntityCtor | null };
  return label !== undefined ? (list.getClassForDebug?.(label) ?? null) : null;
}

function construct<A extends unknown[]>(name: string, w: World, ...args: A): Entity | null {
  const cls = entityClass(name) as ArgsCtor<A> | null;
  return cls ? new cls(w, ...args) : null;
}

/** new EntitySnowball(world, player) and friends (EntityPotion also takes the potion stack). */
export function createThrowable(name: string, w: World, thrower: EntityLiving, stack: ItemStack): Entity | null {
  const factory = ItemEntityFactories.throwable.get(name);
  if (factory) return factory(w, thrower, stack);
  return name === 'ThrownPotion' ? construct(name, w, thrower, stack.copy()) : construct(name, w, thrower);
}

/** new EntityArrow(world, shooter, velocity): a player's arrow can be picked up. */
export function createArrow(w: World, shooter: EntityLiving, velocity: number): Entity | null {
  if (ItemEntityFactories.arrow) return ItemEntityFactories.arrow(w, shooter, velocity);
  return construct('Arrow', w, shooter, velocity);
}

/** new EntityFishHook(world, player). */
export function createFishHook(w: World, player: EntityPlayer): Entity | null {
  if (ItemEntityFactories.fishHook) return ItemEntityFactories.fishHook(w, player);
  return construct('FishHook', w, player);
}

/** new EntityFireworkRocket(world, x, y, z, stack). */
export function createFirework(w: World, x: number, y: number, z: number, stack: ItemStack): Entity | null {
  if (ItemEntityFactories.firework) return ItemEntityFactories.firework(w, x, y, z, stack);
  return construct('FireworksRocketEntity', w, x, y, z, stack);
}

/** new EntityEnderEye(world, x, y, z). */
export function createEnderEye(w: World, x: number, y: number, z: number): Entity | null {
  if (ItemEntityFactories.enderEye) return ItemEntityFactories.enderEye(w, x, y, z);
  return construct('EyeOfEnderSignal', w, x, y, z);
}

/** new EntityPainting / EntityItemFrame(world, x, y, z, direction): hung on face `direction`. */
export function createHanging(name: 'Painting' | 'ItemFrame', w: World, x: number, y: number, z: number, direction: number): Entity | null {
  const factory = ItemEntityFactories.hanging.get(name);
  if (factory) return factory(w, x, y, z, direction);
  return construct(name, w, x, y, z, direction);
}

/** EntityList names of the minecart types (EntityMinecart.createMinecart). */
const MINECART_NAMES = ['MinecartRideable', 'MinecartChest', 'MinecartFurnace', 'MinecartTNT', 'MinecartSpawner', 'MinecartHopper'];

/** EntityMinecart.createMinecart: a cart of `type` resting at (x, y, z). */
export function createMinecart(w: World, x: number, y: number, z: number, type: number): Entity | null {
  if (ItemEntityFactories.minecart) return ItemEntityFactories.minecart(w, x, y, z, type);
  return construct(MINECART_NAMES[type] ?? 'MinecartRideable', w, x, y, z);
}

/** new EntityBoat(world, x, y, z). */
export function createBoat(w: World, x: number, y: number, z: number): Entity | null {
  if (ItemEntityFactories.boat) return ItemEntityFactories.boat(w, x, y, z);
  return construct('Boat', w, x, y, z);
}

/** The 1.5.2 methods items call on the entities they create (optional: classes may differ). */
interface ProjectileLike {
  moveTowards?(x: number, y: number, z: number): void;
  onValidSurface?(): boolean;
}

/** Steers a thrown eye of ender towards (x, y, z) (EntityEnderEye.moveTowards). */
export function moveEnderEyeTowards(e: Entity, x: number, y: number, z: number): void {
  (e as Entity & ProjectileLike).moveTowards?.(x, y, z);
}

/** EntityHanging.onValidSurface (true when the class cannot tell). */
export function isOnValidSurface(e: Entity): boolean {
  const h = e as Entity & ProjectileLike;
  return h.onValidSurface ? h.onValidSurface() : true;
}
