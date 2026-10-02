import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

interface Pos {
  x: number;
  y: number;
  z: number;
}

/**
 * Rails (BlockRailBase, render type 9). Shapes: 0 north-south, 1 east-west, 2-5 ascending
 * east, west, north, south, 6-9 curves (normal rails only). Powered, detector and activator
 * rails keep bit 8 for "on" and only go straight.
 */
export abstract class BlockRailBase extends Block {
  protected readonly isPoweredRail: boolean;

  static isRailBlockAt(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return BlockRailBase.isRailBlock(w.getBlockId(x, y, z));
  }

  static isRailBlock(id: number): boolean {
    return id === BlockIds.rail || id === BlockIds.railPowered || id === BlockIds.railDetector || id === BlockIds.railActivator;
  }

  constructor(id: number, powered: boolean) {
    super(id, Material.circuits);
    this.isPoweredRail = powered;
    this.setBlockBounds(0, 0, 0, 1, 0.125, 1);
    this.setCreativeTab(CreativeTabs.tabTransport);
  }

  /** isPowered(): whether the rail keeps an "on" bit (and cannot curve). */
  isPowered(): boolean {
    return this.isPoweredRail;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.collisionRayTrace(w, x, y, z, start, end);
  }

  /** Slopes select 10/16 high, flat rails 2/16. */
  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    if (meta >= 2 && meta <= 5) this.setBlockBounds(0, 0, 0, 1, 0.625, 1);
    else this.setBlockBounds(0, 0, 0, 1, 0.125, 1);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 9;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.doesBlockHaveSolidTopSurface(x, y - 1, z);
  }

  /** Connects to the rails around (BlockBaseRailLogic). */
  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (w.isRemote) return;
    this.refreshTrackShape(w, x, y, z, true);
    if (this.isPoweredRail) this.onNeighborBlockChange(w, x, y, z, this.blockID);
  }

  /** Pops off without support below, or a slope without the block it climbs. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    const shape = this.isPoweredRail ? meta & 7 : meta;
    let drop = false;
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z)) drop = true;
    if (shape === 2 && !w.doesBlockHaveSolidTopSurface(x + 1, y, z)) drop = true;
    if (shape === 3 && !w.doesBlockHaveSolidTopSurface(x - 1, y, z)) drop = true;
    if (shape === 4 && !w.doesBlockHaveSolidTopSurface(x, y, z - 1)) drop = true;
    if (shape === 5 && !w.doesBlockHaveSolidTopSurface(x, y, z + 1)) drop = true;
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    } else {
      this.onRailNeighborChange(w, x, y, z, meta, shape, id);
    }
  }

  /** func_94358_a: redstone reactions of the subclasses. */
  protected onRailNeighborChange(_w: IWorld, _x: number, _y: number, _z: number, _meta: number, _shape: number, _id: number): void {}

  protected refreshTrackShape(w: IWorld, x: number, y: number, z: number, initial: boolean): void {
    if (!w.isRemote) new BlockRailLogic(w, x, y, z).updateShape(Block.isPowered(w, x, y, z), initial);
  }

  override getMobilityFlag(): number {
    return 0;
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const shape = this.isPoweredRail ? meta & 7 : meta;
    super.breakBlock(w, x, y, z, id, meta);
    if (shape === 2 || shape === 3 || shape === 4 || shape === 5) w.notifyBlocksOfNeighborChange(x, y + 1, z, id);
    if (this.isPoweredRail) {
      w.notifyBlocksOfNeighborChange(x, y, z, id);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, id);
    }
  }
}

/** BlockBaseRailLogic: how a rail at (x, y, z) connects to the rails next to it. */
export class BlockRailLogic {
  private readonly isStraightRail: boolean;
  private connected: Pos[] = [];

  constructor(
    private readonly w: IWorld,
    readonly railX: number,
    readonly railY: number,
    readonly railZ: number,
  ) {
    let meta = w.getBlockMetadata(railX, railY, railZ);
    const rail = Block.blocksList[w.getBlockId(railX, railY, railZ)] as BlockRailBase | null;
    if (rail?.isPowered()) {
      this.isStraightRail = true;
      meta &= -9;
    } else {
      this.isStraightRail = false;
    }
    this.setBasicRail(meta);
  }

