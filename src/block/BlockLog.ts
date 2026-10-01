import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Logs: meta & 3 = wood type, meta & 12 = axis (0 up/down, 4 east/west, 8 north/south). */
export class BlockLog extends Block {
  static readonly woodType = ['oak', 'spruce', 'birch', 'jungle'];
  static readonly treeTextureTypes = ['tree_side', 'tree_spruce', 'tree_birch', 'tree_jungle'];
  private iconArray: (Icon | null)[] = [];
  private treeTop: Icon | null = null;

  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getRenderType(): number {
    return 31;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.wood;
  }

  /** Flags nearby leaves for decay checks. */
  override breakBlock(w: IWorld, x: number, y: number, z: number, _id: number, _meta: number): void {
    const r = 4;
    const k = r + 1;
    if (!w.checkChunksExist(x - k, y - k, z - k, x + k, y + k, z + k)) return;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (w.getBlockId(x + dx, y + dy, z + dz) === BlockIds.leaves) {
            const m = w.getBlockMetadata(x + dx, y + dy, z + dz);
            if ((m & 8) === 0) w.setBlockMetadataWithNotify(x + dx, y + dy, z + dz, m | 8, 4);
          }
        }
      }
    }
  }

  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    const type = meta & 3;
    let axis = 0;
    switch (side) {
      case 0:
      case 1:
        axis = 0;
        break;
      case 2:
      case 3:
        axis = 8;
        break;
      case 4:
      case 5:
        axis = 4;
        break;
    }
    return type | axis;
  }

  override getIcon(side: number, meta: number): Icon | null {
    const axis = meta & 12;
    const type = meta & 3;
    if (axis === 0 && (side === 1 || side === 0)) return this.treeTop;
    if (axis === 4 && (side === 5 || side === 4)) return this.treeTop;
    if (axis === 8 && (side === 2 || side === 3)) return this.treeTop;
    return this.iconArray[type];
  }

  override damageDropped(meta: number): number {
    return meta & 3;
  }

  static limitToValidMetadata(meta: number): number {
    return meta & 3;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return new ItemStack(this.blockID, 1, BlockLog.limitToValidMetadata(meta));
  }

  override registerIcons(reg: IconRegister): void {
    this.treeTop = reg.registerIcon('tree_top');
    this.iconArray = BlockLog.treeTextureTypes.map((n) => reg.registerIcon(n));
  }
}
