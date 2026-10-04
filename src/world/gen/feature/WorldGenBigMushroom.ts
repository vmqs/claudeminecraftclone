import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Huge brown (flat cap) and red (dome) mushrooms (WorldGenBigMushroom). */
export class WorldGenBigMushroom extends WorldGenerator {
  constructor(private readonly mushroomType = -1) {
    super(mushroomType >= 0);
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    let type = rand.nextInt(2);
    if (this.mushroomType >= 0) type = this.mushroomType;
    const height = rand.nextInt(3) + 4;
    if (!(y >= 1 && y + height + 1 < 256)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height; yy++) {
      const r = yy <= y + 3 ? 0 : 3;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 256) {
            const id = w.getBlockId(xx, yy, zz);
            if (id !== 0 && id !== BlockIds.leaves) ok = false;
          } else {
            ok = false;
          }
        }
      }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if (below !== BlockIds.dirt && below !== BlockIds.grass && below !== BlockIds.mycelium) return false;
    const capId = BlockIds.mushroomCapBrown + type;
    const top = y + height;
    const capStart = type === 1 ? top - 3 : top;
    for (let yy = capStart; yy <= top; yy++) {
      let r = 1;
      if (yy < top) r++;
      if (type === 0) r = 3;
      for (let xx = x - r; xx <= x + r; xx++) {
        for (let zz = z - r; zz <= z + r; zz++) {
          let meta = 5;
          if (xx === x - r) meta--;
          if (xx === x + r) meta++;
          if (zz === z - r) meta -= 3;
          if (zz === z + r) meta += 3;
          if (type === 0 || yy < top) {
            if ((xx === x - r || xx === x + r) && (zz === z - r || zz === z + r)) continue;
            if (xx === x - (r - 1) && zz === z - r) meta = 1;
            if (xx === x - r && zz === z - (r - 1)) meta = 1;
            if (xx === x + (r - 1) && zz === z - r) meta = 3;
            if (xx === x + r && zz === z - (r - 1)) meta = 3;
            if (xx === x - (r - 1) && zz === z + r) meta = 7;
            if (xx === x - r && zz === z + (r - 1)) meta = 7;
            if (xx === x + (r - 1) && zz === z + r) meta = 9;
            if (xx === x + r && zz === z + (r - 1)) meta = 9;
          }
          if (meta === 5 && yy < top) meta = 0;
          if ((meta !== 0 || y >= top - 1) && !Block.opaqueCubeLookup[w.getBlockId(xx, yy, zz)]) this.setBlockAndMetadata(w, xx, yy, zz, capId, meta);
        }
      }
    }
    for (let i = 0; i < height; i++) {
      if (!Block.opaqueCubeLookup[w.getBlockId(x, y + i, z)]) this.setBlockAndMetadata(w, x, y + i, z, capId, 10);
    }
    return true;
  }
}
