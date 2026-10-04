import { BlockIds } from '../../block/BlockIds';
import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import { EntityList } from '../../entity/EntityList';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { World } from '../World';
import { VillageDoorInfo } from './VillageDoorInfo';
import type { TagCompound } from '../../item/ItemStack';
import { NBT, NBTType } from '../storage/NBT';

const f = Math.fround;

/** A block position (ChunkCoordinates) used for the village centre. */
export class VillageCoords {
  constructor(
    public posX = 0,
    public posY = 0,
    public posZ = 0,
  ) {}

  set(x: number, y: number, z: number): void {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
  }

  getDistanceSquared(x: number, y: number, z: number): number {
    const dx = this.posX - x;
    const dy = this.posY - y;
    const dz = this.posZ - z;
    return f(dx * dx + dy * dy + dz * dz);
  }
}

/** A mob that hurt a villager recently (VillageAgressor). */
interface VillageAgressor {
  readonly agressor: EntityLiving;
  agressionTime: number;
}

const isNamed = (name: string) => (e: Entity): e is EntityLiving => EntityList.getEntityString(e) === name;

/**
 * A village (Village): the doors found around villagers, their average as the centre, a radius
 * of at least 32, the villager and iron golem counts, aggressors to defend against, player
 * reputations (-30..10) and the mating season. Spawns an iron golem now and then when there are
 * more than 20 doors and fewer golems than one per 10 villagers.
 */
export class Village {
  private readonly villageDoorInfoList: VillageDoorInfo[] = [];
  private readonly centerHelper = new VillageCoords();
  private readonly center = new VillageCoords();
  private villageRadius = 0;
  private lastAddDoorTimestamp = 0;
  private tickCounter = 0;
  private numVillagers = 0;
  private noBreedTicks = 0;
  private readonly playerReputation = new Map<string, number>();
  private readonly villageAgressors: VillageAgressor[] = [];
  private numIronGolems = 0;

  constructor(private worldObj: World) {}

  tick(counter: number): void {
    this.tickCounter = counter;
    this.removeDeadAndOutOfRangeDoors();
    this.removeDeadAndOldAgressors();
    if (counter % 20 === 0) this.updateNumVillagers();
    if (counter % 30 === 0) this.updateNumIronGolems();
    const wanted = Math.trunc(this.numVillagers / 10);
    if (this.numIronGolems < wanted && this.villageDoorInfoList.length > 20 && this.worldObj.rand.nextInt(7000) === 0) {
      const v = this.tryGetIronGolemSpawningLocation(MathHelper.floor_float(this.center.posX), MathHelper.floor_float(this.center.posY), MathHelper.floor_float(this.center.posZ), 2, 4, 2);
      if (v) {
        const golem = EntityList.createEntityByName('VillagerGolem', this.worldObj);
        if (golem) {
          golem.setPosition(v.xCoord, v.yCoord, v.zCoord);
          this.worldObj.spawnEntityInWorld(golem);
          this.numIronGolems++;
        }
      }
    }
  }

