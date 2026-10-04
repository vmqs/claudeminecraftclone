import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../../entity/EntityLiving';
import { EntityList } from '../../entity/EntityList';
import { EnumCreatureType } from '../biome/SpawnListEntry';
import { canCreatureTypeSpawnAtLocation } from '../SpawnRules';
import type { World } from '../World';
import type { Village } from './Village';

const f = Math.fround;

/** What a siege does with the zombies it spawns (EntityZombie.setVillager). */
interface SiegeZombie extends EntityLiving {
  setVillager?(v: boolean): void;
}

/**
 * Zombie sieges (VillageSiege): at midnight, one night in ten, a village of at least 10 doors and
 * 20 villagers next to a player picks a spot on its edge and spawns 20 zombies there, one every
 * three ticks. As in 1.5.2 the spot search never returns a position (it finds one and drops it),
 * so a siege starts but no zombie ever appears; the random draws are kept.
 */
export class VillageSiege {
  /** field_75535_b: a village was chosen for tonight. */
  private villageChosen = false;
  /** field_75536_c: -1 unset, 0 waiting for midnight, 1 siege tonight, 2 no (more) siege tonight. */
  private siegeState = -1;
  /** field_75533_d: zombies left to spawn. */
  private zombiesLeft = 0;
  /** field_75534_e: ticks to the next zombie. */
  private nextSpawnDelay = 0;
  private theVillage: Village | null = null;
  private spawnX = 0;
  private spawnY = 0;
  private spawnZ = 0;

  constructor(private readonly worldObj: World) {}

  tick(): void {
    const w = this.worldObj;
    if (w.isDaytime()) {
      this.siegeState = 0;
      return;
    }
    if (this.siegeState === 2) return;
    if (this.siegeState === 0) {
      const angle = w.getCelestialAngle(0);
      if (angle < 0.5 || angle > 0.501) return;
      this.siegeState = w.rand.nextInt(10) === 0 ? 1 : 2;
      this.villageChosen = false;
      if (this.siegeState === 2) return;
    }
    if (!this.villageChosen) {
      if (!this.chooseVillage()) return;
      this.villageChosen = true;
    }
    if (this.nextSpawnDelay > 0) {
      this.nextSpawnDelay--;
    } else {
      this.nextSpawnDelay = 2;
      if (this.zombiesLeft > 0) {
        this.spawnZombie();
        this.zombiesLeft--;
      } else {
        this.siegeState = 2;
      }
    }
  }

  /** func_75529_b: a big enough village near a player, and a spot on its edge outside others. */
  private chooseVillage(): boolean {
    const w = this.worldObj;
    const villages = w.villageCollectionObj;
    for (const p of w.playerEntities) {
      const v = villages.findNearestVillage(Math.trunc(p.posX), Math.trunc(p.posY), Math.trunc(p.posZ), 1);
      this.theVillage = v;
      if (!v || v.getNumVillageDoors() < 10 || v.getTicksSinceLastDoorAdding() < 20 || v.getNumVillagers() < 20) continue;
      const c = v.getCenter();
      const r = f(v.getVillageRadius());
      let inOther = false;
      for (let i = 0; i < 10; i++) {
        this.spawnX = c.posX + Math.trunc(f(MathHelper.cos(f(f(w.rand.nextFloat() * f(Math.PI)) * 2)) * r) * 0.9);
        this.spawnY = c.posY;
        this.spawnZ = c.posZ + Math.trunc(f(MathHelper.sin(f(f(w.rand.nextFloat() * f(Math.PI)) * 2)) * r) * 0.9);
        inOther = villages.getVillageList().some((o) => o !== v && o.isInRange(this.spawnX, this.spawnY, this.spawnZ));
        if (!inOther) break;
      }
      if (inOther) return false;
      if (this.findSpawnSpot(this.spawnX, this.spawnY, this.spawnZ)) {
        this.nextSpawnDelay = 0;
        this.zombiesLeft = 20;
        return true;
      }
    }
    return false;
  }

  private spawnZombie(): boolean {
    const w = this.worldObj;
    const spot = this.findSpawnSpot(this.spawnX, this.spawnY, this.spawnZ);
    if (!spot) return false;
    const zombie = EntityList.createEntityByName('Zombie', w) as SiegeZombie | null;
    if (!zombie) return false;
    zombie.initCreature();
    zombie.setVillager?.(false);
    zombie.setLocationAndAngles(spot[0], spot[1], spot[2], f(w.rand.nextFloat() * 360), 0);
    w.spawnEntityInWorld(zombie);
    const c = this.theVillage!.getCenter();
    zombie.setHomeArea(c.posX, c.posY, c.posZ, this.theVillage!.getVillageRadius());
    return true;
  }

  /** func_75527_a: ten tries for a monster spot in the village; the found spot is discarded (1.5.2). */
  private findSpawnSpot(x: number, y: number, z: number): [number, number, number] | null {
    const w = this.worldObj;
    for (let i = 0; i < 10; i++) {
      const sx = x + w.rand.nextInt(16) - 8;
      const sy = y + w.rand.nextInt(6) - 3;
      const sz = z + w.rand.nextInt(16) - 8;
      // The original builds a vector here and forgets to return it.
      void (this.theVillage!.isInRange(sx, sy, sz) && canCreatureTypeSpawnAtLocation(EnumCreatureType.monster, w, sx, sy, sz));
    }
    return null;
  }
}
