import type { IBlockAccess } from '../world/IBlockAccess';
import { Block } from './Block';
import type { Material } from './Material';

export class BlockLeavesBase extends Block {
  /** true = fancy graphics (faces between leaves are drawn). */
  graphicsLevel: boolean;

  constructor(id: number, material: Material, fancy: boolean) {
    super(id, material);
    this.graphicsLevel = fancy;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    const id = w.getBlockId(x, y, z);
    return !this.graphicsLevel && id === this.blockID ? false : super.shouldSideBeRendered(w, x, y, z, side);
  }
}
