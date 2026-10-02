import type { Minecraft } from '../client/Minecraft';
import { hsbToRgb } from '../core/Color';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { Direction } from '../core/Facing';
import { ItemStack } from '../item/ItemStack';
import { RenderItem } from '../render/entity/RenderItem';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { RenderHelper } from '../render/RenderHelper';
import { EnumSkyBlock } from '../world/IBlockAccess';
import { Gui } from './Gui';
import { GuiNewChat } from './GuiNewChat';

const f = Math.fround;

function fmt(v: number, digits: number): string {
  return v.toFixed(digits);
}

/** The in-game HUD (GuiIngame): vignette, hotbar, crosshair, held item name and the F3 screen. */
export class GuiIngame extends Gui {
  static readonly itemRenderer = new RenderItem();
  private readonly rand = new JavaRandom();
  private updateCounter = 0;
  /** "Now playing" line over the hotbar (jukebox records). */
  private recordPlaying = '';
  private recordPlayingUpFor = 0;
  private recordIsPlaying = false;
  prevVignetteBrightness = 1;
  private remainingHighlightTicks = 0;
  private highlightingItemStack: ItemStack | null = null;

  private readonly persistantChatGUI: GuiNewChat;

  constructor(private readonly mc: Minecraft) {
    super();
    this.persistantChatGUI = new GuiNewChat(mc);
  }

  getChatGUI(): GuiNewChat {
    return this.persistantChatGUI;
  }

