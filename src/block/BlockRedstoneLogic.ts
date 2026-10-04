import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { ITileEntityProvider, TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityComparator } from '../world/tileentity/TileEntityComparator';
import { Block } from './Block';
import { BlockDirectional } from './BlockDirectional';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Repeaters and comparators (BlockRedstoneLogic): a 2/16 slab facing meta & 3 (the output
 * side). The signal logic is ported, but power only reaches them when the world simulates
 * redstone (World.getIndirectPowerLevelTo), which is out of scope.
 */
export abstract class BlockRedstoneLogic extends BlockDirectional {
  protected readonly isRepeaterPowered: boolean;

  constructor(id: number, powered: boolean) {
    super(id, Material.circuits);
    this.isRepeaterPowered = powered;
    this.setBlockBounds(0, 0, 0, 1, 0.125, 1);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return !w.doesBlockHaveSolidTopSurface(x, y - 1, z) ? false : super.canPlaceBlockAt(w, x, y, z);
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    return !w.doesBlockHaveSolidTopSurface(x, y - 1, z) ? false : super.canBlockStay(w, x, y, z);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    const meta = w.getBlockMetadata(x, y, z);
    if (this.isLocked(w, x, y, z, meta)) return;
    const powered = this.isGettingInput(w, x, y, z, meta);
    if (this.isRepeaterPowered && !powered) {
      w.setBlock(x, y, z, this.getUnpoweredBlockId(), meta, 2);
    } else if (!this.isRepeaterPowered) {
      w.setBlock(x, y, z, this.getPoweredBlockId(), meta, 2);
      if (!powered) w.scheduleBlockUpdate(x, y, z, this.getPoweredBlockId(), this.getTickDelay(meta), -1);
    }
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 0) return Block.blocksList[this.isRepeaterPowered ? BlockIds.torchRedstoneActive : BlockIds.torchRedstoneIdle]!.getBlockTextureFromSide(side);
    return side === 1 ? this.blockIcon : Block.blocksList[BlockIds.stoneDoubleSlab]!.getBlockTextureFromSide(1);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.isRepeaterPowered ? 'repeater_lit' : 'repeater');
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, side: number): boolean {
    return side !== 0 && side !== 1;
  }

  override getRenderType(): number {
    return 36;
  }

  /** func_96470_c: whether the output is on. */
  protected isOutputOn(_meta: number): boolean {
    return this.isRepeaterPowered;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    return this.isProvidingWeakPower(w, x, y, z, side);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    if (!this.isOutputOn(meta)) return 0;
    const d = BlockDirectional.getDirection(meta);
    if ((d === 0 && side === 3) || (d === 1 && side === 4) || (d === 2 && side === 2) || (d === 3 && side === 5)) return this.getOutputStrength(w, x, y, z, meta);
    return 0;
  }

  /** Pops off without a solid floor; otherwise re-evaluates its input. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (!this.canBlockStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
      w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    } else {
      this.updateState(w, x, y, z, id);
    }
  }

  /** func_94479_f */
  protected updateState(w: IWorld, x: number, y: number, z: number, _id: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    if (this.isLocked(w, x, y, z, meta)) return;
    const powered = this.isGettingInput(w, x, y, z, meta);
    if (((this.isRepeaterPowered && !powered) || (!this.isRepeaterPowered && powered)) && !w.isBlockTickScheduled(x, y, z, this.blockID)) {
      let priority = -1;
      if (this.isFacingAnotherDiode(w, x, y, z, meta)) priority = -3;
      else if (this.isRepeaterPowered) priority = -2;
      w.scheduleBlockUpdate(x, y, z, this.blockID, this.getRepeaterDelay(meta), priority);
    }
  }

  /** func_94476_e: a repeater locked by a powered repeater from the side. */
  isLocked(_w: IBlockAccess, _x: number, _y: number, _z: number, _meta: number): boolean {
    return false;
  }

  /** func_94478_d */
  protected isGettingInput(w: IWorld, x: number, y: number, z: number, meta: number): boolean {
    return this.getInputStrength(w, x, y, z, meta) > 0;
  }

  protected getInputStrength(w: IWorld, x: number, y: number, z: number, meta: number): number {
    const d = BlockDirectional.getDirection(meta);
    const bx = x + Direction.offsetX[d];
    const bz = z + Direction.offsetZ[d];
    const power = w.getIndirectPowerLevelTo?.(bx, y, bz, Direction.directionToFacing[d]) ?? 0;
    if (power >= 15) return power;
    return Math.max(power, w.getBlockId(bx, y, bz) === BlockIds.redstoneWire ? w.getBlockMetadata(bx, y, bz) : 0);
  }

  /** func_94482_f: the strongest side input. */
  protected getSideInput(w: IBlockAccess, x: number, y: number, z: number, meta: number): number {
    const d = BlockDirectional.getDirection(meta);
    if (d === 0 || d === 2) return Math.max(this.getSidePower(w, x - 1, y, z, 4), this.getSidePower(w, x + 1, y, z, 5));
    return Math.max(this.getSidePower(w, x, y, z + 1, 3), this.getSidePower(w, x, y, z - 1, 2));
  }

  /** func_94488_g */
  protected getSidePower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    const id = w.getBlockId(x, y, z);
    if (!this.isSideInputBlock(id)) return 0;
    return id === BlockIds.redstoneWire ? w.getBlockMetadata(x, y, z) : w.isBlockProvidingPowerTo(x, y, z, side);
  }

  override canProvidePower(): boolean {
    return true;
  }

  /** Faces away from the placer (the input is on the placer's side). */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    const meta = (Block.yawToDirection(e) + 2) % 4;
    w.setBlockMetadataWithNotify(x, y, z, meta, 3);
    if (this.isGettingInput(w, x, y, z, meta)) w.scheduleBlockUpdate(x, y, z, this.blockID, 1);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    this.notifyOutput(w, x, y, z);
  }

  /** func_94483_i_: updates the block in front (and its neighbours except the diode). */
  protected notifyOutput(w: IWorld, x: number, y: number, z: number): void {
    const d = BlockDirectional.getDirection(w.getBlockMetadata(x, y, z));
    if (d === 1) {
      w.notifyBlockOfNeighborChange(x + 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID, 4);
    }
    if (d === 3) {
      w.notifyBlockOfNeighborChange(x - 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID, 5);
    }
    if (d === 2) {
      w.notifyBlockOfNeighborChange(x, y, z + 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID, 2);
    }
    if (d === 0) {
      w.notifyBlockOfNeighborChange(x, y, z - 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID, 3);
    }
  }

  override onBlockDestroyedByPlayer(w: IWorld, x: number, y: number, z: number, meta: number): void {
    if (this.isRepeaterPowered) {
      w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
      w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    }
    super.onBlockDestroyedByPlayer(w, x, y, z, meta);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  /** func_94477_d: which blocks feed the sides. */
  protected isSideInputBlock(id: number): boolean {
    const b = Block.blocksList[id];
    return b !== null && b.canProvidePower();
  }

  /** func_94480_d */
  protected getOutputStrength(_w: IBlockAccess, _x: number, _y: number, _z: number, _meta: number): number {
    return 15;
  }

  static isRedstoneRepeaterBlockID(id: number): boolean {
    return id === BlockIds.redstoneRepeaterIdle || id === BlockIds.redstoneRepeaterActive || id === BlockIds.redstoneComparatorIdle || id === BlockIds.redstoneComparatorActive;
  }

  /** func_94487_f: the idle or active form of this block. */
  isSameDiode(id: number): boolean {
    return id === this.getPoweredBlockId() || id === this.getUnpoweredBlockId();
  }

  /** func_83011_d: another diode behind this one that does not face the same way. */
  isFacingAnotherDiode(w: IWorld, x: number, y: number, z: number, meta: number): boolean {
    const d = BlockDirectional.getDirection(meta);
    const bx = x - Direction.offsetX[d];
    const bz = z - Direction.offsetZ[d];
    if (!BlockRedstoneLogic.isRedstoneRepeaterBlockID(w.getBlockId(bx, y, bz))) return false;
    return BlockDirectional.getDirection(w.getBlockMetadata(bx, y, bz)) !== d;
  }

  /** func_94486_g */
  protected getTickDelay(meta: number): number {
    return this.getRepeaterDelay(meta);
  }

  /** func_94481_j_ */
  protected abstract getRepeaterDelay(meta: number): number;
  /** func_94485_e */
  protected abstract getPoweredBlockId(): number;
  /** func_94484_i */
  protected abstract getUnpoweredBlockId(): number;

  override isAssociatedBlockID(id: number): boolean {
    return this.isSameDiode(id);
  }
}

