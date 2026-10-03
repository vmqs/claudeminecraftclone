import { BlockIds } from '../../block/BlockIds';
import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { WeightedRandom, type WeightedRandomItem } from '../../core/WeightedRandom';
import type { Entity } from '../../entity/Entity';
import { EntityList } from '../../entity/EntityList';
import type { TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import type { World } from '../World';
import { nbt } from './InventoryNBT';
import { NBT, NBTType, cloneNBT, nbtSetType, nbtTypeOf, type NBTTypeId } from '../storage/NBT';

/** Carries the recorded binary types of `from`'s keys over to `to`. */
function copyTypes(from: TagCompound, to: TagCompound): void {
  for (const k of Object.keys(from)) {
    const t = nbtTypeOf(from, k);
    if (t !== undefined) nbtSetType(to, k, t as NBTTypeId);
  }
}
import { TileEntity } from './TileEntity';

/** One weighted entry of "SpawnPotentials" (WeightedRandomMinecart). */
export class WeightedRandomMinecart implements WeightedRandomItem {
  readonly itemWeight: number;
  readonly properties: TagCompound | null;
  readonly minecartName: string;

  constructor(weight: number, properties: TagCompound | null, type: string) {
    this.itemWeight = weight;
    if (type === 'Minecart') {
      if (properties) {
        const t = nbt.getInt(properties, 'Type');
        if (t === 0) type = 'MinecartRideable';
        else if (t === 1) type = 'MinecartChest';
        else if (t === 2) type = 'MinecartFurnace';
      } else {
        type = 'MinecartRideable';
      }
    }
    this.properties = properties;
    this.minecartName = type;
  }

  /** From a SpawnPotentials entry {Weight, Type, Properties}. */
  static fromPotential(tag: TagCompound): WeightedRandomMinecart {
    return new WeightedRandomMinecart(nbt.getInt(tag, 'Weight'), (tag.Properties as TagCompound | undefined) ?? null, nbt.getString(tag, 'Type'));
  }

  /** func_98220_a: {Properties, Type, Weight}. */
  toNBT(): TagCompound {
    const t: TagCompound = {};
    NBT.setCompoundTag(t, 'Properties', this.properties ? cloneNBT(this.properties) : {});
    NBT.setString(t, 'Type', this.minecartName);
    NBT.setInteger(t, 'Weight', this.itemWeight);
    return t;
  }
}

/**
 * Spawns mobs for a spawner (MobSpawnerBaseLogic). Set by the mob code to replace the default
 * spawning step; returns true when it spawned something (the delay then resets).
 */
export type MobSpawnerSpawnHook = (logic: MobSpawnerBaseLogic) => boolean;

/**
 * The spawner state (MobSpawnerBaseLogic): which mob, the delay, the spawn rules, and the
 * spinning mob shown inside the cage. There is no separate client copy, so one update runs
 * both halves of the original: the client particles and spin, then the server countdown and
 * spawn.
 */
export abstract class MobSpawnerBaseLogic {
  /** Replaces {@link spawnMobs} when set (the mob code's spawn step). */
  static spawnHook: MobSpawnerSpawnHook | null = null;

  spawnDelay = 20;
  private mobID = 'Pig';
  private spawnPotentials: WeightedRandomMinecart[] | null = null;
  private randomMinecart: WeightedRandomMinecart | null = null;
  /**
   * The client copy's delay (the client half of the original keeps its own spawnDelay): read
   * with the spawner, counted down every tick and set to minSpawnDelay by block event 1. It
   * only drives the cage spin, which speeds up from 2.5 to 5 degrees a tick.
   */
  private clientDelay = 20;
  /** Rotation of the mob in the cage (field_98287_c), degrees. */
  spin = 0;
  /** Previous tick's rotation (field_98284_d). */
  prevSpin = 0;
  minSpawnDelay = 200;
  maxSpawnDelay = 800;
  spawnCount = 4;
  private renderEntity: Entity | null = null;
  maxNearbyEntities = 6;
  activatingRangeFromPlayer = 16;
  spawnRange = 4;

  getEntityNameToSpawn(): string {
    if (this.randomMinecart === null) {
      if (this.mobID === 'Minecart') this.mobID = 'MinecartRideable';
      return this.mobID;
    }
    return this.randomMinecart.minecartName;
  }

  setMobID(id: string): void {
    this.mobID = id;
    this.renderEntity = null;
  }

  /** A player within the activation range (16 blocks). */
  canRun(): boolean {
    const w = this.getSpawnerWorld();
    if (!w?.getClosestPlayer) return false;
    return w.getClosestPlayer(this.getSpawnerX() + 0.5, this.getSpawnerY() + 0.5, this.getSpawnerZ() + 0.5, this.activatingRangeFromPlayer) !== null;
  }

  updateSpawner(): void {
    if (!this.canRun()) return;
    const w = this.getSpawnerWorld()!;
    // Client half: flames in the cage and the spinning mob.
    const px = this.getSpawnerX() + w.rand.nextFloat();
    const py = this.getSpawnerY() + w.rand.nextFloat();
    const pz = this.getSpawnerZ() + w.rand.nextFloat();
    w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
    w.spawnParticle('flame', px, py, pz, 0, 0, 0);
    if (this.clientDelay > 0) this.clientDelay--;
    this.prevSpin = this.spin;
    this.spin = (this.spin + Math.fround(1000 / Math.fround(this.clientDelay + 200))) % 360;
    // Server half: count down, then spawn (a LAN guest's copy only spins).
    if (w.isRemote) return;
    if (this.spawnDelay === -1) this.resetTimer();
    if (this.spawnDelay > 0) {
      this.spawnDelay--;
      return;
    }
    const hook = MobSpawnerBaseLogic.spawnHook;
    if (hook ? hook(this) : this.spawnMobs()) this.resetTimer();
  }

  /**
   * The default spawn step: up to spawnCount mobs from EntityList within spawnRange, unless
   * maxNearbyEntities of that kind are already around. Returns true when one spawned.
   */
  spawnMobs(): boolean {
    const w = this.getSpawnerWorld()!;
    const x = this.getSpawnerX();
    const y = this.getSpawnerY();
    const z = this.getSpawnerZ();
    let spawned = false;
    for (let i = 0; i < this.spawnCount; i++) {
      let e = EntityList.createEntityByName(this.getEntityNameToSpawn(), w as unknown as World);
      // Unknown mob: give up this tick without resetting the delay (it tries again next tick).
      if (!e) return false;
      const box = AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1).expand(this.spawnRange * 2, 4, this.spawnRange * 2);
      const cls = e.constructor;
      const nearby = w.getEntitiesWithinAABBExcludingEntity(null, box).filter((o) => o instanceof cls).length;
      if (nearby >= this.maxNearbyEntities) {
        this.resetTimer();
        return false;
      }
      const ex = x + (w.rand.nextDouble() - w.rand.nextDouble()) * this.spawnRange;
      const ey = y + w.rand.nextInt(3) - 1;
      const ez = z + (w.rand.nextDouble() - w.rand.nextDouble()) * this.spawnRange;
      const living = e as unknown as { getCanSpawnHere?: () => boolean; spawnExplosionParticle?: () => void };
      e.setLocationAndAngles(ex, ey, ez, w.rand.nextFloat() * 360, 0);
      if (!living.getCanSpawnHere || living.getCanSpawnHere()) {
        e = this.spawnEntity(e);
        w.playAuxSFX(2004, x, y, z, 0);
        living.spawnExplosionParticle?.();
        spawned = true;
      }
    }
    return spawned;
  }

  /**
   * func_98265_a: spawns an entity. With SpawnData the entity is saved, the properties are
   * copied over its tag and it is loaded back (riders in "Riding" are spawned and mounted the
   * same way); otherwise it gets initCreature's random set-up. Without a world (the cage's
   * render entity) nothing is spawned.
   */
  spawnEntity(e: Entity, inWorld = true): Entity {
    const props = this.randomMinecart?.properties;
    const w = inWorld ? (e.worldObj as World | null) : null;
    if (props) {
      let tag: TagCompound = {};
      e.addEntityID(tag);
      for (const k of Object.keys(props)) tag[k] = cloneNBT(props[k]);
      copyTypes(props, tag);
      e.readFromNBT(tag);
      if (w) w.spawnEntityInWorld(e);
      let rider = e;
      while (tag.Riding && typeof tag.Riding === 'object') {
        const riding = tag.Riding as TagCompound;
        const mount = w ? EntityList.createEntityByName(NBT.getString(riding, 'id'), w) : null;
        if (mount && w) {
          const mt: TagCompound = {};
          mount.addEntityID(mt);
          for (const k of Object.keys(riding)) mt[k] = cloneNBT(riding[k]);
          copyTypes(riding, mt);
          mount.readFromNBT(mt);
          mount.setLocationAndAngles(rider.posX, rider.posY, rider.posZ, rider.rotationYaw, rider.rotationPitch);
          w.spawnEntityInWorld(mount);
          rider.mountEntity(mount);
          rider = mount;
        }
        tag = riding;
        if (!mount) break;
      }
    } else if (w) {
      (e as unknown as { initCreature?: () => void }).initCreature?.();
      this.getSpawnerWorld()!.spawnEntityInWorld(e);
    }
    return e;
  }

  /** func_98273_j: a new random delay, a new SpawnPotentials pick, and block event 1. */
  private resetTimer(): void {
    const w = this.getSpawnerWorld()!;
    if (this.maxSpawnDelay <= this.minSpawnDelay) this.spawnDelay = this.minSpawnDelay;
    else this.spawnDelay = this.minSpawnDelay + w.rand.nextInt(this.maxSpawnDelay - this.minSpawnDelay);
    if (this.spawnPotentials && this.spawnPotentials.length > 0) this.setRandomMinecart(WeightedRandom.getRandomItem(w.rand, this.spawnPotentials));
    this.sendBlockEvent(1);
  }

  readFromNBT(tag: TagCompound): void {
    this.mobID = nbt.getString(tag, 'EntityId');
    this.spawnDelay = nbt.getShort(tag, 'Delay');
    this.clientDelay = this.spawnDelay;
    if (Array.isArray(tag.SpawnPotentials)) this.spawnPotentials = (tag.SpawnPotentials as TagCompound[]).map((t) => WeightedRandomMinecart.fromPotential(t));
    else this.spawnPotentials = null;
    if (tag.SpawnData && typeof tag.SpawnData === 'object') this.setRandomMinecart(new WeightedRandomMinecart(1, tag.SpawnData as TagCompound, this.mobID));
    else this.setRandomMinecart(null);
    if (nbt.hasKey(tag, 'MinSpawnDelay')) {
      this.minSpawnDelay = nbt.getShort(tag, 'MinSpawnDelay');
      this.maxSpawnDelay = nbt.getShort(tag, 'MaxSpawnDelay');
      this.spawnCount = nbt.getShort(tag, 'SpawnCount');
    }
    if (nbt.hasKey(tag, 'MaxNearbyEntities')) {
      this.maxNearbyEntities = nbt.getShort(tag, 'MaxNearbyEntities');
      this.activatingRangeFromPlayer = nbt.getShort(tag, 'RequiredPlayerRange');
    }
    if (nbt.hasKey(tag, 'SpawnRange')) this.spawnRange = nbt.getShort(tag, 'SpawnRange');
    this.renderEntity = null;
  }

  writeToNBT(tag: TagCompound): void {
    NBT.setString(tag, 'EntityId', this.getEntityNameToSpawn());
    NBT.setShort(tag, 'Delay', this.spawnDelay);
    NBT.setShort(tag, 'MinSpawnDelay', this.minSpawnDelay);
    NBT.setShort(tag, 'MaxSpawnDelay', this.maxSpawnDelay);
    NBT.setShort(tag, 'SpawnCount', this.spawnCount);
    NBT.setShort(tag, 'MaxNearbyEntities', this.maxNearbyEntities);
    NBT.setShort(tag, 'RequiredPlayerRange', this.activatingRangeFromPlayer);
    NBT.setShort(tag, 'SpawnRange', this.spawnRange);
    if (this.randomMinecart?.properties) NBT.setCompoundTag(tag, 'SpawnData', cloneNBT(this.randomMinecart.properties));
    if (this.randomMinecart || (this.spawnPotentials && this.spawnPotentials.length > 0)) {
      const list = this.spawnPotentials && this.spawnPotentials.length > 0 ? this.spawnPotentials.map((p) => p.toNBT()) : [this.randomMinecart!.toNBT()];
      NBT.setList(tag, 'SpawnPotentials', NBTType.Compound, list);
    }
  }

  /** func_98281_h: the (unspawned) entity the cage renderer spins, created once. */
  getEntityForRenderer(world: World): Entity | null {
    if (!this.renderEntity) {
      const e = EntityList.createEntityByName(this.getEntityNameToSpawn(), world);
      // Created without a world in 1.5.2, so it is not spawned.
      if (e && this.randomMinecart?.properties) this.spawnEntity(e, false);
      this.renderEntity = e;
    }
    return this.renderEntity;
  }

  /** setDelayToMin: block event 1 tells the client the delay was reset. */
  setDelayToMin(id: number): boolean {
    if (id !== 1) return false;
    this.clientDelay = this.minSpawnDelay;
    return true;
  }

  getRandomMinecart(): WeightedRandomMinecart | null {
    return this.randomMinecart;
  }

  setRandomMinecart(m: WeightedRandomMinecart | null): void {
    this.randomMinecart = m;
  }

  abstract sendBlockEvent(id: number): void;
  abstract getSpawnerWorld(): IWorld | null;
  abstract getSpawnerX(): number;
  abstract getSpawnerY(): number;
  abstract getSpawnerZ(): number;
}

