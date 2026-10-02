import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import { Material } from '../../../block/Material';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Swamp oaks: wide crowns hung with vines, may stand in shallow water (WorldGenSwamp). */
export class WorldGenSwamp extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(4) + 5;
    while (w.getBlockMaterial(x, y - 1, z) === Material.water) y--;
    if (!(y >= 1 && y + height + 1 <= 128)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height; yy++) {
      let r = 1;
      if (yy === y) r = 0;
      if (yy >= y + 1 + height - 2) r = 3;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 128) {
            const id = w.getBlockId(xx, yy, zz);
            if (id !== 0 && id !== BlockIds.leaves) {
              if (id !== BlockIds.waterStill && id !== BlockIds.waterMoving) ok = false;
              else if (yy > y) ok = false;
            }
          } else {
            ok = false;
          }
        }
      }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if (!((below === BlockIds.grass || below === BlockIds.dirt) && y < 128 - height - 1)) return false;
    this.setBlock(w, x, y - 1, z, BlockIds.dirt);
    for (let yy = y - 3 + height; yy <= y + height; yy++) {
      const dy = yy - (y + height);
      const r = 2 - Math.trunc(dy / 2);
      for (let xx = x - r; xx <= x + r; xx++) {
        const dx = xx - x;
        for (let zz = z - r; zz <= z + r; zz++) {
          const dz = zz - z;
          if ((Math.abs(dx) !== r || Math.abs(dz) !== r || (rand.nextInt(2) !== 0 && dy !== 0)) && !Block.opaqueCubeLookup[w.getBlockId(xx, yy, zz)]) {
            this.setBlock(w, xx, yy, zz, BlockIds.leaves);
          }
        }
      }
    }
    for (let i = 0; i < height; i++) {
      const id = w.getBlockId(x, y + i, z);
      if (id === 0 || id === BlockIds.leaves || id === BlockIds.waterMoving || id === BlockIds.waterStill) this.setBlock(w, x, y + i, z, BlockIds.wood);
    }
    for (let yy = y - 3 + height; yy <= y + height; yy++) {
      const dy = yy - (y + height);
      const r = 2 - Math.trunc(dy / 2);
      for (let xx = x - r; xx <= x + r; xx++) {
        for (let zz = z - r; zz <= z + r; zz++) {
          if (w.getBlockId(xx, yy, zz) !== BlockIds.leaves) continue;
          if (rand.nextInt(4) === 0 && w.getBlockId(xx - 1, yy, zz) === 0) this.generateVines(w, xx - 1, yy, zz, 8);
          if (rand.nextInt(4) === 0 && w.getBlockId(xx + 1, yy, zz) === 0) this.generateVines(w, xx + 1, yy, zz, 2);
          if (rand.nextInt(4) === 0 && w.getBlockId(xx, yy, zz - 1) === 0) this.generateVines(w, xx, yy, zz - 1, 1);
          if (rand.nextInt(4) === 0 && w.getBlockId(xx, yy, zz + 1) === 0) this.generateVines(w, xx, yy, zz + 1, 4);
        }
      }
    }
    return true;
  }

  private generateVines(w: IWorld, x: number, y: number, z: number, meta: number): void {
    this.setBlockAndMetadata(w, x, y, z, BlockIds.vine, meta);
    for (let n = 4; w.getBlockId(x, --y, z) === 0 && n > 0; n--) this.setBlockAndMetadata(w, x, y, z, BlockIds.vine, meta);
  }
}
