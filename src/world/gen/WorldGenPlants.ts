import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Sand or gravel discs under shallow water (WorldGenSand). */
export class WorldGenSand extends WorldGenerator {
  constructor(
    private readonly radius: number,
    private readonly sandID: number,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    if (w.getBlockMaterial(x, y, z) !== Material.water) return false;
    const r = rand.nextInt(this.radius - 2) + 2;
    const h = 2;
    for (let xx = x - r; xx <= x + r; xx++) {
      for (let zz = z - r; zz <= z + r; zz++) {
        const dx = xx - x;
        const dz = zz - z;
        if (dx * dx + dz * dz > r * r) continue;
        for (let yy = y - h; yy <= y + h; yy++) {
          const id = w.getBlockId(xx, yy, zz);
          if (id === BlockIds.dirt || id === BlockIds.grass) w.setBlock(xx, yy, zz, this.sandID, 0, 2);
        }
      }
    }
    return true;
  }
}

/** Clay discs under water (WorldGenClay). */
export class WorldGenClay extends WorldGenerator {
  constructor(private readonly numberOfBlocks: number) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    if (w.getBlockMaterial(x, y, z) !== Material.water) return false;
    const r = rand.nextInt(this.numberOfBlocks - 2) + 2;
    const h = 1;
    for (let xx = x - r; xx <= x + r; xx++) {
      for (let zz = z - r; zz <= z + r; zz++) {
        const dx = xx - x;
        const dz = zz - z;
        if (dx * dx + dz * dz > r * r) continue;
        for (let yy = y - h; yy <= y + h; yy++) {
          const id = w.getBlockId(xx, yy, zz);
          if (id === BlockIds.dirt || id === BlockIds.blockClay) w.setBlock(xx, yy, zz, BlockIds.blockClay, 0, 2);
        }
      }
    }
    return true;
  }
}

/** Single water/lava springs in cave walls (WorldGenLiquids); flows immediately. */
export class WorldGenLiquids extends WorldGenerator {
  constructor(private readonly liquidBlockId: number) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const stone = BlockIds.stone;
    if (w.getBlockId(x, y + 1, z) !== stone) return false;
    if (w.getBlockId(x, y - 1, z) !== stone) return false;
    if (w.getBlockId(x, y, z) !== 0 && w.getBlockId(x, y, z) !== stone) return false;
    let solid = 0;
    if (w.getBlockId(x - 1, y, z) === stone) solid++;
    if (w.getBlockId(x + 1, y, z) === stone) solid++;
    if (w.getBlockId(x, y, z - 1) === stone) solid++;
    if (w.getBlockId(x, y, z + 1) === stone) solid++;
    let air = 0;
    if (w.isAirBlock(x - 1, y, z)) air++;
    if (w.isAirBlock(x + 1, y, z)) air++;
    if (w.isAirBlock(x, y, z - 1)) air++;
    if (w.isAirBlock(x, y, z + 1)) air++;
    if (solid === 3 && air === 1) {
      w.setBlock(x, y, z, this.liquidBlockId, 0, 2);
      const gw = w as IWorld & { scheduledUpdatesAreImmediate?: boolean };
      gw.scheduledUpdatesAreImmediate = true;
      Block.blocksList[this.liquidBlockId]?.updateTick(w, x, y, z, rand);
      gw.scheduledUpdatesAreImmediate = false;
    }
    return true;
  }
}

/** Dead bushes (WorldGenDeadBush). */
export class WorldGenDeadBush extends WorldGenerator {
  constructor(private readonly deadBushID: number) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    let id: number;
    while (((id = w.getBlockId(x, y, z)) === 0 || id === BlockIds.leaves) && y > 0) y--;
    const b = Block.blocksList[this.deadBushID];
    for (let i = 0; i < 4; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(px, py, pz) && b && b.canBlockStay(w, px, py, pz)) w.setBlock(px, py, pz, this.deadBushID, 0, 2);
    }
    return true;
  }
}

/** Cactus clusters (WorldGenCactus). */
export class WorldGenCactus extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const cactus = Block.blocksList[BlockIds.cactus];
    for (let i = 0; i < 10; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (!w.isAirBlock(px, py, pz)) continue;
      const h = 1 + rand.nextInt(rand.nextInt(3) + 1);
      for (let k = 0; k < h; k++) {
        if (cactus && cactus.canBlockStay(w, px, py + k, pz)) w.setBlock(px, py + k, pz, BlockIds.cactus, 0, 2);
      }
    }
    return true;
  }
}