  private setBasicRail(shape: number): void {
    const x = this.railX;
    const y = this.railY;
    const z = this.railZ;
    const c: Pos[] = [];
    if (shape === 0) c.push({ x, y, z: z - 1 }, { x, y, z: z + 1 });
    else if (shape === 1) c.push({ x: x - 1, y, z }, { x: x + 1, y, z });
    else if (shape === 2) c.push({ x: x - 1, y, z }, { x: x + 1, y: y + 1, z });
    else if (shape === 3) c.push({ x: x - 1, y: y + 1, z }, { x: x + 1, y, z });
    else if (shape === 4) c.push({ x, y: y + 1, z: z - 1 }, { x, y, z: z + 1 });
    else if (shape === 5) c.push({ x, y, z: z - 1 }, { x, y: y + 1, z: z + 1 });
    else if (shape === 6) c.push({ x: x + 1, y, z }, { x, y, z: z + 1 });
    else if (shape === 7) c.push({ x: x - 1, y, z }, { x, y, z: z + 1 });
    else if (shape === 8) c.push({ x: x - 1, y, z }, { x, y, z: z - 1 });
    else if (shape === 9) c.push({ x: x + 1, y, z }, { x, y, z: z - 1 });
    this.connected = c;
  }

  private refreshConnectedTracks(): void {
    for (let i = 0; i < this.connected.length; i++) {
      const other = this.getRailLogic(this.connected[i]);
      if (other && other.isConnectedTo(this)) this.connected[i] = { x: other.railX, y: other.railY, z: other.railZ };
      else this.connected.splice(i--, 1);
    }
  }

  private isMinecartTrack(x: number, y: number, z: number): boolean {
    return BlockRailBase.isRailBlockAt(this.w, x, y, z) || BlockRailBase.isRailBlockAt(this.w, x, y + 1, z) || BlockRailBase.isRailBlockAt(this.w, x, y - 1, z);
  }

  private getRailLogic(p: Pos): BlockRailLogic | null {
    if (BlockRailBase.isRailBlockAt(this.w, p.x, p.y, p.z)) return new BlockRailLogic(this.w, p.x, p.y, p.z);
    if (BlockRailBase.isRailBlockAt(this.w, p.x, p.y + 1, p.z)) return new BlockRailLogic(this.w, p.x, p.y + 1, p.z);
    if (BlockRailBase.isRailBlockAt(this.w, p.x, p.y - 1, p.z)) return new BlockRailLogic(this.w, p.x, p.y - 1, p.z);
    return null;
  }

  /** isRailChunkPositionCorrect: this rail lists `other` among its connections. */
  private isConnectedTo(other: BlockRailLogic): boolean {
    return this.connected.some((p) => p.x === other.railX && p.z === other.railZ);
  }

  private isPartOfTrack(x: number, _y: number, z: number): boolean {
    return this.connected.some((p) => p.x === x && p.z === z);
  }

  getNumberOfAdjacentTracks(): number {
    let n = 0;
    if (this.isMinecartTrack(this.railX, this.railY, this.railZ - 1)) n++;
    if (this.isMinecartTrack(this.railX, this.railY, this.railZ + 1)) n++;
    if (this.isMinecartTrack(this.railX - 1, this.railY, this.railZ)) n++;
    if (this.isMinecartTrack(this.railX + 1, this.railY, this.railZ)) n++;
    return n;
  }

  private canConnectTo(other: BlockRailLogic): boolean {
    if (this.isConnectedTo(other)) return true;
    return this.connected.length !== 2;
  }

  private connectToNeighbor(other: BlockRailLogic): void {
    this.connected.push({ x: other.railX, y: other.railY, z: other.railZ });
    const x = this.railX;
    const y = this.railY;
    const z = this.railZ;
    const n = this.isPartOfTrack(x, y, z - 1);
    const s = this.isPartOfTrack(x, y, z + 1);
    const west = this.isPartOfTrack(x - 1, y, z);
    const east = this.isPartOfTrack(x + 1, y, z);
    let shape = -1;
    if (n || s) shape = 0;
    if (west || east) shape = 1;
    if (!this.isStraightRail) {
      if (s && east && !n && !west) shape = 6;
      if (s && west && !n && !east) shape = 7;
      if (n && west && !s && !east) shape = 8;
      if (n && east && !s && !west) shape = 9;
    }
    shape = this.slope(shape);
    if (shape < 0) shape = 0;
    let meta = shape;
    if (this.isStraightRail) meta = (this.w.getBlockMetadata(x, y, z) & 8) | shape;
    this.w.setBlockMetadataWithNotify(x, y, z, meta, 3);
  }

