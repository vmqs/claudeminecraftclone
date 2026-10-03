import { Keyboard, Mouse } from '../../client/Keyboard';
import { I18n } from '../../core/I18n';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { CreativeTabs } from '../../item/CreativeTabs';
import { ItemStack } from '../../item/ItemStack';
import { getAllCreativeItems } from '../../item/Items';
import { GL } from '../../render/gl/GL';
import { RenderHelper } from '../../render/RenderHelper';
import { GuiTextField } from '../GuiTextField';
import { ClickMode, Container, OUTSIDE_WINDOW } from './Container';
import { ContainerCreative, creativeGridInventory } from './ContainerCreative';
import { GuiInventory } from './GuiInventory';
import { InventoryEffectRenderer } from './InventoryEffectRenderer';
import { Slot } from './Slot';
import { SlotCreativeInventory } from './SlotCreativeInventory';

/** Drops a stack from the creative window; the server gave such items the short creative lifetime. */

/**
 * The creative inventory (GuiContainerCreative): twelve tabs around a 9x5 grid of every item
 * in the selected tab, a scroll bar, the search tab with its text field, and the Survival
 * Inventory tab showing the player's own slots, armour and the destroy-item slot.
 */
export class GuiContainerCreative extends InventoryEffectRenderer {
  /** The last selected tab, kept between openings. */
  private static selectedTabIndex = CreativeTabs.tabBlock.getTabIndex();
  private currentScroll = 0;
  private isScrolling = false;
  private wasClicking = false;
  private searchField!: GuiTextField;
  private backupContainerSlots: Slot[] | null = null;
  /** The destroy-item slot of the Survival Inventory tab (field_74235_v). */
  private destroySlot: Slot | null = null;
  /** A click happened since the last key press: the next key clears the search text (field_74234_w). */
  private clearSearchOnKey = false;
  private readonly creative: ContainerCreative;

  constructor(player: EntityPlayer) {
    const container = new ContainerCreative(player);
    super(container);
    this.creative = container;
    player.openContainer = container;
    this.allowUserInput = true;
    this.ySize = 136;
    this.xSize = 195;
  }

  /** The grid inventory shared by every creative window. */
  static getInventory(): typeof creativeGridInventory {
    return creativeGridInventory;
  }

  getSelectedTabIndex(): number {
    return GuiContainerCreative.selectedTabIndex;
  }

  override updateScreen(): void {
    if (!this.mc.playerController.isInCreativeMode()) this.mc.displayGuiScreen(new GuiInventory(this.mc.thePlayer!));
  }