  private tryGetIronGolemSpawningLocation(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Vec3 | null {
    const rand = this.worldObj.rand;
    for (let i = 0; i < 10; i++) {
      const x = cx + rand.nextInt(16) - 8;
      const y = cy + rand.nextInt(6) - 3;
      const z = cz + rand.nextInt(16) - 8;
      if (this.isInRange(x, y, z) && this.isValidIronGolemSpawningLocation(x, y, z, sx, sy, sz)) return new Vec3(x, y, z);
    }
    return null;
  }

  private isValidIronGolemSpawningLocation(x: number, y: number, z: number, sx: number, sy: number, sz: number): boolean {
    const w = this.worldObj;
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z)) return false;
    const x0 = x - Math.trunc(sx / 2);
    const z0 = z - Math.trunc(sz / 2);
    for (let bx = x0; bx < x0 + sx; bx++) {
      for (let by = y; by < y + sy; by++) {
        for (let bz = z0; bz < z0 + sz; bz++) if (w.isBlockNormalCube(bx, by, bz)) return false;
      }
    }
    return true;
  }

  private villageBox(): AxisAlignedBB {
    const c = this.center;
    const r = this.villageRadius;
    return AxisAlignedBB.getBoundingBox(c.posX - r, c.posY - 4, c.posZ - r, c.posX + r, c.posY + 4, c.posZ + r);
  }

  private updateNumIronGolems(): void {
    this.numIronGolems = this.worldObj.getEntitiesWithinAABB(isNamed('VillagerGolem'), this.villageBox()).length;
  }

  private updateNumVillagers(): void {
    this.numVillagers = this.worldObj.getEntitiesWithinAABB(isNamed('Villager'), this.villageBox()).length;
    if (this.numVillagers === 0) this.playerReputation.clear();
  }

  getCenter(): VillageCoords {
    return this.center;
  }

  getVillageRadius(): number {
    return this.villageRadius;
  }

  getNumVillageDoors(): number {
    return this.villageDoorInfoList.length;
  }

  getTicksSinceLastDoorAdding(): number {
    return this.tickCounter - this.lastAddDoorTimestamp;
  }

  getNumVillagers(): number {
    return this.numVillagers;
  }

  isInRange(x: number, y: number, z: number): boolean {
    return this.center.getDistanceSquared(x, y, z) < this.villageRadius * this.villageRadius;
  }

  getVillageDoorInfoList(): readonly VillageDoorInfo[] {
    return this.villageDoorInfoList;
  }

  findNearestDoor(x: number, y: number, z: number): VillageDoorInfo | null {
    let best: VillageDoorInfo | null = null;
    let bestD = 2147483647;
    for (const d of this.villageDoorInfoList) {
      const dist = d.getDistanceSquared(x, y, z);
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** The least restricted door within 16 blocks (doors further away count 1000x their distance). */
  findNearestDoorUnrestricted(x: number, y: number, z: number): VillageDoorInfo | null {
    let best: VillageDoorInfo | null = null;
    let bestD = 2147483647;
    for (const d of this.villageDoorInfoList) {
      let dist = d.getDistanceSquared(x, y, z);
      if (dist > 256) dist = Math.imul(dist, 1000);
      else dist = d.getDoorOpeningRestrictionCounter();
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  getVillageDoorAt(x: number, y: number, z: number): VillageDoorInfo | null {
    if (this.center.getDistanceSquared(x, y, z) > this.villageRadius * this.villageRadius) return null;
    for (const d of this.villageDoorInfoList) if (d.posX === x && d.posZ === z && Math.abs(d.posY - y) <= 1) return d;
    return null;
  }

  addVillageDoorInfo(d: VillageDoorInfo): void {
    this.villageDoorInfoList.push(d);
    this.centerHelper.posX += d.posX;
    this.centerHelper.posY += d.posY;
    this.centerHelper.posZ += d.posZ;
    this.updateVillageRadiusAndCenter();
    this.lastAddDoorTimestamp = d.lastActivityTimestamp;
  }

  isAnnihilated(): boolean {
    return this.villageDoorInfoList.length === 0;
  }

  addOrRenewAgressor(e: EntityLiving): void {
    for (const a of this.villageAgressors) {
      if (a.agressor === e) {
        a.agressionTime = this.tickCounter;
        return;
      }
    }
    this.villageAgressors.push({ agressor: e, agressionTime: this.tickCounter });
  }

  findNearestVillageAggressor(e: EntityLiving): EntityLiving | null {
    let best = Number.MAX_VALUE;
    let found: VillageAgressor | null = null;
    for (const a of this.villageAgressors) {
      const d = a.agressor.getDistanceSqToEntity(e);
      if (!(d > best)) {
        found = a;
        best = d;
      }
    }
    return found ? found.agressor : null;
  }

  /** func_82685_c: the nearest online player whose reputation here is -15 or lower. */
  findNearestUnpopularPlayer(e: EntityLiving): EntityPlayer | null {
    let best = Number.MAX_VALUE;
    let found: EntityPlayer | null = null;
    for (const name of [...this.playerReputation.keys()].sort()) {
      if (!this.isPlayerReputationTooLow(name)) continue;
      const p = this.worldObj.getPlayerEntityByName(name);
      if (!p) continue;
      const d = p.getDistanceSqToEntity(e);
      if (!(d > best)) {
        found = p;
        best = d;
      }
    }
    return found;
  }

  private removeDeadAndOldAgressors(): void {
    for (let i = this.villageAgressors.length - 1; i >= 0; i--) {
      const a = this.villageAgressors[i];
      if (!a.agressor.isEntityAlive() || Math.abs(this.tickCounter - a.agressionTime) > 300) this.villageAgressors.splice(i, 1);
    }
  }

  private removeDeadAndOutOfRangeDoors(): void {
    let removed = false;
    const reset = this.worldObj.rand.nextInt(50) === 0;
    for (let i = 0; i < this.villageDoorInfoList.length; i++) {
      const d = this.villageDoorInfoList[i];
      if (reset) d.resetDoorOpeningRestrictionCounter();
      if (this.worldObj.getBlockId(d.posX, d.posY, d.posZ) !== BlockIds.doorWood || Math.abs(this.tickCounter - d.lastActivityTimestamp) > 1200) {
        this.centerHelper.posX -= d.posX;
        this.centerHelper.posY -= d.posY;
        this.centerHelper.posZ -= d.posZ;
        removed = true;
        d.isDetachedFromVillageFlag = true;
        this.villageDoorInfoList.splice(i--, 1);
      }
    }
    if (removed) this.updateVillageRadiusAndCenter();
  }

  private updateVillageRadiusAndCenter(): void {
    const n = this.villageDoorInfoList.length;
    if (n === 0) {
      this.center.set(0, 0, 0);
      this.villageRadius = 0;
      return;
    }
    this.center.set(Math.trunc(this.centerHelper.posX / n), Math.trunc(this.centerHelper.posY / n), Math.trunc(this.centerHelper.posZ / n));
    let maxD = 0;
    for (const d of this.villageDoorInfoList) maxD = Math.max(d.getDistanceSquared(this.center.posX, this.center.posY, this.center.posZ), maxD);
    this.villageRadius = Math.max(32, Math.trunc(Math.sqrt(maxD)) + 1);
  }

  getReputationForPlayer(name: string): number {
    return this.playerReputation.get(name) ?? 0;
  }

  setReputationForPlayer(name: string, delta: number): number {
    const v = MathHelper.clamp_int(this.getReputationForPlayer(name) + delta, -30, 10);
    this.playerReputation.set(name, v);
    return v;
  }

  isPlayerReputationTooLow(name: string): boolean {
    return this.getReputationForPlayer(name) <= -15;
  }

  /** A villager was killed by a monster (or something unseen near a player): no babies for 3600 ticks. */
  endMatingSeason(): void {
    this.noBreedTicks = this.tickCounter;
  }

  isMatingSeason(): boolean {
    return this.noBreedTicks === 0 || this.tickCounter - this.noBreedTicks >= 3600;
  }

  /** func_82683_b: changes every known player's reputation (a cured zombie villager settling in). */
  addReputationForAllPlayers(delta: number): void {
    for (const name of [...this.playerReputation.keys()]) this.setReputationForPlayer(name, delta);
  }

  /** writeVillageDataToNBT (an entry of villages.dat's "Villages"). */
  writeVillageDataToNBT(t: TagCompound): void {
    NBT.setInteger(t, 'PopSize', this.numVillagers);
    NBT.setInteger(t, 'Radius', this.villageRadius);
    NBT.setInteger(t, 'Golems', this.numIronGolems);
    NBT.setInteger(t, 'Stable', this.lastAddDoorTimestamp);
    NBT.setInteger(t, 'Tick', this.tickCounter);
    NBT.setInteger(t, 'MTick', this.noBreedTicks);
    NBT.setInteger(t, 'CX', this.center.posX);
    NBT.setInteger(t, 'CY', this.center.posY);
    NBT.setInteger(t, 'CZ', this.center.posZ);
    NBT.setInteger(t, 'ACX', this.centerHelper.posX);
    NBT.setInteger(t, 'ACY', this.centerHelper.posY);
    NBT.setInteger(t, 'ACZ', this.centerHelper.posZ);
    const doors: TagCompound[] = [];
    for (const d of this.villageDoorInfoList) {
      const e: TagCompound = {};
      NBT.setInteger(e, 'X', d.posX);
      NBT.setInteger(e, 'Y', d.posY);
      NBT.setInteger(e, 'Z', d.posZ);
      NBT.setInteger(e, 'IDX', d.insideDirectionX);
      NBT.setInteger(e, 'IDZ', d.insideDirectionZ);
      NBT.setInteger(e, 'TS', d.lastActivityTimestamp);
      doors.push(e);
    }
    NBT.setList(t, 'Doors', NBTType.Compound, doors);
    const players: TagCompound[] = [];
    for (const [name, s] of this.playerReputation) {
      const e: TagCompound = {};
      NBT.setString(e, 'Name', name);
      NBT.setInteger(e, 'S', s);
      players.push(e);
    }
    NBT.setList(t, 'Players', NBTType.Compound, players);
  }

  /** readVillageDataFromNBT. */
  readVillageDataFromNBT(t: TagCompound): void {
    this.numVillagers = NBT.getInteger(t, 'PopSize');
    this.villageRadius = NBT.getInteger(t, 'Radius');
    this.numIronGolems = NBT.getInteger(t, 'Golems');
    this.lastAddDoorTimestamp = NBT.getInteger(t, 'Stable');
    this.tickCounter = NBT.getInteger(t, 'Tick');
    this.noBreedTicks = NBT.getInteger(t, 'MTick');
    this.center.posX = NBT.getInteger(t, 'CX');
    this.center.posY = NBT.getInteger(t, 'CY');
    this.center.posZ = NBT.getInteger(t, 'CZ');
    this.centerHelper.posX = NBT.getInteger(t, 'ACX');
    this.centerHelper.posY = NBT.getInteger(t, 'ACY');
    this.centerHelper.posZ = NBT.getInteger(t, 'ACZ');
    for (const e of NBT.getCompoundList(t, 'Doors')) {
      this.villageDoorInfoList.push(new VillageDoorInfo(NBT.getInteger(e, 'X'), NBT.getInteger(e, 'Y'), NBT.getInteger(e, 'Z'), NBT.getInteger(e, 'IDX'), NBT.getInteger(e, 'IDZ'), NBT.getInteger(e, 'TS')));
    }
    for (const e of NBT.getCompoundList(t, 'Players')) this.playerReputation.set(NBT.getString(e, 'Name'), NBT.getInteger(e, 'S'));
  }
}
