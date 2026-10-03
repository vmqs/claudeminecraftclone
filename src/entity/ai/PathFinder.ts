import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import { MathHelper } from '../../core/MathHelper';
import type { IBlockAccess } from '../../world/IBlockAccess';
import type { Entity } from '../Entity';
import { PathEntity } from './PathEntity';
import { Path, PathPoint } from './PathPoint';

const f = Math.fround;

/** Results of PathFinder.getVerticalOffset for a box at a position. */
export enum PathCell {
  /** Clear, with water (or an open trapdoor) inside. */
  ClearWithWater = 2,
  Clear = 1,
  Blocked = 0,
  /** Water while avoiding water. */
  Water = -1,
  Lava = -2,
  /** Fence, wall, fence gate or a rail under the walker. */
  Fence = -3,
  Trapdoor = -4,
}

/**
 * A* over block positions (PathFinder): 4-way moves with one-block step-ups, drops up to the
 * entity's maximum fall height, doors, water and lava rules as in 1.5.2. The search is bounded
 * by `maxDistance` from the start.
 */
export class PathFinder {
  private readonly path = new Path();
  private readonly pointMap = new Map<number, PathPoint>();
  private readonly pathOptions: PathPoint[] = new Array(32);

  constructor(
    private readonly worldMap: IBlockAccess,
    private readonly isWoodenDoorAllowed: boolean,
    private readonly isMovementBlockAllowed: boolean,
    private isPathingInWater: boolean,
    private readonly canEntityDrown: boolean,
  ) {}

  createEntityPathToEntity(e: Entity, target: Entity, maxDistance: number): PathEntity | null {
    return this.createEntityPathToPos(e, target.posX, target.boundingBox.minY, target.posZ, maxDistance);
  }

  createEntityPathToXYZ(e: Entity, x: number, y: number, z: number, maxDistance: number): PathEntity | null {
    return this.createEntityPathToPos(e, f(x + f(0.5)), f(y + f(0.5)), f(z + f(0.5)), maxDistance);
  }

  private createEntityPathToPos(e: Entity, x: number, y: number, z: number, maxDistance: number): PathEntity | null {
    this.path.clearPath();
    this.pointMap.clear();
    const savedInWater = this.isPathingInWater;
    let startY: number;
    if (this.canEntityDrown && e.isInWater()) {
      // Swimmers start from the water surface.
      startY = Math.trunc(e.boundingBox.minY);
      const bx = MathHelper.floor_double(e.posX);
      const bz = MathHelper.floor_double(e.posZ);
      let id = this.worldMap.getBlockId(bx, startY, bz);
      while (id === BlockIds.waterMoving || id === BlockIds.waterStill) id = this.worldMap.getBlockId(bx, ++startY, bz);
      this.isPathingInWater = false;
    } else {
      startY = MathHelper.floor_double(e.boundingBox.minY + 0.5);
    }
    const start = this.openPoint(MathHelper.floor_double(e.boundingBox.minX), startY, MathHelper.floor_double(e.boundingBox.minZ));
    const half = f(e.width / 2);
    const end = this.openPoint(MathHelper.floor_double(x - half), MathHelper.floor_double(y), MathHelper.floor_double(z - half));
    const size = new PathPoint(MathHelper.floor_float(f(e.width + 1)), MathHelper.floor_float(f(e.height + 1)), MathHelper.floor_float(f(e.width + 1)));
    const result = this.addToPath(e, start, end, size, maxDistance);
    this.isPathingInWater = savedInWater;
    return result;
  }

  private addToPath(e: Entity, start: PathPoint, end: PathPoint, size: PathPoint, maxDistance: number): PathEntity | null {
    start.totalPathDistance = 0;
    start.distanceToNext = start.distanceToSquared(end);
    start.distanceToTarget = start.distanceToNext;
    this.path.clearPath();
    this.path.addPoint(start);
    let closest = start;
    while (!this.path.isPathEmpty()) {
      const p = this.path.dequeue();
      if (p.equals(end)) return this.createEntityPath(end);
      if (p.distanceToSquared(end) < closest.distanceToSquared(end)) closest = p;
      p.isFirst = true;
      const n = this.findPathOptions(e, p, size, end, maxDistance);
      for (let i = 0; i < n; i++) {
        const q = this.pathOptions[i];
        const cost = f(p.totalPathDistance + p.distanceToSquared(q));
        if (q.isAssigned() && !(cost < q.totalPathDistance)) continue;
        q.previous = p;
        q.totalPathDistance = cost;
        q.distanceToNext = q.distanceToSquared(end);
        if (q.isAssigned()) {
          this.path.changeDistance(q, f(q.totalPathDistance + q.distanceToNext));
        } else {
          q.distanceToTarget = f(q.totalPathDistance + q.distanceToNext);
          this.path.addPoint(q);
        }
      }
    }
    // Unreachable: walk to the closest point found, if it is not the start.
    return closest === start ? null : this.createEntityPath(closest);
  }

