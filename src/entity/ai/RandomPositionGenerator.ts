import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { EntityCreature } from '../EntityCreature';

/**
 * Random walk targets for AI tasks (RandomPositionGenerator): the best of 10 random positions
 * within (xz, y) blocks by getBlockPathWeight, optionally restricted to a half-space towards or
 * away from a point and to the creature's home area.
 */
export class RandomPositionGenerator {
  static findRandomTarget(e: EntityCreature, xz: number, y: number): Vec3 | null {
    return RandomPositionGenerator.findRandomTargetBlock(e, xz, y, null);
  }

  static findRandomTargetBlockTowards(e: EntityCreature, xz: number, y: number, target: Vec3): Vec3 | null {
    return RandomPositionGenerator.findRandomTargetBlock(e, xz, y, new Vec3(target.xCoord - e.posX, target.yCoord - e.posY, target.zCoord - e.posZ));
  }

  static findRandomTargetBlockAwayFrom(e: EntityCreature, xz: number, y: number, from: Vec3): Vec3 | null {
    return RandomPositionGenerator.findRandomTargetBlock(e, xz, y, new Vec3(e.posX - from.xCoord, e.posY - from.yCoord, e.posZ - from.zCoord));
  }

  private static findRandomTargetBlock(e: EntityCreature, xz: number, y: number, dir: Vec3 | null): Vec3 | null {
    const rand = e.getRNG();
    let found = false;
    let bx = 0;
    let by = 0;
    let bz = 0;
    let best = -99999;
    let nearHome = false;
    if (e.hasHome()) {
      const d = e.getHomePosition().getDistanceSquared(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ)) + 4;
      const r = e.getMaximumHomeDistance() + xz;
      nearHome = d < r * r;
    }
    for (let i = 0; i < 10; i++) {
      let x = rand.nextInt(2 * xz) - xz;
      let yy = rand.nextInt(2 * y) - y;
      let z = rand.nextInt(2 * xz) - xz;
      if (dir && x * dir.xCoord + z * dir.zCoord < 0) continue;
      x += MathHelper.floor_double(e.posX);
      yy += MathHelper.floor_double(e.posY);
      z += MathHelper.floor_double(e.posZ);
      if (nearHome && !e.isWithinHomeDistance(x, yy, z)) continue;
      const w = e.getBlockPathWeight(x, yy, z);
      if (w > best) {
        best = w;
        bx = x;
        by = yy;
        bz = z;
        found = true;
      }
    }
    return found ? new Vec3(bx, by, bz) : null;
  }
}
