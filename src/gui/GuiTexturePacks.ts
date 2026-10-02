import type { GameSettings } from '../client/GameSettings';
import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import type { Tessellator } from '../render/gl/Tessellator';
import type { GuiButton } from './GuiButton';
import { GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';

/** One entry of the pack list (ITexturePack): Default (the vanilla layer) or a bundled pack. */
export interface TexturePackEntry {
  /** null for Default. */
  id: string | null;
  fileName: string;
  firstDescriptionLine: string | null;
  secondDescriptionLine: string | null;
}

/** TexturePackImplementation.trimStringToGUIWidth */
function trimToGuiWidth(s: string | undefined): string | null {
  if (s === undefined) return null;
  return s.length > 34 ? s.substring(0, 34) : s;
}

/** Default first, then the bundled packs (TexturePackList.availableTexturePacks). */
export function availableTexturePacks(mc: Minecraft): TexturePackEntry[] {
  const list: TexturePackEntry[] = [{ id: null, fileName: 'Default', firstDescriptionLine: 'The default look of Minecraft', secondDescriptionLine: null }];
  for (const p of mc.resources.packs) {
    const lines = p.description.split(/\r?\n/);
    list.push({ id: p.id, fileName: p.name + '.zip', firstDescriptionLine: trimToGuiWidth(lines[0]), secondDescriptionLine: trimToGuiWidth(lines[1]) });
  }
  return list;
}

/** pack.png of each pack as its own texture (bindThumbnailTexture); unknown_pack.png without one. */
const thumbnails = new Map<string, WebGLTexture | null>();

function bindThumbnailTexture(mc: Minecraft, pack: TexturePackEntry): void {
  const key = pack.id ?? '';
  const tex = thumbnails.get(key);
  if (tex) {
    GL.bindTexture(tex);
    return;
  }
  if (!thumbnails.has(key)) {
    thumbnails.set(key, null);
    const rm = mc.resources;
    const info = rm.packs.find((p) => p.id === pack.id);
    let url: string | null = null;
    if (pack.id === null) url = rm.resolve('pack.png', 'vanilla');
    else if (info?.files.includes('pack.png')) url = `${rm.baseUrl}packs/${pack.id}/pack.png`;
    if (url) {
      void fetch(url)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null))
        .then((bmp) => {
          if (!bmp) return;
          const t = mc.renderEngine.allocateTexture(bmp.width, bmp.height);
          mc.renderEngine.setupTextureExt(t, bmp, false, false);
          bmp.close();
          thumbnails.set(key, t);
        })
        .catch(() => undefined);
    }
  }
  mc.renderEngine.bindTexture('/gui/unknown_pack.png');
}

/** "Select Texture Pack" (GuiTexturePacks). Packs cannot be added from a browser tab, so the folder button does nothing. */
export class GuiTexturePacks extends GuiScreen {
  private guiTexturePackSlot!: GuiTexturePackSlot;
  packs: TexturePackEntry[] = [];

  constructor(
    protected readonly guiScreen: GuiScreen,
    _settings: GameSettings,
  ) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiSmallButton(5, cx - 154, this.height - 48, null, I18n.translateToLocal('texturePack.openFolder')));
    this.buttonList.push(new GuiSmallButton(6, cx + 4, this.height - 48, null, I18n.translateToLocal('gui.done')));
    this.packs = availableTexturePacks(this.mc);
    this.guiTexturePackSlot = new GuiTexturePackSlot(this);
    this.guiTexturePackSlot.registerScrollButtons(this.buttonList, 7, 8);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 5) return;
    if (b.id === 6) this.mc.displayGuiScreen(this.guiScreen);
    else this.guiTexturePackSlot.actionPerformed(b);
  }

  /** setTexturePack + refreshTextures + loadRenderers. */
  selectPack(pack: TexturePackEntry): void {
    const mc = this.mc;
    if (mc.resources.selectedPack === pack.id) return;
    mc.gameSettings.skin = pack.fileName;
    mc.gameSettings.saveOptions();
    mc.resources.selectPack(pack.id);
    void mc.fontRenderer.readFontData(mc.resources);
    mc.renderGlobal.loadRenderers();
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.guiTexturePackSlot.drawScreen(mx, my, pt);
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('texturePack.title'), cx, 16, 0xffffff);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('texturePack.folderInfo'), cx - 77, this.height - 26, 0x808080);
    super.drawScreen(mx, my, pt);
  }

  bindThumbnail(pack: TexturePackEntry): void {
    bindThumbnailTexture(this.mc, pack);
  }
}

/** The pack rows (GuiTexturePackSlot): 32x32 icon, file name and two description lines. */
class GuiTexturePackSlot extends GuiSlot {
  constructor(private readonly gui: GuiTexturePacks) {
    super(gui.mc, gui.width, gui.height, 32, gui.height - 55 + 4, 36);
  }

  protected getSize(): number {
    return this.gui.packs.length;
  }

  protected elementClicked(i: number): void {
    this.gui.selectPack(this.gui.packs[i]);
  }

  protected isSelected(i: number): boolean {
    return this.gui.mc.resources.selectedPack === this.gui.packs[i].id;
  }

  protected override getContentHeight(): number {
    return this.getSize() * 36;
  }

  protected drawBackground(): void {
    this.gui.drawDefaultBackground();
  }

  protected drawSlot(i: number, x: number, y: number, h: number, t: Tessellator): void {
    const pack = this.gui.packs[i];
    this.gui.bindThumbnail(pack);
    GL.color(1, 1, 1, 1);
    t.startDrawingQuads();
    t.setColorOpaque_I(0xffffff);
    t.addVertexWithUV(x, y + h, 0, 0, 1);
    t.addVertexWithUV(x + 32, y + h, 0, 1, 1);
    t.addVertexWithUV(x + 32, y, 0, 1, 0);
    t.addVertexWithUV(x, y, 0, 0, 0);
    t.draw();
    let name = pack.fileName;
    if (name.length > 32) name = name.substring(0, 32).trim() + '...';
    const font = this.gui.font;
    this.gui.drawString(font, name, x + 32 + 2, y + 1, 0xffffff);
    if (pack.firstDescriptionLine !== null) this.gui.drawString(font, pack.firstDescriptionLine, x + 32 + 2, y + 12, 0x808080);
    if (pack.secondDescriptionLine !== null) this.gui.drawString(font, pack.secondDescriptionLine, x + 32 + 2, y + 12 + 10, 0x808080);
  }
}
