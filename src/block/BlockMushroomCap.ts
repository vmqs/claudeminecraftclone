import type { JavaRandom } from '../core/JavaRandom';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import type { Material } from './Material';

/**
 * Huge mushroom blocks (99 brown, 100 red). Metadata picks which faces show the cap:
 * 1-9 the 3x3 top positions (1 north-west ... 9 south-east), 10 stem, 14 cap all over,
 * 15 stem all over, 0 pores only.
 */
export class BlockMushroomCap extends Block {
  private static readonly skinTextures = ['mushroom_skin_brown', 'mushroom_skin_red'];
  private iconSkins: (Icon | null)[] = [];
  private iconStem: Icon | null = null;
  private iconInside: Icon | null = null;

  constructor(
    id: number,
    material: Material,
    private readonly mushroomType: number,
  ) {
    super(id, material);
  }

  override getIcon(side: number, meta: number): Icon | null {
    const skin = this.iconSkins[this.mushroomType];
    if (meta === 10 && side > 1) return this.iconStem;
    if (meta >= 1 && meta <= 9 && side === 1) return skin;
    if (meta >= 1 && meta <= 3 && side === 2) return skin;
    if (meta >= 7 && meta <= 9 && side === 3) return skin;
    if ((meta === 1 || meta === 4 || meta === 7) && side === 4) return skin;
    if ((meta === 3 || meta === 6 || meta === 9) && side === 5) return skin;
    if (meta === 14) return skin;
    return meta === 15 ? this.iconStem : this.iconInside;
  }

  /** 0-2 small mushrooms (nextInt(10) - 7, at least 0). */
  override quantityDropped(rand: JavaRandom): number {
    return Math.max(0, rand.nextInt(10) - 7);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.mushroomBrown + this.mushroomType;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return BlockIds.mushroomBrown + this.mushroomType;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconSkins = BlockMushroomCap.skinTextures.map((n) => reg.registerIcon(n));
    this.iconInside = reg.registerIcon('mushroom_inside');
    this.iconStem = reg.registerIcon('mushroom_skin_stem');
  }
}
