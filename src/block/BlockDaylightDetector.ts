import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { EnumSkyBlock, type IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityDaylightDetector } from '../world/tileentity/TileEntityDaylightDetector';
import { BlockContainer } from './BlockContainer';
import { Material } from './Material';

/** Daylight sensor (151): a 6/16 slab whose metadata is the sky light (re-read every 20 ticks). */
export class BlockDaylightDetector extends BlockContainer {
  private iconArray: (Icon | null)[] = [null, null];

  constructor(id: number) {
    super(id, Material.wood);
    this.setBlockBounds(0, 0, 0, 1, 0.375, 1);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {
    this.setBlockBounds(0, 0, 0, 1, 0.375, 1);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return w.getBlockMetadata(x, y, z);
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {}

  override onNeighborBlockChange(_w: IWorld, _x: number, _y: number, _z: number, _id: number): void {}

  override onBlockAdded(_w: IWorld, _x: number, _y: number, _z: number): void {}

  /** Sky light minus the darkening of the hour, scaled by the cosine of the sun's angle. */
  updateLightLevel(w: IWorld, x: number, y: number, z: number): void {
    if (w.provider.hasNoSky) return;
    const world = w as unknown as { skylightSubtracted?: number; getCelestialAngleRadians?: (pt: number) => number };
    const meta = w.getBlockMetadata(x, y, z);
    let light = w.getSavedLightValue(EnumSkyBlock.Sky, x, y, z) - (world.skylightSubtracted ?? 0);
    const f = Math.fround;
    let angle = f(world.getCelestialAngleRadians?.(1) ?? 0);
    const PI = f(Math.PI);
    if (angle < PI) angle = f(angle + f(f(0 - angle) * f(0.2)));
    else angle = f(angle + f(f(f(Math.PI * 2) - angle) * f(0.2)));
    light = Math.round(f(light * MathHelper.cos(angle)));
    if (light < 0) light = 0;
    if (light > 15) light = 15;
    if (meta !== light) w.setBlockMetadataWithNotify(x, y, z, light, 3);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override canProvidePower(): boolean {
    return true;
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityDaylightDetector();
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side === 1 ? this.iconArray[0] : this.iconArray[1];
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray[0] = reg.registerIcon('daylightDetector_top');
    this.iconArray[1] = reg.registerIcon('daylightDetector_side');
  }
}
