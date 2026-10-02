import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { World } from '../world/World';
import type { ItemStack } from './ItemStack';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * How items create the entities they throw, shoot or place. The entity classes belong to the
 * entities agent; they can register exact constructors here (the original's
 * `new EntitySnowball(world, player)` etc.). Until a factory is registered the item falls back
 * to `EntityList.createEntityByName(name)` plus the original constructor's set-up, applied
 * through the 1.5.2 field and method names (thrower, shootingEntity, setThrowableHeading...).
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

/** The 1.5.2 fields and methods the fallbacks set up (all optional: classes may differ). */
interface ProjectileLike {
  thrower?: EntityLiving | null;
  throwerName?: string;
  shootingEntity?: Entity | null;
  canBePickedUp?: number;
  potionDamage?: ItemStack | null;
  ticksInGround?: number;
  setThrowableHeading?(x: number, y: number, z: number, velocity: number, inaccuracy: number): void;
  moveTowards?(x: number, y: number, z: number): void;
  onValidSurface?(): boolean;
}

function rng(e: Entity): JavaRandom {
  return (e as unknown as { rand: JavaRandom }).rand;
}

/** EntityThrowable.setThrowableHeading (used when the class has none). */
function throwableHeading(e: Entity, x: number, y: number, z: number, velocity: number, inaccuracy: number, arrow = false): void {
  const p = e as Entity & ProjectileLike;
  if (p.setThrowableHeading) {
    p.setThrowableHeading(x, y, z, velocity, inaccuracy);
    return;
  }
  const r = rng(e);
  const len = MathHelper.sqrt_double(x * x + y * y + z * z);
  x /= len;
  y /= len;
  z /= len;
  const spread = (axis: number) => axis + r.nextGaussian() * (arrow ? (r.nextBoolean() ? -1 : 1) : 1) * 0.007499999832361937 * inaccuracy;
  x = spread(x) * velocity;
  y = spread(y) * velocity;
  z = spread(z) * velocity;
  e.motionX = x;
  e.motionY = y;
  e.motionZ = z;
  const h = MathHelper.sqrt_double(x * x + z * z);
  e.prevRotationYaw = e.rotationYaw = f((Math.atan2(x, z) * 180) / Math.PI);
  e.prevRotationPitch = e.rotationPitch = f((Math.atan2(y, h) * 180) / Math.PI);
  p.ticksInGround = 0;
}

/** Places a projectile at the shooter's eye, 0.16 to the right and 0.1 down, facing its look. */
function placeAtEye(e: Entity, shooter: EntityLiving): void {
  e.setLocationAndAngles(shooter.posX, shooter.posY + shooter.getEyeHeight(), shooter.posZ, shooter.rotationYaw, shooter.rotationPitch);
  e.posX -= f(MathHelper.cos(f(f(e.rotationYaw / 180) * PI_F)) * f(0.16));
  e.posY -= 0.10000000149011612;
  e.posZ -= f(MathHelper.sin(f(f(e.rotationYaw / 180) * PI_F)) * f(0.16));
  e.setPosition(e.posX, e.posY, e.posZ);
  e.yOffset = 0;
}

/** Throw speed and pitch lift of each EntityThrowable (func_70182_d / func_70183_g). */
const THROW_PARAMS: Record<string, [velocity: number, pitchOffset: number]> = {
  Snowball: [1.5, 0],
  ThrownEgg: [1.5, 0],
  ThrownEnderpearl: [1.5, 0],
  ThrownExpBottle: [0.7, -20],
  ThrownPotion: [0.5, -20],
};

/** new EntitySnowball(world, player) and friends; null when the entity class does not exist yet. */
export function createThrowable(name: string, w: World, thrower: EntityLiving, stack: ItemStack): Entity | null {
  const factory = ItemEntityFactories.throwable.get(name);
  if (factory) return factory(w, thrower, stack);
  const e = EntityList.createEntityByName(name, w);
  if (!e) return null;
  const p = e as Entity & ProjectileLike;
  p.thrower = thrower;
  if (name === 'ThrownPotion') p.potionDamage = stack.copy();
  placeAtEye(e, thrower);
  const [velocity, pitchOffset] = THROW_PARAMS[name] ?? [1.5, 0];
  const k = f(0.4);
  const yaw = f(f(e.rotationYaw / 180) * PI_F);
  const pitch = f(f(e.rotationPitch / 180) * PI_F);
  e.motionX = f(f(-MathHelper.sin(yaw) * MathHelper.cos(pitch)) * k);
  e.motionZ = f(f(MathHelper.cos(yaw) * MathHelper.cos(pitch)) * k);
  e.motionY = f(-MathHelper.sin(f(f(f(e.rotationPitch + pitchOffset) / 180) * PI_F)) * k);
  throwableHeading(e, e.motionX, e.motionY, e.motionZ, velocity, 1);
  return e;
}

