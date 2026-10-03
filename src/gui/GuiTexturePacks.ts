import type { GameSettings } from '../client/GameSettings';
import type { Minecraft } from '../client/Minecraft';
import { translateOr, translateOrFormatted } from '../client/ControlsText';
import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import type { Tessellator } from '../render/gl/Tessellator';
import { importTexturePackFile } from '../assets/PackFiles';
import { GuiButton, GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';
import { GuiYesNo } from './GuiYesNo';

/** One entry of the pack list (ITexturePack): Default (the vanilla layer), a bundled or an imported pack. */
export interface TexturePackEntry {
  /** null for Default. */
  id: string | null;
  fileName: string;
  firstDescriptionLine: string | null;
  secondDescriptionLine: string | null;
  /** Imported by the player: can be deleted. */
  user: boolean;
  /** TexturePackCustom.isCompatible (a textures/ folder); 1.5.2 marks the others "Incompatible". */
  compatible: boolean;
  icon: Blob | null;
}

/** TexturePackImplementation.trimStringToGUIWidth */
function trimToGuiWidth(s: string | undefined): string | null {
  if (s === undefined) return null;
  return s.length > 34 ? s.substring(0, 34) : s;
}

/** Default first, then the bundled packs, then the imported ones (TexturePackList.availableTexturePacks). */
export function availableTexturePacks(mc: Minecraft): TexturePackEntry[] {
  const list: TexturePackEntry[] = [{ id: null, fileName: 'Default', firstDescriptionLine: 'The default look of Minecraft', secondDescriptionLine: null, user: false, compatible: true, icon: null }];
  for (const p of mc.resources.packs) {
    const lines = p.description.trim() ? p.description.split(/\r?\n/) : [];
    // A converted 1.6+ pack says so where its description leaves room.
    if (p.layout === 'modern') lines.splice(Math.min(lines.length, 1), 0, translateOr('texturePack.converted'));
    list.push({
      id: p.id,
      fileName: p.name + '.zip',
      firstDescriptionLine: trimToGuiWidth(lines[0]),
      secondDescriptionLine: trimToGuiWidth(lines[1]),
      user: p.user === true,
      compatible: p.compatible !== false,
      icon: p.icon ?? null,
    });
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
    let blob: Promise<Blob | null> | null = null;
    if (pack.icon) {
      blob = Promise.resolve(pack.icon);
    } else {
      let url: string | null = null;
      if (pack.id === null) url = rm.resolve('pack.png', 'vanilla');
      else if (!pack.user && info?.files.includes('pack.png')) url = `${rm.baseUrl}packs/${pack.id}/pack.png`;
      if (url) blob = fetch(url).then((r) => (r.ok ? r.blob() : null));
    }
    if (blob) {
      void blob
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

/**
 * "Select Texture Pack" (GuiTexturePacks). A browser tab has no texture pack folder, so
 * "Open texture pack folder" opens a file picker for .zip packs instead (dropping .zip files
 * on the page works too). Imported packs are stored in IndexedDB, listed after the bundled
 * ones with their pack.png and pack.txt, and have a delete button.
 */
export class GuiTexturePacks extends GuiScreen {
  private guiTexturePackSlot!: GuiTexturePackSlot;
  packs: TexturePackEntry[] = [];
  /** Shown instead of "(Place texture pack files here)" for a while after an import. */
  private status: { text: string; until: number } | null = null;
  private importing = 0;
  /** The delete button drawn on imported rows. */
  readonly deleteButton = new GuiButton(9, 0, 0, 20, 20, 'X');
  private readonly onDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  };
  private readonly onDrop = (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    void this.importFiles([...files]);
  };

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
    this.refreshPacks();
    this.guiTexturePackSlot = new GuiTexturePackSlot(this);
    this.guiTexturePackSlot.registerScrollButtons(this.buttonList, 7, 8);
    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('drop', this.onDrop);
  }

  override onGuiClosed(): void {
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('drop', this.onDrop);
  }

  /** TexturePackList.updateAvaliableTexturePacks */
  refreshPacks(): void {
    this.packs = availableTexturePacks(this.mc);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 5) this.openFilePicker();
    else if (b.id === 6) this.mc.displayGuiScreen(this.guiScreen);
    else this.guiTexturePackSlot.actionPerformed(b);
  }

  /** "Open texture pack folder": a file picker for .zip texture packs. */
  private openFilePicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = input.files ? [...input.files] : [];
      input.remove();
      void this.importFiles(files);
    });
    input.addEventListener('cancel', () => input.remove());
    document.body.appendChild(input);
    input.click();
  }

  /** Imports .zip texture packs one after another, reporting each in the status line. */
  async importFiles(files: File[]): Promise<void> {
    this.importing++;
    try {
      for (const file of files) {
        this.setStatus(translateOrFormatted('texturePack.importing', file.name), 60000);
        const result = await importTexturePackFile(this.mc.resources, file);
        if (result.ok) this.setStatus(translateOrFormatted('texturePack.imported', result.name), 5000);
        else this.setStatus('§c' + translateOrFormatted('texturePack.importFailed', file.name, result.error), 8000);
        this.refreshPacks();
      }
    } finally {
      this.importing--;
    }
  }

  private setStatus(text: string, ms: number): void {
    this.status = { text, until: performance.now() + ms };
  }

  /** setTexturePack + refreshTextures + loadRenderers. */
  selectPack(pack: TexturePackEntry): void {
    const mc = this.mc;
    if (mc.resources.selectedPack === pack.id) return;
    mc.gameSettings.skin = pack.fileName;
    mc.gameSettings.saveOptions();
    void mc.resources.selectPack(pack.id).then(() => {
      void mc.fontRenderer.readFontData(mc.resources);
      mc.renderGlobal.loadRenderers();
    });
  }

  /** The delete button on an imported pack: asks first, like deleting a world. */
  askDelete(pack: TexturePackEntry): void {
    const i = this.packs.indexOf(pack);
    this.mc.displayGuiScreen(new GuiYesNo(this, translateOr('texturePack.deleteQuestion'), translateOrFormatted('texturePack.deleteWarning', pack.fileName), translateOr('texturePack.delete'), I18n.translateToLocal('gui.cancel'), i));
  }

  override confirmClicked(ok: boolean, index: number): void {
    const pack = this.packs[index];
    if (ok && pack?.user && pack.id !== null) {
      const id = pack.id;
      void this.mc.resources.removeUserPack(id).then(() => {
        const tex = thumbnails.get(id);
        if (tex) GL.gl.deleteTexture(tex);
        thumbnails.delete(id);
        this.refreshPacks();
        void this.mc.fontRenderer.readFontData(this.mc.resources);
        this.mc.renderGlobal.loadRenderers();
      });
    }
    this.mc.displayGuiScreen(this);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.guiTexturePackSlot.drawScreen(mx, my, pt);
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('texturePack.title'), cx, 16, 0xffffff);
    if (this.status && (this.importing > 0 || performance.now() < this.status.until)) {
      const text = this.fontRenderer.trimStringToWidth(this.status.text, this.width - 8);
      this.drawCenteredString(this.fontRenderer, text, cx, this.height - 26, 0x808080);
    } else {
      this.status = null;
      this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('texturePack.folderInfo'), cx - 77, this.height - 26, 0x808080);
    }
    super.drawScreen(mx, my, pt);
  }

  bindThumbnail(pack: TexturePackEntry): void {
    bindThumbnailTexture(this.mc, pack);
  }
}

