import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/**
 * Block of quartz (155): 0 plain, 1 chiseled, 2-4 pillar along Y, X, Z (render type 39 turns
 * the pillar texture with the axis).
 */
export class BlockQuartz extends Block {
  static readonly quartzBlockTypes = ['default', 'chiseled', 'lines'];
  private static readonly sideTextures = ['quartzblock_side', 'quartzblock_chiseled', 'quartzblock_lines', null, null];
  private sideIcons: (Icon | null)[] = [];
  private iconChiseledTop: Icon | null = null;
  private iconLinesTop: Icon | null = null;
  private iconTop: Icon | null = null;
  private iconBottom: Icon | null = null;

  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (meta === 2 || meta === 3 || meta === 4) {
      if (meta === 2 && (side === 1 || side === 0)) return this.iconLinesTop;
      if (meta === 3 && (side === 5 || side === 4)) return this.iconLinesTop;
      if (meta === 4 && (side === 2 || side === 3)) return this.iconLinesTop;
      return this.sideIcons[meta];
    }
    if (side === 1 || (side === 0 && meta === 1)) return meta === 1 ? this.iconChiseledTop : this.iconTop;
    if (side === 0) return this.iconBottom;
    if (meta < 0 || meta >= this.sideIcons.length) meta = 0;
    return this.sideIcons[meta];
  }

  /** A pillar (item damage 2) takes the axis of the face it is placed against. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    if (meta === 2) {
      if (side === 0 || side === 1) meta = 2;
      else if (side === 2 || side === 3) meta = 4;
      else if (side === 4 || side === 5) meta = 3;
    }
    return meta;
  }

  override damageDropped(meta: number): number {
    return meta !== 3 && meta !== 4 ? meta : 2;
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return meta !== 3 && meta !== 4 ? super.createStackedBlock(meta) : new ItemStack(this.blockID, 1, 2);
  }

  override getRenderType(): number {
    return 39;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0), new ItemStack(id, 1, 1), new ItemStack(id, 1, 2));
  }

  override registerIcons(reg: IconRegister): void {
    this.sideIcons = [];
    for (let i = 0; i < BlockQuartz.sideTextures.length; i++) {
      const name = BlockQuartz.sideTextures[i];
      this.sideIcons.push(name === null ? this.sideIcons[i - 1] : reg.registerIcon(name));
    }
    this.iconTop = reg.registerIcon('quartzblock_top');
    this.iconChiseledTop = reg.registerIcon('quartzblock_chiseled_top');
    this.iconLinesTop = reg.registerIcon('quartzblock_lines_top');
    this.iconBottom = reg.registerIcon('quartzblock_bottom');
  }
}
