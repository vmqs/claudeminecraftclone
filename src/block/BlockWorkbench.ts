import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Crafting table (58): the front texture on the north and west faces; opens the 3x3 grid. */
export class BlockWorkbench extends Block {
  private iconTop: Icon | null = null;
  private iconFront: Icon | null = null;

  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.iconTop;
    if (side === 0) return Block.blocksList[BlockIds.planks]!.getBlockTextureFromSide(side);
    return side !== 2 && side !== 4 ? this.blockIcon : this.iconFront;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('workbench_side');
    this.iconTop = reg.registerIcon('workbench_top');
    this.iconFront = reg.registerIcon('workbench_front');
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    return BlockGuiHooks.open({ kind: 'workbench', player: p, world: w, x, y, z });
  }
}
