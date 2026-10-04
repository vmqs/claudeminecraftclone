import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityFurnace } from '../world/tileentity/TileEntityFurnace';
import { Block } from './Block';
import { BlockContainer, calcRedstoneFromInventory } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/**
 * Furnace (61 idle, 62 burning): meta 2-5 = the side with the front texture. While burning the
 * furnace swaps to block 62 (light 13, flames at the front) and back, keeping its tile entity.
 */
export class BlockFurnace extends BlockContainer {
  private readonly furnaceRand = BlockContainer.newRandom();
  private static keepFurnaceInventory = false;
  private iconTop: Icon | null = null;
  private iconFront: Icon | null = null;

  constructor(
    id: number,
    private readonly isActive: boolean,
  ) {
    super(id, Material.rock);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.furnaceIdle;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    BlockFurnace.setDefaultDirection(w, x, y, z);
  }

  /** Faces away from a solid neighbour (south by default). */
  static setDefaultDirection(w: IWorld, x: number, y: number, z: number): void {
    if (w.isRemote) return;
    const n = w.getBlockId(x, y, z - 1);
    const s = w.getBlockId(x, y, z + 1);
    const west = w.getBlockId(x - 1, y, z);
    const east = w.getBlockId(x + 1, y, z);
    const o = Block.opaqueCubeLookup;
    let facing = 3;
    if (o[n] && !o[s]) facing = 3;
    if (o[s] && !o[n]) facing = 2;
    if (o[west] && !o[east]) facing = 5;
    if (o[east] && !o[west]) facing = 4;
    w.setBlockMetadataWithNotify(x, y, z, facing, 2);
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 1 || side === 0) return this.iconTop;
    return side !== meta ? this.blockIcon : this.iconFront;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('furnace_side');
    this.iconFront = reg.registerIcon(this.isActive ? 'furnace_front_lit' : 'furnace_front');
    this.iconTop = reg.registerIcon('furnace_top');
  }

  /** Smoke and flames in front of a lit furnace. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (!this.isActive) return;
    const meta = w.getBlockMetadata(x, y, z);
    const px = f(x + 0.5);
    const py = f(f(y + 0) + f(f(rand.nextFloat() * 6) / 16));
    const pz = f(z + 0.5);
    const d = f(0.52);
    const r = f(f(rand.nextFloat() * f(0.6)) - f(0.3));
    let fx = px;
    let fz = pz;
    if (meta === 4) {
      fx = f(px - d);
      fz = f(pz + r);
    } else if (meta === 5) {
      fx = f(px + d);
      fz = f(pz + r);
    } else if (meta === 2) {
      fx = f(px + r);
      fz = f(pz - d);
    } else if (meta === 3) {
      fx = f(px + r);
      fz = f(pz + d);
    } else {
      return;
    }
    w.spawnParticle('smoke', fx, py, fz, 0, 0, 0);
    w.spawnParticle('flame', fx, py, fz, 0, 0, 0);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityFurnace) BlockGuiHooks.open({ kind: 'furnace', player: p, world: w, x, y, z, inventory: te, tileEntity: te });
    return true;
  }

  /** Swaps between the idle and burning block, keeping metadata and the tile entity (and its items). */
  static updateFurnaceBlockState(burning: boolean, w: IWorld, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const te = w.getBlockTileEntity(x, y, z);
    BlockFurnace.keepFurnaceInventory = true;
    w.setBlock(x, y, z, burning ? BlockIds.furnaceBurning : BlockIds.furnaceIdle);
    BlockFurnace.keepFurnaceInventory = false;
    w.setBlockMetadataWithNotify(x, y, z, meta, 2);
    if (te) {
      te.validate();
      w.setBlockTileEntity(x, y, z, te);
    }
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityFurnace();
  }

  /** The front faces the placer. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, [2, 5, 3, 4][Block.yawToDirection(e)], 2);
    if (stack.hasDisplayName()) {
      const te = w.getBlockTileEntity(x, y, z);
      if (te instanceof TileEntityFurnace) te.setGuiDisplayName(stack.getDisplayName());
    }
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    if (!BlockFurnace.keepFurnaceInventory) {
      const te = w.getBlockTileEntity(x, y, z);
      if (te instanceof TileEntityFurnace) {
        BlockContainer.dropInventory(w, x, y, z, te, this.furnaceRand);
        w.notifyComparatorsOfChange(x, y, z, id);
      }
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    return calcRedstoneFromInventory(te instanceof TileEntityFurnace ? te : null);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return BlockIds.furnaceIdle;
  }
}

TileEntityFurnace.updateBlockState = (burning, te) => {
  if (te.worldObj) BlockFurnace.updateFurnaceBlockState(burning, te.worldObj, te.xCoord, te.yCoord, te.zCoord);
};
