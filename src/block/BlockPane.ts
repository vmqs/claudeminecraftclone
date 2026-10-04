import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import type { Material } from './Material';

/**
 * Iron bars (101) and glass panes (102), render type 18: thin plates that join opaque cubes,
 * glass and each other. Glass panes drop nothing.
 */
export class BlockPane extends Block {
  private iconSide: Icon | null = null;

  constructor(
    id: number,
    private readonly faceTexture: string,
    private readonly sideTexture: string,
    material: Material,
    private readonly canDropItself: boolean,
  ) {
    super(id, material);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override idDropped(meta: number, rand: JavaRandom, fortune: number): number {
    return !this.canDropItself ? 0 : super.idDropped(meta, rand, fortune);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 18;
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    return w.getBlockId(x, y, z) === this.blockID ? false : super.shouldSideBeRendered(w, x, y, z, side);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    const n = this.canThisPaneConnectToThisBlockID(w.getBlockId(x, y, z - 1));
    const s = this.canThisPaneConnectToThisBlockID(w.getBlockId(x, y, z + 1));
    const west = this.canThisPaneConnectToThisBlockID(w.getBlockId(x - 1, y, z));
    const east = this.canThisPaneConnectToThisBlockID(w.getBlockId(x + 1, y, z));
    const any = west || east || n || s;
    if ((!west || !east) && any) {
      if (west && !east) {
        this.setBlockBounds(0, 0, 0.4375, 0.5, 1, 0.5625);
        super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
      } else if (!west && east) {
        this.setBlockBounds(0.5, 0, 0.4375, 1, 1, 0.5625);
        super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
      }
    } else {
      this.setBlockBounds(0, 0, 0.4375, 1, 1, 0.5625);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    }
    if ((!n || !s) && any) {
      if (n && !s) {
        this.setBlockBounds(0.4375, 0, 0, 0.5625, 1, 0.5);
        super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
      } else if (!n && s) {
        this.setBlockBounds(0.4375, 0, 0.5, 0.5625, 1, 1);
        super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
      }
    } else {
      this.setBlockBounds(0.4375, 0, 0, 0.5625, 1, 1);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    }
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    let minX = 0.4375;
    let maxX = 0.5625;
    let minZ = 0.4375;
    let maxZ = 0.5625;
    const n = this.canThisPaneConnectToThisBlockID(w.getBlockId(x, y, z - 1));
    const s = this.canThisPaneConnectToThisBlockID(w.getBlockId(x, y, z + 1));
    const west = this.canThisPaneConnectToThisBlockID(w.getBlockId(x - 1, y, z));
    const east = this.canThisPaneConnectToThisBlockID(w.getBlockId(x + 1, y, z));
    const any = west || east || n || s;
    if ((!west || !east) && any) {
      if (west && !east) minX = 0;
      else if (!west && east) maxX = 1;
    } else {
      minX = 0;
      maxX = 1;
    }
    if ((!n || !s) && any) {
      if (n && !s) minZ = 0;
      else if (!n && s) maxZ = 1;
    } else {
      minZ = 0;
      maxZ = 1;
    }
    this.setBlockBounds(minX, 0, minZ, maxX, 1, maxZ);
  }

  /** The texture of the pane's thin edges. */
  getSideTextureIndex(): Icon | null {
    return this.iconSide;
  }

  canThisPaneConnectToThisBlockID(id: number): boolean {
    return Block.opaqueCubeLookup[id] || id === this.blockID || id === BlockIds.glass;
  }

  protected override canSilkHarvest(): boolean {
    return true;
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return new ItemStack(this.blockID, 1, meta);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.faceTexture);
    this.iconSide = reg.registerIcon(this.sideTexture);
  }
}
