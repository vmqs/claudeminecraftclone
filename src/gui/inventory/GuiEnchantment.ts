import { JavaRandom } from '../../core/JavaRandom';
import { I18n } from '../../core/I18n';
import { MathHelper } from '../../core/MathHelper';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { ItemStack } from '../../item/ItemStack';
import { GL } from '../../render/gl/GL';
import { RenderHelper } from '../../render/RenderHelper';
import type { World } from '../../world/World';
import { FontRenderer } from '../FontRenderer';
import { ScaledResolution } from '../ScaledResolution';
import { ContainerEnchantment } from './ContainerEnchantment';
import { GuiContainer } from './GuiContainer';
import { ModelBook } from './ModelBook';

const f = Math.fround;

/** The random "Standard Galactic" names of the offers (EnchantmentNameParts). */
export class EnchantmentNameParts {
  static readonly instance = new EnchantmentNameParts();
  private readonly rand = new JavaRandom();
  private readonly wordList =
    'the elder scrolls klaatu berata niktu xyzzy bless curse light darkness fire air earth water hot dry cold wet ignite snuff embiggen twist shorten stretch fiddle destroy imbue galvanize enchant free limited range of towards inside sphere cube self other ball mental physical grow shrink demon elemental spirit animal creature beast humanoid undead fresh stale'.split(
      ' ',
    );

  generateRandomEnchantName(): string {
    const n = this.rand.nextInt(2) + 3;
    const words: string[] = [];
    for (let i = 0; i < n; i++) words.push(this.wordList[this.rand.nextInt(this.wordList.length)]);
    return words.join(' ');
  }

  setRandSeed(seed: bigint): void {
    this.rand.setSeed(seed);
  }
}

/**
 * The enchanting table screen (GuiEnchantment): the animated book in its own small perspective
 * view, and three offers with galactic names and their level cost (green when affordable).
 */
export class GuiEnchantment extends GuiContainer {
  private static readonly bookModel = new ModelBook();
  /** The alternate (Standard Galactic) font, mc.standardGalacticFontRenderer. */
  private static galacticFont: FontRenderer | null = null;
  private readonly rand = new JavaRandom();
  private readonly container: ContainerEnchantment;
  private ticks = 0;
  private pageFlip = 0;
  private pageFlipPrev = 0;
  private flipTarget = 0;
  private flipVelocity = 0;
  private bookOpen = 0;
  private bookOpenPrev = 0;
  private theItemStack: ItemStack | null = null;

  constructor(
    inv: InventoryPlayer,
    world: World,
    x: number,
    y: number,
    z: number,
    private readonly customName: string | null,
  ) {
    const c = new ContainerEnchantment(inv, world, x, y, z);
    super(c);
    this.container = c;
  }

  override initGui(): void {
    super.initGui();
    if (!GuiEnchantment.galacticFont) {
      const font = new FontRenderer('/font/alternate.png', this.mc.renderEngine, false);
      GuiEnchantment.galacticFont = font;
      void font.readFontData(this.mc.resources);
    }
  }