  /** A straight rail climbs toward a rail one block higher. */
  private slope(shape: number): number {
    const x = this.railX;
    const y = this.railY;
    const z = this.railZ;
    if (shape === 0) {
      if (BlockRailBase.isRailBlockAt(this.w, x, y + 1, z - 1)) shape = 4;
      if (BlockRailBase.isRailBlockAt(this.w, x, y + 1, z + 1)) shape = 5;
    }
    if (shape === 1) {
      if (BlockRailBase.isRailBlockAt(this.w, x + 1, y + 1, z)) shape = 2;
      if (BlockRailBase.isRailBlockAt(this.w, x - 1, y + 1, z)) shape = 3;
    }
    return shape;
  }

  private canConnectFrom(x: number, y: number, z: number): boolean {
    const other = this.getRailLogic({ x, y, z });
    if (!other) return false;
    other.refreshConnectedTracks();
    return other.canConnectTo(this);
  }

  /** func_94511_a: picks the shape from the rails that can take a connection, then tells them. */
  updateShape(powered: boolean, initial: boolean): void {
    const x = this.railX;
    const y = this.railY;
    const z = this.railZ;
    const n = this.canConnectFrom(x, y, z - 1);
    const s = this.canConnectFrom(x, y, z + 1);
    const west = this.canConnectFrom(x - 1, y, z);
    const east = this.canConnectFrom(x + 1, y, z);
    let shape = -1;
    if ((n || s) && !west && !east) shape = 0;
    if ((west || east) && !n && !s) shape = 1;
    if (!this.isStraightRail) {
      if (s && east && !n && !west) shape = 6;
      if (s && west && !n && !east) shape = 7;
      if (n && west && !s && !east) shape = 8;
      if (n && east && !s && !west) shape = 9;
    }
    if (shape === -1) {
      if (n || s) shape = 0;
      if (west || east) shape = 1;
      if (!this.isStraightRail) {
        if (powered) {
          if (s && east) shape = 6;
          if (west && s) shape = 7;
          if (east && n) shape = 9;
          if (n && west) shape = 8;
        } else {
          if (n && west) shape = 8;
          if (east && n) shape = 9;
          if (west && s) shape = 7;
          if (s && east) shape = 6;
        }
      }
    }
    shape = this.slope(shape);
    if (shape < 0) shape = 0;
    this.setBasicRail(shape);
    let meta = shape;
    if (this.isStraightRail) meta = (this.w.getBlockMetadata(x, y, z) & 8) | shape;
    if (initial || this.w.getBlockMetadata(x, y, z) !== meta) {
      this.w.setBlockMetadataWithNotify(x, y, z, meta, 3);
      for (const p of this.connected) {
        const other = this.getRailLogic(p);
        if (!other) continue;
        other.refreshConnectedTracks();
        if (other.canConnectTo(this)) other.connectToNeighbor(this);
      }
    }
  }
}

/** Rail (66): straight, sloped and curved. */
export class BlockRail extends BlockRailBase {
  private iconTurn: Icon | null = null;

  constructor(id: number) {
    super(id, false);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    return meta >= 6 ? this.iconTurn : this.blockIcon;
  }

  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.iconTurn = reg.registerIcon('rail_turn');
  }

  /** A junction re-evaluates its curve when powered (redstone only). */
  protected override onRailNeighborChange(w: IWorld, x: number, y: number, z: number, _meta: number, _shape: number, id: number): void {
    if (!Block.hasRedstone(w)) return;
    if (id > 0 && Block.blocksList[id]?.canProvidePower() && new BlockRailLogic(w, x, y, z).getNumberOfAdjacentTracks() === 3) this.refreshTrackShape(w, x, y, z, false);
  }
}

/** Powered (27) and activator (157) rails: bit 8 lit by redstone, passed along up to 8 rails. */
export class BlockRailPowered extends BlockRailBase {
  protected iconPowered: Icon | null = null;

