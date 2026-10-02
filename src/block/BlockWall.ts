import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Cobblestone walls (139; 0 plain, 1 mossy; render type 32): a post, or a lower straight
 * section between two opposite connections; collision is 1.5 blocks high.
 */
export class BlockWall extends Block {
  static readonly types = ['normal', 'mossy'];

  constructor(id: number, model: Block) {
    super(id, model.blockMaterial);
    this.setHardness(model.getRawHardness());
    this.setResistance(model.getRawResistance() / 3);
    this.setStepSound(model.stepSound);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    return meta === 1 ? Block.blocksList[BlockIds.cobblestoneMossy]!.getBlockTextureFromSide(side) : Block.blocksList[BlockIds.cobblestone]!.getBlockTextureFromSide(side);
  }

  override getRenderType(): number {
    return 32;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const n = this.canConnectWallTo(w, x, y, z - 1);
    const s = this.canConnectWallTo(w, x, y, z + 1);
    const west = this.canConnectWallTo(w, x - 1, y, z);
    const east = this.canConnectWallTo(w, x + 1, y, z);
    let minX = 0.25;
    let maxX = 0.75;
    let minZ = 0.25;
    let maxZ = 0.75;
    let maxY = 1;
    if (n) minZ = 0;
    if (s) maxZ = 1;
    if (west) minX = 0;
    if (east) maxX = 1;
    if (n && s && !west && !east) {
      maxY = 0.8125;
      minX = 0.3125;
      maxX = 0.6875;
    } else if (!n && !s && west && east) {
      maxY = 0.8125;
      minZ = 0.3125;
      maxZ = 0.6875;
    }
    this.setBlockBounds(minX, 0, minZ, maxX, maxY, maxZ);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    this.maxY = 1.5;
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  canConnectWallTo(w: IBlockAccess, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === this.blockID || id === BlockIds.fenceGate) return true;
    const b = Block.blocksList[id];
    return b !== null && b.blockMaterial.isOpaque() && b.renderAsNormalBlock() ? b.blockMaterial !== Material.pumpkin : false;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0), new ItemStack(id, 1, 1));
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    return side === 0 ? super.shouldSideBeRendered(w, x, y, z, side) : true;
  }

  override registerIcons(_reg: IconRegister): void {}
}
