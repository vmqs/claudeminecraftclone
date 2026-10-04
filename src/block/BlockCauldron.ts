import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Leather armour as the cauldron washes it (ItemArmor.removeColor). */
interface DyeableArmor {
  removeColor?(stack: ItemStack): void;
}

/**
 * Cauldron (118, render type 24): meta = water level 0-3. A water bucket fills it (the bucket
 * stays in creative), a glass bottle takes a level as a water bottle, leather armour is washed
 * of its dye, and rain refills it slowly.
 */
export class BlockCauldron extends Block {
  private iconInner: Icon | null = null;
  private iconTop: Icon | null = null;
  private iconBottom: Icon | null = null;

  constructor(id: number) {
    super(id, Material.iron);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.iconTop;
    return side === 0 ? this.iconBottom : this.blockIcon;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconInner = reg.registerIcon('cauldron_inner');
    this.iconTop = reg.registerIcon('cauldron_top');
    this.iconBottom = reg.registerIcon('cauldron_bottom');
    this.blockIcon = reg.registerIcon('cauldron_side');
  }

  /** func_94375_b: the inner and bottom textures, for the renderer. */
  static getCauldronIcon(name: string): Icon | null {
    const b = Block.blocksList[BlockIds.cauldron] as BlockCauldron | null;
    if (!b) return null;
    if (name === 'cauldron_inner') return b.iconInner;
    return name === 'cauldron_bottom' ? b.iconBottom : null;
  }

  /** The 5/16 floor and four 2/16 walls. */
  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    const t = 0.125;
    this.setBlockBounds(0, 0, 0, 1, 0.3125, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, t, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, 1, 1, t);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBoundsForItemRender();
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 24;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const inv = p.inventory;
    const held = inv.getCurrentItem();
    if (!held) return true;
    const level = w.getBlockMetadata(x, y, z);
    if (held.itemID === ItemIds.bucketWater) {
      if (level < 3) {
        if (!p.capabilities.isCreativeMode) inv.setInventorySlotContents(inv.currentItem, new ItemStack(ItemIds.bucketEmpty, 1, 0));
        w.setBlockMetadataWithNotify(x, y, z, 3, 2);
      }
      return true;
    }
    if (held.itemID === ItemIds.glassBottle) {
      if (level > 0) {
        const bottle = new ItemStack(ItemIds.potion, 1, 0);
        if (!inv.addItemStackToInventory(bottle)) {
          const e = w.createItemEntity?.(x + 0.5, y + 1.5, z + 0.5, bottle) ?? null;
          if (e) w.spawnEntityInWorld(e);
          else w.dropItemStack(x + 0.5, y + 1.5, z + 0.5, bottle);
        }
        held.stackSize--;
        if (held.stackSize <= 0) inv.setInventorySlotContents(inv.currentItem, null);
        w.setBlockMetadataWithNotify(x, y, z, level - 1, 2);
      }
    } else if (level > 0 && BlockCauldron.isLeatherArmor(held)) {
      (held.getItem() as unknown as DyeableArmor).removeColor?.(held);
      w.setBlockMetadataWithNotify(x, y, z, level - 1, 2);
      return true;
    }
    return true;
  }

  private static isLeatherArmor(stack: ItemStack): boolean {
    const id = stack.itemID;
    return id === ItemIds.helmetLeather || id === ItemIds.plateLeather || id === ItemIds.legsLeather || id === ItemIds.bootsLeather;
  }

  /** Rain adds a level now and then (1 in 20 rain ticks). */
  override fillWithRain(w: IWorld, x: number, y: number, z: number): void {
    if (w.rand.nextInt(20) !== 1) return;
    const level = w.getBlockMetadata(x, y, z);
    if (level < 3) w.setBlockMetadataWithNotify(x, y, z, level + 1, 2);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.cauldron;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.cauldron;
  }
}