/** new EntityArrow(world, shooter, velocity): a player's arrow can be picked up. */
export function createArrow(w: World, shooter: EntityLiving, velocity: number): Entity | null {
  if (ItemEntityFactories.arrow) return ItemEntityFactories.arrow(w, shooter, velocity);
  const e = EntityList.createEntityByName('Arrow', w);
  if (!e) return null;
  const p = e as Entity & ProjectileLike;
  p.shootingEntity = shooter;
  if (shooter.isPlayerEntity) p.canBePickedUp = 1;
  placeAtEye(e, shooter);
  const yaw = f(f(e.rotationYaw / 180) * PI_F);
  const pitch = f(f(e.rotationPitch / 180) * PI_F);
  e.motionX = f(-MathHelper.sin(yaw) * MathHelper.cos(pitch));
  e.motionZ = f(MathHelper.cos(yaw) * MathHelper.cos(pitch));
  e.motionY = -MathHelper.sin(pitch);
  throwableHeading(e, e.motionX, e.motionY, e.motionZ, f(velocity * f(1.5)), 1, true);
  return e;
}

/** new EntityFishHook(world, player): only through a registered factory (no EntityList name). */
export function createFishHook(w: World, player: EntityPlayer): Entity | null {
  return ItemEntityFactories.fishHook ? ItemEntityFactories.fishHook(w, player) : null;
}

/** new EntityFireworkRocket(world, x, y, z, stack). */
export function createFirework(w: World, x: number, y: number, z: number, stack: ItemStack): Entity | null {
  if (ItemEntityFactories.firework) return ItemEntityFactories.firework(w, x, y, z, stack);
  const e = EntityList.createEntityByName('FireworksRocketEntity', w);
  if (!e) return null;
  e.setPosition(x, y, z);
  e.yOffset = 0;
  const r = rng(e);
  e.motionX = r.nextGaussian() * 0.001;
  e.motionZ = r.nextGaussian() * 0.001;
  e.motionY = 0.05;
  const flight = Number(((stack.getTagCompound()?.Fireworks as { Flight?: number } | undefined)?.Flight ?? 0) << 24 >> 24);
  const rocket = e as Entity & { lifetime?: number; fireworkAge?: number; fireworkItem?: ItemStack };
  rocket.fireworkAge = 0;
  rocket.lifetime = 10 * (1 + flight) + r.nextInt(6) + r.nextInt(7);
  rocket.fireworkItem = stack.copy();
  return e;
}

/** new EntityEnderEye(world, x, y, z). */
export function createEnderEye(w: World, x: number, y: number, z: number): Entity | null {
  if (ItemEntityFactories.enderEye) return ItemEntityFactories.enderEye(w, x, y, z);
  const e = EntityList.createEntityByName('EyeOfEnderSignal', w);
  if (!e) return null;
  e.setPosition(x, y, z);
  e.yOffset = 0;
  return e;
}

/** A painting or item frame hung on face `direction` of (x, y, z). */
export function createHanging(name: 'Painting' | 'ItemFrame', w: World, x: number, y: number, z: number, direction: number): Entity | null {
  const factory = ItemEntityFactories.hanging.get(name);
  if (factory) return factory(w, x, y, z, direction);
  const e = EntityList.createEntityByName(name, w);
  if (!e) return null;
  const h = e as Entity & { xPosition?: number; yPosition?: number; zPosition?: number; setDirection?(d: number): void };
  h.xPosition = x;
  h.yPosition = y;
  h.zPosition = z;
  h.setDirection?.(direction);
  return e;
}

/** EntityList names of the minecart types (EntityMinecart.createMinecart). */
const MINECART_NAMES = ['MinecartRideable', 'MinecartChest', 'MinecartFurnace', 'MinecartTNT', 'MinecartSpawner', 'MinecartHopper'];

/** EntityMinecart.createMinecart: a cart of `type` resting at (x, y, z). */
export function createMinecart(w: World, x: number, y: number, z: number, type: number): Entity | null {
  if (ItemEntityFactories.minecart) return ItemEntityFactories.minecart(w, x, y, z, type);
  const e = EntityList.createEntityByName(MINECART_NAMES[type] ?? 'MinecartRideable', w);
  if (!e) return null;
  placeVehicle(e, x, y, z);
  return e;
}

/** new EntityBoat(world, x, y, z). */
export function createBoat(w: World, x: number, y: number, z: number): Entity | null {
  if (ItemEntityFactories.boat) return ItemEntityFactories.boat(w, x, y, z);
  const e = EntityList.createEntityByName('Boat', w);
  if (!e) return null;
  placeVehicle(e, x, y, z);
  return e;
}

function placeVehicle(e: Entity, x: number, y: number, z: number): void {
  e.setPosition(x, y + e.yOffset, z);
  e.motionX = e.motionY = e.motionZ = 0;
  e.prevPosX = x;
  e.prevPosY = y;
  e.prevPosZ = z;
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