/** Repeater (93 off, 94 on; render type 15): meta >> 2 = delay 1-4 (2-8 ticks), cycled by right click. */
export class BlockRedstoneRepeater extends BlockRedstoneLogic {
  /** How far the delay torch sits from the centre for each delay. */
  static readonly repeaterTorchOffset = [-0.0625, 0.0625, 0.1875, 0.3125];
  private static readonly repeaterState = [1, 2, 3, 4];

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    const delay = (((meta & 12) >> 2) + 1) << 2;
    w.setBlockMetadataWithNotify(x, y, z, (delay & 12) | (meta & 3), 3);
    return true;
  }

  protected getRepeaterDelay(meta: number): number {
    return BlockRedstoneRepeater.repeaterState[(meta & 12) >> 2] * 2;
  }

  protected getPoweredBlockId(): number {
    return BlockIds.redstoneRepeaterActive;
  }

  protected getUnpoweredBlockId(): number {
    return BlockIds.redstoneRepeaterIdle;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.redstoneRepeater;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.redstoneRepeater;
  }

  override getRenderType(): number {
    return 15;
  }

  /** Locked by a powered repeater or comparator pointing into its side. */
  override isLocked(w: IBlockAccess, x: number, y: number, z: number, meta: number): boolean {
    return this.getSideInput(w, x, y, z, meta) > 0;
  }

  protected override isSideInputBlock(id: number): boolean {
    return BlockRedstoneLogic.isRedstoneRepeaterBlockID(id);
  }

  /** Red dust over one of the two torches while powered. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (!this.isRepeaterPowered) return;
    const f = Math.fround;
    const meta = w.getBlockMetadata(x, y, z);
    const d = BlockDirectional.getDirection(meta);
    const px = f(x + 0.5) + f(rand.nextFloat() - 0.5) * 0.2;
    const py = f(y + 0.4) + f(rand.nextFloat() - 0.5) * 0.2;
    const pz = f(z + 0.5) + f(rand.nextFloat() - 0.5) * 0.2;
    let ox = 0;
    let oz = 0;
    if (rand.nextInt(2) === 0) {
      if (d === 0) oz = -0.3125;
      else if (d === 1) ox = 0.3125;
      else if (d === 2) oz = 0.3125;
      else if (d === 3) ox = -0.3125;
    } else {
      const off = BlockRedstoneRepeater.repeaterTorchOffset[(meta & 12) >> 2];
      if (d === 0) oz = off;
      else if (d === 1) ox = -off;
      else if (d === 2) oz = -off;
      else if (d === 3) ox = off;
    }
    w.spawnParticle('reddust', px + ox, py, pz + oz, 0, 0, 0);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    super.breakBlock(w, x, y, z, id, meta);
    this.notifyOutput(w, x, y, z);
  }
}

/**
 * Comparator (149 off, 150 on; render type 37): bit 4 = subtract mode (front torch lit),
 * bit 8 = output on; the output strength lives in TileEntityComparator.
 */
