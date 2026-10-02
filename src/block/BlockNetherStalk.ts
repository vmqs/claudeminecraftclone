import type { JavaRandom } from '../core/JavaRandom';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { BlockFlower } from './BlockFlower';
import { BlockIds, ItemIds } from './BlockIds';

/** Nether wart (115, render type 6): 4 ages on soul sand (3 textures); ripe it drops 2-4 warts. */
export class BlockNetherStalk extends BlockFlower {
  private static readonly textures = ['netherStalk_0', 'netherStalk_1', 'netherStalk_2'];
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id);
    this.setTickRandomly(true);
    const r = 0.5;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, 0.25, 0.5 + r);
    this.setCreativeTab(null);
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.slowSand;
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    return this.canThisPlantGrowOnThisBlockID(w.getBlockId(x, y - 1, z));
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    let meta = w.getBlockMetadata(x, y, z);
    if (meta < 3 && rand.nextInt(10) === 0) w.setBlockMetadataWithNotify(x, y, z, ++meta, 2);
    super.updateTick(w, x, y, z, rand);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    if (meta >= 3) return this.iconArray[2];
    return meta > 0 ? this.iconArray[1] : this.iconArray[0];
  }

  override getRenderType(): number {
    return 6;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, _chance: number, fortune: number): void {
    if (w.isRemote) return;
    let n = 1;
    if (meta >= 3) {
      n = 2 + w.rand.nextInt(3);
      if (fortune > 0) n += w.rand.nextInt(fortune + 1);
    }
    for (let i = 0; i < n; i++) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(ItemIds.netherStalkSeeds, 1, 0));
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.netherStalkSeeds;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = BlockNetherStalk.textures.map((n) => reg.registerIcon(n));
  }
}
