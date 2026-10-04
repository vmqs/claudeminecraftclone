import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { BlockRedstoneLogic } from './BlockRedstoneLogic';
import { Material } from './Material';

/**
 * Redstone dust (55, render type 5): meta = signal 0-15. It connects to other dust, power
 * sources and the ends of repeaters (isPowerProviderOrWire, used by the renderer). Signal
 * propagation is redstone logic and out of scope: placed dust stays at 0, drawn in the
 * unpowered colour.
 */
export class BlockRedstoneWire extends Block {
  private wiresProvidePower = true;
  private iconCross: Icon | null = null;
  private iconLine: Icon | null = null;
  private iconCrossOverlay: Icon | null = null;
  private iconLineOverlay: Icon | null = null;
  private static instance: BlockRedstoneWire | null = null;

  constructor(id: number) {
    super(id, Material.circuits);
    this.setBlockBounds(0, 0, 0, 1, 0.0625, 1);
    BlockRedstoneWire.instance = this;
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
    return 5;
  }

  /** The original's constant (the renderer computes the real colour from the signal). */
  override colorMultiplier(_w: IBlockAccess, _x: number, _y: number, _z: number): number {
    return 0x800000;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.doesBlockHaveSolidTopSurface(x, y - 1, z) || w.getBlockId(x, y - 1, z) === BlockIds.glowStone;
  }

  /** Signal propagation (updateAndPropagateCurrentStrength) runs only when the world simulates redstone. */
  private updateAndPropagateCurrentStrength(_w: IWorld, _x: number, _y: number, _z: number): void {
    // TODO(redstone): calculateCurrentChanges; out of scope, dust keeps its metadata.
  }

