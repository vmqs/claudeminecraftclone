import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemStack } from '../item/ItemStack';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Flower pot (140, render type 33): meta = the plant in it (1 rose, 2 dandelion, 3-6 saplings,
 * 7 red and 8 brown mushroom, 9 cactus, 10 dead bush, 11 fern). Right click with a plant puts
 * it in (creative keeps the item).
 */
export class BlockFlowerPot extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setBlockBoundsForItemRender();
  }

  override setBlockBoundsForItemRender(): void {
    const h = 0.375;
    const r = h / 2;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, h, 0.5 + r);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 33;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    const held = p.inventory.getCurrentItem();
    if (!held || w.getBlockMetadata(x, y, z) !== 0) return false;
    const meta = BlockFlowerPot.getMetaForPlant(held);
    if (meta <= 0) return false;
    w.setBlockMetadataWithNotify(x, y, z, meta, 2);
    if (!p.capabilities.isCreativeMode && --held.stackSize <= 0) p.inventory.setInventorySlotContents(p.inventory.currentItem, null);
    return true;
  }

  /** Pick block gives the plant (or the pot when empty). */
  override idPicked(w: IWorld, x: number, y: number, z: number): number {
    const plant = BlockFlowerPot.getPlantForMeta(w.getBlockMetadata(x, y, z));
    return plant ? plant.itemID : ItemIds.flowerPot;
  }

  override getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    const plant = BlockFlowerPot.getPlantForMeta(w.getBlockMetadata(x, y, z));
    return plant ? plant.getItemDamage() : ItemIds.flowerPot;
  }

  override isFlowerPot(): boolean {
    return true;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return super.canPlaceBlockAt(w, x, y, z) && w.doesBlockHaveSolidTopSurface(x, y - 1, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  /** The pot and, if any, its plant. */
  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, fortune);
    if (meta > 0) {
      const plant = BlockFlowerPot.getPlantForMeta(meta);
      if (plant) this.dropBlockAsItem_do(w, x, y, z, plant);
    }
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.flowerPot;
  }

  static getPlantForMeta(meta: number): ItemStack | null {
    switch (meta) {
      case 1:
        return new ItemStack(BlockIds.plantRed, 1, 0);
      case 2:
        return new ItemStack(BlockIds.plantYellow, 1, 0);
      case 3:
      case 4:
      case 5:
      case 6:
        return new ItemStack(BlockIds.sapling, 1, meta - 3);
      case 7:
        return new ItemStack(BlockIds.mushroomRed, 1, 0);
      case 8:
        return new ItemStack(BlockIds.mushroomBrown, 1, 0);
      case 9:
        return new ItemStack(BlockIds.cactus, 1, 0);
      case 10:
        return new ItemStack(BlockIds.deadBush, 1, 0);
      case 11:
        return new ItemStack(BlockIds.tallGrass, 1, 2);
      default:
        return null;
    }
  }

  static getMetaForPlant(stack: ItemStack): number {
    const id = stack.itemID;
    if (id === BlockIds.plantRed) return 1;
    if (id === BlockIds.plantYellow) return 2;
    if (id === BlockIds.cactus) return 9;
    if (id === BlockIds.mushroomBrown) return 8;
    if (id === BlockIds.mushroomRed) return 7;
    if (id === BlockIds.deadBush) return 10;
    if (id === BlockIds.sapling) {
      const d = stack.getItemDamage();
      if (d >= 0 && d <= 3) return 3 + d;
    }
    if (id === BlockIds.tallGrass && stack.getItemDamage() === 2) return 11;
    return 0;
  }
}
