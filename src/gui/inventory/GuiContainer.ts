import { MathHelper } from '../../core/MathHelper';
import type { ItemStack } from '../../item/ItemStack';
import { RenderItem } from '../../render/entity/RenderItem';
import { GL } from '../../render/gl/GL';
import { OpenGlHelper } from '../../render/OpenGlHelper';
import { RenderHelper } from '../../render/RenderHelper';
import { Keys } from '../../client/Keyboard';
import { GuiScreen } from '../GuiScreen';
import { ClickMode, Container, OUTSIDE_WINDOW } from './Container';
import type { Slot } from './Slot';

/** Slot highlight and drag-preview colour (0x80FFFFFF). */
const HIGHLIGHT = -2130706433;

/**
 * A screen showing a Container (GuiContainer): background and foreground layers drawn by
 * subclasses around the slots, the hovered-slot highlight, the stack on the cursor, item
 * tooltips, and the mouse handling of 1.5.2 (click, shift-click, number keys, middle-click
 * clone, Q drop, drag-spreading, double-click collect, touchscreen drag).
 */
export abstract class GuiContainer extends GuiScreen {
  protected static itemRenderer = new RenderItem();
  protected xSize = 176;
  protected ySize = 166;
  protected guiLeft = 0;
  protected guiTop = 0;
  /** The slot under the mouse this frame (theSlot). */
  private theSlot: Slot | null = null;
  /** Touchscreen drag state. */
  private clickedSlot: Slot | null = null;
  private isRightMouseClick = false;
  private draggedStack: ItemStack | null = null;
  private touchUpX = 0;
  private touchUpY = 0;
  private returningStackDestSlot: Slot | null = null;
  private returningStackTime = 0;
  private returningStack: ItemStack | null = null;
  private currentDragTargetSlot: Slot | null = null;
  private dragItemDropDelay = 0;
  /** Drag-spreading over several slots. */
  protected readonly dragSplittingSlots = new Set<Slot>();
  protected dragSplitting = false;
  private dragSplittingLimit = 0;
  private dragSplittingButton = 0;
  private ignoreMouseUp: boolean;
  private dragSplittingRemnant = 0;
  /** Double-click detection. */
  private lastClickTime = 0;
  private lastClickSlot: Slot | null = null;
  private lastClickButton = 0;
  private doubleClick = false;
  private shiftClickedSlot: ItemStack | null = null;

  constructor(public inventorySlots: Container) {
    super();
    this.ignoreMouseUp = true;
  }

