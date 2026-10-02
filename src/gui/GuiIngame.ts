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
import { Block } from '../block/Block';
import { Material } from '../block/Material';
import type { World } from '../world/World';
import { BossStatus } from './BossStatus';
import type { FontRenderer } from './FontRenderer';
import { Gui } from './Gui';
import { worldScoreboardOverlay } from './ScoreboardOverlay';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { GuiNewChat } from './GuiNewChat';

const f = Math.fround;

const PUMPKIN_ID = 86;
const PORTAL_ID = 90;
/** Potion ids (Potion.potionTypes). */
const POTION_CONFUSION = 9;
const POTION_REGENERATION = 10;
const POTION_HUNGER = 17;
const POTION_POISON = 19;
const POTION_WITHER = 20;

/** The survival state the HUD reads; the parts the player class may not have yet are optional. */
interface SurvivalPlayer {
  experience?: number;
  experienceLevel?: number;
  xpBarCap?(): number;
  getFoodStats?(): { getFoodLevel(): number; getPrevFoodLevel?(): number; getSaturationLevel(): number } | null;
  getSleepTimer?(): number;
  isPotionActive?(id: number): boolean;
}

/** EntityPlayer.xpBarCap. */
function xpBarCap(p: SurvivalPlayer): number {
  if (p.xpBarCap) return p.xpBarCap();
  const l = p.experienceLevel ?? 0;
  return l >= 30 ? 62 + (l - 30) * 7 : l >= 15 ? 17 + (l - 15) * 3 : 17;
}

function potionActive(p: unknown, id: number): boolean {
  return (p as SurvivalPlayer).isPotionActive?.(id) ?? false;
}

/** One row of the TAB list (GuiPlayerInfo). */
export interface PlayerListEntry {
  name: string;
  /** Ping in ms; negative for unknown. */
  responseTime: number;
}

export interface PlayerList {
  entries: PlayerListEntry[];
  maxPlayers: number;
}

/** A scoreboard objective shown in the TAB list. */
export interface ScoreLookup {
  /** The player name with its team prefix/suffix. */
  formatName(name: string): string;
  score(name: string): number;
}

/** The sidebar objective: its title and the sorted rows (name already formatted with the team). */
export interface SidebarObjective {
  displayName: string;
  scores: { name: string; value: number }[];
}