  constructor(id: number) {
    super(id, true);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    return (meta & 8) === 0 ? this.blockIcon : this.iconPowered;
  }

  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.iconPowered = reg.registerIcon(this.getUnlocalizedName2() + '_powered');
  }

  /** func_94360_a: follows the line of powered rails looking for a powered one. */
  protected isConnectedRailPowered(w: IWorld, x: number, y: number, z: number, meta: number, forward: boolean, depth: number): boolean {
    if (depth >= 8) return false;
    let shape = meta & 7;
    let flat = true;
    switch (shape) {
      case 0:
        if (forward) z++;
        else z--;
        break;
      case 1:
        if (forward) x--;
        else x++;
        break;
      case 2:
        if (forward) x--;
        else {
          x++;
          y++;
          flat = false;
        }
        shape = 1;
        break;
      case 3:
        if (forward) {
          x--;
          y++;
          flat = false;
        } else x++;
        shape = 1;
        break;
      case 4:
        if (forward) z++;
        else {
          z--;
          y++;
          flat = false;
        }
        shape = 0;
        break;
      case 5:
        if (forward) {
          z++;
          y++;
          flat = false;
        } else z--;
        shape = 0;
        break;
    }
    return this.isRailPowered(w, x, y, z, forward, depth, shape) || (flat && this.isRailPowered(w, x, y - 1, z, forward, depth, shape));
  }

  /** func_94361_a */
  protected isRailPowered(w: IWorld, x: number, y: number, z: number, forward: boolean, depth: number, axis: number): boolean {
    if (w.getBlockId(x, y, z) !== this.blockID) return false;
    const meta = w.getBlockMetadata(x, y, z);
    const shape = meta & 7;
    if (axis === 1 && (shape === 0 || shape === 4 || shape === 5)) return false;
    if (axis === 0 && (shape === 1 || shape === 2 || shape === 3)) return false;
    if ((meta & 8) !== 0) {
      if (Block.isPowered(w, x, y, z)) return true;
      return this.isConnectedRailPowered(w, x, y, z, meta, forward, depth + 1);
    }
    return false;
  }

  protected override onRailNeighborChange(w: IWorld, x: number, y: number, z: number, meta: number, shape: number, _id: number): void {
    if (!Block.hasRedstone(w)) return;
    const powered = Block.isPowered(w, x, y, z) || this.isConnectedRailPowered(w, x, y, z, meta, true, 0) || this.isConnectedRailPowered(w, x, y, z, meta, false, 0);
    let changed = false;
    if (powered && (meta & 8) === 0) {
      w.setBlockMetadataWithNotify(x, y, z, shape | 8, 3);
      changed = true;
    } else if (!powered && (meta & 8) !== 0) {
      w.setBlockMetadataWithNotify(x, y, z, shape, 3);
      changed = true;
    }
    if (changed) {
      w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
      if (shape === 2 || shape === 3 || shape === 4 || shape === 5) w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    }
  }
}

/** Detector rail (28): bit 8 while a minecart is on it. */
export class BlockDetectorRail extends BlockRailBase {
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, true);
    this.setTickRandomly(true);
  }

  override tickRate(_w: IWorld): number {
    return 20;
  }

  override canProvidePower(): boolean {
    return true;
  }

  override onEntityCollidedWithBlock(w: IWorld, x: number, y: number, z: number, _e: Entity): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) this.setStateIfMinecartInteractsWithRail(w, x, y, z, meta);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 0) this.setStateIfMinecartInteractsWithRail(w, x, y, z, meta);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return (w.getBlockMetadata(x, y, z) & 8) !== 0 ? 15 : 0;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    if ((w.getBlockMetadata(x, y, z) & 8) === 0) return 0;
    return side === 1 ? 15 : 0;
  }

  private minecartsOn(w: IWorld, x: number, y: number, z: number): Entity[] {
    const f = Math.fround;
    const inset = 0.125;
    const box = AxisAlignedBB.getBoundingBox(f(x + inset), y, f(z + inset), f(x + 1 - inset), f(y + 1 - inset), f(z + 1 - inset));
    return w.getEntitiesWithinAABBExcludingEntity(null, box).filter((e) => (EntityList.getEntityString(e) ?? '').startsWith('Minecart'));
  }

  private setStateIfMinecartInteractsWithRail(w: IWorld, x: number, y: number, z: number, meta: number): void {
    const wasOn = (meta & 8) !== 0;
    const on = this.minecartsOn(w, x, y, z).length > 0;
    if (on && !wasOn) {
      w.setBlockMetadataWithNotify(x, y, z, meta | 8, 3);
      w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    }
    if (!on && wasOn) {
      w.setBlockMetadataWithNotify(x, y, z, meta & 7, 3);
      w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
      w.markBlockRangeForRenderUpdate(x, y, z, x, y, z);
    }
    if (on) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
    w.notifyComparatorsOfChange(x, y, z, this.blockID);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    this.setStateIfMinecartInteractsWithRail(w, x, y, z, w.getBlockMetadata(x, y, z));
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [reg.registerIcon('detectorRail'), reg.registerIcon('detectorRail_on')];
  }

  override getIcon(_side: number, meta: number): Icon | null {
    return (meta & 8) !== 0 ? this.iconArray[1] : this.iconArray[0];
  }
}
