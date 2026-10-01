import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { ColorizerFoliage, ColorizerGrass } from '../world/biome/Colorizer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { BlockIds, ItemIds } from './BlockIds';
import { BlockFlower } from './BlockFlower';
import { Material } from './Material';

/** Tall grass: meta 0 shrub (dead bush look), 1 grass, 2 fern. */
export class BlockTallGrass extends BlockFlower {
  private static readonly grassTypes = ['deadbush', 'tallgrass', 'fern'];
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.vine);
    const f = 0.4;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, 0.8, 0.5 + f);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    if (meta >= this.iconArray.length) meta = 0;
    return this.iconArray[meta];
  }

  override getBlockColor(): number {
    return ColorizerGrass.getGrassColor(0.5, 1.0);
  }

  override getRenderColor(meta: number): number {
    return meta === 0 ? 0xffffff : ColorizerFoliage.getFoliageColorBasic();
  }

  override colorMultiplier(w: IBlockAccess, x: number, y: number, z: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    return meta === 0 ? 0xffffff : w.getBiomeGenForCoords(x, z).getBiomeGrassColor();
  }

  override idDropped(_meta: number, rand: JavaRandom, _fortune: number): number {
    return rand.nextInt(8) === 0 ? ItemIds.seeds : -1;
  }

  override quantityDroppedWithBonus(fortune: number, rand: JavaRandom): number {
    return 1 + rand.nextInt(fortune * 2 + 1);
  }

  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    const held = p.getCurrentEquippedItem();
    if (!w.isRemote && held && held.itemID === ItemIds.shears) {
      this.dropBlockAsItem_do(w, x, y, z, new ItemStack(BlockIds.tallGrass, 1, meta));
    } else {
      super.harvestBlock(w, p, x, y, z, meta);
    }
  }

  override getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    return w.getBlockMetadata(x, y, z);
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 1; i < 3; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = BlockTallGrass.grassTypes.map((n) => reg.registerIcon(n));
  }
}
