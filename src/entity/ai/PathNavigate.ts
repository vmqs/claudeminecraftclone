import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { World } from '../../world/World';
import type { EntityLiving } from '../EntityLiving';
import { PathFinder } from './PathFinder';
import type { PathEntity } from './PathEntity';

/**
 * Path following for AI mobs (PathNavigate): finds paths with PathFinder, skips ahead to the
 * furthest directly walkable point, gives up when stuck for 100 ticks, and feeds the next
 * point to the entity's move helper.
 */
export class PathNavigate {
  private currentPath: PathEntity | null = null;
  private speed = 0;
  private noSunPathfind = false;
  private totalTicks = 0;
  private ticksAtLastPos = 0;
  private readonly lastPosCheck = new Vec3(0, 0, 0);
  private canPassOpenWoodenDoors = true;
  private canPassClosedWoodenDoors = false;
  private avoidsWater = false;
  private canSwim = false;

  constructor(
    private readonly theEntity: EntityLiving,
    private readonly worldObj: World,
    private readonly pathSearchRange: number,
  ) {}

  setAvoidsWater(v: boolean): void {
    this.avoidsWater = v;
  }
  getAvoidsWater(): boolean {
    return this.avoidsWater;
  }
  setBreakDoors(v: boolean): void {
    this.canPassClosedWoodenDoors = v;
  }
  setEnterDoors(v: boolean): void {
    this.canPassOpenWoodenDoors = v;
  }
  getCanBreakDoors(): boolean {
    return this.canPassClosedWoodenDoors;
  }
  setAvoidSun(v: boolean): void {
    this.noSunPathfind = v;
  }
  setSpeed(v: number): void {
    this.speed = v;
  }
  setCanSwim(v: boolean): void {
    this.canSwim = v;
  }

  private newFinder(): PathFinder {
    return new PathFinder(this.worldObj, this.canPassOpenWoodenDoors, this.canPassClosedWoodenDoors, this.avoidsWater, this.canSwim);
  }

  getPathToXYZ(x: number, y: number, z: number): PathEntity | null {
    if (!this.canNavigate()) return null;
    return this.newFinder().createEntityPathToXYZ(this.theEntity, MathHelper.floor_double(x), Math.trunc(y), MathHelper.floor_double(z), this.pathSearchRange);
  }

  tryMoveToXYZ(x: number, y: number, z: number, speed: number): boolean {
    return this.setPath(this.getPathToXYZ(MathHelper.floor_double(x), Math.trunc(y), MathHelper.floor_double(z)), speed);
  }

  getPathToEntityLiving(target: EntityLiving): PathEntity | null {
    if (!this.canNavigate()) return null;
    return this.newFinder().createEntityPathToEntity(this.theEntity, target, this.pathSearchRange);
  }

  tryMoveToEntityLiving(target: EntityLiving, speed: number): boolean {
    const path = this.getPathToEntityLiving(target);
    return path !== null && this.setPath(path, speed);
  }

  setPath(path: PathEntity | null, speed: number): boolean {
    if (!path) {
      this.currentPath = null;
      return false;
    }
    if (!path.isSamePath(this.currentPath)) this.currentPath = path;
    if (this.noSunPathfind) this.removeSunnyPath();
    if (this.currentPath!.getCurrentPathLength() === 0) return false;
    this.speed = speed;
    const pos = this.getEntityPosition();
    this.ticksAtLastPos = this.totalTicks;
    this.lastPosCheck.xCoord = pos.xCoord;
    this.lastPosCheck.yCoord = pos.yCoord;
    this.lastPosCheck.zCoord = pos.zCoord;
    return true;
  }

  getPath(): PathEntity | null {
    return this.currentPath;
  }

  onUpdateNavigation(): void {
    this.totalTicks++;
    if (this.noPath()) return;
    if (this.canNavigate()) this.pathFollow();
    if (this.noPath()) return;
    const next = this.currentPath!.getPosition(this.theEntity);
    this.theEntity.getMoveHelper().setMoveTo(next.xCoord, next.yCoord, next.zCoord, this.speed);
  }

  private pathFollow(): void {
    const path = this.currentPath!;
    const pos = this.getEntityPosition();
    // Only points on the current level count for skipping ahead.
    let levelEnd = path.getCurrentPathLength();
    for (let i = path.getCurrentPathIndex(); i < path.getCurrentPathLength(); i++) {
      if (path.getPathPointFromIndex(i).yCoord !== Math.trunc(pos.yCoord)) {
        levelEnd = i;
        break;
      }
    }
    const reach = Math.fround(this.theEntity.width * this.theEntity.width);
    for (let i = path.getCurrentPathIndex(); i < levelEnd; i++) {
      if (pos.squareDistanceTo(path.getVectorFromIndex(this.theEntity, i)) < reach) path.setCurrentPathIndex(i + 1);
    }
    const sx = MathHelper.ceiling_float_int(this.theEntity.width);
    const sy = Math.trunc(this.theEntity.height) + 1;
    for (let i = levelEnd - 1; i >= path.getCurrentPathIndex(); i--) {
      if (this.isDirectPathBetweenPoints(pos, path.getVectorFromIndex(this.theEntity, i), sx, sy, sx)) {
        path.setCurrentPathIndex(i);
        break;
      }
    }
    if (this.totalTicks - this.ticksAtLastPos > 100) {
      if (pos.squareDistanceTo(this.lastPosCheck) < 2.25) this.clearPathEntity();
      this.ticksAtLastPos = this.totalTicks;
      this.lastPosCheck.xCoord = pos.xCoord;
      this.lastPosCheck.yCoord = pos.yCoord;
      this.lastPosCheck.zCoord = pos.zCoord;
    }
  }