  renderGameOverlay(pt: number, _hasScreen: boolean, _mx: number, _my: number): void {
    const sr = this.mc.getScaledResolution();
    const w = sr.getScaledWidth();
    const h = sr.getScaledHeight();
    const fr = this.mc.fontRenderer;
    const p = this.mc.thePlayer!;
    this.mc.entityRenderer.setupOverlayRendering();
    GL.enable(GL.BLEND);
    if (this.mc.gameSettings.fancyGraphics) this.renderVignette(p.getBrightness(pt), w, h);
    else GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/gui.png');
    const inv = p.inventory;
    this.zLevel = -90;
    this.drawTexturedModalRect(Math.trunc(w / 2) - 91, h - 22, 0, 0, 182, 22);
    this.drawTexturedModalRect(Math.trunc(w / 2) - 91 - 1 + inv.currentItem * 20, h - 22 - 1, 0, 22, 24, 22);
    this.mc.renderEngine.bindTexture('/gui/icons.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.ONE_MINUS_DST_COLOR, GL.ONE_MINUS_SRC_COLOR);
    this.drawTexturedModalRect(Math.trunc(w / 2) - 7, Math.trunc(h / 2) - 7, 0, 0, 16, 16);
    GL.disable(GL.BLEND);
    this.rand.setSeed(BigInt(this.updateCounter * 312871));
    GL.disable(GL.BLEND);
    RenderHelper.enableGUIStandardItemLighting();
    for (let i = 0; i < 9; i++) this.renderInventorySlot(i, Math.trunc(w / 2) - 90 + i * 20 + 2, h - 16 - 3, pt);
    RenderHelper.disableStandardItemLighting();
    if (this.mc.gameSettings.heldItemTooltips && this.remainingHighlightTicks > 0 && this.highlightingItemStack) {
      const name = this.highlightingItemStack.getDisplayName();
      const x = Math.trunc((w - fr.getStringWidth(name)) / 2);
      const y = h - 59 + 14;
      let a = Math.trunc((this.remainingHighlightTicks * 256) / 10);
      if (a > 255) a = 255;
      if (a > 0) {
        GL.pushMatrix();
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        fr.drawStringWithShadow(name, x, y, 0xffffff + (a << 24));
        GL.disable(GL.BLEND);
        GL.popMatrix();
      }
    }
    if (this.mc.gameSettings.showDebugInfo) this.renderDebugInfo(w);
    if (this.recordPlayingUpFor > 0) {
      const left = f(this.recordPlayingUpFor - pt);
      const alpha = Math.min(255, Math.trunc(f(f(left * 256) / 20)));
      if (alpha > 0) {
        GL.pushMatrix();
        GL.translate(Math.trunc(w / 2), h - 48, 0);
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        const color = this.recordIsPlaying ? hsbToRgb(f(left / 50), f(0.7), f(0.6)) & 0xffffff : 0xffffff;
        fr.drawString(this.recordPlaying, -Math.trunc(fr.getStringWidth(this.recordPlaying) / 2), -4, (color + (alpha << 24)) | 0);
        GL.disable(GL.BLEND);
        GL.popMatrix();
      }
    }
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.disable(GL.ALPHA_TEST);
    GL.pushMatrix();
    GL.translate(0, h - 48, 0);
    this.persistantChatGUI.drawChat(this.updateCounter);
    GL.popMatrix();
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
    GL.enable(GL.ALPHA_TEST);
  }

  private renderDebugInfo(w: number): void {
    const fr = this.mc.fontRenderer;
    const p = this.mc.thePlayer!;
    const world = this.mc.theWorld!;
    GL.pushMatrix();
    fr.drawStringWithShadow(`Minecraft 1.5.2 (${this.mc.debug})`, 2, 2, 0xffffff);
    fr.drawStringWithShadow(this.mc.debugInfoRenders(), 2, 12, 0xffffff);
    fr.drawStringWithShadow(this.mc.getEntityDebug(), 2, 22, 0xffffff);
    fr.drawStringWithShadow(this.mc.debugInfoEntities(), 2, 32, 0xffffff);
    fr.drawStringWithShadow(this.mc.getWorldProviderName(), 2, 42, 0xffffff);
    const mem = (performance as unknown as { memory?: { jsHeapSizeLimit: number; totalJSHeapSize: number; usedJSHeapSize: number } }).memory;
    const max = mem?.jsHeapSizeLimit ?? 1024 * 1024 * 1024;
    const total = mem?.totalJSHeapSize ?? 0;
    const used = mem?.usedJSHeapSize ?? 0;
    const mb = (v: number) => Math.trunc(v / 1024 / 1024);
    let s = `Used memory: ${Math.trunc((used * 100) / max)}% (${mb(used)}MB) of ${mb(max)}MB`;
    this.drawString(fr, s, w - fr.getStringWidth(s) - 2, 2, 0xe0e0e0);
    s = `Allocated memory: ${Math.trunc((total * 100) / max)}% (${mb(total)}MB)`;
    this.drawString(fr, s, w - fr.getStringWidth(s) - 2, 12, 0xe0e0e0);
    const x = MathHelper.floor_double(p.posX);
    const y = MathHelper.floor_double(p.posY);
    const z = MathHelper.floor_double(p.posZ);
    this.drawString(fr, `x: ${fmt(p.posX, 5)} (${x}) // c: ${x >> 4} (${x & 15})`, 2, 64, 0xe0e0e0);
    this.drawString(fr, `y: ${fmt(p.boundingBox.minY, 3)} (feet pos, ${fmt(p.posY, 3)} eyes pos)`, 2, 72, 0xe0e0e0);
    this.drawString(fr, `z: ${fmt(p.posZ, 5)} (${z}) // c: ${z >> 4} (${z & 15})`, 2, 80, 0xe0e0e0);
    const dir = MathHelper.floor_double(f((p.rotationYaw * 4) / 360) + 0.5) & 3;
    this.drawString(fr, `f: ${dir} (${Direction.directions[dir]}) / ${javaFloatString(MathHelper.wrapAngleTo180_float(p.rotationYaw))}`, 2, 88, 0xe0e0e0);
    if (world.blockExists(x, y, z)) {
      const c = world.getChunkFromBlockCoords(x, z);
      this.drawString(
        fr,
        `lc: ${c.getTopFilledSegment() + 15} b: ${c.getBiomeGenForWorldCoords(x & 15, z & 15).biomeName} bl: ${c.getSavedLightValue(EnumSkyBlock.Block, x & 15, y, z & 15)} sl: ${c.getSavedLightValue(EnumSkyBlock.Sky, x & 15, y, z & 15)} rl: ${c.getBlockLightValue(x & 15, y, z & 15, 0)}`,
        2,
        96,
        0xe0e0e0,
      );
    }
    this.drawString(fr, `ws: ${fmt(p.capabilities.getWalkSpeed(), 3)}, fs: ${fmt(p.capabilities.getFlySpeed(), 3)}, g: ${p.onGround}, fl: ${world.getHeightValue(x, z)}`, 2, 104, 0xe0e0e0);
    GL.popMatrix();
  }

  private renderVignette(brightness: number, w: number, h: number): void {
    let b = 1 - brightness;
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    this.prevVignetteBrightness = f(this.prevVignetteBrightness + (b - this.prevVignetteBrightness) * 0.01);
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    GL.blendFunc(GL.ZERO, GL.ONE_MINUS_SRC_COLOR);
    GL.color(this.prevVignetteBrightness, this.prevVignetteBrightness, this.prevVignetteBrightness, 1);
    this.mc.renderEngine.bindTexture('%blur%/misc/vignette.png');
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(0, h, -90, 0, 1);
    t.addVertexWithUV(w, h, -90, 1, 1);
    t.addVertexWithUV(w, 0, -90, 1, 0);
    t.addVertexWithUV(0, 0, -90, 0, 0);
    t.draw();
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
    GL.color(1, 1, 1, 1);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
  }

  private renderInventorySlot(slot: number, x: number, y: number, pt: number): void {
    const stack = this.mc.thePlayer!.inventory.mainInventory[slot];
    if (!stack) return;
    const anim = f(stack.animationsToGo - pt);
    if (anim > 0) {
      GL.pushMatrix();
      const k = f(1 + f(anim / 5));
      GL.translate(x + 8, y + 12, 0);
      GL.scale(f(1 / k), f(f(k + 1) / 2), 1);
      GL.translate(-(x + 8), -(y + 12), 0);
    }
    GuiIngame.itemRenderer.renderItemAndEffectIntoGUI(this.mc.fontRenderer, this.mc.renderEngine, stack, x, y);
    if (anim > 0) GL.popMatrix();
    GuiIngame.itemRenderer.renderItemOverlayIntoGUI(this.mc.fontRenderer, this.mc.renderEngine, stack, x, y);
  }

  setRecordPlayingMessage(title: string): void {
    this.recordPlaying = 'Now playing: ' + title;
    this.recordPlayingUpFor = 60;
    this.recordIsPlaying = true;
  }

  updateTick(): void {
    if (this.recordPlayingUpFor > 0) this.recordPlayingUpFor--;
    this.updateCounter++;
    const p = this.mc.thePlayer;
    if (!p) return;
    const cur = p.inventory.getCurrentItem();
    if (!cur) this.remainingHighlightTicks = 0;
    else if (
      this.highlightingItemStack &&
      cur.itemID === this.highlightingItemStack.itemID &&
      ItemStack.areItemStackTagsEqual(cur, this.highlightingItemStack) &&
      (cur.isItemStackDamageable() || cur.getItemDamage() === this.highlightingItemStack.getItemDamage())
    ) {
      if (this.remainingHighlightTicks > 0) this.remainingHighlightTicks--;
    } else {
      this.remainingHighlightTicks = 40;
    }
    this.highlightingItemStack = cur;
  }

  getUpdateCounter(): number {
    return this.updateCounter;
  }
}

/** Java's Float.toString for the F3 yaw (e.g. "0.0", "-90.0", "12.345678"). */
function javaFloatString(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(1);
  const s = String(Math.fround(v));
  const short = parseFloat(Math.fround(v).toPrecision(9));
  for (let p = 1; p <= 9; p++) {
    const c = parseFloat(short.toPrecision(p));
    if (Math.fround(c) === Math.fround(v)) return String(c);
  }
  return s;
}