  /** notifyWireNeighborsOfNeighborChange */
  private notifyWireNeighbors(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockId(x, y, z) !== this.blockID) return;
    w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
  }

  private notifyAround(w: IWorld, x: number, y: number, z: number): void {
    this.notifyWireNeighbors(w, x - 1, y, z);
    this.notifyWireNeighbors(w, x + 1, y, z);
    this.notifyWireNeighbors(w, x, y, z - 1);
    this.notifyWireNeighbors(w, x, y, z + 1);
    this.notifyWireNeighbors(w, x - 1, w.isBlockNormalCube(x - 1, y, z) ? y + 1 : y - 1, z);
    this.notifyWireNeighbors(w, x + 1, w.isBlockNormalCube(x + 1, y, z) ? y + 1 : y - 1, z);
    this.notifyWireNeighbors(w, x, w.isBlockNormalCube(x, y, z - 1) ? y + 1 : y - 1, z - 1);
    this.notifyWireNeighbors(w, x, w.isBlockNormalCube(x, y, z + 1) ? y + 1 : y - 1, z + 1);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    if (w.isRemote) return;
    this.updateAndPropagateCurrentStrength(w, x, y, z);
    w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
    this.notifyAround(w, x, y, z);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    super.breakBlock(w, x, y, z, id, meta);
    if (w.isRemote) return;
    w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    this.updateAndPropagateCurrentStrength(w, x, y, z);
    this.notifyAround(w, x, y, z);
  }

  /** Pops off without a solid top below (or glowstone). */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (w.isRemote) return;
    if (this.canPlaceBlockAt(w, x, y, z)) {
      this.updateAndPropagateCurrentStrength(w, x, y, z);
    } else {
      this.dropBlockAsItem(w, x, y, z, 0, 0);
      w.setBlockToAir(x, y, z);
    }
    super.onNeighborBlockChange(w, x, y, z, id);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.redstone;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    return !this.wiresProvidePower ? 0 : this.isProvidingWeakPower(w, x, y, z, side);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    if (!this.wiresProvidePower) return 0;
    const meta = w.getBlockMetadata(x, y, z);
    if (meta === 0) return 0;
    if (side === 1) return meta;
    const p = BlockRedstoneWire.isPoweredOrRepeater;
    let west = p(w, x - 1, y, z, 1) || (!w.isBlockNormalCube(x - 1, y, z) && p(w, x - 1, y - 1, z, -1));
    let east = p(w, x + 1, y, z, 3) || (!w.isBlockNormalCube(x + 1, y, z) && p(w, x + 1, y - 1, z, -1));
    let north = p(w, x, y, z - 1, 2) || (!w.isBlockNormalCube(x, y, z - 1) && p(w, x, y - 1, z - 1, -1));
    let south = p(w, x, y, z + 1, 0) || (!w.isBlockNormalCube(x, y, z + 1) && p(w, x, y - 1, z + 1, -1));
    if (!w.isBlockNormalCube(x, y + 1, z)) {
      if (w.isBlockNormalCube(x - 1, y, z) && p(w, x - 1, y + 1, z, -1)) west = true;
      if (w.isBlockNormalCube(x + 1, y, z) && p(w, x + 1, y + 1, z, -1)) east = true;
      if (w.isBlockNormalCube(x, y, z - 1) && p(w, x, y + 1, z - 1, -1)) north = true;
      if (w.isBlockNormalCube(x, y, z + 1) && p(w, x, y + 1, z + 1, -1)) south = true;
    }
    if (!north && !east && !west && !south && side >= 2 && side <= 5) return meta;
    if (side === 2 && north && !west && !east) return meta;
    if (side === 3 && south && !west && !east) return meta;
    if (side === 4 && west && !north && !south) return meta;
    return side === 5 && east && !north && !south ? meta : 0;
  }

  override canProvidePower(): boolean {
    return this.wiresProvidePower;
  }

  /** Red dust above powered wire, brighter with the signal. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    const meta = w.getBlockMetadata(x, y, z);
    if (meta <= 0) return;
    const f = Math.fround;
    const px = x + 0.5 + (rand.nextFloat() - 0.5) * 0.2;
    const py = f(y + 0.0625);
    const pz = z + 0.5 + (rand.nextFloat() - 0.5) * 0.2;
    const s = f(meta / 15);
    const r = f(f(s * 0.6) + 0.4);
    let g = f(f(f(s * s) * 0.7) - 0.5);
    let b = f(f(f(s * s) * 0.6) - 0.7);
    if (g < 0) g = 0;
    if (b < 0) b = 0;
    w.spawnParticle('reddust', px, py, pz, r, g, b);
  }

  /** Whether the dust at a position connects toward `dir` (Direction index, -1 = any). */
  static isPowerProviderOrWire(w: IBlockAccess, x: number, y: number, z: number, dir: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === BlockIds.redstoneWire) return true;
    if (id === 0) return false;
    if (id !== BlockIds.redstoneRepeaterIdle && id !== BlockIds.redstoneRepeaterActive) return Block.blocksList[id]!.canProvidePower() && dir !== -1;
    const meta = w.getBlockMetadata(x, y, z);
    return dir === (meta & 3) || dir === Direction.rotateOpposite[meta & 3];
  }

  static isPoweredOrRepeater(w: IBlockAccess, x: number, y: number, z: number, dir: number): boolean {
    if (BlockRedstoneWire.isPowerProviderOrWire(w, x, y, z, dir)) return true;
    if (w.getBlockId(x, y, z) !== BlockIds.redstoneRepeaterActive) return false;
    return dir === (w.getBlockMetadata(x, y, z) & 3);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.redstone;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconCross = reg.registerIcon('redstoneDust_cross');
    this.iconLine = reg.registerIcon('redstoneDust_line');
    this.iconCrossOverlay = reg.registerIcon('redstoneDust_cross_overlay');
    this.iconLineOverlay = reg.registerIcon('redstoneDust_line_overlay');
    this.blockIcon = this.iconCross;
  }

  /** func_94409_b: the dust textures by name, for the renderer. */
  static getRedstoneWireIcon(name: string): Icon | null {
    const b = BlockRedstoneWire.instance;
    if (!b) return null;
    if (name === 'redstoneDust_cross') return b.iconCross;
    if (name === 'redstoneDust_line') return b.iconLine;
    if (name === 'redstoneDust_cross_overlay') return b.iconCrossOverlay;
    return name === 'redstoneDust_line_overlay' ? b.iconLineOverlay : null;
  }

  /** Repeaters and comparators count as connections only at their ends. */
  static isDiode(id: number): boolean {
    return BlockRedstoneLogic.isRedstoneRepeaterBlockID(id);
  }
}
