import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Fences (85 wood, 113 nether brick; render type 11): a post that connects to fences, fence
 * gates and opaque full blocks (not pumpkins); the collision boxes are 1.5 blocks high.
 */
export class BlockFence extends Block {
  constructor(
    id: number,
    private readonly textureName: string,
    material: Material,
  ) {
    super(id, material);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    const n = this.canConnectFenceTo(w, x, y, z - 1);
    const s = this.canConnectFenceTo(w, x, y, z + 1);
    const west = this.canConnectFenceTo(w, x - 1, y, z);
    const east = this.canConnectFenceTo(w, x + 1, y, z);
    let minX = 0.375;
    let maxX = 0.625;
    let minZ = 0.375;
    let maxZ = 0.625;
    if (n) minZ = 0;
    if (s) maxZ = 1;
    if (n || s) {
      this.setBlockBounds(minX, 0, minZ, maxX, 1.5, maxZ);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    }
    minZ = 0.375;
    maxZ = 0.625;
    if (west) minX = 0;
    if (east) maxX = 1;
    if (west || east || (!n && !s)) {
      this.setBlockBounds(minX, 0, minZ, maxX, 1.5, maxZ);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    }
    if (n) minZ = 0;
    if (s) maxZ = 1;
    this.setBlockBounds(minX, 0, minZ, maxX, 1, maxZ);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const n = this.canConnectFenceTo(w, x, y, z - 1);
    const s = this.canConnectFenceTo(w, x, y, z + 1);
    const west = this.canConnectFenceTo(w, x - 1, y, z);
    const east = this.canConnectFenceTo(w, x + 1, y, z);
    this.setBlockBounds(west ? 0 : 0.375, 0, n ? 0 : 0.375, east ? 1 : 0.625, 1, s ? 1 : 0.625);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  override getRenderType(): number {
    return 11;
  }

  canConnectFenceTo(w: IBlockAccess, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === this.blockID || id === BlockIds.fenceGate) return true;
    const b = Block.blocksList[id];
    return b !== null && b.blockMaterial.isOpaque() && b.renderAsNormalBlock() ? b.blockMaterial !== Material.pumpkin : false;
  }

  static isIdAFence(id: number): boolean {
    return id === BlockIds.fence || id === BlockIds.netherFence;
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): boolean {
    return true;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.textureName);
  }
}
