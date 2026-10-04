import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Mouse } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { GL } from '../render/gl/GL';
import { RenderItem } from '../render/entity/RenderItem';
import { RenderHelper } from '../render/RenderHelper';
import type { Icon } from '../render/texture/Icon';
import { AchievementList } from '../stats/AchievementList';
import type { Achievement } from '../stats/StatBase';
import type { StatFileWriter } from '../stats/StatFileWriter';
import { GuiAchievement } from './GuiAchievement';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

const f = Math.fround;
/** The scroll limits of the map, in map pixels (24 per column or row). */
const MAP_TOP = AchievementList.minDisplayColumn * 24 - 112;
const MAP_LEFT = AchievementList.minDisplayRow * 24 - 112;
const MAP_BOTTOM = AchievementList.maxDisplayColumn * 24 - 77;
const MAP_RIGHT = AchievementList.maxDisplayRow * 24 - 77;
/** The visible part of the map inside the frame. */
const VIEW_W = 224;
const VIEW_H = 155;

/** Whether the "can unlock" blink is in its bright phase (sine of a 600 ms cycle). */
function blink(threshold: number): boolean {
  return Math.sin(((GuiAchievement.now() % 600) / 600) * Math.PI * 2) > threshold;
}

/**
 * The achievement map (GuiAchievements): a 256x202 frame over a stone-and-ore background that
 * gets deeper further down, the achievements at 24 pixels per column and row joined to their
 * parents by lines (grey when taken, blinking green when next, black otherwise), drag to scroll,
 * and a tooltip with the description, "Taken!" or "Requires '...'".
 */
export class GuiAchievements extends GuiScreen {
  private readonly paneWidth = 256;
  private readonly paneHeight = 202;
  private mouseX = 0;
  private mouseY = 0;
  /** Map scroll: previous and current position (smoothed), and the target (field_74124_q / field_74123_r). */
  private prevMapX: number;
  private prevMapY: number;
  private guiMapX: number;
  private guiMapY: number;
  private targetMapX: number;
  private targetMapY: number;
  private isMouseButtonDown = 0;
  private static readonly renderItem = new RenderItem();

  constructor(private readonly statFileWriter: StatFileWriter) {
    super();
    const w = 141;
    const h = 141;
    this.prevMapX = this.guiMapX = this.targetMapX = AchievementList.openInventory.displayColumn * 24 - Math.trunc(w / 2) - 12;
    this.prevMapY = this.guiMapY = this.targetMapY = AchievementList.openInventory.displayRow * 24 - Math.trunc(h / 2);
  }

