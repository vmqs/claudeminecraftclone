import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import { RenderItem } from '../render/entity/RenderItem';
import { RenderHelper } from '../render/RenderHelper';
import type { Achievement } from '../stats/StatBase';
import { Gui } from './Gui';
import { ScaledResolution } from './ScaledResolution';

/**
 * The achievement toast (GuiAchievement): "Achievement get!" and the achievement's name slide
 * down at the top right for three seconds, or (queueAchievementInformation) an achievement's
 * name and description stay there, which is how a new player is told to open the inventory.
 * Drawn over everything once per frame, after the screen.
 */
export class GuiAchievement extends Gui {
  /** The clock (Minecraft.getSystemTime, ms); scenarios may pin it. */
  static now: () => number = () => performance.now();
  private readonly itemRender = new RenderItem();
  private title = '';
  private text = '';
  private theAchievement: Achievement | null = null;
  private achievementTime = 0;
  /** Showing an achievement's description rather than "Achievement get!" (haveAchiement). */
  private information = false;
  private windowWidth = 0;
  private windowHeight = 0;

  constructor(private readonly mc: Minecraft) {
    super();
  }

  /** queueTakenAchievement: "Achievement get!" for a newly unlocked achievement. */
  queueTakenAchievement(a: Achievement): void {
    this.title = I18n.translateToLocal('achievement.get');
    this.text = I18n.translateToLocal(a.getName());
    this.achievementTime = GuiAchievement.now();
    this.theAchievement = a;
    this.information = false;
  }

  /** queueAchievementInformation: the name and description, shown fully until no longer queued. */
  queueAchievementInformation(a: Achievement): void {
    this.title = I18n.translateToLocal(a.getName());
    this.text = a.getDescription();
    this.achievementTime = GuiAchievement.now() - 2500;
    this.theAchievement = a;
    this.information = true;
  }

  /** What is shown now (for scenarios): the achievement and whether it is the hint. */
  getShown(): { achievement: Achievement; information: boolean } | null {
    return this.theAchievement && this.achievementTime !== 0 ? { achievement: this.theAchievement, information: this.information } : null;
  }

  /** A GUI-space projection of its own over the whole window, with a cleared depth buffer. */
  private updateAchievementWindowScale(): void {
    const mc = this.mc;
    GL.viewport(0, 0, mc.displayWidth, mc.displayHeight);
    const sr = new ScaledResolution(mc.gameSettings.guiScale, mc.displayWidth, mc.displayHeight);
    this.windowWidth = sr.getScaledWidth();
    this.windowHeight = sr.getScaledHeight();
    GL.clear(GL.DEPTH_BUFFER_BIT);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, this.windowWidth, this.windowHeight, 0, 1000, 3000);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -2000);
  }

  updateAchievementWindow(): void {
    const a = this.theAchievement;
    if (!a || this.achievementTime === 0) return;
    const d = (GuiAchievement.now() - this.achievementTime) / 3000;
    if (!this.information && (d < 0 || d > 1)) {
      this.achievementTime = 0;
      return;
    }
    this.updateAchievementWindowScale();
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    let slide = d * 2;
    if (slide > 1) slide = 2 - slide;
    slide *= 4;
    slide = 1 - slide;
    if (slide < 0) slide = 0;
    slide *= slide;
    slide *= slide;
    const x = this.windowWidth - 160;
    const y = 0 - Math.trunc(slide * 36);
    GL.color(1, 1, 1, 1);
    GL.enable(GL.TEXTURE_2D);
    this.mc.renderEngine.bindTexture('/achievement/bg.png');
    GL.disable(GL.LIGHTING);
    this.drawTexturedModalRect(x, y, 96, 202, 160, 32);
    const fr = this.mc.fontRenderer;
    if (this.information) {
      fr.drawSplitString(this.text, x + 30, y + 7, 120, -1);
    } else {
      fr.drawString(this.title, x + 30, y + 7, -256);
      fr.drawString(this.text, x + 30, y + 18, -1);
    }
    RenderHelper.enableGUIStandardItemLighting();
    GL.disable(GL.LIGHTING);
    GL.enable(GL.RESCALE_NORMAL);
    GL.enable(GL.COLOR_MATERIAL);
    GL.enable(GL.LIGHTING);
    this.itemRender.renderItemAndEffectIntoGUI(fr, this.mc.renderEngine, a.theItemStack, x + 8, y + 8);
    GL.disable(GL.LIGHTING);
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
  }
}
