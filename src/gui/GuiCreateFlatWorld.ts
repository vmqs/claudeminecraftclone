import { I18n } from '../core/I18n';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { GL } from '../render/gl/GL';
import { RenderItem } from '../render/entity/RenderItem';
import { RenderHelper } from '../render/RenderHelper';
import { Tessellator } from '../render/gl/Tessellator';
import { FlatGeneratorInfo } from '../world/gen/FlatGeneratorInfo';
import { flatGeneratorToString } from './FlatPresets';
import { GuiButton } from './GuiButton';
import type { GuiCreateWorld } from './GuiCreateWorld';
import { GuiFlatPresets } from './GuiFlatPresets';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';

/** Draws an item in an 18x18 /gui/slot.png frame (the layer and preset lists' icons). */
export function drawSlotWithItem(gui: GuiScreen, renderItem: RenderItem, x: number, y: number, stack: ItemStack | null): void {
  GL.color(1, 1, 1, 1);
  gui.mc.renderEngine.bindTexture('/gui/slot.png');
  const t = Tessellator.instance;
  const k = 0.0078125;
  t.startDrawingQuads();
  t.addVertexWithUV(x + 1, y + 1 + 18, 0, 0, 18 * k);
  t.addVertexWithUV(x + 1 + 18, y + 1 + 18, 0, 18 * k, 18 * k);
  t.addVertexWithUV(x + 1 + 18, y + 1, 0, 18 * k, 0);
  t.addVertexWithUV(x + 1, y + 1, 0, 0, 0);
  t.draw();
  if (stack && Item.itemsList[stack.itemID]) {
    RenderHelper.enableGUIStandardItemLighting();
    renderItem.renderItemIntoGUI(gui.mc.fontRenderer, gui.mc.renderEngine, stack, x + 2, y + 2);
    RenderHelper.disableStandardItemLighting();
  }
}

/** "Superflat Customization" (GuiCreateFlatWorld): the layers, Remove Layer and Presets. */
export class GuiCreateFlatWorld extends GuiScreen {
  static readonly theRenderItem = new RenderItem();
  flatInfo: FlatGeneratorInfo;
  private customizationTitle = '';
  private layerMaterialLabel = '';
  private heightLabel = '';
  private listSlot!: GuiCreateFlatWorldListSlot;
  private buttonAddLayer!: GuiButton;
  private buttonEditLayer!: GuiButton;
  private buttonRemoveLayer!: GuiButton;

  constructor(
    private readonly createWorldGui: GuiCreateWorld,
    preset: string,
  ) {
    super();
    this.flatInfo = FlatGeneratorInfo.createFlatGeneratorFromString(preset || null);
  }

  get font() {
    return this.fontRenderer;
  }

  getFlatGeneratorInfo(): string {
    return flatGeneratorToString(this.flatInfo);
  }

