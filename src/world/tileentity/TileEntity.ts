import { Block } from '../../block/Block';
import type { TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';

export type TileEntityConstructor = new () => TileEntity;

/**
 * Per-block data and behaviour (TileEntity): chests, furnaces, signs, spawners, pistons...
 * Worker-safe: world generation creates tile entities in the worker (dungeon spawners and
 * chests), serialises them with writeToNBT into the chunk payload, and the main thread
 * recreates them with createAndLoadEntity. Each subclass registers its 1.5.2 savegame id in
 * src/world/tileentity/TileEntities.ts.
 */
export class TileEntity {
  private static readonly nameToClassMap = new Map<string, TileEntityConstructor>();
  private static readonly classToNameMap = new Map<TileEntityConstructor, string>();

  worldObj: IWorld | null = null;
  xCoord = 0;
  yCoord = 0;
  zCoord = 0;
  protected tileEntityInvalid = false;
  /** Cached block metadata (-1 = read from the world on demand). */
  blockMetadata = -1;
  blockType: Block | null = null;

  static addMapping(cls: TileEntityConstructor, id: string): void {
    if (TileEntity.nameToClassMap.has(id)) throw new Error(`Duplicate tile entity id: ${id}`);
    TileEntity.nameToClassMap.set(id, cls);
    TileEntity.classToNameMap.set(cls, id);
  }

  getWorldObj(): IWorld | null {
    return this.worldObj;
  }

  setWorldObj(w: IWorld | null): void {
    this.worldObj = w;
  }

  /** func_70309_m */
  hasWorldObj(): boolean {
    return this.worldObj !== null;
  }

  readFromNBT(tag: TagCompound): void {
    this.xCoord = Number(tag.x ?? 0);
    this.yCoord = Number(tag.y ?? 0);
    this.zCoord = Number(tag.z ?? 0);
  }

  writeToNBT(tag: TagCompound): void {
    const id = TileEntity.classToNameMap.get(this.constructor as TileEntityConstructor);
    if (id === undefined) throw new Error(`${this.constructor.name} is missing a TileEntity mapping`);
    tag.id = id;
    tag.x = this.xCoord;
    tag.y = this.yCoord;
    tag.z = this.zCoord;
  }

  /** Ticked every game tick while loaded. */
  updateEntity(): void {}

  /** createAndLoadEntity: a new tile entity from a descriptor, or null for unknown ids. */
  static createAndLoadEntity(tag: TagCompound): TileEntity | null {
    const cls = TileEntity.nameToClassMap.get(String(tag.id));
    if (!cls) {
      console.warn(`Skipping TileEntity with id ${String(tag.id)}`);
      return null;
    }
    const te = new cls();
    te.readFromNBT(tag);
    return te;
  }

  getBlockMetadata(): number {
    if (this.blockMetadata === -1) this.blockMetadata = this.worldObj!.getBlockMetadata(this.xCoord, this.yCoord, this.zCoord);
    return this.blockMetadata;
  }

  /** Contents changed: refresh the cached metadata and let the world know (comparators). */
  onInventoryChanged(): void {
    const w = this.worldObj;
    if (!w) return;
    this.blockMetadata = w.getBlockMetadata(this.xCoord, this.yCoord, this.zCoord);
    w.updateTileEntityChunkAndDoNothing(this.xCoord, this.yCoord, this.zCoord, this);
    const b = this.getBlockType();
    if (b) w.notifyComparatorsOfChange(this.xCoord, this.yCoord, this.zCoord, b.blockID);
  }

  /** Squared distance from the block centre. */
  getDistanceFrom(x: number, y: number, z: number): number {
    const dx = this.xCoord + 0.5 - x;
    const dy = this.yCoord + 0.5 - y;
    const dz = this.zCoord + 0.5 - z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** The special renderer draws it within 64 blocks. */
  getMaxRenderDistanceSquared(): number {
    return 4096;
  }

  getBlockType(): Block | null {
    this.blockType ??= Block.blocksList[this.worldObj!.getBlockId(this.xCoord, this.yCoord, this.zCoord)];
    return this.blockType;
  }

  isInvalid(): boolean {
    return this.tileEntityInvalid;
  }

  invalidate(): void {
    this.tileEntityInvalid = true;
  }

  validate(): void {
    this.tileEntityInvalid = false;
  }

  /** Block events (World.addBlockEvent): chest lid, note block, piston. */
  receiveClientEvent(_id: number, _param: number): boolean {
    return false;
  }

  updateContainingBlockInfo(): void {
    this.blockType = null;
    this.blockMetadata = -1;
  }
}

/** Blocks that own a tile entity (ITileEntityProvider). */
export interface ITileEntityProvider {
  createNewTileEntity(world: IWorld): TileEntity | null;
}

export function isTileEntityProvider(b: unknown): b is ITileEntityProvider {
  return typeof (b as Partial<ITileEntityProvider> | null)?.createNewTileEntity === 'function';
}
