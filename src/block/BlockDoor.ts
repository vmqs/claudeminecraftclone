import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { IconFlipped } from '../render/texture/IconFlipped';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockFenceGate } from './BlockFenceGate';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Doors (64 wood, 71 iron; render type 7). The lower half stores the facing (meta & 3) and
 * the open bit (4); the upper half has bit 8 and the hinge side in bit 1. getFullMetadata
 * combines both: facing | open | 8 if upper | 16 if the hinge is mirrored.
 */
export class BlockDoor extends Block {
  private static readonly doorIconNames = ['doorWood_lower', 'doorWood_upper', 'doorIron_lower', 'doorIron_upper'];
  private readonly doorTypeForIcon: number;
  private iconArray: Icon[] = [];

  constructor(id: number, material: Material) {
    super(id, material);
    this.doorTypeForIcon = material === Material.iron ? 2 : 0;
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override getIcon(_side: number, _meta: number): Icon | null {
    return this.iconArray[this.doorTypeForIcon] ?? null;
  }

  /** Upper or lower texture, mirrored so the handle sits away from the hinge. */
  override getBlockTexture(w: IBlockAccess, x: number, y: number, z: number, side: number): Icon | null {
    if (side === 1 || side === 0) return this.iconArray[this.doorTypeForIcon];
    const full = this.getFullMetadata(w, x, y, z);
    const dir = full & 3;
    const open = (full & 4) !== 0;
    const upper = (full & 8) !== 0;
    let flip = false;
    if (open) {
      if ((dir === 0 && side === 2) || (dir === 1 && side === 5) || (dir === 2 && side === 3) || (dir === 3 && side === 4)) flip = !flip;
    } else {
      if ((dir === 0 && side === 5) || (dir === 1 && side === 3) || (dir === 2 && side === 4) || (dir === 3 && side === 2)) flip = !flip;
      if ((full & 16) !== 0) flip = !flip;
    }
    return this.iconArray[this.doorTypeForIcon + (flip ? BlockDoor.doorIconNames.length : 0) + (upper ? 1 : 0)];
  }

  override registerIcons(reg: IconRegister): void {
    const n = BlockDoor.doorIconNames.length;
    this.iconArray = new Array<Icon>(n * 2);
    for (let i = 0; i < n; i++) {
      this.iconArray[i] = reg.registerIcon(BlockDoor.doorIconNames[i]);
      this.iconArray[i + n] = new IconFlipped(this.iconArray[i], true, false);
    }
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getBlocksMovement(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return (this.getFullMetadata(w, x, y, z) & 4) !== 0;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 7;
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.setDoorRotation(this.getFullMetadata(w, x, y, z));
  }

  getDoorOrientation(w: IBlockAccess, x: number, y: number, z: number): number {
    return this.getFullMetadata(w, x, y, z) & 3;
  }

  isDoorOpen(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return (this.getFullMetadata(w, x, y, z) & 4) !== 0;
  }

  /** A 3/16 thick panel on the side the facing, open bit and hinge choose. */
  private setDoorRotation(full: number): void {
    const t = 0.1875;
    this.setBlockBounds(0, 0, 0, 1, 2, 1);
    const dir = full & 3;
    const open = (full & 4) !== 0;
    const mirrored = (full & 16) !== 0;
    if (dir === 0) {
      if (open) {
        if (!mirrored) this.setBlockBounds(0, 0, 0, 1, 1, t);
        else this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
      } else {
        this.setBlockBounds(0, 0, 0, t, 1, 1);
      }
    } else if (dir === 1) {
      if (open) {
        if (!mirrored) this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
        else this.setBlockBounds(0, 0, 0, t, 1, 1);
      } else {
        this.setBlockBounds(0, 0, 0, 1, 1, t);
      }
    } else if (dir === 2) {
      if (open) {
        if (!mirrored) this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
        else this.setBlockBounds(0, 0, 0, 1, 1, t);
      } else {
        this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
      }
    } else if (dir === 3) {
      if (open) {
        if (!mirrored) this.setBlockBounds(0, 0, 0, t, 1, 1);
        else this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
      } else {
        this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
      }
    }
  }

  override onBlockClicked(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer): void {}

  /** Wooden doors toggle by hand (iron doors only by redstone); the open bit lives in the lower half. */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (this.blockMaterial === Material.iron) return true;
    this.toggle(w, x, y, z, this.getFullMetadata(w, x, y, z));
    BlockFenceGate.playDoorSound(w, p, x, y, z);
    return true;
  }

  private toggle(w: IWorld, x: number, y: number, z: number, full: number): void {
    const lower = (full & 7) ^ 4;
    if ((full & 8) === 0) {
      w.setBlockMetadataWithNotify(x, y, z, lower, 2);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    } else {
      w.setBlockMetadataWithNotify(x, y - 1, z, lower, 2);
      w.markBlockRangeForRenderUpdate(x, y - 1, z, x, y, z);
    }
  }

  onPoweredBlockChange(w: IWorld, x: number, y: number, z: number, powered: boolean): void {
    const full = this.getFullMetadata(w, x, y, z);
    if (((full & 4) !== 0) !== powered) {
      this.toggle(w, x, y, z, full);
      BlockFenceGate.playDoorSound(w, null, x, y, z);
    }
  }

  /** The lower half breaks without the upper half or a solid floor (and drops the door). */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) {
      let broken = false;
      if (w.getBlockId(x, y + 1, z) !== this.blockID) {
        w.setBlockToAir(x, y, z);
        broken = true;
      }
      if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z)) {
        w.setBlockToAir(x, y, z);
        broken = true;
        if (w.getBlockId(x, y + 1, z) === this.blockID) w.setBlockToAir(x, y + 1, z);
      }
      if (broken) {
        if (!w.isRemote) this.dropBlockAsItem(w, x, y, z, meta, 0);
      } else if (Block.hasRedstone(w)) {
        const powered = Block.isPowered(w, x, y, z) || Block.isPowered(w, x, y + 1, z);
        if ((powered || (id > 0 && Block.blocksList[id]?.canProvidePower())) && id !== this.blockID) this.onPoweredBlockChange(w, x, y, z, powered);
      }
    } else {
      if (w.getBlockId(x, y - 1, z) !== this.blockID) w.setBlockToAir(x, y, z);
      if (id > 0 && id !== this.blockID) this.onNeighborBlockChange(w, x, y - 1, z, id);
    }
  }

  override idDropped(meta: number, _rand: JavaRandom, _fortune: number): number {
    if ((meta & 8) !== 0) return 0;
    return this.blockMaterial === Material.iron ? ItemIds.doorIron : ItemIds.doorWood;
  }

  override collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.collisionRayTrace(w, x, y, z, start, end);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    if (y >= 255) return false;
    return w.doesBlockHaveSolidTopSurface(x, y - 1, z) && super.canPlaceBlockAt(w, x, y, z) && super.canPlaceBlockAt(w, x, y + 1, z);
  }

  override getMobilityFlag(): number {
    return 1;
  }

  /** facing | open | 8 (upper half) | 16 (hinge mirrored), read from both halves. */
  getFullMetadata(w: IBlockAccess, x: number, y: number, z: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    const upper = (meta & 8) !== 0;
    const lowerMeta = upper ? w.getBlockMetadata(x, y - 1, z) : meta;
    const upperMeta = upper ? meta : w.getBlockMetadata(x, y + 1, z);
    const mirrored = (upperMeta & 1) !== 0;
    return (lowerMeta & 7) | (upper ? 8 : 0) | (mirrored ? 16 : 0);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return this.blockMaterial === Material.iron ? ItemIds.doorIron : ItemIds.doorWood;
  }

  /** Breaking the upper half in creative removes the lower half first, so nothing drops. */
  override onBlockHarvested(w: IWorld, x: number, y: number, z: number, meta: number, p: EntityPlayer): void {
    if (p.capabilities.isCreativeMode && (meta & 8) !== 0 && w.getBlockId(x, y - 1, z) === this.blockID) w.setBlockToAir(x, y - 1, z);
  }

  /**
   * ItemDoor.placeDoorBlock: the two halves, with the hinge mirrored when the door would
   * otherwise open into a wall or next to another door.
   */
  static placeDoorBlock(w: IWorld, x: number, y: number, z: number, dir: number, door: Block): void {
    let dx = 0;
    let dz = 0;
    if (dir === 0) dz = 1;
    if (dir === 1) dx = -1;
    if (dir === 2) dz = -1;
    if (dir === 3) dx = 1;
    const solidLeft = (w.isBlockNormalCube(x - dx, y, z - dz) ? 1 : 0) + (w.isBlockNormalCube(x - dx, y + 1, z - dz) ? 1 : 0);
    const solidRight = (w.isBlockNormalCube(x + dx, y, z + dz) ? 1 : 0) + (w.isBlockNormalCube(x + dx, y + 1, z + dz) ? 1 : 0);
    const doorLeft = w.getBlockId(x - dx, y, z - dz) === door.blockID || w.getBlockId(x - dx, y + 1, z - dz) === door.blockID;
    const doorRight = w.getBlockId(x + dx, y, z + dz) === door.blockID || w.getBlockId(x + dx, y + 1, z + dz) === door.blockID;
    let mirrored = false;
    if (doorLeft && !doorRight) mirrored = true;
    else if (solidRight > solidLeft) mirrored = true;
    w.setBlock(x, y, z, door.blockID, dir, 2);
    w.setBlock(x, y + 1, z, door.blockID, 8 | (mirrored ? 1 : 0), 2);
    w.notifyBlocksOfNeighborChange(x, y, z, door.blockID);
    w.notifyBlocksOfNeighborChange(x, y + 1, z, door.blockID);
  }
}