export class BlockComparator extends BlockRedstoneLogic implements ITileEntityProvider {
  constructor(id: number, powered: boolean) {
    super(id, powered);
    this.isBlockContainer = true;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.comparator;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.comparator;
  }

  protected getRepeaterDelay(_meta: number): number {
    return 2;
  }

  protected getPoweredBlockId(): number {
    return BlockIds.redstoneComparatorActive;
  }

  protected getUnpoweredBlockId(): number {
    return BlockIds.redstoneComparatorIdle;
  }

  override getRenderType(): number {
    return 37;
  }

  override getIcon(side: number, meta: number): Icon | null {
    const on = this.isRepeaterPowered || (meta & 8) !== 0;
    if (side === 0) return Block.blocksList[on ? BlockIds.torchRedstoneActive : BlockIds.torchRedstoneIdle]!.getBlockTextureFromSide(side);
    if (side === 1) return on ? (Block.blocksList[BlockIds.redstoneComparatorActive] as BlockComparator).blockIcon : this.blockIcon;
    return Block.blocksList[BlockIds.stoneDoubleSlab]!.getBlockTextureFromSide(1);
  }

  protected override isOutputOn(meta: number): boolean {
    return this.isRepeaterPowered || (meta & 8) !== 0;
  }

  protected override getOutputStrength(w: IBlockAccess, x: number, y: number, z: number, _meta: number): number {
    return this.getTileEntityComparator(w, x, y, z)?.getOutputSignal() ?? 0;
  }

  /** func_94491_m: the output for the current mode. */
  private computeOutput(w: IWorld, x: number, y: number, z: number, meta: number): number {
    const input = this.getInputStrength(w, x, y, z, meta);
    return !this.isSubtractMode(meta) ? input : Math.max(input - this.getSideInput(w, x, y, z, meta), 0);
  }

  /** func_94490_c */
  isSubtractMode(meta: number): boolean {
    return (meta & 4) === 4;
  }

