import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Tripwire hooks call this to update the line (BlockTripWireSource.func_72143_a). */
interface TripWireLine {
  updateLine(w: IWorld, x: number, y: number, z: number, id: number, meta: number, notify: boolean, wireIndex: number, wireMeta: number): void;
}

/**
 * Tripwire (132, render type 30, translucent pass): string between hooks. Bits: 1 something
 * on it, 2 hanging (no solid block below), 4 attached to hooks, 8 disarmed with shears.
 */
export class BlockTripWire extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setBlockBounds(0, 0, 0, 1, 0.15625, 1);
    this.setTickRandomly(true);
  }

  override tickRate(_w: IWorld): number {
    return 10;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderBlockPass(): number {
    return 1;
  }

  override getRenderType(): number {
    return 30;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.silk;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.silk;
  }

  /** Breaks when the ground below appears or vanishes (the hanging bit no longer matches). */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const hanging = (meta & 2) === 2;
    const noGround = !w.doesBlockHaveSolidTopSurface(x, y - 1, z);
    if (hanging !== noGround) {
      this.dropBlockAsItem(w, x, y, z, meta, 0);
      w.setBlockToAir(x, y, z);
    }
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const attached = (meta & 4) === 4;
    const hanging = (meta & 2) === 2;
    if (!hanging) this.setBlockBounds(0, 0, 0, 1, 0.09375, 1);
    else if (!attached) this.setBlockBounds(0, 0, 0, 1, 0.5, 1);
    else this.setBlockBounds(0, 0.0625, 0, 1, 0.15625, 1);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    const meta = w.doesBlockHaveSolidTopSurface(x, y - 1, z) ? 0 : 2;
    w.setBlockMetadataWithNotify(x, y, z, meta, 3);
    this.updateHooks(w, x, y, z, meta);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, _id: number, meta: number): void {
    this.updateHooks(w, x, y, z, meta | 1);
  }

  /** Cut with shears: disarmed (bit 8), so breaking it does not trigger the hooks. */
  override onBlockHarvested(w: IWorld, x: number, y: number, z: number, meta: number, p: EntityPlayer): void {
    if (w.isRemote) return;
    const held = p.getCurrentEquippedItem();
    if (held && held.itemID === ItemIds.shears) w.setBlockMetadataWithNotify(x, y, z, meta | 8, 4);
  }

  /** func_72149_e: tells the hooks at both ends of the line. */
  private updateHooks(w: IWorld, x: number, y: number, z: number, meta: number): void {
    for (let d = 0; d < 2; d++) {
      for (let i = 1; i < 42; i++) {
        const hx = x + Direction.offsetX[d] * i;
        const hz = z + Direction.offsetZ[d] * i;
        const id = w.getBlockId(hx, y, hz);
        if (id === BlockIds.tripWireSource) {
          if ((w.getBlockMetadata(hx, y, hz) & 3) === Direction.rotateOpposite[d]) {
            (Block.blocksList[BlockIds.tripWireSource] as unknown as TripWireLine).updateLine(w, hx, y, hz, id, w.getBlockMetadata(hx, y, hz), true, i, meta);
          }
          break;
        }
        if (id !== BlockIds.tripWire) break;
      }
    }
  }

  override onEntityCollidedWithBlock(w: IWorld, x: number, y: number, z: number, _e: Entity): void {
    if (!w.isRemote && (w.getBlockMetadata(x, y, z) & 1) !== 1) this.updateTripWireState(w, x, y, z);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isRemote && (w.getBlockMetadata(x, y, z) & 1) === 1) this.updateTripWireState(w, x, y, z);
  }

  private updateTripWireState(w: IWorld, x: number, y: number, z: number): void {
    let meta = w.getBlockMetadata(x, y, z);
    const wasOn = (meta & 1) === 1;
    const box = AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, y + this.maxY, z + this.maxZ);
    let on = false;
    for (const e of w.getEntitiesWithinAABBExcludingEntity(null, box)) {
      if (!((e as unknown as { doesEntityNotTriggerPressurePlate?: () => boolean }).doesEntityNotTriggerPressurePlate?.() ?? false)) {
        on = true;
        break;
      }
    }
    if (on && !wasOn) meta |= 1;
    if (!on && wasOn) meta &= -2;
    if (on !== wasOn) {
      w.setBlockMetadataWithNotify(x, y, z, meta, 3);
      this.updateHooks(w, x, y, z, meta);
    }
    if (on) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  /** func_72148_a: whether the wire continues toward `dir` (another wire at the same height or a facing hook). */
  static isConnectedTo(w: IBlockAccess, x: number, y: number, z: number, meta: number, dir: number): boolean {
    const nx = x + Direction.offsetX[dir];
    const nz = z + Direction.offsetZ[dir];
    const id = w.getBlockId(nx, y, nz);
    const hanging = (meta & 2) === 2;
    if (id === BlockIds.tripWireSource) return (w.getBlockMetadata(nx, y, nz) & 3) === Direction.rotateOpposite[dir];
    if (id === BlockIds.tripWire) return hanging === ((w.getBlockMetadata(nx, y, nz) & 2) === 2);
    return false;
  }
}