  setFlatGeneratorInfo(s: string): void {
    this.flatInfo = FlatGeneratorInfo.createFlatGeneratorFromString(s || null);
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonList = [];
    this.customizationTitle = t('createWorld.customize.flat.title');
    this.layerMaterialLabel = t('createWorld.customize.flat.tile');
    this.heightLabel = t('createWorld.customize.flat.height');
    this.listSlot = new GuiCreateFlatWorldListSlot(this);
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push((this.buttonAddLayer = new GuiButton(2, cx - 154, this.height - 52, 100, 20, t('createWorld.customize.flat.addLayer') + ' (NYI)')));
    this.buttonList.push((this.buttonEditLayer = new GuiButton(3, cx - 50, this.height - 52, 100, 20, t('createWorld.customize.flat.editLayer') + ' (NYI)')));
    this.buttonList.push((this.buttonRemoveLayer = new GuiButton(4, cx - 155, this.height - 52, 150, 20, t('createWorld.customize.flat.removeLayer'))));
    this.buttonList.push(new GuiButton(0, cx - 155, this.height - 28, 150, 20, t('gui.done')));
    this.buttonList.push(new GuiButton(5, cx + 5, this.height - 52, 150, 20, t('createWorld.customize.presets')));
    this.buttonList.push(new GuiButton(1, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.buttonAddLayer.drawButton = this.buttonEditLayer.drawButton = false;
    this.flatInfo.updateLayers();
    this.updateButtons();
  }

  protected override actionPerformed(b: GuiButton): void {
    const layers = this.flatInfo.flatLayers;
    const index = layers.length - this.listSlot.selectedLayer - 1;
    if (b.id === 1) {
      this.mc.displayGuiScreen(this.createWorldGui);
    } else if (b.id === 0) {
      this.createWorldGui.generatorOptionsToUse = this.getFlatGeneratorInfo();
      this.mc.displayGuiScreen(this.createWorldGui);
    } else if (b.id === 5) {
      this.mc.displayGuiScreen(new GuiFlatPresets(this));
    } else if (b.id === 4 && this.hasSelection()) {
      layers.splice(index, 1);
      this.listSlot.selectedLayer = Math.min(this.listSlot.selectedLayer, layers.length - 1);
    }
    this.flatInfo.updateLayers();
    this.updateButtons();
  }

  /** func_82270_g */
  updateButtons(): void {
    const sel = this.hasSelection();
    this.buttonRemoveLayer.enabled = sel;
    this.buttonEditLayer.enabled = false;
    this.buttonAddLayer.enabled = false;
  }

  private hasSelection(): boolean {
    return this.listSlot.selectedLayer > -1 && this.listSlot.selectedLayer < this.flatInfo.flatLayers.length;
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.listSlot.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, this.customizationTitle, Math.trunc(this.width / 2), 8, 0xffffff);
    const x = Math.trunc(this.width / 2) - 92 - 16;
    this.drawString(this.fontRenderer, this.layerMaterialLabel, x, 32, 0xffffff);
    this.drawString(this.fontRenderer, this.heightLabel, x + 2 + 213 - this.fontRenderer.getStringWidth(this.heightLabel), 32, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}

/** The layer rows, top layer first (GuiCreateFlatWorldListSlot). */
class GuiCreateFlatWorldListSlot extends GuiSlot {
  selectedLayer = -1;

  constructor(private readonly gui: GuiCreateFlatWorld) {
    super(gui.mc, gui.width, gui.height, 43, gui.height - 60, 24);
  }

  protected getSize(): number {
    return this.gui.flatInfo.flatLayers.length;
  }

  protected elementClicked(i: number): void {
    this.selectedLayer = i;
    this.gui.updateButtons();
  }

  protected isSelected(i: number): boolean {
    return i === this.selectedLayer;
  }

  protected drawBackground(): void {}

  protected drawSlot(i: number, x: number, y: number, _h: number, _t: Tessellator): void {
    const layers = this.gui.flatInfo.flatLayers;
    const layer = layers[layers.length - i - 1];
    const stack = layer.blockId === 0 ? null : new ItemStack(layer.blockId, 1, layer.meta);
    let name = 'Air';
    if (stack) {
      const item = Item.itemsList[layer.blockId];
      name = item ? item.getItemDisplayName(stack) : String(layer.blockId);
    }
    drawSlotWithItem(this.gui, GuiCreateFlatWorld.theRenderItem, x, y, stack);
    const font = this.gui.font;
    font.drawString(name, x + 18 + 5, y + 3, 0xffffff);
    let key = 'createWorld.customize.flat.layer';
    if (i === 0) key = 'createWorld.customize.flat.layer.top';
    else if (i === layers.length - 1) key = 'createWorld.customize.flat.layer.bottom';
    const count = I18n.translateToLocalFormatted(key, layer.count);
    font.drawString(count, x + 2 + 213 - font.getStringWidth(count), y + 3, 0xffffff);
  }

  protected override getScrollBarX(): number {
    return this.gui.width - 70;
  }
}
