import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';

/** A feature placer (trees, ores, plants). Runs against any IWorld (main world or generation world). */
export abstract class WorldGenerator {
  constructor(private readonly doBlockNotify = false) {}

  abstract generate(world: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean;

  setScale(_x: number, _y: number, _z: number): void {}

  protected setBlock(w: IWorld, x: number, y: number, z: number, id: number): void {
    this.setBlockAndMetadata(w, x, y, z, id, 0);
  }

  protected setBlockAndMetadata(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    w.setBlock(x, y, z, id, meta, this.doBlockNotify ? 3 : 2);
  }
}