  protected override handleMouseClick(slot: Slot | null, slotId: number, button: number, mode: number): void {
    this.clearSearchOnKey = true;
    const shift = mode === ClickMode.QUICK_MOVE;
    if (slotId === OUTSIDE_WINDOW && mode === ClickMode.PICKUP) mode = ClickMode.THROW;
    const player = this.mc.thePlayer!;
    const inv = player.inventory;
    const pc = this.mc.playerController;
    const tab = GuiContainerCreative.selectedTabIndex;
    const onInventoryTab = tab === CreativeTabs.tabInventory.getTabIndex();

    if (slot === null && !onInventoryTab && mode !== ClickMode.DRAG) {
      // Outside the window: throw the cursor stack (left) or one item of it (right).
      const held = inv.getItemStack();
      if (held) {
        if (button === 0) {
          this.mc.playerController.sendPacketDropItem(held);
          inv.setItemStack(null);
        }
        if (button === 1) {
          const one = held.splitStack(1);
          this.mc.playerController.sendPacketDropItem(one);
          if (held.stackSize === 0) inv.setItemStack(null);
        }
      }
    } else if (slot !== null && slot === this.destroySlot && shift) {
      // Shift-click on the destroy slot empties the whole inventory.
      for (let i = 0; i < player.inventoryContainer.getInventory().length; i++) pc.sendSlotPacket(null, i);
    } else if (onInventoryTab) {
      if (slot !== null && slot === this.destroySlot) {
        inv.setItemStack(null);
      } else if (mode === ClickMode.THROW && slot && slot.getHasStack()) {
        const thrown = slot.decrStackSize(button === 0 ? 1 : slot.getStack()!.getMaxStackSize());
        this.mc.playerController.sendPacketDropItem(thrown);
      } else if (mode === ClickMode.THROW && inv.getItemStack()) {
        this.mc.playerController.sendPacketDropItem(inv.getItemStack());
        inv.setItemStack(null);
      } else {
        const id = slot === null ? slotId : (slot as SlotCreativeInventory).theSlot.slotNumber;
        player.inventoryContainer.slotClick(id, button, mode, player);
        player.inventoryContainer.detectAndSendChanges();
      }
    } else if (mode !== ClickMode.DRAG && slot!.inventory === creativeGridInventory) {
      const held = inv.getItemStack();
      const inSlot = slot!.getStack();
      if (mode === ClickMode.SWAP) {
        // Number key over the grid: a full stack into that hotbar slot.
        if (inSlot && button >= 0 && button < 9) {
          const copy = inSlot.copy();
          copy.stackSize = copy.getMaxStackSize();
          inv.setInventorySlotContents(button, copy);
          player.inventoryContainer.detectAndSendChanges();
        }
        return;
      }
      if (mode === ClickMode.CLONE) {
        if (!inv.getItemStack() && slot!.getHasStack()) {
          const copy = slot!.getStack()!.copy();
          copy.stackSize = copy.getMaxStackSize();
          inv.setItemStack(copy);
        }
        return;
      }
      if (mode === ClickMode.THROW) {
        if (inSlot) {
          const copy = inSlot.copy();
          copy.stackSize = button === 0 ? 1 : copy.getMaxStackSize();
          this.mc.playerController.sendPacketDropItem(copy);
        }
        return;
      }
      if (held && inSlot && held.isItemEqual(inSlot)) {
        // Same item: left click adds one (shift: fills the stack), right click removes one.
        if (button === 0) {
          if (shift) held.stackSize = held.getMaxStackSize();
          else if (held.stackSize < held.getMaxStackSize()) held.stackSize++;
        } else if (held.stackSize <= 1) {
          inv.setItemStack(null);
        } else {
          held.stackSize--;
        }
      } else if (inSlot && !held) {
        inv.setItemStack(ItemStack.copyItemStack(inSlot));
        if (shift) inv.getItemStack()!.stackSize = inv.getItemStack()!.getMaxStackSize();
      } else {
        // Clicking the grid with anything else deletes the cursor stack.
        inv.setItemStack(null);
      }
    } else {
      this.inventorySlots.slotClick(slot === null ? slotId : slot.slotNumber, button, mode, player);
      if (Container.getDragEvent(button) === 2) {
        for (let i = 0; i < 9; i++) pc.sendSlotPacket(this.inventorySlots.getSlot(45 + i).getStack(), 36 + i);
      } else if (slot !== null) {
        const stack = this.inventorySlots.getSlot(slot.slotNumber).getStack();
        pc.sendSlotPacket(stack, slot.slotNumber - this.inventorySlots.inventorySlots.length + 9 + 36);
      }
    }
  }

  override initGui(): void {
    if (!this.mc.playerController.isInCreativeMode()) {
      this.mc.displayGuiScreen(new GuiInventory(this.mc.thePlayer!));
      return;
    }
    super.initGui();
    this.buttonList = [];
    Keyboard.enableRepeatEvents(true);
    // CreativeCrafting: a LAN guest reports every slot it changes to the host.
    const crafter = this.mc.playerController.creativeCrafter();
    if (crafter) this.mc.thePlayer!.inventoryContainer.addCraftingToCrafters(crafter);
    this.searchField = new GuiTextField(this.fontRenderer, this.guiLeft + 82, this.guiTop + 6, 89, this.fontRenderer.FONT_HEIGHT);
    this.searchField.setMaxStringLength(15);
    this.searchField.setEnableBackgroundDrawing(false);
    this.searchField.setVisible(false);
    this.searchField.setTextColor(0xffffff);
    const tab = GuiContainerCreative.selectedTabIndex;
    GuiContainerCreative.selectedTabIndex = -1;
    this.setCurrentCreativeTab(CreativeTabs.creativeTabArray[tab]);
  }

