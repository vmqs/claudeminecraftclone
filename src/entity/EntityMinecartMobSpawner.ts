import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import { EntityList } from './EntityList';
import type { EntityLiving } from './EntityLiving';
import { EntityMinecart } from './EntityMinecart';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * The spawning half of MobSpawnerBaseLogic for a spawner riding a minecart: with a player
 * within 16 blocks it counts down 200-800 ticks, then tries 4 spawns of its mob within 4
 * blocks (at most 6 nearby), with the 2004 smoke effect. The spinning mob of the renderer
 * turns faster as the delay runs out.
 */
export class MinecartSpawnerLogic {
  spawnDelay = 20;
  mobID = 'Pig';
  /** Spin angle of the displayed mob (field_98287_c / field_98284_d). */
  mobRotation = 0;
  prevMobRotation = 0;
  minSpawnDelay = 200;
  maxSpawnDelay = 800;
  spawnCount = 4;
  maxNearbyEntities = 6;
  activatingRangeFromPlayer = 16;
  spawnRange = 4;
  /** The mob shown spinning inside (created on demand by the renderer). */
  displayEntity: Entity | null = null;

  constructor(private readonly cart: EntityMinecart) {}

  private get x(): number {
    return MathHelper.floor_double(this.cart.posX);
  }
  private get y(): number {
    return MathHelper.floor_double(this.cart.posY);
  }
  private get z(): number {
    return MathHelper.floor_double(this.cart.posZ);
  }

  canRun(): boolean {
    return this.cart.worldObj.getClosestPlayer(this.x + 0.5, this.y + 0.5, this.z + 0.5, this.activatingRangeFromPlayer) !== null;
  }

  updateSpawner(): void {
    if (!this.canRun()) return;
    const w = this.cart.worldObj;
    // Client half: smoke and flames, and the spin of the displayed mob.
    const px = f(this.x + w.rand.nextFloat());
    const py = f(this.y + w.rand.nextFloat());
    const pz = f(this.z + w.rand.nextFloat());
    w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
    w.spawnParticle('flame', px, py, pz, 0, 0, 0);
    this.prevMobRotation = this.mobRotation;
    this.mobRotation = (this.mobRotation + f(1000 / f(this.spawnDelay + 200))) % 360;
    // Server half.
    if (this.spawnDelay === -1) this.resetDelay();
    if (this.spawnDelay > 0) {
      this.spawnDelay--;
      return;
    }
    let spawned = false;
    for (let i = 0; i < this.spawnCount; i++) {
      const e = EntityList.createEntityByName(this.mobID, w);
      if (!e) return;
      const cls = e.constructor;
      const r = this.spawnRange;
      const box = AxisAlignedBB.getBoundingBox(this.x, this.y, this.z, this.x + 1, this.y + 1, this.z + 1).expand(r * 2, 4, r * 2);
      const nearby = w.getEntitiesWithinAABBExcludingEntity(null, box, (o) => o.constructor === cls).length;
      if (nearby >= this.maxNearbyEntities) {
        this.resetDelay();
        return;
      }
      const sx = this.x + (w.rand.nextDouble() - w.rand.nextDouble()) * r;
      const sy = this.y + w.rand.nextInt(3) - 1;
      const sz = this.z + (w.rand.nextDouble() - w.rand.nextDouble()) * r;
      const living = e.isLivingEntity ? (e as EntityLiving) : null;
      e.setLocationAndAngles(sx, sy, sz, f(w.rand.nextFloat() * 360), 0);
      if (!living || living.getCanSpawnHere()) {
        living?.initCreature();
        w.spawnEntityInWorld(e);
        w.playAuxSFX(2004, this.x, this.y, this.z, 0);
        living?.spawnExplosionParticle();
        spawned = true;
      }
    }
    if (spawned) this.resetDelay();
  }

  private resetDelay(): void {
    const w = this.cart.worldObj;
    this.spawnDelay = this.maxSpawnDelay <= this.minSpawnDelay ? this.minSpawnDelay : this.minSpawnDelay + w.rand.nextInt(this.maxSpawnDelay - this.minSpawnDelay);
  }

  /** Spawn data this simplified logic does not use, kept so saving does not lose it. */
  private keptTags: TagCompound = {};

  /** MobSpawnerBaseLogic.writeToNBT. */
  writeToNBT(tag: TagCompound): void {
    NBT.setString(tag, 'EntityId', this.mobID);
    NBT.setShort(tag, 'Delay', this.spawnDelay);
    NBT.setShort(tag, 'MinSpawnDelay', this.minSpawnDelay);
    NBT.setShort(tag, 'MaxSpawnDelay', this.maxSpawnDelay);
    NBT.setShort(tag, 'SpawnCount', this.spawnCount);
    NBT.setShort(tag, 'MaxNearbyEntities', this.maxNearbyEntities);
    NBT.setShort(tag, 'RequiredPlayerRange', this.activatingRangeFromPlayer);
    NBT.setShort(tag, 'SpawnRange', this.spawnRange);
    for (const k of ['SpawnData', 'SpawnPotentials']) if (this.keptTags[k] !== undefined) tag[k] = this.keptTags[k];
  }

  /** MobSpawnerBaseLogic.readFromNBT. */
  readFromNBT(tag: TagCompound): void {
    if (NBT.hasKey(tag, 'EntityId')) this.mobID = NBT.getString(tag, 'EntityId');
    this.spawnDelay = NBT.getShort(tag, 'Delay');
    if (NBT.hasKey(tag, 'MinSpawnDelay')) {
      this.minSpawnDelay = NBT.getShort(tag, 'MinSpawnDelay');
      this.maxSpawnDelay = NBT.getShort(tag, 'MaxSpawnDelay');
      this.spawnCount = NBT.getShort(tag, 'SpawnCount');
    }
    if (NBT.hasKey(tag, 'MaxNearbyEntities')) {
      this.maxNearbyEntities = NBT.getShort(tag, 'MaxNearbyEntities');
      this.activatingRangeFromPlayer = NBT.getShort(tag, 'RequiredPlayerRange');
    }
    if (NBT.hasKey(tag, 'SpawnRange')) this.spawnRange = NBT.getShort(tag, 'SpawnRange');
    this.keptTags = {};
    for (const k of ['SpawnData', 'SpawnPotentials']) if (tag[k] !== undefined) this.keptTags[k] = tag[k];
    this.displayEntity = null;
  }
}

/** A minecart carrying a working mob spawner (EntityMinecartMobSpawner, "MinecartSpawner"). */
export class EntityMinecartMobSpawner extends EntityMinecart {
  readonly mobSpawnerLogic = new MinecartSpawnerLogic(this);

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  getMinecartType(): number {
    return 4;
  }

  override getDefaultDisplayTile(): Block | null {
    return Block.blocksList[BlockIds.mobSpawner];
  }

  override onUpdate(): void {
    super.onUpdate();
    this.mobSpawnerLogic.updateSpawner();
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    this.mobSpawnerLogic.writeToNBT(tag);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.mobSpawnerLogic.readFromNBT(tag);
  }
}

EntityMinecart.minecartTypes.set(4, EntityMinecartMobSpawner);
