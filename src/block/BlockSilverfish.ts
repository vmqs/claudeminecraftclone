import type { JavaRandom } from '../core/JavaRandom';
import { EntityList } from '../entity/EntityList';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Monster egg (97): stone (0), cobblestone (1) or stone brick (2) hiding a silverfish. */
export class BlockSilverfish extends Block {
  static readonly silverfishStoneTypes = ['stone', 'cobble', 'brick'];

  constructor(id: number) {
    super(id, Material.clay);
    this.setHardness(0);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (meta === 1) return Block.blocksList[BlockIds.cobblestone]!.getBlockTextureFromSide(side);
    if (meta === 2) return Block.blocksList[BlockIds.stoneBrick]!.getBlockTextureFromSide(side);
    return Block.blocksList[BlockIds.stone]!.getBlockTextureFromSide(side);
  }

  override registerIcons(_reg: IconRegister): void {}

  /** Breaking it releases the silverfish. */
  override onBlockDestroyedByPlayer(w: IWorld, x: number, y: number, z: number, meta: number): void {
    if (!w.isRemote) {
      const e = EntityList.createEntityByName('Silverfish', w as unknown as World);
      if (e) {
        e.setLocationAndAngles(x + 0.5, y, z + 0.5, 0, 0);
        w.spawnEntityInWorld(e);
        (e as unknown as { spawnExplosionParticle?: () => void }).spawnExplosionParticle?.();
      }
    }
    super.onBlockDestroyedByPlayer(w, x, y, z, meta);
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  /** getPosingIdByMetadata: blocks a silverfish can hide in. */
  static getPosingIdByMetadata(id: number): boolean {
    return id === BlockIds.stone || id === BlockIds.cobblestone || id === BlockIds.stoneBrick;
  }

  static getMetadataForBlockType(id: number): number {
    if (id === BlockIds.cobblestone) return 1;
    return id === BlockIds.stoneBrick ? 2 : 0;
  }

  protected override createStackedBlock(meta: number): ItemStack {
    const id = meta === 1 ? BlockIds.cobblestone : meta === 2 ? BlockIds.stoneBrick : BlockIds.stone;
    return new ItemStack(id, 1, 0);
  }

  override getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    return w.getBlockMetadata(x, y, z);
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 3; i++) out.push(new ItemStack(id, 1, i));
  }
}