  override onGuiClosed(): void {
    super.onGuiClosed();
    Keyboard.enableRepeatEvents(false);
    const crafter = this.mc.playerController.creativeCrafter();
    if (crafter) this.mc.thePlayer?.inventoryContainer.removeCraftingFromCrafters(crafter);
  }

  protected override keyTyped(ch: string, key: number): void {
    if (GuiContainerCreative.selectedTabIndex !== CreativeTabs.tabAllSearch.getTabIndex()) {
      // The chat key jumps to the search tab.
      if (Keyboard.isKeyDown(this.mc.gameSettings.keyBindChat.keyCode)) this.setCurrentCreativeTab(CreativeTabs.tabAllSearch);
      else super.keyTyped(ch, key);
      return;
    }
    if (this.clearSearchOnKey) {
      this.clearSearchOnKey = false;
      this.searchField.setText('');
    }
    if (this.checkHotbarKeys(key)) return;
    if (this.searchField.textboxKeyTyped(ch, key)) this.updateCreativeSearch();
    else super.keyTyped(ch, key);
  }

  /** Every creative item (and every enchanted book) whose tooltip contains the search text. */
  private updateCreativeSearch(): void {
    const list = this.creative.itemList;
    list.length = 0;
    const query = this.searchField.getText().toLowerCase();
    const advanced = this.mc.gameSettings.advancedItemTooltips;
    for (const stack of getAllCreativeItems()) {
      if (stack.getTooltip(this.mc.thePlayer, advanced).some((line) => line.toLowerCase().includes(query))) list.push(stack);
    }
    this.currentScroll = 0;
    this.creative.scrollTo(0);
  }

  protected override drawGuiContainerForegroundLayer(): void {
    const tab = CreativeTabs.creativeTabArray[GuiContainerCreative.selectedTabIndex];
    if (tab.drawInForegroundOfTab()) this.fontRenderer.drawString(tab.getTranslatedTabLabel(), 8, 6, 0x404040);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    if (button === 0) {
      const rx = x - this.guiLeft;
      const ry = y - this.guiTop;
      for (const tab of CreativeTabs.creativeTabArray) if (this.isMouseOverTab(tab, rx, ry)) return;
    }
    super.mouseClicked(x, y, button);
  }

  protected override mouseMovedOrUp(x: number, y: number, button: number): void {
    if (button === 0) {
      const rx = x - this.guiLeft;
      const ry = y - this.guiTop;
      for (const tab of CreativeTabs.creativeTabArray) {
        if (this.isMouseOverTab(tab, rx, ry)) {
          this.setCurrentCreativeTab(tab);
          return;
        }
      }
    }
    super.mouseMovedOrUp(x, y, button);
  }

  private needsScrollBars(): boolean {
    const i = GuiContainerCreative.selectedTabIndex;
    return i !== CreativeTabs.tabInventory.getTabIndex() && CreativeTabs.creativeTabArray[i].shouldHidePlayerInventory() && this.creative.hasMoreThan1PageOfItemsInList();
  }

