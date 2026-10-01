import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import { EnumSkyBlock, type IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockBreakable } from './BlockBreakable';
import { Material } from './Material';

export class BlockIce extends BlockBreakable {
  constructor(id: number) {
    super(id, 'ice', Material.ice, false);
    this.slipperiness = 0.98;
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getRenderBlockPass(): number {
    return 1;
  }

  /** Note the original passes the opposite side to the parent check. */
  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    return super.shouldSideBeRendered(w, x, y, z, 1 - side);
  }

  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    if (w.provider.isHellWorld) {
      w.setBlockToAir(x, y, z);
      return;
    }
    this.dropBlockAsItem(w, x, y, z, meta, 0);
    const below = w.getBlockMaterial(x, y - 1, z);
    if (below.blocksMovement() || below.isLiquid()) w.setBlock(x, y, z, BlockIds.waterMoving);
    void p;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.getSavedLightValue(EnumSkyBlock.Block, x, y, z) > 11 - Block.lightOpacity[this.blockID]) {
      if (w.provider.isHellWorld) {
        w.setBlockToAir(x, y, z);
        return;
      }
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlock(x, y, z, BlockIds.waterStill);
    }
  }

  override getMobilityFlag(): number {
    return 0;
  }
}
