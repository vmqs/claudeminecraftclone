import { EnumOptions, type GameSettings } from '../client/GameSettings';
import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import type { Tessellator } from '../render/gl/Tessellator';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';

/** A stable random id per browser, like the snooper token kept in options. */
function snooperToken(): string {
  const key = 'mc152.snooperToken';
  try {
    let t = localStorage.getItem(key);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(key, t);
    }
    return t;
  } catch {
    return '00000000-0000-0000-0000-000000000000';
  }
}

const startTime = Date.now();

/**
 * The values PlayerUsageSnooper would report, from what the browser exposes. Nothing is ever
 * sent anywhere; the screen only shows them.
 */
export function getSnooperStats(mc: Minecraft): Map<string, string> {
  const m = new Map<string, string>();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = (performance as unknown as { memory?: { jsHeapSizeLimit: number; totalJSHeapSize: number; usedJSHeapSize: number } }).memory;
  m.set('snooper_token', snooperToken());
  m.set('os_name', nav.platform || 'unknown');
  m.set('os_version', nav.userAgent);
  m.set('os_architecture', nav.platform.includes('64') ? 'amd64' : 'x86');
  m.set('java_version', 'n/a (browser)');
  m.set('version', '1.5.2');
  m.set('memory_total', String(mem?.totalJSHeapSize ?? 0));
  m.set('memory_max', String(mem?.jsHeapSizeLimit ?? 0));
  m.set('memory_free', String(mem ? mem.totalJSHeapSize - mem.usedJSHeapSize : 0));
  m.set('cpu_cores', String(nav.hardwareConcurrency ?? 1));
  m.set('run_time', String(Math.trunc((Date.now() - startTime) / 60000) * 1000));
  m.set('fps', mc.debug.split(' ')[0] || '0');
  m.set('texpack_name', mc.resources.selectedPack ?? 'Default');
  m.set('vsync_enabled', String(mc.gameSettings.enableVsync));
  m.set('display_frequency', '60');
  m.set('display_type', document.fullscreenElement ? 'fullscreen' : 'windowed');
  const gl = GL.gl;
  if (gl) {
    m.set('opengl_version', String(gl.getParameter(gl.VERSION)));
    m.set('opengl_vendor', String(gl.getParameter(gl.VENDOR)));
    m.set('gl_caps[gl_max_texture_size]', String(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    m.set('gl_caps[gl_max_vertex_uniforms]', String(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)));
    m.set('gl_caps[gl_max_fragment_uniforms]', String(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)));
  }
  m.set('client_brand', 'vanilla');
  m.set('applet', 'false');
  return m;
}

/** Machine Specs Collection (GuiSnooper): the description, the collected values and the toggle. */
export class GuiSnooper extends GuiScreen {
  readonly keys: string[] = [];
  readonly values: string[] = [];
  private snooperTitle = '';
  private descLines: string[] = [];
  private snooperList!: GuiSnooperList;
  private buttonAllowSnooping!: GuiButton;

  constructor(
    private readonly snooperGuiScreen: GuiScreen,
    private readonly snooperGameSettings: GameSettings,
  ) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    this.snooperTitle = I18n.translateToLocal('options.snooper.title');
    this.descLines = this.fontRenderer.listFormattedStringToWidth(I18n.translateToLocal('options.snooper.desc'), this.width - 30);
    this.keys.length = 0;
    this.values.length = 0;
    const cx = Math.trunc(this.width / 2);
    this.buttonAllowSnooping = new GuiButton(1, cx - 152, this.height - 30, 150, 20, this.snooperGameSettings.getKeyBinding(EnumOptions.SNOOPER_ENABLED));
    this.buttonList.push(this.buttonAllowSnooping);
    this.buttonList.push(new GuiButton(2, cx + 2, this.height - 30, 150, 20, I18n.translateToLocal('gui.done')));
    const stats = [...getSnooperStats(this.mc).entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [k, v] of stats) {
      this.keys.push(k);
      this.values.push(this.fontRenderer.trimStringToWidth(v, this.width - 220));
    }
    this.snooperList = new GuiSnooperList(this);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 2) {
      this.snooperGameSettings.saveOptions();
      this.mc.displayGuiScreen(this.snooperGuiScreen);
    }
    if (b.id === 1) {
      this.snooperGameSettings.setOptionValue(EnumOptions.SNOOPER_ENABLED, 1);
      this.buttonAllowSnooping.displayString = this.snooperGameSettings.getKeyBinding(EnumOptions.SNOOPER_ENABLED);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.snooperList.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, this.snooperTitle, Math.trunc(this.width / 2), 8, 0xffffff);
    let y = 22;
    for (const line of this.descLines) {
      this.drawCenteredString(this.fontRenderer, line, Math.trunc(this.width / 2), y, 0x808080);
      y += this.fontRenderer.FONT_HEIGHT;
    }
    super.drawScreen(mx, my, pt);
  }
}

/** The key/value rows of the snooper screen (GuiSnooperList). */
class GuiSnooperList extends GuiSlot {
  constructor(private readonly gui: GuiSnooper) {
    super(gui.mc, gui.width, gui.height, 80, gui.height - 40, gui.font.FONT_HEIGHT + 1);
  }

  protected getSize(): number {
    return this.gui.keys.length;
  }

  protected elementClicked(): void {}

  protected isSelected(): boolean {
    return false;
  }

  protected drawBackground(): void {}

  protected drawSlot(i: number, _x: number, y: number, _h: number, _t: Tessellator): void {
    this.gui.font.drawString(this.gui.keys[i], 10, y, 0xffffff);
    this.gui.font.drawString(this.gui.values[i], 230, y, 0xffffff);
  }

  protected override getScrollBarX(): number {
    return this.gui.width - 10;
  }
}