  override initGui(): void {
    super.initGui();
    this.mc.thePlayer!.openContainer = this.inventorySlots;
    this.guiLeft = Math.trunc((this.width - this.xSize) / 2);
    this.guiTop = Math.trunc((this.height - this.ySize) / 2);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const left = this.guiLeft;
    const top = this.guiTop;
    this.drawGuiContainerBackgroundLayer(pt, mx, my);
    GL.disable(GL.RESCALE_NORMAL);
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.LIGHTING);
    GL.disable(GL.DEPTH_TEST);
    super.drawScreen(mx, my, pt);
    RenderHelper.enableGUIStandardItemLighting();
    GL.pushMatrix();
    GL.translate(left, top, 0);
    GL.color(1, 1, 1, 1);
    GL.enable(GL.RESCALE_NORMAL);
    this.theSlot = null;
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, 240, 240);
    GL.color(1, 1, 1, 1);
    for (const slot of this.inventorySlots.inventorySlots) {
      this.drawSlotInventory(slot);
      if (this.isMouseOverSlot(slot, mx, my)) {
        this.theSlot = slot;
        GL.disable(GL.LIGHTING);
        GL.disable(GL.DEPTH_TEST);
        const x = slot.xDisplayPosition;
        const y = slot.yDisplayPosition;
        this.drawGradientRect(x, y, x + 16, y + 16, HIGHLIGHT, HIGHLIGHT);
        GL.enable(GL.LIGHTING);
        GL.enable(GL.DEPTH_TEST);
      }
    }
    this.drawGuiContainerForegroundLayer(mx, my);

    const inv = this.mc.thePlayer!.inventory;
    let cursor = this.draggedStack ?? inv.getItemStack();
    if (cursor) {
      const dy = this.draggedStack === null ? 8 : 16;
      let label: string | null = null;
      if (this.draggedStack !== null && this.isRightMouseClick) {
        cursor = cursor.copy();
        cursor.stackSize = MathHelper.ceiling_float_int(cursor.stackSize / 2);
      } else if (this.dragSplitting && this.dragSplittingSlots.size > 1) {
        cursor = cursor.copy();
        cursor.stackSize = this.dragSplittingRemnant;
        if (cursor.stackSize === 0) label = '§e0';
      }
      this.drawItemStack(cursor, mx - left - 8, my - top - dy, label);
    }
    if (this.returningStack && this.returningStackDestSlot) {
      let t = (performance.now() - this.returningStackTime) / 100;
      const dest = this.returningStackDestSlot;
      const stack = this.returningStack;
      if (t >= 1) {
        t = 1;
        this.returningStack = null;
      }
      const x = this.touchUpX + Math.trunc((dest.xDisplayPosition - this.touchUpX) * t);
      const y = this.touchUpY + Math.trunc((dest.yDisplayPosition - this.touchUpY) * t);
      this.drawItemStack(stack, x, y, null);
    }
    GL.popMatrix();

    if (inv.getItemStack() === null && this.theSlot?.getHasStack()) this.drawItemStackTooltip(this.theSlot.getStack()!, mx, my);
    GL.enable(GL.LIGHTING);
    GL.enable(GL.DEPTH_TEST);
    RenderHelper.enableStandardItemLighting();
  }

  private drawItemStack(stack: ItemStack, x: number, y: number, label: string | null): void {
    const r = GuiContainer.itemRenderer;
    GL.translate(0, 0, 32);
    this.zLevel = 200;
    r.zLevel = 200;
    r.renderItemAndEffectIntoGUI(this.fontRenderer, this.mc.renderEngine, stack, x, y);
    r.renderItemOverlayIntoGUI(this.fontRenderer, this.mc.renderEngine, stack, x, y - (this.draggedStack === null ? 0 : 8), label);
    this.zLevel = 0;
    r.zLevel = 0;
  }

  /** The item name in its rarity colour, then grey detail lines. */
  protected drawItemStackTooltip(stack: ItemStack, x: number, y: number): void {
    const lines = stack.getTooltip(this.mc.thePlayer, this.mc.gameSettings.advancedItemTooltips);
    for (let i = 0; i < lines.length; i++) {
      lines[i] = i === 0 ? '§' + stack.getRarity().rarityColor.toString(16) + lines[i] : '§7' + lines[i];
    }
    this.drawHoveringText(lines, x, y);
  }

  protected drawCreativeTabHoveringText(text: string, x: number, y: number): void {
    this.drawHoveringText([text], x, y);
  }

  /** func_102021_a: the purple-bordered tooltip box, kept inside the screen. */
  protected drawHoveringText(lines: readonly string[], mx: number, my: number): void {
    if (lines.length === 0) return;
    GL.disable(GL.RESCALE_NORMAL);
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.LIGHTING);
    GL.disable(GL.DEPTH_TEST);
    let w = 0;
    for (const s of lines) w = Math.max(w, this.fontRenderer.getStringWidth(s));
    let x = mx + 12;
    let y = my - 12;
    let h = 8;
    if (lines.length > 1) h += 2 + (lines.length - 1) * 10;
    if (x + w > this.width) x -= 28 + w;
    if (y + h + 6 > this.height) y = this.height - h - 6;
    const r = GuiContainer.itemRenderer;
    this.zLevel = 300;
    r.zLevel = 300;
    const bg = -267386864;
    this.drawGradientRect(x - 3, y - 4, x + w + 3, y - 3, bg, bg);
    this.drawGradientRect(x - 3, y + h + 3, x + w + 3, y + h + 4, bg, bg);
    this.drawGradientRect(x - 3, y - 3, x + w + 3, y + h + 3, bg, bg);
    this.drawGradientRect(x - 4, y - 3, x - 3, y + h + 3, bg, bg);
    this.drawGradientRect(x + w + 3, y - 3, x + w + 4, y + h + 3, bg, bg);
    const borderTop = 1347420415;
    const borderBottom = (((borderTop & 0xfefefe) >> 1) | (borderTop & 0xff000000)) | 0;
    this.drawGradientRect(x - 3, y - 3 + 1, x - 3 + 1, y + h + 3 - 1, borderTop, borderBottom);
    this.drawGradientRect(x + w + 2, y - 3 + 1, x + w + 3, y + h + 3 - 1, borderTop, borderBottom);
    this.drawGradientRect(x - 3, y - 3, x + w + 3, y - 3 + 1, borderTop, borderTop);
    this.drawGradientRect(x - 3, y + h + 2, x + w + 3, y + h + 3, borderBottom, borderBottom);
    for (let i = 0; i < lines.length; i++) {
      this.fontRenderer.drawStringWithShadow(lines[i], x, y, -1);
      if (i === 0) y += 2;
      y += 10;
    }
    this.zLevel = 0;
    r.zLevel = 0;
    GL.enable(GL.LIGHTING);
    GL.enable(GL.DEPTH_TEST);
    RenderHelper.enableStandardItemLighting();
    GL.enable(GL.RESCALE_NORMAL);
  }

  protected drawGuiContainerForegroundLayer(_mx: number, _my: number): void {}

  protected abstract drawGuiContainerBackgroundLayer(pt: number, mx: number, my: number): void;

  private drawSlotInventory(slot: Slot): void {
    const x = slot.xDisplayPosition;
    const y = slot.yDisplayPosition;
    let stack = slot.getStack();
    let preview = false;
    let hidden = slot === this.clickedSlot && this.draggedStack !== null && !this.isRightMouseClick;
    const held = this.mc.thePlayer!.inventory.getItemStack();
    let label: string | null = null;
    if (slot === this.clickedSlot && this.draggedStack !== null && this.isRightMouseClick && stack) {
      stack = stack.copy();
      stack.stackSize = Math.trunc(stack.stackSize / 2);
    } else if (this.dragSplitting && this.dragSplittingSlots.has(slot) && held) {
      if (this.dragSplittingSlots.size === 1) return;
      if (Container.canAddItemToSlot(slot, held, true) && this.inventorySlots.canDragIntoSlot(slot)) {
        stack = held.copy();
        preview = true;
        Container.computeStackSize(this.dragSplittingSlots, this.dragSplittingLimit, stack, slot.getStack()?.stackSize ?? 0);
        if (stack.stackSize > stack.getMaxStackSize()) {
          label = '§e' + stack.getMaxStackSize();
          stack.stackSize = stack.getMaxStackSize();
        }
        if (stack.stackSize > slot.getSlotStackLimit()) {
          label = '§e' + slot.getSlotStackLimit();
          stack.stackSize = slot.getSlotStackLimit();
        }
      } else {
        this.dragSplittingSlots.delete(slot);
        this.updateDragSplitting();
      }
    }
    const r = GuiContainer.itemRenderer;
    this.zLevel = 100;
    r.zLevel = 100;
    if (!stack) {
      const icon = slot.getBackgroundIconIndex();
      if (icon) {
        GL.disable(GL.LIGHTING);
        this.mc.renderEngine.bindTexture('/gui/items.png');
        this.drawTexturedModelRectFromIcon(x, y, icon, 16, 16);
        GL.enable(GL.LIGHTING);
        hidden = true;
      }
    }
    if (!hidden) {
      if (preview) GuiScreen.drawRect(x, y, x + 16, y + 16, HIGHLIGHT);
      GL.enable(GL.DEPTH_TEST);
      r.renderItemAndEffectIntoGUI(this.fontRenderer, this.mc.renderEngine, stack, x, y);
      r.renderItemOverlayIntoGUI(this.fontRenderer, this.mc.renderEngine, stack, x, y, label);
    }
    r.zLevel = 0;
    this.zLevel = 0;
  }

  /** func_94066_g: how many items stay on the cursor after the current drag-spread. */
  private updateDragSplitting(): void {
    const held = this.mc.thePlayer!.inventory.getItemStack();
    if (!held || !this.dragSplitting) return;
    this.dragSplittingRemnant = held.stackSize;
    for (const slot of this.dragSplittingSlots) {
      const s = held.copy();
      const existing = slot.getStack()?.stackSize ?? 0;
      Container.computeStackSize(this.dragSplittingSlots, this.dragSplittingLimit, s, existing);
      if (s.stackSize > s.getMaxStackSize()) s.stackSize = s.getMaxStackSize();
      if (s.stackSize > slot.getSlotStackLimit()) s.stackSize = slot.getSlotStackLimit();
      this.dragSplittingRemnant -= s.stackSize - existing;
    }
  }

  private getSlotAtPosition(x: number, y: number): Slot | null {
    for (const slot of this.inventorySlots.inventorySlots) if (this.isMouseOverSlot(slot, x, y)) return slot;
    return null;
  }

  private isOutside(x: number, y: number): boolean {
    return x < this.guiLeft || y < this.guiTop || x >= this.guiLeft + this.xSize || y >= this.guiTop + this.ySize;
  }

  private get pickBlockButton(): number {
    return this.mc.gameSettings.keyBindPickBlock.keyCode + 100;
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    const gs = this.mc.gameSettings;
    const inv = this.mc.thePlayer!.inventory;
    const isPick = button === this.pickBlockButton;
    const slot = this.getSlotAtPosition(x, y);
    const now = performance.now();
    this.doubleClick = this.lastClickSlot === slot && now - this.lastClickTime < 250 && this.lastClickButton === button;
    this.ignoreMouseUp = false;
    if (button === 0 || button === 1 || isPick) {
      const outside = this.isOutside(x, y);
      let slotId = slot ? slot.slotNumber : -1;
      if (outside) slotId = OUTSIDE_WINDOW;
      if (gs.touchscreen && outside && inv.getItemStack() === null) {
        this.mc.displayGuiScreen(null);
        return;
      }
      if (slotId !== -1) {
        if (gs.touchscreen) {
          if (slot?.getHasStack()) {
            this.clickedSlot = slot;
            this.draggedStack = null;
            this.isRightMouseClick = button === 1;
          } else {
            this.clickedSlot = null;
          }
        } else if (!this.dragSplitting) {
          if (inv.getItemStack() === null) {
            if (isPick) {
              this.handleMouseClick(slot, slotId, button, ClickMode.CLONE);
            } else {
              const shift = slotId !== OUTSIDE_WINDOW && GuiScreen.isShiftKeyDown();
              let mode: number = ClickMode.PICKUP;
              if (shift) {
                this.shiftClickedSlot = slot?.getHasStack() ? slot.getStack() : null;
                mode = ClickMode.QUICK_MOVE;
              } else if (slotId === OUTSIDE_WINDOW) {
                mode = ClickMode.THROW;
              }
              this.handleMouseClick(slot, slotId, button, mode);
            }
            this.ignoreMouseUp = true;
          } else {
            this.dragSplitting = true;
            this.dragSplittingButton = button;
            this.dragSplittingSlots.clear();
            if (button === 0) this.dragSplittingLimit = 0;
            else if (button === 1) this.dragSplittingLimit = 1;
          }
        }
      }
    }
    this.lastClickSlot = slot;
    this.lastClickTime = now;
    this.lastClickButton = button;
  }

  protected override mouseClickMove(x: number, y: number, button: number, _held: number): void {
    const slot = this.getSlotAtPosition(x, y);
    const held = this.mc.thePlayer!.inventory.getItemStack();
    if (this.clickedSlot && this.mc.gameSettings.touchscreen) {
      if (button !== 0 && button !== 1) return;
      if (this.draggedStack === null) {
        if (slot !== this.clickedSlot) this.draggedStack = this.clickedSlot.getStack()?.copy() ?? null;
      } else if (this.draggedStack.stackSize > 1 && slot && Container.canAddItemToSlot(slot, this.draggedStack, false)) {
        const now = performance.now();
        if (this.currentDragTargetSlot === slot) {
          if (now - this.dragItemDropDelay > 500) {
            this.handleMouseClick(this.clickedSlot, this.clickedSlot.slotNumber, 0, ClickMode.PICKUP);
            this.handleMouseClick(slot, slot.slotNumber, 1, ClickMode.PICKUP);
            this.handleMouseClick(this.clickedSlot, this.clickedSlot.slotNumber, 0, ClickMode.PICKUP);
            this.dragItemDropDelay = now + 750;
            this.draggedStack.stackSize--;
          }
        } else {
          this.currentDragTargetSlot = slot;
          this.dragItemDropDelay = now;
        }
      }
    } else if (
      this.dragSplitting &&
      slot &&
      held &&
      held.stackSize > this.dragSplittingSlots.size &&
      Container.canAddItemToSlot(slot, held, true) &&
      slot.isItemValid(held) &&
      this.inventorySlots.canDragIntoSlot(slot)
    ) {
      this.dragSplittingSlots.add(slot);
      this.updateDragSplitting();
    }
  }

  protected override mouseMovedOrUp(x: number, y: number, button: number): void {
    const player = this.mc.thePlayer!;
    const inv = player.inventory;
    const slot = this.getSlotAtPosition(x, y);
    let slotId = slot ? slot.slotNumber : -1;
    if (this.isOutside(x, y)) slotId = OUTSIDE_WINDOW;

    if (this.doubleClick && slot && button === 0 && this.inventorySlots.canMergeSlot(null, slot)) {
      if (GuiScreen.isShiftKeyDown()) {
        if (this.shiftClickedSlot) {
          for (const s of this.inventorySlots.inventorySlots) {
            if (s.canTakeStack(player) && s.getHasStack() && s.inventory === slot.inventory && Container.canAddItemToSlot(s, this.shiftClickedSlot, true)) {
              this.handleMouseClick(s, s.slotNumber, button, ClickMode.QUICK_MOVE);
            }
          }
        }
      } else {
        this.handleMouseClick(slot, slotId, button, ClickMode.PICKUP_ALL);
      }
      this.doubleClick = false;
      this.lastClickTime = 0;
    } else {
      if (this.dragSplitting && this.dragSplittingButton !== button) {
        this.dragSplitting = false;
        this.dragSplittingSlots.clear();
        this.ignoreMouseUp = true;
        return;
      }
      if (this.ignoreMouseUp) {
        this.ignoreMouseUp = false;
        return;
      }
      if (this.clickedSlot && this.mc.gameSettings.touchscreen) {
        if (button === 0 || button === 1) {
          if (this.draggedStack === null && slot !== this.clickedSlot) this.draggedStack = this.clickedSlot.getStack();
          const fits = Container.canAddItemToSlot(slot, this.draggedStack, false);
          if (slotId !== -1 && this.draggedStack && fits) {
            this.handleMouseClick(this.clickedSlot, this.clickedSlot.slotNumber, button, ClickMode.PICKUP);
            this.handleMouseClick(slot, slotId, 0, ClickMode.PICKUP);
            if (inv.getItemStack()) {
              this.handleMouseClick(this.clickedSlot, this.clickedSlot.slotNumber, button, ClickMode.PICKUP);
              this.startReturningStack(x, y);
            } else {
              this.returningStack = null;
            }
          } else if (this.draggedStack) {
            this.startReturningStack(x, y);
          }
          this.draggedStack = null;
          this.clickedSlot = null;
        }
      } else if (this.dragSplitting && this.dragSplittingSlots.size > 0) {
        this.handleMouseClick(null, OUTSIDE_WINDOW, Container.getDragData(0, this.dragSplittingLimit), ClickMode.DRAG);
        for (const s of this.dragSplittingSlots) this.handleMouseClick(s, s.slotNumber, Container.getDragData(1, this.dragSplittingLimit), ClickMode.DRAG);
        this.handleMouseClick(null, OUTSIDE_WINDOW, Container.getDragData(2, this.dragSplittingLimit), ClickMode.DRAG);
      } else if (inv.getItemStack()) {
        if (button === this.pickBlockButton) {
          this.handleMouseClick(slot, slotId, button, ClickMode.CLONE);
        } else {
          const shift = slotId !== OUTSIDE_WINDOW && GuiScreen.isShiftKeyDown();
          if (shift) this.shiftClickedSlot = slot?.getHasStack() ? slot.getStack() : null;
          this.handleMouseClick(slot, slotId, button, shift ? ClickMode.QUICK_MOVE : ClickMode.PICKUP);
        }
      }
    }
    if (inv.getItemStack() === null) this.lastClickTime = 0;
    this.dragSplitting = false;
  }

  /** Touchscreen: the dragged stack flies back to its slot over 100 ms. */
  private startReturningStack(x: number, y: number): void {
    this.touchUpX = x - this.guiLeft;
    this.touchUpY = y - this.guiTop;
    this.returningStackDestSlot = this.clickedSlot;
    this.returningStack = this.draggedStack;
    this.returningStackTime = performance.now();
  }

  private isMouseOverSlot(slot: Slot, x: number, y: number): boolean {
    return this.isPointInRegion(slot.xDisplayPosition, slot.yDisplayPosition, 16, 16, x, y);
  }

  protected isPointInRegion(rx: number, ry: number, w: number, h: number, x: number, y: number): boolean {
    x -= this.guiLeft;
    y -= this.guiTop;
    return x >= rx - 1 && x < rx + w + 1 && y >= ry - 1 && y < ry + h + 1;
  }

  /** Sends a click to the container through the player controller (windowClick). */
  protected handleMouseClick(slot: Slot | null, slotId: number, button: number, mode: number): void {
    if (slot) slotId = slot.slotNumber;
    this.mc.playerController.windowClick(this.inventorySlots.windowId, slotId, button, mode, this.mc.thePlayer!);
  }

  protected override keyTyped(_ch: string, key: number): void {
    const gs = this.mc.gameSettings;
    if (key === Keys.ESCAPE || key === gs.keyBindInventory.keyCode) this.mc.thePlayer!.closeScreen();
    this.checkHotbarKeys(key);
    if (this.theSlot?.getHasStack()) {
      if (key === gs.keyBindPickBlock.keyCode) this.handleMouseClick(this.theSlot, this.theSlot.slotNumber, 0, ClickMode.CLONE);
      else if (key === gs.keyBindDrop.keyCode) this.handleMouseClick(this.theSlot, this.theSlot.slotNumber, GuiScreen.isCtrlKeyDown() ? 1 : 0, ClickMode.THROW);
    }
  }

  /** Number keys 1-9 over a slot swap it with that hotbar slot. */
  protected checkHotbarKeys(key: number): boolean {
    if (this.mc.thePlayer!.inventory.getItemStack() !== null || !this.theSlot) return false;
    for (let i = 0; i < 9; i++) {
      if (key === Keys['1'] + i) {
        this.handleMouseClick(this.theSlot, this.theSlot.slotNumber, i, ClickMode.SWAP);
        return true;
      }
    }
    return false;
  }

  override onGuiClosed(): void {
    if (this.mc.thePlayer) this.inventorySlots.onCraftGuiClosed(this.mc.thePlayer);
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }

  override updateScreen(): void {
    super.updateScreen();
    const p = this.mc.thePlayer!;
    if (!p.isEntityAlive() || p.isDead) p.closeScreen();
  }
}