  /** Switches tab: refills the item list; the Survival Inventory tab swaps in the player's own slots. */
  setCurrentCreativeTab(tab: CreativeTabs): void {
    const previous = GuiContainerCreative.selectedTabIndex;
    GuiContainerCreative.selectedTabIndex = tab.getTabIndex();
    const c = this.creative;
    this.dragSplittingSlots.clear();
    c.itemList.length = 0;
    tab.displayAllReleventItems(c.itemList);
    const slots = c.inventorySlots;
    if (tab === CreativeTabs.tabInventory) {
      const own = this.mc.thePlayer!.inventoryContainer;
      if (this.backupContainerSlots === null) this.backupContainerSlots = [...slots];
      slots.length = 0;
      for (let i = 0; i < own.inventorySlots.length; i++) {
        const s = new SlotCreativeInventory(own.inventorySlots[i], i);
        slots.push(s);
        if (i >= 5 && i < 9) {
          // Armour: two columns of two either side of the player.
          const k = i - 5;
          s.xDisplayPosition = 9 + Math.trunc(k / 2) * 54;
          s.yDisplayPosition = 6 + (k % 2) * 27;
        } else if (i < 5) {
          // The crafting grid and result are not shown.
          s.xDisplayPosition = -2000;
          s.yDisplayPosition = -2000;
        } else {
          const k = i - 9;
          s.xDisplayPosition = 9 + (k % 9) * 18;
          s.yDisplayPosition = i >= 36 ? 112 : 54 + Math.trunc(k / 9) * 18;
        }
      }
      this.destroySlot = new Slot(creativeGridInventory, 0, 173, 112);
      slots.push(this.destroySlot);
    } else if (previous === CreativeTabs.tabInventory.getTabIndex() && this.backupContainerSlots) {
      slots.length = 0;
      slots.push(...this.backupContainerSlots);
      this.backupContainerSlots = null;
    }
    if (this.searchField) {
      if (tab === CreativeTabs.tabAllSearch) {
        this.searchField.setVisible(true);
        this.searchField.setCanLoseFocus(false);
        this.searchField.setFocused(true);
        this.searchField.setText('');
        this.updateCreativeSearch();
      } else {
        this.searchField.setVisible(false);
        this.searchField.setCanLoseFocus(true);
        this.searchField.setFocused(false);
      }
    }
    this.currentScroll = 0;
    c.scrollTo(0);
  }