  protected override drawGuiContainerForegroundLayer(): void {
    this.fontRenderer.drawString(this.customName ?? I18n.translateToLocal('container.enchant'), 12, 5, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  override updateScreen(): void {
    super.updateScreen();
    this.updateBook();
  }

  protected override mouseClicked(mx: number, my: number, button: number): void {
    super.mouseClicked(mx, my, button);
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    for (let i = 0; i < 3; i++) {
      const dx = mx - (x + 60);
      const dy = my - (y + 14 + 19 * i);
      if (dx >= 0 && dy >= 0 && dx < 108 && dy < 19 && this.container.enchantItem(this.mc.thePlayer!, i)) this.mc.playerController.sendEnchantPacket(this.container.windowId, i);
    }
  }

  protected drawGuiContainerBackgroundLayer(pt: number, mx: number, my: number): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/enchant.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    this.drawBook(pt);
    RenderHelper.disableStandardItemLighting();
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/enchant.png');
    EnchantmentNameParts.instance.setRandSeed(this.container.nameSeed);
    const player = this.mc.thePlayer!;
    const xpLevel = (player as { experienceLevel?: number }).experienceLevel ?? 0;
    for (let i = 0; i < 3; i++) {
      const name = EnchantmentNameParts.instance.generateRandomEnchantName();
      this.zLevel = 0;
      this.mc.renderEngine.bindTexture('/gui/enchant.png');
      const level = this.container.enchantLevels[i];
      GL.color(1, 1, 1, 1);
      const rowY = y + 14 + 19 * i;
      if (level === 0) {
        this.drawTexturedModalRect(x + 60, rowY, 0, 185, 108, 19);
        continue;
      }
      const cost = String(level);
      const galactic = GuiEnchantment.galacticFont ?? this.fontRenderer;
      let color = 0x685e4a;
      if (xpLevel < level && !player.capabilities.isCreativeMode) {
        this.drawTexturedModalRect(x + 60, rowY, 0, 185, 108, 19);
        galactic.drawSplitString(name, x + 62, y + 16 + 19 * i, 104, (color & 0xfefefe) >> 1);
        this.fontRenderer.drawStringWithShadow(cost, x + 62 + 104 - this.fontRenderer.getStringWidth(cost), y + 16 + 19 * i + 7, 0x407f10);
      } else {
        const dx = mx - (x + 60);
        const dy = my - rowY;
        if (dx >= 0 && dy >= 0 && dx < 108 && dy < 19) {
          this.drawTexturedModalRect(x + 60, rowY, 0, 204, 108, 19);
          color = 0xffff80;
        } else {
          this.drawTexturedModalRect(x + 60, rowY, 0, 166, 108, 19);
        }
        galactic.drawSplitString(name, x + 62, y + 16 + 19 * i, 104, color);
        this.fontRenderer.drawStringWithShadow(cost, x + 62 + 104 - this.fontRenderer.getStringWidth(cost), y + 16 + 19 * i + 7, 0x80ff20);
      }
    }
  }

  /** The book in a 320x240 viewport centred on the screen, with a 90 degree perspective. */
  private drawBook(pt: number): void {
    GL.pushMatrix();
    GL.matrixMode(GL.PROJECTION);
    GL.pushMatrix();
    GL.loadIdentity();
    const sr = new ScaledResolution(this.mc.gameSettings.guiScale, this.mc.displayWidth, this.mc.displayHeight);
    const sf = sr.getScaleFactor();
    GL.viewport(Math.trunc((sr.getScaledWidth() - 320) / 2) * sf, Math.trunc((sr.getScaledHeight() - 240) / 2) * sf, 320 * sf, 240 * sf);
    GL.translate(f(-0.34), f(0.23), 0);
    GL.perspective(90, f(1.3333334), 9, 80);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    RenderHelper.enableStandardItemLighting();
    GL.translate(0, f(3.3), -16);
    GL.scale(5, 5, 5);
    GL.rotate(180, 0, 0, 1);
    this.mc.renderEngine.bindTexture('/item/book.png');
    GL.rotate(20, 1, 0, 0);
    const open = f(this.bookOpenPrev + f(f(this.bookOpen - this.bookOpenPrev) * pt));
    GL.translate(f(f(1 - open) * f(0.2)), f(f(1 - open) * f(0.1)), f(f(1 - open) * f(0.25)));
    GL.rotate(f(f(-f(1 - open) * 90) - 90), 0, 1, 0);
    GL.rotate(180, 1, 0, 0);
    const flip = f(this.pageFlipPrev + f(f(this.pageFlip - this.pageFlipPrev) * pt));
    let right = f(flip + f(0.25));
    let left = f(flip + f(0.75));
    right = f(f(f(right - MathHelper.truncateDoubleToInt(right)) * f(1.6)) - f(0.3));
    left = f(f(f(left - MathHelper.truncateDoubleToInt(left)) * f(1.6)) - f(0.3));
    right = Math.min(1, Math.max(0, right));
    left = Math.min(1, Math.max(0, left));
    GL.enable(GL.RESCALE_NORMAL);
    GuiEnchantment.bookModel.render(null, 0, right, left, open, 0, f(0.0625));
    GL.disable(GL.RESCALE_NORMAL);
    RenderHelper.disableStandardItemLighting();
    GL.matrixMode(GL.PROJECTION);
    GL.viewport(0, 0, this.mc.displayWidth, this.mc.displayHeight);
    GL.popMatrix();
    GL.matrixMode(GL.MODELVIEW);
    GL.popMatrix();
  }

  /** func_74205_h: flip pages when the item changes, open the book while offers exist. */
  private updateBook(): void {
    const stack = this.inventorySlots.getSlot(0).getStack();
    if (!ItemStack.areItemStacksEqual(stack, this.theItemStack)) {
      this.theItemStack = stack;
      do {
        this.flipTarget = f(this.flipTarget + (this.rand.nextInt(4) - this.rand.nextInt(4)));
      } while (this.pageFlip <= f(this.flipTarget + 1) && this.pageFlip >= f(this.flipTarget - 1));
    }
    this.ticks++;
    this.pageFlipPrev = this.pageFlip;
    this.bookOpenPrev = this.bookOpen;
    const offers = this.container.enchantLevels.some((l) => l !== 0);
    this.bookOpen = f(this.bookOpen + (offers ? f(0.2) : f(-0.2)));
    if (this.bookOpen < 0) this.bookOpen = 0;
    if (this.bookOpen > 1) this.bookOpen = 1;
    let v = f(f(this.flipTarget - this.pageFlip) * f(0.4));
    const max = f(0.2);
    if (v < -max) v = -max;
    if (v > max) v = max;
    this.flipVelocity = f(this.flipVelocity + f(f(v - this.flipVelocity) * f(0.9)));
    this.pageFlip = f(this.pageFlip + this.flipVelocity);
  }
}
