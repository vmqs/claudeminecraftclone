import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { Facing } from '../../core/Facing';
import type { Entity } from '../../entity/Entity';
import type { TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';
import { NBT } from '../storage/NBT';

const f = Math.fround;

/** BlockPistonMoving.getAxisAlignedBB as the piston tile entity uses it. */
interface MovingBlockBounds {
  getAxisAlignedBB(w: IWorld, x: number, y: number, z: number, blockId: number, progress: number, orientation: number): AxisAlignedBB | null;
}

/**
 * A block being moved by a piston (TileEntityPiston) inside a block 36: the block it carries,
 * the direction, and the 0..1 progress that the renderer and collision boxes follow.
 */
export class TileEntityPiston extends TileEntity {
  private storedBlockID = 0;
  private storedMetadata = 0;
  private storedOrientation = 0;
  private extending = false;
  private shouldHeadBeRendered = false;
  private progress = 0;
  private lastProgress = 0;
  private readonly pushedObjects: Entity[] = [];

  constructor(blockId = 0, meta = 0, orientation = 0, extending = false, renderHead = false) {
    super();
    this.storedBlockID = blockId;
    this.storedMetadata = meta;
    this.storedOrientation = orientation;
    this.extending = extending;
    this.shouldHeadBeRendered = renderHead;
  }

  getStoredBlockID(): number {
    return this.storedBlockID;
  }

  override getBlockMetadata(): number {
    return this.storedMetadata;
  }

  isExtending(): boolean {
    return this.extending;
  }

  getPistonOrientation(): number {
    return this.storedOrientation;
  }

  shouldRenderHead(): boolean {
    return this.shouldHeadBeRendered;
  }

  getProgress(pt: number): number {
    if (pt > 1) pt = 1;
    return f(this.lastProgress + f(f(this.progress - this.lastProgress) * pt));
  }

  private offset(pt: number, axis: readonly number[]): number {
    const p = this.getProgress(pt);
    return this.extending ? f(f(p - 1) * axis[this.storedOrientation]) : f(f(1 - p) * axis[this.storedOrientation]);
  }

  getOffsetX(pt: number): number {
    return this.offset(pt, Facing.offsetsXForSide);
  }

  getOffsetY(pt: number): number {
    return this.offset(pt, Facing.offsetsYForSide);
  }

  getOffsetZ(pt: number): number {
    return this.offset(pt, Facing.offsetsZForSide);
  }

  /** Moves entities in the way of the moving block along with it. */
  private updatePushedObjects(progress: number, step: number): void {
    progress = this.extending ? f(1 - progress) : f(progress - 1);
    const moving = Block.blocksList[BlockIds.pistonMoving] as unknown as Partial<MovingBlockBounds> | null;
    const w = this.worldObj!;
    const box = moving?.getAxisAlignedBB?.(w, this.xCoord, this.yCoord, this.zCoord, this.storedBlockID, progress, this.storedOrientation) ?? null;
    if (!box) return;
    const list = w.getEntitiesWithinAABBExcludingEntity(null, box);
    if (list.length === 0) return;
    this.pushedObjects.push(...list);
    const o = this.storedOrientation;
    for (const e of this.pushedObjects) {
      e.moveEntity(f(step * Facing.offsetsXForSide[o]), f(step * Facing.offsetsYForSide[o]), f(step * Facing.offsetsZForSide[o]));
    }
    this.pushedObjects.length = 0;
  }

  /** Finishes the move at once (the piston retracted again before it ended). */
  clearPistonTileEntity(): void {
    const w = this.worldObj;
    if (this.lastProgress < 1 && w) {
      this.lastProgress = this.progress = 1;
      w.removeBlockTileEntity(this.xCoord, this.yCoord, this.zCoord);
      this.invalidate();
      this.placeStoredBlock(w);
    }
  }

  private placeStoredBlock(w: IWorld): void {
    if (w.getBlockId(this.xCoord, this.yCoord, this.zCoord) === BlockIds.pistonMoving) {
      w.setBlock(this.xCoord, this.yCoord, this.zCoord, this.storedBlockID, this.storedMetadata, 3);
      w.notifyBlockOfNeighborChange(this.xCoord, this.yCoord, this.zCoord, this.storedBlockID);
    }
  }

  override updateEntity(): void {
    this.lastProgress = this.progress;
    const w = this.worldObj!;
    if (this.lastProgress >= 1) {
      this.updatePushedObjects(1, 0.25);
      w.removeBlockTileEntity(this.xCoord, this.yCoord, this.zCoord);
      this.invalidate();
      this.placeStoredBlock(w);
    } else {
      this.progress = f(this.progress + 0.5);
      if (this.progress >= 1) this.progress = 1;
      if (this.extending) this.updatePushedObjects(this.progress, f(f(this.progress - this.lastProgress) + f(0.0625)));
    }
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.storedBlockID = nbt.getInt(tag, 'blockId');
    this.storedMetadata = nbt.getInt(tag, 'blockData');
    this.storedOrientation = nbt.getInt(tag, 'facing');
    this.lastProgress = this.progress = nbt.getFloat(tag, 'progress');
    this.extending = nbt.getBoolean(tag, 'extending');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    NBT.setInteger(tag, 'blockId', this.storedBlockID);
    NBT.setInteger(tag, 'blockData', this.storedMetadata);
    NBT.setInteger(tag, 'facing', this.storedOrientation);
    NBT.setFloat(tag, 'progress', this.lastProgress);
    NBT.setBoolean(tag, 'extending', this.extending);
  }
}