  override handleMouseInput(): void {
    super.handleMouseInput();
    let wheel = Mouse.getEventDWheel();
    if (wheel !== 0 && this.needsScrollBars()) {
      const rows = Math.trunc(this.creative.itemList.length / 9) - 5 + 1;
      wheel = wheel > 0 ? 1 : -1;
      this.currentScroll = Math.fround(this.currentScroll - wheel / rows);
      if (this.currentScroll < 0) this.currentScroll = 0;
      if (this.currentScroll > 1) this.currentScroll = 1;
      this.creative.scrollTo(this.currentScroll);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const down = Mouse.isButtonDown(0);
    const x0 = this.guiLeft + 175;
    const y0 = this.guiTop + 18;
    const x1 = x0 + 14;
    const y1 = y0 + 112;
    if (!this.wasClicking && down && mx >= x0 && my >= y0 && mx < x1 && my < y1) this.isScrolling = this.needsScrollBars();
    if (!down) this.isScrolling = false;
    this.wasClicking = down;
    if (this.isScrolling) {
      this.currentScroll = Math.fround(Math.fround(my - y0 - 7.5) / Math.fround(y1 - y0 - 15));
      if (this.currentScroll < 0) this.currentScroll = 0;
      if (this.currentScroll > 1) this.currentScroll = 1;
      this.creative.scrollTo(this.currentScroll);
    }
    super.drawScreen(mx, my, pt);
    for (const tab of CreativeTabs.creativeTabArray) if (this.renderCreativeInventoryHoveringText(tab, mx, my)) break;
    const bin = this.destroySlot;
    if (bin && GuiContainerCreative.selectedTabIndex === CreativeTabs.tabInventory.getTabIndex() && this.isPointInRegion(bin.xDisplayPosition, bin.yDisplayPosition, 16, 16, mx, my)) {
      this.drawCreativeTabHoveringText(I18n.translateToLocal('inventory.binSlot'), mx, my);
    }
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
  }

  protected drawGuiContainerBackgroundLayer(_pt: number, mx: number, my: number): void {
    GL.color(1, 1, 1, 1);
    RenderHelper.enableGUIStandardItemLighting();
    const selected = CreativeTabs.creativeTabArray[GuiContainerCreative.selectedTabIndex];
    for (const tab of CreativeTabs.creativeTabArray) {
      this.mc.renderEngine.bindTexture('/gui/allitems.png');
      if (tab.getTabIndex() !== GuiContainerCreative.selectedTabIndex) this.renderCreativeTab(tab);
    }
    this.mc.renderEngine.bindTexture('/gui/creative_inv/' + selected.getBackgroundImageName());
    this.drawTexturedModalRect(this.guiLeft, this.guiTop, 0, 0, this.xSize, this.ySize);
    this.searchField.drawTextBox();
    GL.color(1, 1, 1, 1);
    const sx = this.guiLeft + 175;
    const sy0 = this.guiTop + 18;
    const sy1 = sy0 + 112;
    this.mc.renderEngine.bindTexture('/gui/allitems.png');
    if (selected.shouldHidePlayerInventory()) {
      this.drawTexturedModalRect(sx, sy0 + Math.trunc(Math.fround((sy1 - sy0 - 17) * this.currentScroll)), 232 + (this.needsScrollBars() ? 0 : 12), 0, 12, 15);
    }
    this.renderCreativeTab(selected);
    if (selected === CreativeTabs.tabInventory) {
      GuiInventory.drawPlayerOnGui(this.mc, this.guiLeft + 43, this.guiTop + 45, 20, Math.fround(this.guiLeft + 43 - mx), Math.fround(this.guiTop + 45 - 30 - my));
    }
  }

  /** The tab's top-left corner relative to the window: columns of 28 (+1 px gap each), the last one right-aligned. */
  private tabOrigin(tab: CreativeTabs): [number, number] {
    const col = tab.getTabColumn();
    let x = 28 * col;
    if (col === 5) x = this.xSize - 28 + 2;
    else if (col > 0) x += col;
    const y = tab.isTabInFirstRow() ? -32 : this.ySize;
    return [x, y];
  }

  /** func_74232_a */
  protected isMouseOverTab(tab: CreativeTabs, x: number, y: number): boolean {
    const [tx, ty] = this.tabOrigin(tab);
    return x >= tx && x <= tx + 28 && y >= ty && y <= ty + 32;
  }

  protected renderCreativeInventoryHoveringText(tab: CreativeTabs, mx: number, my: number): boolean {
    const [tx, ty] = this.tabOrigin(tab);
    if (!this.isPointInRegion(tx + 3, ty + 3, 23, 27, mx, my)) return false;
    this.drawCreativeTabHoveringText(tab.getTranslatedTabLabel(), mx, my);
    return true;
  }

  /** One tab from allitems.png (raised when selected) with its icon item. */
  protected renderCreativeTab(tab: CreativeTabs): void {
    const selected = tab.getTabIndex() === GuiContainerCreative.selectedTabIndex;
    const top = tab.isTabInFirstRow();
    const col = tab.getTabColumn();
    const u = col * 28;
    let v = selected ? 32 : 0;
    let x = this.guiLeft + 28 * col;
    let y = this.guiTop;
    if (col === 5) x = this.guiLeft + this.xSize - 28;
    else if (col > 0) x += col;
    if (top) {
      y -= 28;
    } else {
      v += 64;
      y += this.ySize - 4;
    }
    GL.disable(GL.LIGHTING);
    this.drawTexturedModalRect(x, y, u, v, 28, 32);
    const r = InventoryEffectRenderer.itemRenderer;
    this.zLevel = 100;
    r.zLevel = 100;
    x += 6;
    y += 8 + (top ? 1 : -1);
    GL.enable(GL.LIGHTING);
    GL.enable(GL.RESCALE_NORMAL);
    const item = tab.getTabIconItem();
    if (item) {
      const icon = new ItemStack(item);
      r.renderItemAndEffectIntoGUI(this.fontRenderer, this.mc.renderEngine, icon, x, y);
      r.renderItemOverlayIntoGUI(this.fontRenderer, this.mc.renderEngine, icon, x, y);
    }
    GL.disable(GL.LIGHTING);
    r.zLevel = 0;
    this.zLevel = 0;
  }

}
