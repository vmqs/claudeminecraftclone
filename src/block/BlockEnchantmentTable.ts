import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityEnchantmentTable } from '../world/tileentity/TileEntityEnchantmentTable';
import { BlockContainer } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/** Enchanting table (116): 12/16 high; glyphs fly to it from bookshelves two blocks away. */
export class BlockEnchantmentTable extends BlockContainer {
  private iconTop: Icon | null = null;
  private iconBottom: Icon | null = null;

  constructor(id: number) {
    super(id, Material.rock);
    this.setBlockBounds(0, 0, 0, 1, 0.75, 1);
    this.setLightOpacity(0);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  /** "enchantmenttable" particles from each bookshelf in the 5x5 ring (not blocked halfway). */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.randomDisplayTick(w, x, y, z, rand);
    for (let bx = x - 2; bx <= x + 2; bx++) {
      for (let bz = z - 2; bz <= z + 2; bz++) {
        if (bx > x - 2 && bx < x + 2 && bz === z - 1) bz = z + 2;
        if (rand.nextInt(16) !== 0) continue;
        for (let by = y; by <= y + 1; by++) {
          if (w.getBlockId(bx, by, bz) !== BlockIds.bookShelf) continue;
          if (!w.isAirBlock(Math.trunc((bx - x) / 2) + x, by, Math.trunc((bz - z) / 2) + z)) break;
          const vx = f(bx - x + rand.nextFloat()) - 0.5;
          const vy = f(f(by - y - rand.nextFloat()) - 1);
          const vz = f(bz - z + rand.nextFloat()) - 0.5;
          w.spawnParticle('enchantmenttable', x + 0.5, y + 2, z + 0.5, vx, vy, vz);
        }
      }
    }
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 0) return this.iconBottom;
    return side === 1 ? this.iconTop : this.blockIcon;
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityEnchantmentTable();
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    const name = te instanceof TileEntityEnchantmentTable && te.hasCustomName() ? te.getInvName() : null;
    return BlockGuiHooks.open({ kind: 'enchantment', player: p, world: w, x, y, z, tileEntity: te, customName: name });
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    super.onBlockPlacedBy(w, x, y, z, e, stack);
    if (!stack.hasDisplayName()) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityEnchantmentTable) te.setCustomName(stack.getDisplayName());
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('enchantment_side');
    this.iconTop = reg.registerIcon('enchantment_top');
    this.iconBottom = reg.registerIcon('enchantment_bottom');
  }
}