  private findPathOptions(e: Entity, p: PathPoint, size: PathPoint, end: PathPoint, maxDistance: number): number {
    let n = 0;
    const stepUp = this.getVerticalOffset(e, p.xCoord, p.yCoord + 1, p.zCoord, size) === PathCell.Clear ? 1 : 0;
    const candidates = [
      this.getSafePoint(e, p.xCoord, p.yCoord, p.zCoord + 1, size, stepUp),
      this.getSafePoint(e, p.xCoord - 1, p.yCoord, p.zCoord, size, stepUp),
      this.getSafePoint(e, p.xCoord + 1, p.yCoord, p.zCoord, size, stepUp),
      this.getSafePoint(e, p.xCoord, p.yCoord, p.zCoord - 1, size, stepUp),
    ];
    for (const q of candidates) if (q && !q.isFirst && q.distanceTo(end) < maxDistance) this.pathOptions[n++] = q;
    return n;
  }

  /** Where an entity ends up stepping into (x, y, z): stepped up, fallen down, or null. */
  private getSafePoint(e: Entity, x: number, y: number, z: number, size: PathPoint, stepUp: number): PathPoint | null {
    const cell = this.getVerticalOffset(e, x, y, z, size);
    if (cell === PathCell.ClearWithWater) return this.openPoint(x, y, z);
    let p: PathPoint | null = cell === PathCell.Clear ? this.openPoint(x, y, z) : null;
    if (p === null && stepUp > 0 && cell !== PathCell.Fence && cell !== PathCell.Trapdoor && this.getVerticalOffset(e, x, y + stepUp, z, size) === PathCell.Clear) {
      p = this.openPoint(x, y + stepUp, z);
      y += stepUp;
    }
    if (p === null) return null;
    let fallen = 0;
    let below = 0;
    while (y > 0) {
      below = this.getVerticalOffset(e, x, y - 1, z, size);
      if (this.isPathingInWater && below === PathCell.Water) return null;
      if (below !== PathCell.Clear) break;
      if (fallen++ >= e.getMaxFallHeight()) return null;
      if (--y > 0) p = this.openPoint(x, y, z);
    }
    return below === PathCell.Lava ? null : p;
  }

  private openPoint(x: number, y: number, z: number): PathPoint {
    const k = PathPoint.makeHash(x, y, z);
    let p = this.pointMap.get(k);
    if (!p) {
      p = new PathPoint(x, y, z);
      this.pointMap.set(k, p);
    }
    return p;
  }

  getVerticalOffset(e: Entity, x: number, y: number, z: number, size: PathPoint): PathCell {
    return PathFinder.checkCell(e, x, y, z, size, this.isPathingInWater, this.isMovementBlockAllowed, this.isWoodenDoorAllowed);
  }

  /** func_82565_a: what a box of `size` blocks at (x, y, z) would stand in. */
  static checkCell(e: Entity, x: number, y: number, z: number, size: PathPoint, avoidWater: boolean, breakDoors: boolean, enterDoors: boolean): PathCell {
    const w = e.worldObj;
    let wet = false;
    for (let bx = x; bx < x + size.xCoord; bx++) {
      for (let by = y; by < y + size.yCoord; by++) {
        for (let bz = z; bz < z + size.zCoord; bz++) {
          const id = w.getBlockId(bx, by, bz);
          if (id <= 0) continue;
          if (id === BlockIds.trapdoor) wet = true;
          else if (id === BlockIds.waterMoving || id === BlockIds.waterStill) {
            if (avoidWater) return PathCell.Water;
            wet = true;
          } else if (!enterDoors && id === BlockIds.doorWood) return PathCell.Blocked;
          const block = Block.blocksList[id]!;
          const rt = block.getRenderType();
          if (w.blockGetRenderType(bx, by, bz) === 9) {
            // Rails: only walkable while already on rails.
            const ex = MathHelper.floor_double(e.posX);
            const ey = MathHelper.floor_double(e.posY);
            const ez = MathHelper.floor_double(e.posZ);
            if (w.blockGetRenderType(ex, ey, ez) !== 9 && w.blockGetRenderType(ex, ey - 1, ez) !== 9) return PathCell.Fence;
          } else if (!block.getBlocksMovement(w, bx, by, bz) && (!breakDoors || id !== BlockIds.doorWood)) {
            if (rt === 11 || id === BlockIds.fenceGate || rt === 32) return PathCell.Fence;
            if (id === BlockIds.trapdoor) return PathCell.Trapdoor;
            if (block.blockMaterial !== Material.lava) return PathCell.Blocked;
            if (!e.handleLavaMovement()) return PathCell.Lava;
          }
        }
      }
    }
    return wet ? PathCell.ClearWithWater : PathCell.Clear;
  }

  private createEntityPath(end: PathPoint): PathEntity {
    const points: PathPoint[] = [];
    for (let p: PathPoint | null = end; p; p = p.previous) points.push(p);
    return new PathEntity(points.reverse());
  }
}
