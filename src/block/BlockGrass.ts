import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { ColorizerGrass } from '../world/biome/Colorizer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

export class BlockGrass extends Block {
  private iconGrassTop: Icon | null = null;
  private iconSnowSide: Icon | null = null;
  private iconGrassSideOverlay: Icon | null = null;
  private static instance: BlockGrass;

  constructor(id: number) {
    super(id, Material.grass);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabBlock);
    BlockGrass.instance = this;
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.iconGrassTop;
    return side === 0 ? Block.blocksList[BlockIds.dirt]!.getBlockTextureFromSide(side) : this.blockIcon;
  }

  override getBlockTexture(w: IBlockAccess, x: number, y: number, z: number, side: number): Icon | null {
    if (side === 1) return this.iconGrassTop;
    if (side === 0) return Block.blocksList[BlockIds.dirt]!.getBlockTextureFromSide(side);
    const above = w.getBlockMaterial(x, y + 1, z);
    return above !== Material.snow && above !== Material.craftedSnow ? this.blockIcon : this.iconSnowSide;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('grass_side');
    this.iconGrassTop = reg.registerIcon('grass_top');
    this.iconSnowSide = reg.registerIcon('snow_side');
    this.iconGrassSideOverlay = reg.registerIcon('grass_side_overlay');
  }

  override getBlockColor(): number {
    return ColorizerGrass.getGrassColor(0.5, 1.0);
  }

  override getRenderColor(_meta: number): number {
    return this.getBlockColor();
  }

  /** Average of the 3x3 biome grass colours around the block. */
  override colorMultiplier(w: IBlockAccess, x: number, _y: number, z: number): number {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = w.getBiomeGenForCoords(x + dx, z + dz).getBiomeGrassColor();
        r += (c & 0xff0000) >> 16;
        g += (c & 0xff00) >> 8;
        b += c & 0xff;
      }
    }
    return ((((r / 9) | 0) & 255) << 16) | ((((g / 9) | 0) & 255) << 8) | (((b / 9) | 0) & 255);
  }

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
          w.setBlock(tx, ty, tz, BlockIds.grass);
        }
      }
    }
  }

  override idDropped(_meta: number, rand: JavaRandom, fortune: number): number {
    return Block.blocksList[BlockIds.dirt]!.idDropped(0, rand, fortune);
  }

  /** The tinted overlay drawn over grass_side in fancy mode. */
  static getIconSideOverlay(): Icon | null {
    return BlockGrass.instance.iconGrassSideOverlay;
  }
}