  override initGui(): void {
    this.buttonList = [];
    this.buttonList.push(new GuiButton(1, Math.trunc(this.width / 2) + 24, Math.trunc(this.height / 2) + 74, 80, 20, I18n.translateToLocal('gui.done')));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 1) {
      this.mc.displayGuiScreen(null);
      this.mc.setIngameFocus();
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    if (key === this.mc.gameSettings.keyBindInventory.keyCode) {
      this.mc.displayGuiScreen(null);
      this.mc.setIngameFocus();
    } else {
      super.keyTyped(ch, key);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    if (Mouse.isButtonDown(0)) {
      const x0 = Math.trunc((this.width - this.paneWidth) / 2) + 8;
      const y0 = Math.trunc((this.height - this.paneHeight) / 2) + 17;
      if ((this.isMouseButtonDown === 0 || this.isMouseButtonDown === 1) && mx >= x0 && mx < x0 + VIEW_W && my >= y0 && my < y0 + VIEW_H) {
        if (this.isMouseButtonDown === 0) {
          this.isMouseButtonDown = 1;
        } else {
          this.guiMapX -= mx - this.mouseX;
          this.guiMapY -= my - this.mouseY;
          this.targetMapX = this.prevMapX = this.guiMapX;
          this.targetMapY = this.prevMapY = this.guiMapY;
        }
        this.mouseX = mx;
        this.mouseY = my;
      }
      if (this.targetMapX < MAP_TOP) this.targetMapX = MAP_TOP;
      if (this.targetMapY < MAP_LEFT) this.targetMapY = MAP_LEFT;
      if (this.targetMapX >= MAP_BOTTOM) this.targetMapX = MAP_BOTTOM - 1;
      if (this.targetMapY >= MAP_RIGHT) this.targetMapY = MAP_RIGHT - 1;
    } else {
      this.isMouseButtonDown = 0;
    }
    this.drawDefaultBackground();
    this.genAchievementBackground(mx, my, pt);
    GL.disable(GL.LIGHTING);
    GL.disable(GL.DEPTH_TEST);
    this.drawTitle();
    GL.enable(GL.LIGHTING);
    GL.enable(GL.DEPTH_TEST);
  }

  /** Eases the map towards where it was dragged. */
  override updateScreen(): void {
    this.prevMapX = this.guiMapX;
    this.prevMapY = this.guiMapY;
    const dx = this.targetMapX - this.guiMapX;
    const dy = this.targetMapY - this.guiMapY;
    if (dx * dx + dy * dy < 4) {
      this.guiMapX += dx;
      this.guiMapY += dy;
    } else {
      this.guiMapX += dx * 0.85;
      this.guiMapY += dy * 0.85;
    }
  }

  private drawTitle(): void {
    const x = Math.trunc((this.width - this.paneWidth) / 2);
    const y = Math.trunc((this.height - this.paneHeight) / 2);
    this.fontRenderer.drawString('Achievements', x + 15, y + 5, 0x404040);
  }

  /** The background tile of map cell (column, row): deeper rows turn to stone, ores and bedrock. */
  private backgroundIcon(rand: JavaRandom, column: number, row: number): Icon | null {
    rand.setSeed(1234 + column);
    rand.nextInt();
    const depth = rand.nextInt(1 + row) + Math.trunc(row / 2);
    const icon = (id: number) => Block.blocksList[id]?.getIcon(0, 0) ?? null;
    if (depth > 37 || row === 35) return icon(BlockIds.bedrock);
    if (depth === 22) return rand.nextInt(2) === 0 ? icon(BlockIds.oreDiamond) : icon(BlockIds.oreRedstone);
    if (depth === 10) return icon(BlockIds.oreIron);
    if (depth === 8) return icon(BlockIds.oreCoal);
    if (depth > 4) return icon(BlockIds.stone);
    if (depth > 0) return icon(BlockIds.dirt);
    return icon(BlockIds.sand);
  }

  private genAchievementBackground(mx: number, my: number, pt: number): void {
    let mapX = MathHelper.floor_double(this.prevMapX + (this.guiMapX - this.prevMapX) * pt);
    let mapY = MathHelper.floor_double(this.prevMapY + (this.guiMapY - this.prevMapY) * pt);
    if (mapX < MAP_TOP) mapX = MAP_TOP;
    if (mapY < MAP_LEFT) mapY = MAP_LEFT;
    if (mapX >= MAP_BOTTOM) mapX = MAP_BOTTOM - 1;
    if (mapY >= MAP_RIGHT) mapY = MAP_RIGHT - 1;
    const paneX = Math.trunc((this.width - this.paneWidth) / 2);
    const paneY = Math.trunc((this.height - this.paneHeight) / 2);
    const left = paneX + 16;
    const top = paneY + 17;
    const sw = this.statFileWriter;
    this.zLevel = 0;
    GL.depthFunc(GL.GEQUAL);
    GL.pushMatrix();
    GL.translate(0, 0, -200);
    GL.enable(GL.TEXTURE_2D);
    GL.disable(GL.LIGHTING);
    GL.enable(GL.RESCALE_NORMAL);
    GL.enable(GL.COLOR_MATERIAL);
    this.mc.renderEngine.bindTexture('/terrain.png');
    const col0 = (mapX + 288) >> 4;
    const row0 = (mapY + 288) >> 4;
    const offX = (mapX + 288) % 16;
    const offY = (mapY + 288) % 16;
    const rand = new JavaRandom();
    for (let r = 0; r * 16 - offY < VIEW_H; r++) {
      const shade = f(f(0.6) - f(f((row0 + r) / 25) * f(0.3)));
      GL.color(shade, shade, shade, 1);
      for (let c = 0; c * 16 - offX < VIEW_W; c++) {
        const icon = this.backgroundIcon(rand, col0 + c, row0 + r);
        if (icon) this.drawTexturedModelRectFromIcon(left + c * 16 - offX, top + r * 16 - offY, icon, 16, 16);
      }
    }
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.disable(GL.TEXTURE_2D);

    const list = AchievementList.achievementList;
    for (const a of list) {
      const p = a.parentAchievement;
      if (!p) continue;
      const x = a.displayColumn * 24 - mapX + 11 + left;
      const y = a.displayRow * 24 - mapY + 11 + top;
      const px = p.displayColumn * 24 - mapX + 11 + left;
      const py = p.displayRow * 24 - mapY + 11 + top;
      const alpha = blink(0.6) ? 255 : 130;
      let color = 0xff000000 | 0;
      if (sw.hasAchievementUnlocked(a)) color = 0xff707070 | 0;
      else if (sw.canUnlockAchievement(a)) color = (0x00ff00 + (alpha << 24)) | 0;
      this.drawHorizontalLine(x, px, y, color);
      this.drawVerticalLine(px, y, py, color);
    }

    let hovered: Achievement | null = null;
    const ri = GuiAchievements.renderItem;
    RenderHelper.enableGUIStandardItemLighting();
    GL.disable(GL.LIGHTING);
    GL.enable(GL.RESCALE_NORMAL);
    GL.enable(GL.COLOR_MATERIAL);
    for (const a of list) {
      const dx = a.displayColumn * 24 - mapX;
      const dy = a.displayRow * 24 - mapY;
      if (dx < -24 || dy < -24 || dx > VIEW_W || dy > VIEW_H) continue;
      const canUnlock = sw.canUnlockAchievement(a);
      if (sw.hasAchievementUnlocked(a)) GL.color(1, 1, 1, 1);
      else if (canUnlock) {
        const k = blink(0.6) ? 0.8 : 0.6;
        GL.color(k, k, k, 1);
      } else GL.color(0.3, 0.3, 0.3, 1);
      this.mc.renderEngine.bindTexture('/achievement/bg.png');
      const x = left + dx;
      const y = top + dy;
      this.drawTexturedModalRect(x - 2, y - 2, a.getSpecial() ? 26 : 0, 202, 26, 26);
      if (!canUnlock) {
        GL.color(0.1, 0.1, 0.1, 1);
        ri.renderWithColor = false;
      }
      GL.enable(GL.LIGHTING);
      GL.enable(GL.CULL_FACE);
      ri.renderItemAndEffectIntoGUI(this.mc.fontRenderer, this.mc.renderEngine, a.theItemStack, x + 3, y + 3);
      GL.disable(GL.LIGHTING);
      if (!canUnlock) ri.renderWithColor = true;
      GL.color(1, 1, 1, 1);
      if (mx >= left && my >= top && mx < left + VIEW_W && my < top + VIEW_H && mx >= x && mx <= x + 22 && my >= y && my <= y + 22) hovered = a;
    }

    GL.disable(GL.DEPTH_TEST);
    GL.enable(GL.BLEND);
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/achievement/bg.png');
    this.drawTexturedModalRect(paneX, paneY, 0, 0, this.paneWidth, this.paneHeight);
    GL.popMatrix();
    this.zLevel = 0;
    GL.depthFunc(GL.LEQUAL);
    GL.disable(GL.DEPTH_TEST);
    GL.enable(GL.TEXTURE_2D);
    super.drawScreen(mx, my, pt);
    if (hovered) this.drawTooltip(hovered, mx, my);
    GL.enable(GL.DEPTH_TEST);
    GL.enable(GL.LIGHTING);
    RenderHelper.disableStandardItemLighting();
  }

  private drawTooltip(a: Achievement, mx: number, my: number): void {
    const sw = this.statFileWriter;
    const fr = this.fontRenderer;
    const name = I18n.translateToLocal(a.getName());
    const x = mx + 12;
    const y = my - 4;
    const canUnlock = sw.canUnlockAchievement(a);
    const width = Math.max(fr.getStringWidth(name), 120);
    if (canUnlock) {
      const desc = a.getDescription();
      let h = fr.splitStringWidth(desc, width);
      const taken = sw.hasAchievementUnlocked(a);
      if (taken) h += 12;
      this.drawGradientRect(x - 3, y - 3, x + width + 3, y + h + 3 + 12, 0xc0000000 | 0, 0xc0000000 | 0);
      fr.drawSplitString(desc, x, y + 12, width, 0xffa0a0a0 | 0);
      if (taken) fr.drawStringWithShadow(I18n.translateToLocal('achievement.taken'), x, y + h + 4, 0xff9090ff | 0);
    } else {
      const requires = I18n.translateToLocalFormatted('achievement.requires', I18n.translateToLocal(a.parentAchievement!.getName()));
      const h = fr.splitStringWidth(requires, width);
      this.drawGradientRect(x - 3, y - 3, x + width + 3, y + h + 12 + 3, 0xc0000000 | 0, 0xc0000000 | 0);
      fr.drawSplitString(requires, x, y + 12, width, 0xff705050 | 0);
    }
    const color = canUnlock ? (a.getSpecial() ? 0xffffff80 : 0xffffffff) : a.getSpecial() ? 0xff808040 : 0xff808080;
    fr.drawStringWithShadow(name, x, y, color | 0);
  }

  override doesGuiPauseGame(): boolean {
    return true;
  }
}
