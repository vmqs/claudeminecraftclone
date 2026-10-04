import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** World generation with scheduledUpdatesAreImmediate (GenWorld has it; the client World does not need it). */
type ImmediateWorld = IWorld & { scheduledUpdatesAreImmediate?: boolean };

/** Runs one update tick of a freshly placed block with scheduled updates made immediate. */
function tickNow(w: IWorld, rand: JavaRandom, id: number, x: number, y: number, z: number): void {
  const gw = w as ImmediateWorld;
  gw.scheduledUpdatesAreImmediate = true;
  Block.blocksList[id]?.updateTick(w, x, y, z, rand);
  gw.scheduledUpdatesAreImmediate = false;
}

/**
 * WorldGenHellLava: a lava spring in a netherrack wall or ceiling. Open springs (the ones
 * visible from caves) need netherrack on four sides and one open side; hidden springs (`hidden`)
 * only appear fully enclosed in netherrack, where they flow out once something opens them.
 */
export class WorldGenHellLava extends WorldGenerator {
  constructor(
    private readonly hellLavaID: number,
    private readonly hidden: boolean,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const rack = BlockIds.netherrack;
    if (w.getBlockId(x, y + 1, z) !== rack) return false;
    const here = w.getBlockId(x, y, z);
    if (here !== 0 && here !== rack) return false;
    let solid = 0;
    if (w.getBlockId(x - 1, y, z) === rack) solid++;
    if (w.getBlockId(x + 1, y, z) === rack) solid++;
    if (w.getBlockId(x, y, z - 1) === rack) solid++;
    if (w.getBlockId(x, y, z + 1) === rack) solid++;
    if (w.getBlockId(x, y - 1, z) === rack) solid++;
    let open = 0;
    if (w.isAirBlock(x - 1, y, z)) open++;
    if (w.isAirBlock(x + 1, y, z)) open++;
    if (w.isAirBlock(x, y, z - 1)) open++;
    if (w.isAirBlock(x, y, z + 1)) open++;
    if (w.isAirBlock(x, y - 1, z)) open++;
    if ((!this.hidden && solid === 4 && open === 1) || solid === 5) {
      w.setBlock(x, y, z, this.hellLavaID, 0, 2);
      tickNow(w, rand, this.hellLavaID, x, y, z);
    }
    return true;
  }
}

/** WorldGenFire: 64 tries to light fire on top of netherrack around a point. */
export class WorldGenFire extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 64; i++) {
      const fx = x + rand.nextInt(8) - rand.nextInt(8);
      const fy = y + rand.nextInt(4) - rand.nextInt(4);
      const fz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(fx, fy, fz) && w.getBlockId(fx, fy - 1, fz) === BlockIds.netherrack) w.setBlock(fx, fy, fz, BlockIds.fire, 0, 2);
    }
    return true;
  }
}

/** Offsets of the six neighbours in the order the glowstone generators test them. */
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/**
 * WorldGenGlowStone1 (and WorldGenGlowStone2, identical in 1.5.2): a glowstone cluster hanging
 * from a netherrack ceiling. 1500 random spots up to 11 below and 7 to the side grow the cluster
 * where an air block touches exactly one glowstone block.
 */
export class WorldGenGlowStone1 extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    if (!w.isAirBlock(x, y, z)) return false;
    if (w.getBlockId(x, y + 1, z) !== BlockIds.netherrack) return false;
    const glow = BlockIds.glowStone;
    w.setBlock(x, y, z, glow, 0, 2);
    for (let i = 0; i < 1500; i++) {
      const gx = x + rand.nextInt(8) - rand.nextInt(8);
      const gy = y - rand.nextInt(12);
      const gz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.getBlockId(gx, gy, gz) !== 0) continue;
      let touching = 0;
      for (const [dx, dy, dz] of NEIGHBOURS) if (w.getBlockId(gx + dx, gy + dy, gz + dz) === glow) touching++;
      if (touching === 1) w.setBlock(gx, gy, gz, glow, 0, 2);
    }
    return true;
  }
}

/** WorldGenGlowStone2: the second glowstone pass of ChunkProviderHell (same shape as the first). */
export class WorldGenGlowStone2 extends WorldGenGlowStone1 {}
