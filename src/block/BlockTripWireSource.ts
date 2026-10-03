import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Tripwire hook (131, render type 29): meta & 3 = facing (0 south, 1 west, 2 north, 3 east
 * of the wall), 4 = connected to a hook across a tripwire line, 8 = tripped (powered).
 */
export class BlockTripWireSource extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setCreativeTab(CreativeTabs.tabRedstone);
    this.setTickRandomly(true);
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

  override getRenderType(): number {
    return 29;
  }

  override tickRate(_w: IWorld): number {
    return 10;
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
    let meta = 0;
    if (side === 2 && w.isBlockNormalCubeDefault(x, y, z + 1, true)) meta = 2;
    if (side === 3 && w.isBlockNormalCubeDefault(x, y, z - 1, true)) meta = 0;
    if (side === 4 && w.isBlockNormalCubeDefault(x + 1, y, z, true)) meta = 1;
    if (side === 5 && w.isBlockNormalCubeDefault(x - 1, y, z, true)) meta = 3;
    return meta;
  }

  override onPostBlockPlaced(w: IWorld, x: number, y: number, z: number, meta: number): void {
    this.updateLine(w, x, y, z, this.blockID, meta, false, -1, 0);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (id === this.blockID || !this.checkAttached(w, x, y, z)) return;
    const meta = w.getBlockMetadata(x, y, z);
    const d = meta & 3;
    let drop = false;
    if (!w.isBlockNormalCube(x - 1, y, z) && d === 3) drop = true;
    if (!w.isBlockNormalCube(x + 1, y, z) && d === 1) drop = true;
    if (!w.isBlockNormalCube(x, y, z - 1) && d === 0) drop = true;
    if (!w.isBlockNormalCube(x, y, z + 1) && d === 2) drop = true;
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, meta, 0);
      w.setBlockToAir(x, y, z);
    }
  }

  /**
   * func_72143_a: walks the line toward the facing (up to 41 blocks) to find the matching
   * hook; sets both hooks' attached and tripped bits, the wires' attached bit, and plays the
   * click / string sounds. `wireIndex` / `wireMeta` stand for a wire that is changing.
   */
  updateLine(w: IWorld, x: number, y: number, z: number, id: number, meta: number, notify: boolean, wireIndex: number, wireMeta: number): void {
    const d = meta & 3;
    const wasAttached = (meta & 4) === 4;
    const wasTripped = (meta & 8) === 8;
    let attached = id === BlockIds.tripWireSource;
    let tripped = false;
    const hanging = !w.doesBlockHaveSolidTopSurface(x, y - 1, z);
    const dx = Direction.offsetX[d];
    const dz = Direction.offsetZ[d];
    let other = 0;
    const wires = new Int32Array(42);
    for (let i = 1; i < 42; i++) {
      const wx = x + dx * i;
      const wz = z + dz * i;
      const wid = w.getBlockId(wx, y, wz);
      if (wid === BlockIds.tripWireSource) {
        if ((w.getBlockMetadata(wx, y, wz) & 3) === Direction.rotateOpposite[d]) other = i;
        break;
      }
      if (wid !== BlockIds.tripWire && i !== wireIndex) {
        wires[i] = -1;
        attached = false;
      } else {
        const m = i === wireIndex ? wireMeta : w.getBlockMetadata(wx, y, wz);
        const armed = (m & 8) !== 8;
        const occupied = (m & 1) === 1;
        const wireHanging = (m & 2) === 2;
        attached = attached && wireHanging === hanging;
        tripped = tripped || (armed && occupied);
        wires[i] = m;
        if (i === wireIndex) {
          w.scheduleBlockUpdate(x, y, z, id, this.tickRate(w));
          attached = attached && armed;
        }
      }
    }
    attached = attached && other > 1;
    tripped = tripped && attached;
    const bits = (attached ? 4 : 0) | (tripped ? 8 : 0);
    meta = d | bits;
    if (other > 0) {
      const ox = x + dx * other;
      const oz = z + dz * other;
      const od = Direction.rotateOpposite[d];
      w.setBlockMetadataWithNotify(ox, y, oz, od | bits, 3);
      this.notifyNeighborOfChange(w, ox, y, oz, od);
      this.playSoundEffect(w, ox, y, oz, attached, tripped, wasAttached, wasTripped);
    }
    this.playSoundEffect(w, x, y, z, attached, tripped, wasAttached, wasTripped);
    if (id > 0) {
      w.setBlockMetadataWithNotify(x, y, z, meta, 3);
      if (notify) this.notifyNeighborOfChange(w, x, y, z, d);
    }
    if (wasAttached !== attached) {
      for (let i = 1; i < other; i++) {
        let m = wires[i];
        if (m < 0) continue;
        if (attached) m |= 4;
        else m &= -5;
        w.setBlockMetadataWithNotify(x + dx * i, y, z + dz * i, m, 3);
      }
    }
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    this.updateLine(w, x, y, z, this.blockID, w.getBlockMetadata(x, y, z), true, -1, 0);
  }

  private playSoundEffect(w: IWorld, x: number, y: number, z: number, attached: boolean, tripped: boolean, wasAttached: boolean, wasTripped: boolean): void {
    if (tripped && !wasTripped) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.click', 0.4, 0.6);
    else if (!tripped && wasTripped) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.click', 0.4, 0.5);
    else if (attached && !wasAttached) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.click', 0.4, 0.7);
    else if (!attached && wasAttached) w.playSoundEffect(x + 0.5, y + 0.1, z + 0.5, 'random.bowhit', 0.4, Math.fround(1.2 / Math.fround(w.rand.nextFloat() * 0.2 + 0.9)));
  }

  private notifyNeighborOfChange(w: IWorld, x: number, y: number, z: number, d: number): void {
    w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
    if (d === 3) w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    else if (d === 1) w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    else if (d === 0) w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    else if (d === 2) w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
  }

  /** func_72144_l */
  private checkAttached(w: IWorld, x: number, y: number, z: number): boolean {
    if (this.canPlaceBlockAt(w, x, y, z)) return true;
    this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
    w.setBlockToAir(x, y, z);
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const d = w.getBlockMetadata(x, y, z) & 3;
    const r = 0.1875;
    if (d === 3) this.setBlockBounds(0, 0.2, 0.5 - r, r * 2, 0.8, 0.5 + r);
    else if (d === 1) this.setBlockBounds(1 - r * 2, 0.2, 0.5 - r, 1, 0.8, 0.5 + r);
    else if (d === 0) this.setBlockBounds(0.5 - r, 0.2, 0, 0.5 + r, 0.8, r * 2);
    else if (d === 2) this.setBlockBounds(0.5 - r, 0.2, 1 - r * 2, 0.5 + r, 0.8, 1);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const attached = (meta & 4) === 4;
    const tripped = (meta & 8) === 8;
    if (attached || tripped) this.updateLine(w, x, y, z, 0, meta, false, -1, 0);
    if (tripped) this.notifyNeighborOfChange(w, x, y, z, meta & 3);
    super.breakBlock(w, x, y, z, id, meta);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return (w.getBlockMetadata(x, y, z) & 8) === 8 ? 15 : 0;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 8) return 0;
    const d = meta & 3;
    if (d === 2 && side === 2) return 15;
    if (d === 0 && side === 3) return 15;
    if (d === 1 && side === 4) return 15;
    return d === 3 && side === 5 ? 15 : 0;
  }

  override canProvidePower(): boolean {
    return true;
  }
}
