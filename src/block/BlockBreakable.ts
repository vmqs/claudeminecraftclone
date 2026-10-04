import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import { Block } from './Block';
import type { Material } from './Material';

/** Glass-like blocks; `localFlag` false hides faces between two blocks of the same id. */
export class BlockBreakable extends Block {
  constructor(
    id: number,
    private readonly breakableBlockIcon: string,
    material: Material,
    private readonly localFlag: boolean,
  ) {
    super(id, material);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    const id = w.getBlockId(x, y, z);
    return !this.localFlag && id === this.blockID ? false : super.shouldSideBeRendered(w, x, y, z, side);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.breakableBlockIcon);
  }
}