  noPath(): boolean {
    return this.currentPath === null || this.currentPath.isFinished();
  }

  clearPathEntity(): void {
    this.currentPath = null;
  }

  private getEntityPosition(): Vec3 {
    return new Vec3(this.theEntity.posX, this.getPathableYPos(), this.theEntity.posZ);
  }

  /** Feet level, or the water surface for swimmers. */
  private getPathableYPos(): number {
    const e = this.theEntity;
    if (!(e.isInWater() && this.canSwim)) return Math.trunc(e.boundingBox.minY + 0.5);
    let y = Math.trunc(e.boundingBox.minY);
    const bx = MathHelper.floor_double(e.posX);
    const bz = MathHelper.floor_double(e.posZ);
    let id = this.worldObj.getBlockId(bx, y, bz);
    let n = 0;
    while (id === BlockIds.waterMoving || id === BlockIds.waterStill) {
      id = this.worldObj.getBlockId(bx, ++y, bz);
      if (++n > 16) return Math.trunc(e.boundingBox.minY);
    }
    return y;
  }

  private canNavigate(): boolean {
    return this.theEntity.onGround || (this.canSwim && this.isInFluid());
  }

  private isInFluid(): boolean {
    return this.theEntity.isInWater() || this.theEntity.handleLavaMovement();
  }

  /** Cuts the path before the first sky-lit point (mobs that burn in daylight). */
  private removeSunnyPath(): void {
    const e = this.theEntity;
    if (this.worldObj.canBlockSeeTheSky(MathHelper.floor_double(e.posX), Math.trunc(e.boundingBox.minY + 0.5), MathHelper.floor_double(e.posZ))) return;
    const path = this.currentPath!;
    for (let i = 0; i < path.getCurrentPathLength(); i++) {
      const p = path.getPathPointFromIndex(i);
      if (this.worldObj.canBlockSeeTheSky(p.xCoord, p.yCoord, p.zCoord)) {
        path.setCurrentPathLength(i - 1);
        return;
      }
    }
  }

  /** Walks the grid cells under the straight line from `a` to `b` (a 2D DDA). */
  private isDirectPathBetweenPoints(a: Vec3, b: Vec3, sx: number, sy: number, sz: number): boolean {
    let x = MathHelper.floor_double(a.xCoord);
    let z = MathHelper.floor_double(a.zCoord);
    let dx = b.xCoord - a.xCoord;
    let dz = b.zCoord - a.zCoord;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1.0e-8) return false;
    const inv = 1 / Math.sqrt(len2);
    dx *= inv;
    dz *= inv;
    const y = Math.trunc(a.yCoord);
    if (!this.isSafeToStandAt(x, y, z, sx + 2, sy, sz + 2, a, dx, dz)) return false;
    const stepX = 1 / Math.abs(dx);
    const stepZ = 1 / Math.abs(dz);
    let tx = x - a.xCoord;
    let tz = z - a.zCoord;
    if (dx >= 0) tx++;
    if (dz >= 0) tz++;
    tx /= dx;
    tz /= dz;
    const dirX = dx < 0 ? -1 : 1;
    const dirZ = dz < 0 ? -1 : 1;
    const endX = MathHelper.floor_double(b.xCoord);
    const endZ = MathHelper.floor_double(b.zCoord);
    let leftX = endX - x;
    let leftZ = endZ - z;
    while (leftX * dirX > 0 || leftZ * dirZ > 0) {
      if (tx < tz) {
        tx += stepX;
        x += dirX;
        leftX = endX - x;
      } else {
        tz += stepZ;
        z += dirZ;
        leftZ = endZ - z;
      }
      if (!this.isSafeToStandAt(x, y, z, sx, sy, sz, a, dx, dz)) return false;
    }
    return true;
  }

  private isSafeToStandAt(x: number, y: number, z: number, sx: number, sy: number, sz: number, from: Vec3, dx: number, dz: number): boolean {
    const x0 = x - Math.trunc(sx / 2);
    const z0 = z - Math.trunc(sz / 2);
    if (!this.isPositionClear(x0, y, z0, sx, sy, sz, from, dx, dz)) return false;
    for (let bx = x0; bx < x0 + sx; bx++) {
      for (let bz = z0; bz < z0 + sz; bz++) {
        // Only cells ahead of the walker matter.
        if ((bx + 0.5 - from.xCoord) * dx + (bz + 0.5 - from.zCoord) * dz < 0) continue;
        const id = this.worldObj.getBlockId(bx, y - 1, bz);
        if (id <= 0) return false;
        const m = Block.blocksList[id]!.blockMaterial;
        if (m === Material.water && !this.theEntity.isInWater()) return false;
        if (m === Material.lava) return false;
      }
    }
    return true;
  }

  private isPositionClear(x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, from: Vec3, dx: number, dz: number): boolean {
    for (let bx = x0; bx < x0 + sx; bx++) {
      for (let by = y0; by < y0 + sy; by++) {
        for (let bz = z0; bz < z0 + sz; bz++) {
          if ((bx + 0.5 - from.xCoord) * dx + (bz + 0.5 - from.zCoord) * dz < 0) continue;
          const id = this.worldObj.getBlockId(bx, by, bz);
          if (id > 0 && !Block.blocksList[id]!.getBlocksMovement(this.worldObj, bx, by, bz)) return false;
        }
      }
    }
    return true;
  }
}
