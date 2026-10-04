import { BlockIds } from '../block/BlockIds';
import { Direction } from '../core/Facing';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { World } from './World';

const f = Math.fround;

/**
 * The entity's y as the server sees it: a player's feet (the server's EntityPlayerMP has no
 * y offset; the client's player keeps its eyes in posY), any other entity's posY.
 */
export function serverPosY(e: Entity): number {
  return e.isPlayerEntity ? e.posY - e.yOffset : e.posY;
}

/** A portal found for an arrival column (PortalPosition): reused while it is visited. */
interface PortalPosition {
  x: number;
  y: number;
  z: number;
  lastUpdateTime: number;
}

/**
 * Teleporter: puts an entity that came through a portal into this world. A nether portal leads
 * to the nearest portal block within 128 blocks of the arrival point (the search covers every
 * chunk that exists: loaded or in the save, since only those can hold a portal), else a new
 * portal is built at the nearest spot within 16 blocks where a 4x5 frame fits on solid ground
 * (or floating at y 70+ on a small obsidian ledge). Arriving in the End builds the 5x5 obsidian
 * platform. Found portals are cached per arrival column and forgotten after 300-600 ticks.
 */
export class Teleporter {
  private readonly random: JavaRandom;
  private readonly destinationCoordinateCache = new Map<string, PortalPosition>();

  constructor(public world: World) {
    this.random = new JavaRandom(world.getSeed());
  }

