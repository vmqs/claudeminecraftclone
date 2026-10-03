import type { JavaRandom } from '../core/JavaRandom';
import type { IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/** The April-fools locked chest (95): placeable anywhere, vanishes on its next random tick. */
export class BlockLockedChest extends Block {
  constructor(id: number) {
    super(id, Material.wood);
  }

  override canPlaceBlockAt(_w: IWorld, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    w.setBlockToAir(x, y, z);
  }

  override registerIcons(_reg: IconRegister): void {}
}
