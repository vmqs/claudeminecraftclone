import { BlockIds, ItemIds } from '../../block/BlockIds';
import { JavaRandom } from '../../core/JavaRandom';
import { addStoredEnchantment, EnchantmentHelper } from '../../enchantment/EnchantmentHelper';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { ItemStack } from '../../item/ItemStack';
import type { World } from '../../world/World';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { InventoryBasic } from './InventoryBasic';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';

/** The one-item table inventory (SlotEnchantmentTable): changes re-roll the offered levels. */
class EnchantmentTableInventory extends InventoryBasic {
  constructor(private readonly container: ContainerEnchantment) {
    super('Enchant', true, 1);
  }

  override getInventoryStackLimit(): number {
    return 1;
  }

  override onInventoryChanged(): void {
    super.onInventoryChanged();
    this.container.onCraftMatrixChanged(this);
  }

  override isStackValidForSlot(): boolean {
    return true;
  }
}

/** The item slot of the table (SlotEnchantment): accepts anything. */
class SlotEnchantment extends Slot {
  override isItemValid(): boolean {
    return true;
  }
}

/** What enchanting needs from the player's experience (EntityPlayer.experienceLevel / addExperienceLevel). */
interface Leveled {
  experienceLevel?: number;
  addExperienceLevel?(levels: number): void;
}

/**
 * The enchanting table window (ContainerEnchantment): one item slot; three offers whose levels
 * depend on the bookshelves around the table (one block gap of air), and enchanting itself.
 */
export class ContainerEnchantment extends Container {
  readonly tableInventory: IInventory;
  private readonly rand = new JavaRandom();
  /** Seed of the random galactic names shown on the offers. */
  nameSeed = 0n;
  readonly enchantLevels = [0, 0, 0];

  constructor(
    inv: InventoryPlayer,
    private readonly worldPointer: World,
    private readonly posX: number,
    private readonly posY: number,
    private readonly posZ: number,
  ) {
    super();
    this.tableInventory = new EnchantmentTableInventory(this);
    this.addSlotToContainer(new SlotEnchantment(this.tableInventory, 0, 25, 47));
    addPlayerSlots(this, inv, 84);
  }

  override updateProgressBar(id: number, value: number): void {
    if (id >= 0 && id <= 2) this.enchantLevels[id] = value;
    else super.updateProgressBar(id, value);
  }

  /** Bookshelves at distance 2 (both heights) whose line to the table is clear air. */
  private countBookshelves(): number {
    const w = this.worldPointer;
    const { posX: x, posY: y, posZ: z } = this;
    const shelf = (bx: number, by: number, bz: number) => (w.getBlockId(bx, by, bz) === BlockIds.bookShelf ? 1 : 0);
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dz === 0 && dx === 0) || !w.isAirBlock(x + dx, y, z + dz) || !w.isAirBlock(x + dx, y + 1, z + dz)) continue;
        n += shelf(x + dx * 2, y, z + dz * 2) + shelf(x + dx * 2, y + 1, z + dz * 2);
        if (dx !== 0 && dz !== 0) {
          n += shelf(x + dx * 2, y, z + dz) + shelf(x + dx * 2, y + 1, z + dz);
          n += shelf(x + dx, y, z + dz * 2) + shelf(x + dx, y + 1, z + dz * 2);
        }
      }
    }
    return n;
  }

  override onCraftMatrixChanged(inv: IInventory): void {
    if (inv !== this.tableInventory) return;
    const stack = inv.getStackInSlot(0);
    if (stack && stack.isItemEnchantable()) {
      this.nameSeed = this.rand.nextLong();
      if (!this.worldPointer.isRemote) {
        const shelves = this.countBookshelves();
        for (let i = 0; i < 3; i++) this.enchantLevels[i] = EnchantmentHelper.calcItemStackEnchantability(this.rand, i, shelves, stack);
        this.detectAndSendChanges();
      }
    } else {
      this.enchantLevels.fill(0);
    }
  }

  /** Enchants the item with offer `button` (a book becomes an enchanted book with one of the rolled enchantments). */
  override enchantItem(player: EntityPlayer, button: number): boolean {
    const stack = this.tableInventory.getStackInSlot(0);
    const level = this.enchantLevels[button];
    const p = player as EntityPlayer & Leveled;
    if (level <= 0 || !stack || ((p.experienceLevel ?? 0) < level && !player.capabilities.isCreativeMode)) return false;
    if (!this.worldPointer.isRemote) {
      const list = EnchantmentHelper.buildEnchantmentList(this.rand, stack, level);
      const isBook = stack.itemID === ItemIds.book;
      if (list) {
        p.addExperienceLevel?.(-level);
        if (isBook) stack.itemID = ItemIds.enchantedBook;
        const pick = isBook ? this.rand.nextInt(list.length) : -1;
        list.forEach((d, i) => {
          if (isBook && i !== pick) return;
          if (isBook) addStoredEnchantment(stack, d);
          else stack.addEnchantment(d.enchantmentobj, d.enchantmentLevel);
        });
        this.onCraftMatrixChanged(this.tableInventory);
      }
    }
    return true;
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    if (!this.worldPointer.isRemote) {
      const s = this.tableInventory.getStackInSlotOnClosing(0);
      if (s) player.dropPlayerItem(s);
    }
  }

  canInteractWith(player: EntityPlayer): boolean {
    if (this.worldPointer.getBlockId(this.posX, this.posY, this.posZ) !== BlockIds.enchantmentTable) return false;
    return player.getDistanceSq(this.posX + 0.5, this.posY + 0.5, this.posZ + 0.5) <= 64;
  }

  /** Shift-click: the table item back to the inventory; one item (or a tagged single stack) into the table. */
  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index === 0) {
      if (!this.mergeItemStack(stack, 1, 37, true)) return null;
    } else {
      const table = this.inventorySlots[0];
      if (table.getHasStack() || !table.isItemValid(stack)) return null;
      if (stack.stackTagCompound && stack.stackSize === 1) {
        table.putStack(stack.copy());
        stack.stackSize = 0;
      } else if (stack.stackSize >= 1) {
        table.putStack(new ItemStack(stack.itemID, 1, stack.getItemDamage()));
        stack.stackSize--;
      }
    }
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }
}
