import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { InventoryEnderChest, TileEntityEnderChest } from '../world/tileentity/TileEntityEnderChest';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Ender chest (130, render type 22): opens the player's own 27-slot ender inventory; drops 8 obsidian. */
export class BlockEnderChest extends BlockContainer {
  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabDecorations);
    this.setBlockBounds(0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 22;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.obsidian;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 8;
  }

  protected override canSilkHarvest(): boolean {
    return true;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, [2, 5, 3, 4][Block.yawToDirection(e)], 2);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    const inv = InventoryEnderChest.forPlayer(p);
    const te = w.getBlockTileEntity(x, y, z);
    if (!(te instanceof TileEntityEnderChest)) return true;
    if (w.isBlockNormalCube(x, y + 1, z) || w.isRemote) return true;
    inv.setAssociatedChest(te);
    return BlockGuiHooks.open({ kind: 'enderChest', player: p, world: w, x, y, z, inventory: inv, tileEntity: te });
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityEnderChest();
  }

  /** Portal particles drawn in toward the chest. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    for (let i = 0; i < 3; i++) {
      // The original draws a position and a motion first and then overwrites most of them.
      rand.nextFloat();
      const py = Math.fround(y + rand.nextFloat());
      rand.nextFloat();
      const sx = rand.nextInt(2) * 2 - 1;
      const sz = rand.nextInt(2) * 2 - 1;
      rand.nextFloat();
      const vy = (rand.nextFloat() - 0.5) * 0.125;
      rand.nextFloat();
      const pz = z + 0.5 + 0.25 * sz;
      const vz = Math.fround(rand.nextFloat() * sz);
      const px = x + 0.5 + 0.25 * sx;
      const vx = Math.fround(rand.nextFloat() * sx);
      w.spawnParticle('portal', px, py, pz, vx, vy, vz);
    }
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('obsidian');
  }
}
