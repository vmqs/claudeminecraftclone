import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Mycelium (110): grass-like top and sides (snowy side under snow), spore particles. */
export class BlockMycelium extends Block {
  private iconTop: Icon | null = null;
  private iconSnowSide: Icon | null = null;

  constructor(id: number) {
    super(id, Material.grass);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.iconTop;
    return side === 0 ? Block.blocksList[BlockIds.dirt]!.getBlockTextureFromSide(side) : this.blockIcon;
  }

  override getBlockTexture(w: IBlockAccess, x: number, y: number, z: number, side: number): Icon | null {
    if (side === 1) return this.iconTop;
    if (side === 0) return Block.blocksList[BlockIds.dirt]!.getBlockTextureFromSide(side);
    const above = w.getBlockMaterial(x, y + 1, z);
    return above !== Material.snow && above !== Material.craftedSnow ? this.blockIcon : this.iconSnowSide;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('mycel_side');
    this.iconTop = reg.registerIcon('mycel_top');
    this.iconSnowSide = reg.registerIcon('snow_side');
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): spread to dirt with light >= 9 above, turn to dirt under opaque cover.
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.randomDisplayTick(w, x, y, z, rand);
    if (rand.nextInt(10) === 0) w.spawnParticle('townaura', x + rand.nextFloat(), Math.fround(y + Math.fround(1.1)), z + rand.nextFloat(), 0, 0, 0);
  }

  override idDropped(_meta: number, rand: JavaRandom, fortune: number): number {
    return Block.blocksList[BlockIds.dirt]!.idDropped(0, rand, fortune);
  }
}