class TileEntityMobSpawnerLogic extends MobSpawnerBaseLogic {
  constructor(private readonly te: TileEntityMobSpawner) {
    super();
  }

  sendBlockEvent(id: number): void {
    this.te.worldObj?.addBlockEvent?.(this.te.xCoord, this.te.yCoord, this.te.zCoord, BlockIds.mobSpawner, id, 0);
  }

  getSpawnerWorld(): IWorld | null {
    return this.te.worldObj;
  }

  getSpawnerX(): number {
    return this.te.xCoord;
  }

  getSpawnerY(): number {
    return this.te.yCoord;
  }

  getSpawnerZ(): number {
    return this.te.zCoord;
  }

  override setRandomMinecart(m: WeightedRandomMinecart | null): void {
    super.setRandomMinecart(m);
    this.te.worldObj?.markBlockForUpdate(this.te.xCoord, this.te.yCoord, this.te.zCoord);
  }
}

/** A monster spawner (TileEntityMobSpawner): see {@link MobSpawnerBaseLogic}. */
export class TileEntityMobSpawner extends TileEntity {
  private readonly logic: MobSpawnerBaseLogic = new TileEntityMobSpawnerLogic(this);

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.logic.readFromNBT(tag);
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    this.logic.writeToNBT(tag);
  }

  override updateEntity(): void {
    this.logic.updateSpawner();
    super.updateEntity();
  }

  override receiveClientEvent(id: number, param: number): boolean {
    return this.logic.setDelayToMin(id) ? true : super.receiveClientEvent(id, param);
  }

  /** func_98049_a */
  getSpawnerLogic(): MobSpawnerBaseLogic {
    return this.logic;
  }
}
