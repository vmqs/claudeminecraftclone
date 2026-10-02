import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/** What eating needs from the player (EntityPlayer.canEat / getFoodStats). */
interface EatingPlayer {
  canEat?(always: boolean): boolean;
  getFoodStats?(): { addStats(food: number, saturation: number): void } | null;
}

/**
 * Cake (92): meta = slices eaten (0-5), cut from the west side. Eating needs hunger, and
 * EntityPlayer.canEat is false while damage is disabled, so a creative player cannot eat it.
 */
export class BlockCake extends Block {
  private iconTop: Icon | null = null;
  private iconBottom: Icon | null = null;
  private iconInner: Icon | null = null;

  constructor(id: number) {
    super(id, Material.cake);
    this.setTickRandomly(true);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const eaten = w.getBlockMetadata(x, y, z);
    const e = 0.0625;
    this.setBlockBounds(f((1 + eaten * 2) / 16), 0, e, 1 - e, 0.5, 1 - e);
  }

  override setBlockBoundsForItemRender(): void {
    const e = 0.0625;
    this.setBlockBounds(e, 0, e, 1 - e, 0.5, 1 - e);
  }

  /** The collision box is 1/16 lower than the cake (you sink in a little). */
  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const eaten = w.getBlockMetadata(x, y, z);
    const e = f(0.0625);
    const west = f((1 + eaten * 2) / 16);
    return AxisAlignedBB.getBoundingBox(f(x + west), y, f(z + e), f(x + 1 - e), f(f(y + 0.5) - e), f(z + 1 - e));
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    const eaten = w.getBlockMetadata(x, y, z);
    const e = f(0.0625);
    const west = f((1 + eaten * 2) / 16);
    return AxisAlignedBB.getBoundingBox(f(x + west), y, f(z + e), f(x + 1 - e), f(y + 0.5), f(z + 1 - e));
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 1) return this.iconTop;
    if (side === 0) return this.iconBottom;
    return meta > 0 && side === 4 ? this.iconInner : this.blockIcon;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('cake_side');
    this.iconInner = reg.registerIcon('cake_inner');
    this.iconTop = reg.registerIcon('cake_top');
    this.iconBottom = reg.registerIcon('cake_bottom');
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    this.eatCakeSlice(w, x, y, z, p);
    return true;
  }

  override onBlockClicked(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): void {
    this.eatCakeSlice(w, x, y, z, p);
  }

  private eatCakeSlice(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): void {
    const eater = p as unknown as EatingPlayer;
    // canEat(false) = hungry && damage enabled; with no food stats only the creative check is known.
    const canEat = eater.canEat ? eater.canEat(false) : false;
    if (!canEat) return;
    eater.getFoodStats?.()?.addStats(2, 0.1);
    const eaten = w.getBlockMetadata(x, y, z) + 1;
    if (eaten >= 6) w.setBlockToAir(x, y, z);
    else w.setBlockMetadataWithNotify(x, y, z, eaten, 2);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return !super.canPlaceBlockAt(w, x, y, z) ? false : this.canBlockStay(w, x, y, z);
  }

  /** Vanishes (no drop) without a solid block below. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!this.canBlockStay(w, x, y, z)) w.setBlockToAir(x, y, z);
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    return w.getBlockMaterial(x, y - 1, z).isSolid();
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.cake;
  }
}