/** Room for text in an imported pack's row, between the icon and the delete button. */
const TEXT_ROOM = 156;

/** The pack rows (GuiTexturePackSlot): 32x32 icon, file name and two description lines. */
class GuiTexturePackSlot extends GuiSlot {
  /** Where each imported row's delete button was drawn this frame. */
  private readonly deleteAt = new Map<number, [number, number]>();

  constructor(private readonly gui: GuiTexturePacks) {
    super(gui.mc, gui.width, gui.height, 32, gui.height - 55 + 4, 36);
  }

  protected getSize(): number {
    return this.gui.packs.length;
  }

  protected elementClicked(i: number): void {
    const pack = this.gui.packs[i];
    const at = this.deleteAt.get(i);
    if (pack.user && at && this.mouseX >= at[0] && this.mouseX < at[0] + 20 && this.mouseY >= at[1] && this.mouseY < at[1] + 20) {
      this.gui.mc.sndManager.playSoundFX('random.click', 1, 1);
      this.gui.askDelete(pack);
      return;
    }
    this.gui.selectPack(pack);
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

  override drawScreen(mx: number, my: number, pt: number): void {
    this.deleteAt.clear();
    super.drawScreen(mx, my, pt);
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
    if (!pack.compatible) name = '§4' + I18n.translateToLocal('texturePack.incompatible') + ' - ' + name;
    if (name.length > 32) name = name.substring(0, 32).trim() + '...';
    const font = this.gui.font;
    let first = pack.firstDescriptionLine;
    let second = pack.secondDescriptionLine;
    if (pack.user) {
      // Imported rows end with a delete button; their text stops short of it.
      const fit = (s: string | null) => (s === null || font.getStringWidth(s) <= TEXT_ROOM ? s : font.trimStringToWidth(s, TEXT_ROOM - font.getStringWidth('...')) + '...');
      name = fit(name)!;
      first = fit(first);
      second = fit(second);
      const b = this.gui.deleteButton;
      b.xPosition = x + 194;
      b.yPosition = y + 6;
      this.deleteAt.set(i, [b.xPosition, b.yPosition]);
      b.drawButtonOn(this.gui.mc, this.mouseX, this.mouseY);
    }
    this.gui.drawString(font, name, x + 32 + 2, y + 1, 0xffffff);
    if (first !== null) this.gui.drawString(font, first, x + 32 + 2, y + 12, 0x808080);
    if (second !== null) this.gui.drawString(font, second, x + 32 + 2, y + 12 + 10, 0x808080);
  }
}