/** Where the HUD finds scoreboard display slots (1.5.2 scoreboard: 0 list, 1 sidebar). */
export interface ScoreboardOverlay {
  sidebar(world: World): SidebarObjective | null;
  list(world: World): ScoreLookup | null;
  /** Once per tick: scores that follow the player (the health criteria). */
  tick?(world: World, player: EntityPlayer): void;
}

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
  /** The players of a multiplayer session for the TAB list; null in singleplayer. */
  static playerListProvider: (() => PlayerList) | null = null;
  /** Scoreboard display slots, installed by the scoreboard module. */
  static scoreboardOverlay: ScoreboardOverlay | null = worldScoreboardOverlay;

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
    const prof = this.mc.mcProfiler;
    const stats = p as unknown as SurvivalPlayer;
    this.mc.entityRenderer.setupOverlayRendering();
    GL.enable(GL.BLEND);
    if (this.mc.gameSettings.fancyGraphics) this.renderVignette(p.getBrightness(pt), w, h);
    else GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const helmet = p.inventory.armorItemInSlot(3);
    if (this.mc.gameSettings.thirdPersonView === 0 && helmet && helmet.itemID === PUMPKIN_ID) this.renderPumpkinBlur(w, h);
    if (!potionActive(p, POTION_CONFUSION)) {
      const sp = p as unknown as { prevTimeInPortal?: number; timeInPortal?: number };
      const portal = f((sp.prevTimeInPortal ?? 0) + f(f((sp.timeInPortal ?? 0) - (sp.prevTimeInPortal ?? 0)) * pt));
      if (portal > 0) this.renderPortalOverlay(portal, w, h);
    }
    const drawHud = !p.capabilities.isCreativeMode;
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
    let flash = Math.trunc(p.hurtResistantTime / 3) % 2 === 1;
    if (p.hurtResistantTime < 10) flash = false;
    const health = p.getHealth();
    const prevHealth = (p as unknown as { prevHealth?: number }).prevHealth ?? health;
    this.rand.setSeed(BigInt(this.updateCounter * 312871));
    const food = stats.getFoodStats?.() ?? null;
    const foodLevel = food?.getFoodLevel() ?? 20;
    const prevFoodLevel = food?.getPrevFoodLevel?.() ?? foodLevel;
    const foodFlash = false;
    prof.startSection('bossHealth');
    this.renderBossHealth();
    prof.endSection();
    if (drawHud) {
      const left = Math.trunc(w / 2) - 91;
      const right = Math.trunc(w / 2) + 91;
      prof.startSection('expBar');
      if (xpBarCap(stats) > 0) {
        const len = 182;
        const filled = Math.trunc(f((stats.experience ?? 0) * (len + 1)));
        const y = h - 32 + 3;
        this.drawTexturedModalRect(left, y, 0, 64, len, 5);
        if (filled > 0) this.drawTexturedModalRect(left, y, 0, 69, filled, 5);
      }
      const healthY = h - 39;
      const armorY = healthY - 10;
      const armor = p.getTotalArmorValue();
      let regenHeart = -1;
      if (potionActive(p, POTION_REGENERATION)) regenHeart = this.updateCounter % 25;
      prof.endStartSection('healthArmor');
      const hardcoreRow = this.mc.theWorld?.worldInfo.hardcore ? 5 : 0;
      for (let i = 0; i < 10; i++) {
        if (armor > 0) {
          const x = left + i * 8;
          if (i * 2 + 1 < armor) this.drawTexturedModalRect(x, armorY, 34, 9, 9, 9);
          if (i * 2 + 1 === armor) this.drawTexturedModalRect(x, armorY, 25, 9, 9, 9);
          if (i * 2 + 1 > armor) this.drawTexturedModalRect(x, armorY, 16, 9, 9, 9);
        }
        let u = 16;
        if (potionActive(p, POTION_POISON)) u += 36;
        else if (potionActive(p, POTION_WITHER)) u += 72;
        const bg = flash ? 1 : 0;
        const x = left + i * 8;
        let y = healthY;
        if (health <= 4) y = healthY + this.rand.nextInt(2);
        if (i === regenHeart) y -= 2;
        this.drawTexturedModalRect(x, y, 16 + bg * 9, 9 * hardcoreRow, 9, 9);
        if (flash) {
          if (i * 2 + 1 < prevHealth) this.drawTexturedModalRect(x, y, u + 54, 9 * hardcoreRow, 9, 9);
          if (i * 2 + 1 === prevHealth) this.drawTexturedModalRect(x, y, u + 63, 9 * hardcoreRow, 9, 9);
        }
        if (i * 2 + 1 < health) this.drawTexturedModalRect(x, y, u + 36, 9 * hardcoreRow, 9, 9);
        if (i * 2 + 1 === health) this.drawTexturedModalRect(x, y, u + 45, 9 * hardcoreRow, 9, 9);
      }
      prof.endStartSection('food');
      for (let i = 0; i < 10; i++) {
        let y = healthY;
        let u = 16;
        let bg = 0;
        if (potionActive(p, POTION_HUNGER)) {
          u += 36;
          bg = 13;
        }
        if ((food?.getSaturationLevel() ?? 5) <= 0 && this.updateCounter % (foodLevel * 3 + 1) === 0) y = healthY + (this.rand.nextInt(3) - 1);
        if (foodFlash) bg = 1;
        const x = right - i * 8 - 9;
        this.drawTexturedModalRect(x, y, 16 + bg * 9, 27, 9, 9);
        if (foodFlash) {
          if (i * 2 + 1 < prevFoodLevel) this.drawTexturedModalRect(x, y, u + 54, 27, 9, 9);
          if (i * 2 + 1 === prevFoodLevel) this.drawTexturedModalRect(x, y, u + 63, 27, 9, 9);
        }
        if (i * 2 + 1 < foodLevel) this.drawTexturedModalRect(x, y, u + 36, 27, 9, 9);
        if (i * 2 + 1 === foodLevel) this.drawTexturedModalRect(x, y, u + 45, 27, 9, 9);
      }
      prof.endStartSection('air');
      if (p.isInsideOfMaterial(Material.water)) {
        const air = p.getAir();
        const full = Math.ceil(((air - 2) * 10) / 300);
        const popping = Math.ceil((air * 10) / 300) - full;
        for (let i = 0; i < full + popping; i++) this.drawTexturedModalRect(right - i * 8 - 9, armorY, i < full ? 16 : 25, 18, 9, 9);
      }
      prof.endSection();
    }
    GL.disable(GL.BLEND);
    prof.startSection('actionBar');
    RenderHelper.enableGUIStandardItemLighting();
    for (let i = 0; i < 9; i++) this.renderInventorySlot(i, Math.trunc(w / 2) - 90 + i * 20 + 2, h - 16 - 3, pt);
    RenderHelper.disableStandardItemLighting();
    prof.endSection();
    const sleepTimer = stats.getSleepTimer?.() ?? 0;
    if (sleepTimer > 0) {
      prof.startSection('sleep');
      GL.disable(GL.DEPTH_TEST);
      GL.disable(GL.ALPHA_TEST);
      let k = f(sleepTimer / 100);
      if (k > 1) k = f(1 - f((sleepTimer - 100) / 10));
      Gui.drawRect(0, 0, w, h, (Math.trunc(f(220 * k)) << 24) | 0x101020);
      GL.enable(GL.ALPHA_TEST);
      GL.enable(GL.DEPTH_TEST);
      prof.endSection();
    }
    const level = stats.experienceLevel ?? 0;
    if (drawHud && level > 0) {
      prof.startSection('expLevel');
      const s = '' + level;
      const x = Math.trunc((w - fr.getStringWidth(s)) / 2);
      const y = h - 31 - 4;
      fr.drawString(s, x + 1, y, 0);
      fr.drawString(s, x - 1, y, 0);
      fr.drawString(s, x, y + 1, 0);
      fr.drawString(s, x, y - 1, 0);
      fr.drawString(s, x, y, 0x80ff20);
      prof.endSection();
    }
    if (this.mc.gameSettings.heldItemTooltips) {
      prof.startSection('toolHighlight');
      if (this.remainingHighlightTicks > 0 && this.highlightingItemStack) {
        const name = this.highlightingItemStack.getDisplayName();
        const x = Math.trunc((w - fr.getStringWidth(name)) / 2);
        let y = h - 59;
        if (!drawHud) y += 14;
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
      prof.endSection();
    }
    if (this.mc.gameSettings.showDebugInfo) {
      prof.startSection('debug');
      this.renderDebugInfo(w);
      prof.endSection();
    }
    if (this.recordPlayingUpFor > 0) {
      prof.startSection('overlayMessage');
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
      prof.endSection();
    }
    const sidebar = GuiIngame.scoreboardOverlay?.sidebar(this.mc.theWorld!) ?? null;
    if (sidebar) this.renderSidebar(sidebar, h, w, fr);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.disable(GL.ALPHA_TEST);
    GL.pushMatrix();
    GL.translate(0, h - 48, 0);
    prof.startSection('chat');
    this.persistantChatGUI.drawChat(this.updateCounter);
    prof.endSection();
    GL.popMatrix();
    const remote = GuiIngame.playerListProvider !== null;
    const listObjective = GuiIngame.scoreboardOverlay?.list(this.mc.theWorld!) ?? null;
    if (this.mc.gameSettings.keyBindPlayerList.pressed) {
      // The integrated server's list: just this player, 8 slots (IntegratedPlayerList).
      const players = GuiIngame.playerListProvider?.() ?? { entries: [{ name: p.getEntityName(), responseTime: 0 }], maxPlayers: 8 };
      if (remote || players.entries.length > 1 || listObjective) {
        prof.startSection('playerList');
        this.renderPlayerList(players, listObjective, w, fr);
        prof.endSection();
      }
    }
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
    GL.enable(GL.ALPHA_TEST);
  }

  /** The TAB list (multiplayer, or a scoreboard "list" objective). */
  private renderPlayerList(players: PlayerList, objective: ScoreLookup | null, w: number, fr: FontRenderer): void {
    const list = players.entries;
    const max = players.maxPlayers;
    let rows = max;
    let cols = 1;
    while (rows > 20) {
      cols++;
      rows = Math.trunc((max + cols - 1) / cols);
    }
    let colW = Math.trunc(300 / cols);
    if (colW > 150) colW = 150;
    const x0 = Math.trunc((w - cols * colW) / 2);
    const y0 = 10;
    Gui.drawRect(x0 - 1, y0 - 1, x0 + colW * cols, y0 + 9 * rows, -0x80000000);
    for (let i = 0; i < max; i++) {
      const x = x0 + (i % cols) * colW;
      const y = y0 + Math.trunc(i / cols) * 9;
      Gui.drawRect(x, y, x + colW - 1, y + 8, 0x20ffffff);
      GL.color(1, 1, 1, 1);
      GL.enable(GL.ALPHA_TEST);
      if (i >= list.length) continue;
      const e = list[i];
      const name = objective?.formatName(e.name) ?? e.name;
      fr.drawStringWithShadow(name, x, y, 0xffffff);
      if (objective) {
        const a = x + fr.getStringWidth(name) + 5;
        const b = x + colW - 12 - 5;
        if (b - a > 5) {
          const s = '\u00a7e' + objective.score(e.name);
          fr.drawStringWithShadow(s, b - fr.getStringWidth(s), y, 0xffffff);
        }
      }
      GL.color(1, 1, 1, 1);
      this.mc.renderEngine.bindTexture('/gui/icons.png');
      const rt = e.responseTime;
      const bars = rt < 0 ? 5 : rt < 150 ? 0 : rt < 300 ? 1 : rt < 600 ? 2 : rt < 1000 ? 3 : 4;
      this.zLevel += 100;
      this.drawTexturedModalRect(x + colW - 12, y, 0, 176 + bars * 8, 10, 8);
      this.zLevel -= 100;
    }
  }

  /** The scoreboard "sidebar" objective at the right edge (func_96136_a). */
  private renderSidebar(obj: SidebarObjective, h: number, w: number, fr: FontRenderer): void {
    const scores = obj.scores;
    if (scores.length > 15) return;
    let width = fr.getStringWidth(obj.displayName);
    for (const s of scores) width = Math.max(width, fr.getStringWidth(s.name + ': \u00a7c' + s.value));
    const total = scores.length * fr.FONT_HEIGHT;
    const bottom = Math.trunc(h / 2) + Math.trunc(total / 3);
    const pad = 3;
    const x = w - width - pad;
    let n = 0;
    for (const s of scores) {
      n++;
      const value = '\u00a7c' + s.value;
      const y = bottom - n * fr.FONT_HEIGHT;
      const r = w - pad + 2;
      Gui.drawRect(x - 2, y, r, y + fr.FONT_HEIGHT, 0x50000000);
      fr.drawString(s.name, x, y, 0x20ffffff);
      fr.drawString(value, r - fr.getStringWidth(value), y, 0x20ffffff);
      if (n === scores.length) {
        Gui.drawRect(x - 2, y - fr.FONT_HEIGHT - 1, r, y - 1, 0x60000000);
        Gui.drawRect(x - 2, y - 1, r, y, 0x50000000);
        fr.drawString(obj.displayName, x + Math.trunc(width / 2) - Math.trunc(fr.getStringWidth(obj.displayName) / 2), y - fr.FONT_HEIGHT, 0x20ffffff);
      }
    }
  }

  /** The Ender Dragon / Wither bar at the top (renderBossHealth). */
  private renderBossHealth(): void {
    if (BossStatus.bossName === null || BossStatus.statusBarLength <= 0) return;
    BossStatus.statusBarLength--;
    const fr = this.mc.fontRenderer;
    const w = this.mc.getScaledResolution().getScaledWidth();
    const len = 182;
    const x = Math.trunc(w / 2) - Math.trunc(len / 2);
    const filled = Math.trunc(f(BossStatus.healthScale * (len + 1)));
    const y = 12;
    this.drawTexturedModalRect(x, y, 0, 74, len, 5);
    this.drawTexturedModalRect(x, y, 0, 74, len, 5);
    if (filled > 0) this.drawTexturedModalRect(x, y, 0, 79, filled, 5);
    const name = BossStatus.bossName;
    fr.drawStringWithShadow(name, Math.trunc(w / 2) - Math.trunc(fr.getStringWidth(name) / 2), y - 10, 0xffffff);
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/icons.png');
  }

  private renderPumpkinBlur(w: number, h: number): void {
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(1, 1, 1, 1);
    GL.disable(GL.ALPHA_TEST);
    this.mc.renderEngine.bindTexture('%blur%/misc/pumpkinblur.png');
    this.fullScreenQuad(w, h, 0, 0, 1, 1);
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
    GL.enable(GL.ALPHA_TEST);
    GL.color(1, 1, 1, 1);
  }

  private renderPortalOverlay(k: number, w: number, h: number): void {
    if (k < 1) {
      k = f(k * k);
      k = f(k * k);
      k = f(f(k * 0.8) + 0.2);
    }
    GL.disable(GL.ALPHA_TEST);
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(1, 1, 1, k);
    this.mc.renderEngine.bindTexture('/terrain.png');
    const icon = Block.blocksList[PORTAL_ID]?.getBlockTextureFromSide(1) ?? null;
    if (icon) this.fullScreenQuad(w, h, icon.getMinU(), icon.getMinV(), icon.getMaxU(), icon.getMaxV());
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
    GL.enable(GL.ALPHA_TEST);
    GL.color(1, 1, 1, 1);
  }

  private fullScreenQuad(w: number, h: number, u0: number, v0: number, u1: number, v1: number): void {
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(0, h, -90, u0, v1);
    t.addVertexWithUV(w, h, -90, u1, v1);
    t.addVertexWithUV(w, 0, -90, u1, v0);
    t.addVertexWithUV(0, 0, -90, u0, v0);
    t.draw();
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
    if (this.mc.theWorld) GuiIngame.scoreboardOverlay?.tick?.(this.mc.theWorld, p);
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
