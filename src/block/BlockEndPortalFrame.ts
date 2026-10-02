import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * End portal frame (120): 13/16 high, facing in metadata bits 0-1, an inserted eye of ender in
 * bit 2 (drawn and collided as a small cap on top). Unbreakable; drops nothing.
 */
export class BlockEndPortalFrame extends Block {
  private topIcon: Icon | null = null;
  private eyeIcon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.rock);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.topIcon;
    return side === 0 ? Block.blocksList[BlockIds.whiteStone]!.getBlockTextureFromSide(side) : this.blockIcon;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('endframe_side');
    this.topIcon = reg.registerIcon('endframe_top');
    this.eyeIcon = reg.registerIcon('endframe_eye');
  }

  /** func_94398_p: the eye of ender inlay. */
  func_94398_p(): Icon | null {
    return this.eyeIcon;
  }

  getEyeIcon(): Icon | null {
    return this.eyeIcon;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 26;
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 0.8125, 1);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    this.setBlockBounds(0, 0, 0, 1, 0.8125, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    if (BlockEndPortalFrame.isEnderEyeInserted(w.getBlockMetadata(x, y, z))) {
      this.setBlockBounds(0.3125, 0.8125, 0.3125, 0.6875, 1, 0.6875);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    }
    this.setBlockBoundsForItemRender();
  }

  static isEnderEyeInserted(meta: number): boolean {
    return (meta & 4) !== 0;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  /** Faces the placer: ((yaw quadrant) + 2) % 4. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    const dir = ((Block.yawToDirection(e) & 3) + 2) % 4;
    w.setBlockMetadataWithNotify(x, y, z, dir, 2);
  }
}
