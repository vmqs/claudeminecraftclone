import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import { Direction, Facing } from '../../../core/Facing';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Jungle vines climbing every free wall from y 64 to 127 (WorldGenVines). */
export class WorldGenVines extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const x0 = x;
    const z0 = z;
    const vine = Block.blocksList[BlockIds.vine];
    for (; y < 128; y++) {
      if (w.isAirBlock(x, y, z)) {
        for (let side = 2; side <= 5; side++) {
          if (vine && vine.canPlaceBlockOnSide(w, x, y, z, side)) {
            w.setBlock(x, y, z, BlockIds.vine, 1 << Direction.facingToDirection[Facing.oppositeSide[side]], 2);
            break;
          }
        }
      } else {
        x = x0 + rand.nextInt(4) - rand.nextInt(4);
        z = z0 + rand.nextInt(4) - rand.nextInt(4);
      }
    }
    return true;
  }
}

/** Lily pads on still water (WorldGenWaterlily). */
export class WorldGenWaterlily extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const lily = Block.blocksList[BlockIds.waterlily];
    for (let i = 0; i < 10; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(px, py, pz) && lily && lily.canPlaceBlockAt(w, px, py, pz)) w.setBlock(px, py, pz, BlockIds.waterlily, 0, 2);
    }
    return true;
  }
}

/** Pumpkin patches on grass, random facing (WorldGenPumpkin). */
export class WorldGenPumpkin extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const pumpkin = Block.blocksList[BlockIds.pumpkin];
    for (let i = 0; i < 64; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(px, py, pz) && w.getBlockId(px, py - 1, pz) === BlockIds.grass && pumpkin && pumpkin.canPlaceBlockAt(w, px, py, pz)) {
        w.setBlock(px, py, pz, BlockIds.pumpkin, rand.nextInt(4), 2);
      }
    }
    return true;
  }
}

/** The desert well: a sandstone basin of water under a slab roof (WorldGenDesertWells). */
export class WorldGenDesertWells extends WorldGenerator {
  generate(w: IWorld, _rand: JavaRandom, x: number, y: number, z: number): boolean {
    while (w.isAirBlock(x, y, z) && y > 2) y--;
    if (w.getBlockId(x, y, z) !== BlockIds.sand) return false;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (w.isAirBlock(x + dx, y - 1, z + dz) && w.isAirBlock(x + dx, y - 2, z + dz)) return false;
    const sandstone = BlockIds.sandStone;
    const slab = BlockIds.stoneSingleSlab;
    const water = BlockIds.waterMoving;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.setBlock(x + dx, y + dy, z + dz, sandstone, 0, 2);
    w.setBlock(x, y, z, water, 0, 2);
    w.setBlock(x - 1, y, z, water, 0, 2);
    w.setBlock(x + 1, y, z, water, 0, 2);
    w.setBlock(x, y, z - 1, water, 0, 2);
    w.setBlock(x, y, z + 1, water, 0, 2);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) if (dx === -2 || dx === 2 || dz === -2 || dz === 2) w.setBlock(x + dx, y + 1, z + dz, sandstone, 0, 2);
    }
    w.setBlock(x + 2, y + 1, z, slab, 1, 2);
    w.setBlock(x - 2, y + 1, z, slab, 1, 2);
    w.setBlock(x, y + 1, z + 2, slab, 1, 2);
    w.setBlock(x, y + 1, z - 2, slab, 1, 2);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) w.setBlock(x + dx, y + 4, z + dz, sandstone, 0, 2);
        else w.setBlock(x + dx, y + 4, z + dz, slab, 1, 2);
      }
    }
    for (let dy = 1; dy <= 3; dy++) {
      w.setBlock(x - 1, y + dy, z - 1, sandstone, 0, 2);
      w.setBlock(x - 1, y + dy, z + 1, sandstone, 0, 2);
      w.setBlock(x + 1, y + dy, z - 1, sandstone, 0, 2);
      w.setBlock(x + 1, y + dy, z + 1, sandstone, 0, 2);
    }
    return true;
  }
}
