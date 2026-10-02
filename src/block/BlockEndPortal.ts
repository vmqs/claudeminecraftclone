import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityEndPortal } from '../world/tileentity/TileEntityEndPortal';
import { BlockContainer } from './BlockContainer';
import type { Material } from './Material';

const fround = Math.fround;

/**
 * End portal (119): a full-bright 1/16 high sheet drawn by its tile-entity renderer (render
 * type -1). Walking in would send the entity to the End, which this recreation does not have.
 */
export class BlockEndPortal extends BlockContainer {
  /** Set once the dragon is dead; until then portals outside the overworld vanish when placed. */
  static bossDefeated = false;

  constructor(id: number, material: Material) {
    super(id, material);
    this.setLightValue(1);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityEndPortal();
  }

  override setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {
    this.setBlockBounds(0, 0, 0, 1, 0.0625, 1);
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    return side !== 0 ? false : super.shouldSideBeRendered(w, x, y, z, side);
  }

  override addCollisionBoxesToList(_w: IWorld, _x: number, _y: number, _z: number, _mask: AxisAlignedBB, _list: AxisAlignedBB[], _e: Entity | null): void {}

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, _e: Entity): void {
    // The original calls entity.travelToDimension(1) (the End) for unridden entities on the
    // server; there is no End here, so nothing happens.
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    const px = fround(x + rand.nextFloat());
    const py = fround(y + fround(0.8));
    const pz = fround(z + rand.nextFloat());
    w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
  }

  override getRenderType(): number {
    return -1;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (!BlockEndPortal.bossDefeated && w.provider.dimensionId !== 0) w.setBlockToAir(x, y, z);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('portal');
  }
}
