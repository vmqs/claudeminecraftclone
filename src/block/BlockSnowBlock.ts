import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { EnumSkyBlock } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

/** Snow block (80): drops 4 snowballs, melts next to bright block light. */
export class BlockSnowBlock extends Block {
  constructor(id: number) {
    super(id, Material.craftedSnow);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.snowball;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 4;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): melting is owned by the block-dynamics port; this is the 1.5.2 rule.
    if (w.getSavedLightValue(EnumSkyBlock.Block, x, y, z) > 11) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }
}
