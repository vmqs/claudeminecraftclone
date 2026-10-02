import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/**
 * Buttons (77 stone, 143 wood; drawn as a box from their bounds). meta & 7 = the wall
 * (1 east, 2 west, 3 south, 4 north facing), bit 8 = pressed. A press clicks and releases after
 * tickRate (20 ticks stone, 30 wood); wooden buttons are also held down by arrows.
 */
export abstract class BlockButton extends Block {
  constructor(
    id: number,
    private readonly sensible: boolean,
  ) {
    super(id, Material.circuits);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override tickRate(_w: IWorld): number {
    return this.sensible ? 30 : 20;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override canPlaceBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 2 && w.isBlockNormalCube(x, y, z + 1)) return true;
    if (side === 3 && w.isBlockNormalCube(x, y, z - 1)) return true;
    if (side === 4 && w.isBlockNormalCube(x + 1, y, z)) return true;
    return side === 5 && w.isBlockNormalCube(x - 1, y, z);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.isBlockNormalCube(x - 1, y, z) || w.isBlockNormalCube(x + 1, y, z) || w.isBlockNormalCube(x, y, z - 1) || w.isBlockNormalCube(x, y, z + 1);
  }

  override onBlockPlaced(w: IWorld, x: number, y: number, z: number, side: number, _hx: number, _hy: number, _hz: number, _meta: number): number {
    const old = w.getBlockMetadata(x, y, z);
    const pressed = old & 8;
    let pos: number;
    if (side === 2 && w.isBlockNormalCube(x, y, z + 1)) pos = 4;
    else if (side === 3 && w.isBlockNormalCube(x, y, z - 1)) pos = 3;
    else if (side === 4 && w.isBlockNormalCube(x + 1, y, z)) pos = 2;
    else if (side === 5 && w.isBlockNormalCube(x - 1, y, z)) pos = 1;
    else pos = this.getOrientation(w, x, y, z);
    return pos + pressed;
  }

  private getOrientation(w: IWorld, x: number, y: number, z: number): number {
    if (w.isBlockNormalCube(x - 1, y, z)) return 1;
    if (w.isBlockNormalCube(x + 1, y, z)) return 2;
    if (w.isBlockNormalCube(x, y, z - 1)) return 3;
    return w.isBlockNormalCube(x, y, z + 1) ? 4 : 1;
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!this.redundantCanPlaceBlockAt(w, x, y, z)) return;
    const pos = w.getBlockMetadata(x, y, z) & 7;
    let drop = false;
    if (!w.isBlockNormalCube(x - 1, y, z) && pos === 1) drop = true;
    if (!w.isBlockNormalCube(x + 1, y, z) && pos === 2) drop = true;
    if (!w.isBlockNormalCube(x, y, z - 1) && pos === 3) drop = true;
    if (!w.isBlockNormalCube(x, y, z + 1) && pos === 4) drop = true;
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  private redundantCanPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    if (this.canPlaceBlockAt(w, x, y, z)) return true;
    this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
    w.setBlockToAir(x, y, z);
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.setButtonBounds(w.getBlockMetadata(x, y, z));
  }

  /** func_82534_e: 6x4 pixels on the wall, 2 pixels deep (1 when pressed). */
  private setButtonBounds(meta: number): void {
    const pos = meta & 7;
    const lo = 0.375;
    const hi = 0.625;
    const half = 0.1875;
    const depth = (meta & 8) > 0 ? 0.0625 : 0.125;
    if (pos === 1) this.setBlockBounds(0, lo, 0.5 - half, depth, hi, 0.5 + half);
    else if (pos === 2) this.setBlockBounds(1 - depth, lo, 0.5 - half, 1, hi, 0.5 + half);
    else if (pos === 3) this.setBlockBounds(0.5 - half, lo, 0, 0.5 + half, hi, depth);
    else if (pos === 4) this.setBlockBounds(0.5 - half, lo, 1 - depth, 0.5 + half, hi, 1);
  }

  override onBlockClicked(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer): void {}

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    const pos = meta & 7;
    const press = 8 - (meta & 8);
    if (press === 0) return true;
    w.setBlockMetadataWithNotify(x, y, z, pos + press, 3);
    w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, 0.6);
    this.notifyNeighbors(w, x, y, z, pos);
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
    return true;
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    if ((meta & 8) > 0) this.notifyNeighbors(w, x, y, z, meta & 7);
    super.breakBlock(w, x, y, z, id, meta);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return (w.getBlockMetadata(x, y, z) & 8) > 0 ? 15 : 0;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) return 0;
    const pos = meta & 7;
    if (pos === 5 && side === 1) return 15;
    if (pos === 4 && side === 2) return 15;
    if (pos === 3 && side === 3) return 15;
    if (pos === 2 && side === 4) return 15;
    return pos === 1 && side === 5 ? 15 : 0;
  }

  override canProvidePower(): boolean {
    return true;
  }

  /** The scheduled release (wooden buttons stay down while an arrow is in them). */
  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) return;
    if (this.sensible) {
      this.updateArrowState(w, x, y, z);
    } else {
      w.setBlockMetadataWithNotify(x, y, z, meta & 7, 3);
      this.notifyNeighbors(w, x, y, z, meta & 7);
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, 0.5);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    }
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0.5 - 0.1875, 0.5 - 0.125, 0.5 - 0.125, 0.5 + 0.1875, 0.5 + 0.125, 0.5 + 0.125);
  }

  override onEntityCollidedWithBlock(w: IWorld, x: number, y: number, z: number, _e: Entity): void {
    if (!w.isRemote && this.sensible && (w.getBlockMetadata(x, y, z) & 8) === 0) this.updateArrowState(w, x, y, z);
  }

  /** func_82535_o: pressed while an arrow sits in the button's box. */
  private updateArrowState(w: IWorld, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const pos = meta & 7;
    const pressed = (meta & 8) !== 0;
    this.setButtonBounds(meta);
    const box = AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, y + this.maxY, z + this.maxZ);
    const arrow = w.getEntitiesWithinAABBExcludingEntity(null, box).some((e) => EntityList.getEntityString(e) === 'Arrow');
    if (arrow && !pressed) {
      w.setBlockMetadataWithNotify(x, y, z, pos | 8, 3);
      this.notifyNeighbors(w, x, y, z, pos);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, 0.6);
    }
    if (!arrow && pressed) {
      w.setBlockMetadataWithNotify(x, y, z, pos, 3);
      this.notifyNeighbors(w, x, y, z, pos);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, 0.5);
    }
    if (arrow) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  /** func_82536_d: updates around the button and around the block it is on. */
  private notifyNeighbors(w: IWorld, x: number, y: number, z: number, pos: number): void {
    w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
    if (pos === 1) w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    else if (pos === 2) w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    else if (pos === 3) w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    else if (pos === 4) w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
    else w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
  }

  override registerIcons(_reg: IconRegister): void {}
}

/** Stone button (77): released after 20 ticks. */
export class BlockButtonStone extends BlockButton {
  constructor(id: number) {
    super(id, false);
  }

  override getIcon(_side: number, _meta: number): import('../render/texture/Icon').Icon | null {
    return Block.blocksList[1]!.getBlockTextureFromSide(1);
  }
}

/** Wooden button (143): released after 30 ticks, pressed by arrows. */
export class BlockButtonWood extends BlockButton {
  constructor(id: number) {
    super(id, true);
  }

  override getIcon(_side: number, _meta: number): import('../render/texture/Icon').Icon | null {
    return Block.blocksList[5]!.getBlockTextureFromSide(1);
  }
}
