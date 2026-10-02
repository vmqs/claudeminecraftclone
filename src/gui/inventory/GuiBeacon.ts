import type { Minecraft } from '../../client/Minecraft';
import { ItemIds } from '../../block/BlockIds';
import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { ItemStack } from '../../item/ItemStack';
import { Potion } from '../../potion/Potion';
import { GL } from '../../render/gl/GL';
import { RenderHelper } from '../../render/RenderHelper';
import { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import { GuiButton } from '../GuiButton';
import { ContainerBeacon } from './ContainerBeacon';
import { GuiContainer } from './GuiContainer';

const REGENERATION = 10;

/** A 22x22 beacon button (GuiBeaconButton): frame from beacon.png, an 18x18 picture from `texture`. */
class GuiBeaconButton extends GuiButton {
  /** Selected (field_82256_n). */
  selected = false;

  constructor(
    id: number,
    x: number,
    y: number,
    private readonly texture: string,
    private readonly iconU: number,
    private readonly iconV: number,
    private readonly tooltip: () => string,
  ) {
    super(id, x, y, 22, 22, '');
  }

  override drawButtonOn(mc: Minecraft, mx: number, my: number): void {
    if (!this.drawButton) return;
    mc.renderEngine.bindTexture('/gui/beacon.png');
    GL.color(1, 1, 1, 1);
    this.hovered = mx >= this.xPosition && my >= this.yPosition && mx < this.xPosition + this.width && my < this.yPosition + this.height;
    let u = 0;
    if (!this.enabled) u += this.width * 2;
    else if (this.selected) u += this.width;
    else if (this.hovered) u += this.width * 3;
    this.drawTexturedModalRect(this.xPosition, this.yPosition, u, 219, this.width, this.height);
    if (this.texture !== '/gui/beacon.png') mc.renderEngine.bindTexture(this.texture);
    this.drawTexturedModalRect(this.xPosition + 2, this.yPosition + 2, this.iconU, this.iconV, 18, 18);
  }

  getTooltip(): string {
    return this.tooltip();
  }
}

/** A power button (GuiBeaconButtonPower): the potion's status icon; `tier` 3 is the secondary column. */
class GuiBeaconButtonPower extends GuiBeaconButton {
  constructor(id: number, x: number, y: number, effect: number, tier: number) {
    const icon = Potion.potionTypes[effect]!.getStatusIconIndex();
    super(id, x, y, '/gui/inventory.png', (icon % 8) * 18, 198 + Math.trunc(icon / 8) * 18, () => {
      const name = I18n.translateToLocal(Potion.potionTypes[effect]!.getName());
      return tier >= 3 && effect !== REGENERATION ? name + ' II' : name;
    });
  }
}

/**
 * The beacon screen (GuiBeacon): primary powers by pyramid tier, the secondary column, the
 * payment slot with its four item pictures, Done / Cancel. Choices stay in the screen (as on
 * the client in 1.5.2) until Done pays an item and applies them to the beacon.
 */
export class GuiBeacon extends GuiContainer {
  private confirmButton!: GuiBeaconButton;
  private buttonsNotDrawn = true;
  private readonly beaconContainer: ContainerBeacon;
  /** The client's view of the chosen effects. */
  private primary: number;
  private secondary: number;

  constructor(
    inv: InventoryPlayer,
    private readonly beacon: TileEntityBeacon,
  ) {
    const c = new ContainerBeacon(inv, beacon);
    super(c);
    this.beaconContainer = c;
    this.xSize = 230;
    this.ySize = 219;
    this.primary = beacon.getPrimaryEffect();
    this.secondary = beacon.getSecondaryEffect();
  }

  override initGui(): void {
    super.initGui();
    this.confirmButton = new GuiBeaconButton(-1, this.guiLeft + 164, this.guiTop + 107, '/gui/beacon.png', 90, 220, () => I18n.translateToLocal('gui.done'));
    this.buttonList.push(this.confirmButton);
    this.buttonList.push(new GuiBeaconButton(-2, this.guiLeft + 190, this.guiTop + 107, '/gui/beacon.png', 112, 220, () => I18n.translateToLocal('gui.cancel')));
    this.buttonsNotDrawn = true;
    this.confirmButton.enabled = false;
  }

  /** TileEntityBeacon.setPrimaryEffect's check: the effect must be offered by a tier the pyramid has. */
  private validPrimary(id: number): number {
    const levels = this.beacon.getLevels();
    for (let i = 0; i < levels && i < 3; i++) if (TileEntityBeacon.effectsList[i].includes(id)) return id;
    return 0;
  }

  private validSecondary(id: number): number {
    if (this.beacon.getLevels() < 4) return 0;
    for (let i = 0; i < 4; i++) if (TileEntityBeacon.effectsList[i].includes(id)) return id;
    return 0;
  }

  override updateScreen(): void {
    super.updateScreen();
    const levels = this.beacon.getLevels();
    if (this.buttonsNotDrawn && levels >= 0) {
      this.buttonsNotDrawn = false;
      for (let tier = 0; tier <= 2; tier++) {
        const effects = TileEntityBeacon.effectsList[tier];
        const w = effects.length * 22 + (effects.length - 1) * 2;
        effects.forEach((effect, i) => {
          const b = new GuiBeaconButtonPower((tier << 8) | effect, this.guiLeft + 76 + i * 24 - Math.trunc(w / 2), this.guiTop + 22 + tier * 25, effect, tier);
          this.buttonList.push(b);
          if (tier >= levels) b.enabled = false;
          else if (effect === this.primary) b.selected = true;
        });
      }
      const tier = 3;
      const count = TileEntityBeacon.effectsList[tier].length + 1;
      const w = count * 22 + (count - 1) * 2;
      for (let i = 0; i < count - 1; i++) {
        const effect = TileEntityBeacon.effectsList[tier][i];
        const b = new GuiBeaconButtonPower((tier << 8) | effect, this.guiLeft + 167 + i * 24 - Math.trunc(w / 2), this.guiTop + 47, effect, tier);
        this.buttonList.push(b);
        if (tier >= levels) b.enabled = false;
        else if (effect === this.secondary) b.selected = true;
      }
      if (this.primary > 0) {
        // The primary effect at level II as a secondary choice.
        const b = new GuiBeaconButtonPower((tier << 8) | this.primary, this.guiLeft + 167 + (count - 1) * 24 - Math.trunc(w / 2), this.guiTop + 47, this.primary, tier);
        this.buttonList.push(b);
        if (tier >= levels) b.enabled = false;
        else if (this.primary === this.secondary) b.selected = true;
      }
    }
    this.confirmButton.enabled = this.beacon.getStackInSlot(0) !== null && this.primary > 0;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === -2) {
      this.mc.displayGuiScreen(null);
    } else if (b.id === -1) {
      this.beaconContainer.applyEffects(this.primary, this.secondary);
      this.mc.displayGuiScreen(null);
    } else if (b instanceof GuiBeaconButtonPower) {
      if (b.selected) return;
      const effect = b.id & 255;
      if (b.id >> 8 < 3) this.primary = this.validPrimary(effect);
      else this.secondary = this.validSecondary(effect);
      this.buttonList = [];
      this.initGui();
      this.updateScreen();
    }
  }

  protected override drawGuiContainerForegroundLayer(mx: number, my: number): void {
    RenderHelper.disableStandardItemLighting();
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('tile.beacon.primary'), 62, 10, 0xe0e0e0);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('tile.beacon.secondary'), 169, 10, 0xe0e0e0);
    for (const b of this.buttonList) {
      if (b.isMouseOver() && b instanceof GuiBeaconButton) {
        this.drawCreativeTabHoveringText(b.getTooltip(), mx - this.guiLeft, my - this.guiTop);
        break;
      }
    }
    RenderHelper.enableGUIStandardItemLighting();
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/beacon.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    const r = GuiBeacon.itemRenderer;
    r.zLevel = 100;
    [ItemIds.emerald, ItemIds.diamond, ItemIds.ingotGold, ItemIds.ingotIron].forEach((id, i) => {
      r.renderItemAndEffectIntoGUI(this.fontRenderer, this.mc.renderEngine, new ItemStack(id), x + 42 + i * 22, y + 109);
    });
    r.zLevel = 0;
  }
}