  protected override isGettingInput(w: IWorld, x: number, y: number, z: number, meta: number): boolean {
    const input = this.getInputStrength(w, x, y, z, meta);
    if (input >= 15) return true;
    if (input === 0) return false;
    const side = this.getSideInput(w, x, y, z, meta);
    return side === 0 ? true : input >= side;
  }

  /** Also reads containers behind it (directly or through one solid block). */
  protected override getInputStrength(w: IWorld, x: number, y: number, z: number, meta: number): number {
    let power = super.getInputStrength(w, x, y, z, meta);
    const d = BlockDirectional.getDirection(meta);
    let bx = x + Direction.offsetX[d];
    let bz = z + Direction.offsetZ[d];
    let id = w.getBlockId(bx, y, bz);
    if (id > 0) {
      const b = Block.blocksList[id]!;
      if (b.hasComparatorInputOverride()) {
        power = b.getComparatorInputOverride(w, bx, y, bz, Direction.rotateOpposite[d]);
      } else if (power < 15 && Block.isNormalCube(id)) {
        bx += Direction.offsetX[d];
        bz += Direction.offsetZ[d];
        id = w.getBlockId(bx, y, bz);
        if (id > 0 && Block.blocksList[id]!.hasComparatorInputOverride()) power = Block.blocksList[id]!.getComparatorInputOverride(w, bx, y, bz, Direction.rotateOpposite[d]);
      }
    }
    return power;
  }

  getTileEntityComparator(w: IBlockAccess, x: number, y: number, z: number): TileEntityComparator | null {
    const te = (w as unknown as { getBlockTileEntity?: (x: number, y: number, z: number) => TileEntity | null }).getBlockTileEntity?.(x, y, z) ?? null;
    return te instanceof TileEntityComparator ? te : null;
  }

  /** Toggles compare / subtract mode (click pitch 0.55 into subtract, 0.5 back). */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    const on = this.isRepeaterPowered || (meta & 8) !== 0;
    const subtract = !this.isSubtractMode(meta);
    const bits = (subtract ? 4 : 0) | (on ? 8 : 0);
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, subtract ? 0.55 : 0.5);
    w.setBlockMetadataWithNotify(x, y, z, bits | (meta & 3), 2);
    this.refreshOutput(w, x, y, z);
    return true;
  }

  protected override updateState(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (w.isBlockTickScheduled(x, y, z, this.blockID)) return;
    const meta = w.getBlockMetadata(x, y, z);
    const out = this.computeOutput(w, x, y, z, meta);
    const current = this.getTileEntityComparator(w, x, y, z)?.getOutputSignal() ?? 0;
    if (out !== current || this.isOutputOn(meta) !== this.isGettingInput(w, x, y, z, meta)) {
      w.scheduleBlockUpdate(x, y, z, this.blockID, this.getRepeaterDelay(0), this.isFacingAnotherDiode(w, x, y, z, meta) ? -1 : 0);
    }
  }

  /** func_96476_c: stores the new output and switches bit 8. */
  private refreshOutput(w: IWorld, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const out = this.computeOutput(w, x, y, z, meta);
    const te = this.getTileEntityComparator(w, x, y, z);
    const old = te?.getOutputSignal() ?? 0;
    te?.setOutputSignal(out);
    if (old !== out || !this.isSubtractMode(meta)) {
      const input = this.isGettingInput(w, x, y, z, meta);
      const on = this.isRepeaterPowered || (meta & 8) !== 0;
      if (on && !input) w.setBlockMetadataWithNotify(x, y, z, meta & -9, 2);
      else if (!on && input) w.setBlockMetadataWithNotify(x, y, z, meta | 8, 2);
      this.notifyOutput(w, x, y, z);
    }
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (this.isRepeaterPowered) w.setBlock(x, y, z, this.getUnpoweredBlockId(), w.getBlockMetadata(x, y, z) | 8, 4);
    this.refreshOutput(w, x, y, z);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    w.setBlockTileEntity(x, y, z, this.createNewTileEntity(w));
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    super.breakBlock(w, x, y, z, id, meta);
    w.removeBlockTileEntity(x, y, z);
    this.notifyOutput(w, x, y, z);
  }

  override onBlockEventReceived(w: IWorld, x: number, y: number, z: number, id: number, param: number): boolean {
    super.onBlockEventReceived(w, x, y, z, id, param);
    const te = w.getBlockTileEntity(x, y, z);
    return te ? te.receiveClientEvent(id, param) : false;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.isRepeaterPowered ? 'comparator_lit' : 'comparator');
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityComparator();
  }
}
