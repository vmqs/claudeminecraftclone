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

  /** Turns to dirt under an opaque cover in the dark; spreads to lit dirt nearby like grass. */
  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (w.isRemote) return;
    if (w.getBlockLightValue(x, y + 1, z) < 4 && Block.lightOpacity[w.getBlockId(x, y + 1, z)] > 2) {
      w.setBlock(x, y, z, BlockIds.dirt);
    } else if (w.getBlockLightValue(x, y + 1, z) >= 9) {
      for (let i = 0; i < 4; i++) {
        const tx = x + rand.nextInt(3) - 1;
        const ty = y + rand.nextInt(5) - 3;
        const tz = z + rand.nextInt(3) - 1;
        const above = w.getBlockId(tx, ty + 1, tz);
        if (w.getBlockId(tx, ty, tz) === BlockIds.dirt && w.getBlockLightValue(tx, ty + 1, tz) >= 4 && Block.lightOpacity[above] <= 2) {
          w.setBlock(tx, ty, tz, this.blockID);
        }
      }
    }
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.randomDisplayTick(w, x, y, z, rand);
    if (rand.nextInt(10) === 0) w.spawnParticle('townaura', x + rand.nextFloat(), Math.fround(y + Math.fround(1.1)), z + rand.nextFloat(), 0, 0, 0);
  }

  override idDropped(_meta: number, rand: JavaRandom, fortune: number): number {
    return Block.blocksList[BlockIds.dirt]!.idDropped(0, rand, fortune);
  }
}
