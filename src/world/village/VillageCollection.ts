import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { BlockDoor } from '../../block/BlockDoor';
import type { World } from '../World';
import { Village, VillageCoords } from './Village';
import { VillageDoorInfo } from './VillageDoorInfo';
import type { TagCompound } from '../../item/ItemStack';
import { NBT, NBTType } from '../storage/NBT';

/**
 * All villages of a world (VillageCollection). Villagers report their positions; each tick one
 * reported position is scanned (32x8x32) for wooden doors with a sky-lit outside, and new doors
 * join the nearest village within 32 blocks of its edge or found a new one. Villages without
 * doors disappear. Ticked by World.tick after the block ticks, as WorldServer did.
 *
 * VillageSiege is not ported: in 1.5.2 its spawn-position search always returns nothing, so
 * zombie sieges never happen.
 */
export class VillageCollection {
  private readonly villagerPositionsList: VillageCoords[] = [];
  private readonly newDoors: VillageDoorInfo[] = [];
  private readonly villageList: Village[] = [];
  private tickCounter = 0;

  constructor(private readonly worldObj: World) {}

  addVillagerPosition(x: number, y: number, z: number): void {
    if (this.villagerPositionsList.length > 64) return;
    if (!this.villagerPositionsList.some((p) => p.posX === x && p.posY === y && p.posZ === z)) this.villagerPositionsList.push(new VillageCoords(x, y, z));
  }

  tick(): void {
    this.tickCounter++;
    for (const v of this.villageList) v.tick(this.tickCounter);
    this.removeAnnihilatedVillages();
    this.dropOldestVillagerPosition();
    this.addNewDoorsToVillageOrCreateVillage();
  }

  private removeAnnihilatedVillages(): void {
    for (let i = this.villageList.length - 1; i >= 0; i--) if (this.villageList[i].isAnnihilated()) this.villageList.splice(i, 1);
  }

  getVillageList(): readonly Village[] {
    return this.villageList;
  }

  /** The village whose centre is nearest, among those whose radius + `extra` reaches (x, y, z). */
  findNearestVillage(x: number, y: number, z: number, extra: number): Village | null {
    let found: Village | null = null;
    let best = 3.4028234663852886e38;
    for (const v of this.villageList) {
      const d = v.getCenter().getDistanceSquared(x, y, z);
      if (d >= best) continue;
      const r = extra + v.getVillageRadius();
      if (d > r * r) continue;
      found = v;
      best = d;
    }
    return found;
  }

  private dropOldestVillagerPosition(): void {
    const p = this.villagerPositionsList.shift();
    if (p) this.addUnassignedWoodenDoorsAroundToNewDoorsList(p);
  }

  private addNewDoorsToVillageOrCreateVillage(): void {
    for (const d of this.newDoors) {
      let added = false;
      for (const v of this.villageList) {
        const dist = Math.trunc(v.getCenter().getDistanceSquared(d.posX, d.posY, d.posZ));
        const r = 32 + v.getVillageRadius();
        if (dist <= r * r) {
          v.addVillageDoorInfo(d);
          added = true;
          break;
        }
      }
      if (!added) {
        const v = new Village(this.worldObj);
        v.addVillageDoorInfo(d);
        this.villageList.push(v);
      }
    }
    this.newDoors.length = 0;
  }

  private addUnassignedWoodenDoorsAroundToNewDoorsList(c: VillageCoords): void {
    for (let x = c.posX - 16; x < c.posX + 16; x++) {
      for (let y = c.posY - 4; y < c.posY + 4; y++) {
        for (let z = c.posZ - 16; z < c.posZ + 16; z++) {
          if (this.worldObj.getBlockId(x, y, z) !== BlockIds.doorWood) continue;
          const known = this.getVillageDoorAt(x, y, z);
          if (known) known.lastActivityTimestamp = this.tickCounter;
          else this.addDoorToNewListIfAppropriate(x, y, z);
        }
      }
    }
  }

  private getVillageDoorAt(x: number, y: number, z: number): VillageDoorInfo | null {
    for (const d of this.newDoors) if (d.posX === x && d.posZ === z && Math.abs(d.posY - y) <= 1) return d;
    for (const v of this.villageList) {
      const d = v.getVillageDoorAt(x, y, z);
      if (d) return d;
    }
    return null;
  }

  /** A door counts when more blocks on one side see the sky than on the other (that side is outside). */
  private addDoorToNewListIfAppropriate(x: number, y: number, z: number): void {
    const w = this.worldObj;
    const door = Block.blocksList[BlockIds.doorWood] as BlockDoor;
    const dir = door.getDoorOrientation(w, x, y, z);
    let sky = 0;
    if (dir !== 0 && dir !== 2) {
      for (let i = -5; i < 0; i++) if (w.canBlockSeeTheSky(x, y, z + i)) sky--;
      for (let i = 1; i <= 5; i++) if (w.canBlockSeeTheSky(x, y, z + i)) sky++;
      if (sky !== 0) this.newDoors.push(new VillageDoorInfo(x, y, z, 0, sky > 0 ? -2 : 2, this.tickCounter));
    } else {
      for (let i = -5; i < 0; i++) if (w.canBlockSeeTheSky(x + i, y, z)) sky--;
      for (let i = 1; i <= 5; i++) if (w.canBlockSeeTheSky(x + i, y, z)) sky++;
      if (sky !== 0) this.newDoors.push(new VillageDoorInfo(x, y, z, sky > 0 ? -2 : 2, 0, this.tickCounter));
    }
  }

  /** writeToNBT: villages.dat's {Tick, Villages}. */
  writeToNBT(t: TagCompound): void {
    NBT.setInteger(t, 'Tick', this.tickCounter);
    NBT.setList(
      t,
      'Villages',
      NBTType.Compound,
      this.villageList.map((v) => {
        const e: TagCompound = {};
        v.writeVillageDataToNBT(e);
        return e;
      }),
    );
  }

  /** readFromNBT (into a world that has no villages yet). */
  readFromNBT(t: TagCompound): void {
    this.tickCounter = NBT.getInteger(t, 'Tick');
    for (const e of NBT.getCompoundList(t, 'Villages')) {
      const v = new Village(this.worldObj);
      v.readVillageDataFromNBT(e);
      this.villageList.push(v);
    }
  }
}
