import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityBrewingStand } from '../world/tileentity/TileEntityBrewingStand';
import { BlockContainer, calcRedstoneFromInventory } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/** Brewing stand (117, render type 25): meta bits 1/2/4 show the bottles; smoke rises from it. */
export class BlockBrewingStand extends BlockContainer {
  private readonly rand = BlockContainer.newRandom();
  private iconBase: Icon | null = null;

  constructor(id: number) {
    super(id, Material.iron);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 25;
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityBrewingStand();
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  /** The rod and the base plate. */
  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    this.setBlockBounds(0.4375, 0, 0.4375, 0.5625, 0.875, 0.5625);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBoundsForItemRender();
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 0.125, 1);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityBrewingStand) BlockGuiHooks.open({ kind: 'brewingStand', player: p, world: w, x, y, z, inventory: te, tileEntity: te });
    return true;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, _e: EntityLiving, stack: ItemStack): void {
    if (!stack.hasDisplayName()) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityBrewingStand) te.setGuiDisplayName(stack.getDisplayName());
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    const px = f(f(x + f(0.4)) + f(rand.nextFloat() * f(0.2)));
    const py = f(f(y + f(0.7)) + f(rand.nextFloat() * f(0.3)));
    const pz = f(f(z + f(0.4)) + f(rand.nextFloat() * f(0.2)));
    w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityBrewingStand) BlockContainer.dropInventory(w, x, y, z, te, this.rand);
    super.breakBlock(w, x, y, z, id, meta);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.brewingStand;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.brewingStand;
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    return calcRedstoneFromInventory(te instanceof TileEntityBrewingStand ? te : null);
  }

  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.iconBase = reg.registerIcon('brewingStand_base');
  }

  getBrewingStandIcon(): Icon | null {
    return this.iconBase;
  }
}