  /** placeInPortal: the End's platform, or an existing (else a new) nether portal. */
  placeInPortal(e: Entity, x: number, y: number, z: number, yaw: number): void {
    if (this.world.provider.dimensionId !== 1) {
      if (!this.placeInExistingPortal(e, x, y, z, yaw)) {
        this.makePortal(e);
        this.placeInExistingPortal(e, x, y, z, yaw);
      }
      return;
    }
    const w = this.world;
    const bx = MathHelper.floor_double(e.posX);
    const by = MathHelper.floor_double(serverPosY(e)) - 1;
    const bz = MathHelper.floor_double(e.posZ);
    const ax = 1;
    const az = 0;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        for (let k = -1; k < 3; k++) {
          const px = bx + j * ax + i * az;
          const py = by + k;
          const pz = bz + j * az - i * ax;
          w.setBlock(px, py, pz, k < 0 ? BlockIds.obsidian : 0);
        }
      }
    }
    e.setLocationAndAngles(bx, by, bz, e.rotationYaw, 0);
    e.motionX = e.motionY = e.motionZ = 0;
  }

  /**
   * placeInExistingPortal: moves the entity to the nearest portal (in front of it, turned and
   * with its motion turned as it went in); false when there is none.
   */
  placeInExistingPortal(e: Entity, _x: number, _y: number, _z: number, yaw: number): boolean {
    const w = this.world;
    const range = 128;
    let best = -1;
    let px = 0;
    let py = 0;
    let pz = 0;
    const ex = MathHelper.floor_double(e.posX);
    const ez = MathHelper.floor_double(e.posZ);
    const ey = serverPosY(e);
    const key = `${ex},${ez}`;
    let search = true;
    const cached = this.destinationCoordinateCache.get(key);
    if (cached) {
      best = 0;
      px = cached.x;
      py = cached.y;
      pz = cached.z;
      cached.lastUpdateTime = w.getTotalWorldTime();
      search = false;
    } else {
      const portal = BlockIds.portal;
      const height = w.getActualHeight();
      for (let x = ex - range; x <= ex + range; x++) {
        const dx = x + 0.5 - e.posX;
        for (let z = ez - range; z <= ez + range; z++) {
          const dz = z + 0.5 - e.posZ;
          // Columns of chunks that do not exist hold no portal (getBlockId would read air).
          if (!w.chunkExists(x >> 4, z >> 4)) continue;
          const sections = w.getChunkFromChunkCoords(x >> 4, z >> 4).sections;
          const col = ((z & 15) << 4) | (x & 15);
          for (let y = height - 1; y >= 0; y--) {
            const s = sections[y >> 4];
            if (!s) {
              y &= ~15;
              continue;
            }
            if (s.blocks[((y & 15) << 8) | col] !== portal) continue;
            while (w.getBlockId(x, y - 1, z) === portal) y--;
            const dy = y + 0.5 - ey;
            const d = dx * dx + dy * dy + dz * dz;
            if (best < 0 || d < best) {
              best = d;
              px = x;
              py = y;
              pz = z;
            }
          }
        }
      }
    }
    if (best < 0) return false;
    if (search) this.destinationCoordinateCache.set(key, { x: px, y: py, z: pz, lastUpdateTime: w.getTotalWorldTime() });
    let tx = px + 0.5;
    const ty = py + 0.5;
    let tz = pz + 0.5;
    let dir = -1;
    const portal = BlockIds.portal;
    if (w.getBlockId(px - 1, py, pz) === portal) dir = 2;
    if (w.getBlockId(px + 1, py, pz) === portal) dir = 0;
    if (w.getBlockId(px, py, pz - 1) === portal) dir = 3;
    if (w.getBlockId(px, py, pz + 1) === portal) dir = 1;
    const entered = e.getTeleportDirection();
    if (dir > -1) {
      let left = Direction.rotateLeft[dir];
      let ox = Direction.offsetX[dir];
      let oz = Direction.offsetZ[dir];
      let lx = Direction.offsetX[left];
      let lz = Direction.offsetZ[left];
      let blockedSide = !w.isAirBlock(px + ox + lx, py, pz + oz + lz) || !w.isAirBlock(px + ox + lx, py + 1, pz + oz + lz);
      let blockedFront = !w.isAirBlock(px + ox, py, pz + oz) || !w.isAirBlock(px + ox, py + 1, pz + oz);
      if (blockedSide && blockedFront) {
        dir = Direction.rotateOpposite[dir];
        left = Direction.rotateOpposite[left];
        ox = Direction.offsetX[dir];
        oz = Direction.offsetZ[dir];
        lx = Direction.offsetX[left];
        lz = Direction.offsetZ[left];
        const qx = px - lx;
        tx -= lx;
        const qz = pz - lz;
        tz -= lz;
        blockedSide = !w.isAirBlock(qx + ox + lx, py, qz + oz + lz) || !w.isAirBlock(qx + ox + lx, py + 1, qz + oz + lz);
        blockedFront = !w.isAirBlock(qx + ox, py, qz + oz) || !w.isAirBlock(qx + ox, py + 1, qz + oz);
      }
      let along = f(0.5);
      let out = f(0.5);
      if (!blockedSide && blockedFront) along = 1;
      else if (blockedSide && !blockedFront) along = 0;
      else if (blockedSide && blockedFront) out = 0;
      tx += f(f(lx * along) + f(out * ox));
      tz += f(f(lz * along) + f(out * oz));
      let a = 0;
      let b = 0;
      let c = 0;
      let d = 0;
      if (dir === entered) {
        a = 1;
        b = 1;
      } else if (dir === Direction.rotateOpposite[entered]) {
        a = -1;
        b = -1;
      } else if (dir === Direction.rotateRight[entered]) {
        c = 1;
        d = -1;
      } else {
        c = -1;
        d = 1;
      }
      const mx = e.motionX;
      const mz = e.motionZ;
      e.motionX = mx * a + mz * d;
      e.motionZ = mx * c + mz * b;
      e.rotationYaw = f(f(yaw - f(entered * 90)) + f(dir * 90));
    } else {
      e.motionX = e.motionY = e.motionZ = 0;
    }
    e.setLocationAndAngles(tx, ty, tz, e.rotationYaw, e.rotationPitch);
    return true;
  }

  /**
   * makePortal: a new portal (obsidian frame, portal inside) at the nearest spot within 16 blocks
   * where it stands on solid blocks with air around it, or one floating at y 70 or above on an
   * obsidian ledge when there is no such spot.
   */
  makePortal(e: Entity): boolean {
    const w = this.world;
    const range = 16;
    let best = -1;
    const sy = serverPosY(e);
    const ex = MathHelper.floor_double(e.posX);
    const ey = MathHelper.floor_double(sy);
    const ez = MathHelper.floor_double(e.posZ);
    let bx = ex;
    let by = ey;
    let bz = ez;
    let orient = 0;
    const start = this.random.nextInt(4);
    const height = w.getActualHeight();
    for (let x = ex - range; x <= ex + range; x++) {
      const dx = x + 0.5 - e.posX;
      for (let z = ez - range; z <= ez + range; z++) {
        const dz = z + 0.5 - e.posZ;
        column: for (let y = height - 1; y >= 0; y--) {
          if (!w.isAirBlock(x, y, z)) continue;
          while (y > 0 && w.isAirBlock(x, y - 1, z)) y--;
          for (let o = start; o < start + 4; o++) {
            let ax = o % 2;
            let az = 1 - ax;
            if (o % 4 >= 2) {
              ax = -ax;
              az = -az;
            }
            for (let i = 0; i < 3; i++) {
              for (let j = 0; j < 4; j++) {
                for (let k = -1; k < 4; k++) {
                  const qx = x + (j - 1) * ax + i * az;
                  const qy = y + k;
                  const qz = z + (j - 1) * az - i * ax;
                  if ((k < 0 && !w.getBlockMaterial(qx, qy, qz).isSolid()) || (k >= 0 && !w.isAirBlock(qx, qy, qz))) continue column;
                }
              }
            }
            const dy = y + 0.5 - sy;
            const d = dx * dx + dy * dy + dz * dz;
            if (best < 0 || d < best) {
              best = d;
              bx = x;
              by = y;
              bz = z;
              orient = o % 4;
            }
          }
        }
      }
    }
    if (best < 0) {
      for (let x = ex - range; x <= ex + range; x++) {
        const dx = x + 0.5 - e.posX;
        for (let z = ez - range; z <= ez + range; z++) {
          const dz = z + 0.5 - e.posZ;
          column: for (let y = height - 1; y >= 0; y--) {
            if (!w.isAirBlock(x, y, z)) continue;
            while (y > 0 && w.isAirBlock(x, y - 1, z)) y--;
            for (let o = start; o < start + 2; o++) {
              const ax = o % 2;
              const az = 1 - ax;
              for (let j = 0; j < 4; j++) {
                for (let k = -1; k < 4; k++) {
                  const qx = x + (j - 1) * ax;
                  const qy = y + k;
                  const qz = z + (j - 1) * az;
                  if ((k < 0 && !w.getBlockMaterial(qx, qy, qz).isSolid()) || (k >= 0 && !w.isAirBlock(qx, qy, qz))) continue column;
                }
              }
              const dy = y + 0.5 - sy;
              const d = dx * dx + dy * dy + dz * dz;
              if (best < 0 || d < best) {
                best = d;
                bx = x;
                by = y;
                bz = z;
                orient = o % 2;
              }
            }
          }
        }
      }
    }
    let ax = orient % 2;
    let az = 1 - ax;
    if (orient % 4 >= 2) {
      ax = -ax;
      az = -az;
    }
    if (best < 0) {
      if (by < 70) by = 70;
      if (by > height - 10) by = height - 10;
      for (let i = -1; i <= 1; i++) {
        for (let j = 1; j < 3; j++) {
          for (let k = -1; k < 3; k++) {
            const qx = bx + (j - 1) * ax + i * az;
            const qy = by + k;
            const qz = bz + (j - 1) * az - i * ax;
            w.setBlock(qx, qy, qz, k < 0 ? BlockIds.obsidian : 0);
          }
        }
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      for (let j = 0; j < 4; j++) {
        for (let k = -1; k < 4; k++) {
          const qx = bx + (j - 1) * ax;
          const qy = by + k;
          const qz = bz + (j - 1) * az;
          const frame = j === 0 || j === 3 || k === -1 || k === 3;
          w.setBlock(qx, qy, qz, frame ? BlockIds.obsidian : BlockIds.portal, 0, 2);
        }
      }
      for (let j = 0; j < 4; j++) {
        for (let k = -1; k < 4; k++) {
          const qx = bx + (j - 1) * ax;
          const qy = by + k;
          const qz = bz + (j - 1) * az;
          w.notifyBlocksOfNeighborChange(qx, qy, qz, w.getBlockId(qx, qy, qz));
        }
      }
    }
    return true;
  }

  /** removeStalePortalLocations: every 100 ticks, forgets portals not used for 600 ticks. */
  removeStalePortalLocations(totalTime: number): void {
    if (totalTime % 100 !== 0) return;
    const limit = totalTime - 600;
    for (const [k, p] of this.destinationCoordinateCache) if (p.lastUpdateTime < limit) this.destinationCoordinateCache.delete(k);
  }
}
