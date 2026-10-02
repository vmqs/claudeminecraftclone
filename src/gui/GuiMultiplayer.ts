import { Keyboard, Keys } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import type { Tessellator } from '../render/gl/Tessellator';
import { GuiButton } from './GuiButton';
import { GuiConnecting } from './GuiConnecting';
import { GuiScreen } from './GuiScreen';
import { GuiScreenAddServer } from './GuiScreenAddServer';
import { GuiScreenServerList } from './GuiScreenServerList';
import { GuiSlot } from './GuiSlot';
import { GuiYesNo } from './GuiYesNo';

/** One saved server (ServerData). */
export class ServerData {
  serverMOTD = '';
  populationInfo = '';
  pingToServer = 0;
  /** Protocol version reported by the ping; 61 is 1.5.2. */
  protocolVersion = 61;
  gameVersion = '1.5.2';
  /** The ping was started (field_78841_f). */
  polled = false;
  private hideAddress = false;

  constructor(
    public serverName: string,
    public serverIP: string,
  ) {}

  isHidingAddress(): boolean {
    return this.hideAddress;
  }

  setHideAddress(v: boolean): void {
    this.hideAddress = v;
  }
}

const SERVERS_KEY = 'mc152.servers';

/** servers.dat, kept in localStorage (ServerList). */
export class ServerList {
  private readonly servers: ServerData[] = [];

  loadServerList(): void {
    this.servers.length = 0;
    try {
      const list = JSON.parse(localStorage.getItem(SERVERS_KEY) ?? '[]') as { name: string; ip: string; hideAddress?: boolean }[];
      for (const s of list) {
        const d = new ServerData(s.name, s.ip);
        d.setHideAddress(!!s.hideAddress);
        this.servers.push(d);
      }
    } catch {
      /* storage unavailable or corrupt */
    }
  }

  saveServerList(): void {
    try {
      localStorage.setItem(SERVERS_KEY, JSON.stringify(this.servers.map((s) => ({ name: s.serverName, ip: s.serverIP, hideAddress: s.isHidingAddress() }))));
    } catch {
      /* storage unavailable */
    }
  }

  getServerData(i: number): ServerData {
    return this.servers[i];
  }

  removeServerData(i: number): void {
    this.servers.splice(i, 1);
  }

  addServerData(d: ServerData): void {
    this.servers.push(d);
  }

  countServers(): number {
    return this.servers.length;
  }

  swapServers(a: number, b: number): void {
    const t = this.servers[a];
    this.servers[a] = this.servers[b];
    this.servers[b] = t;
    this.saveServerList();
  }
}

/** Pings running at once (GuiMultiplayer.threadsPending). */
let threadsPending = 0;

/**
 * ThreadPollServers. A browser cannot open the game's TCP connection, so every ping ends like
 * an unreachable server does in the original.
 */
function pollServer(d: ServerData): void {
  d.serverMOTD = '§8Polling..';
  threadsPending++;
  setTimeout(
    () => {
      d.pingToServer = -1;
      d.serverMOTD = "§4Can't reach server";
      threadsPending--;
    },
    400 + Math.random() * 400,
  );
}

/** "Play Multiplayer" (GuiMultiplayer): the saved servers, the LAN scan row and the buttons. */
export class GuiMultiplayer extends GuiScreen {
  private serverSlotContainer!: GuiSlotServer;
  internetServerList!: ServerList;
  selectedServer = -1;
  buttonEdit!: GuiButton;
  buttonSelect!: GuiButton;
  buttonDelete!: GuiButton;
  private deleteClicked = false;
  private addClicked = false;
  private editClicked = false;
  private directClicked = false;
  lagTooltip: string | null = null;
  private theServerData: ServerData | null = null;
  ticksOpened = 0;
  private initialized = false;

  constructor(private readonly parentScreen: GuiScreen) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    if (!this.initialized) {
      this.initialized = true;
      this.internetServerList = new ServerList();
      this.internetServerList.loadServerList();
      this.serverSlotContainer = new GuiSlotServer(this);
    } else {
      this.serverSlotContainer.setDimensions(this.width, this.height, 32, this.height - 64);
    }
    this.initGuiControls();
  }

  initGuiControls(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push((this.buttonEdit = new GuiButton(7, cx - 154, this.height - 28, 70, 20, t('selectServer.edit'))));
    this.buttonList.push((this.buttonDelete = new GuiButton(2, cx - 74, this.height - 28, 70, 20, t('selectServer.delete'))));
    this.buttonList.push((this.buttonSelect = new GuiButton(1, cx - 154, this.height - 52, 100, 20, t('selectServer.select'))));
    this.buttonList.push(new GuiButton(4, cx - 50, this.height - 52, 100, 20, t('selectServer.direct')));
    this.buttonList.push(new GuiButton(3, cx + 4 + 50, this.height - 52, 100, 20, t('selectServer.add')));
    this.buttonList.push(new GuiButton(8, cx + 4, this.height - 28, 70, 20, t('selectServer.refresh')));
    this.buttonList.push(new GuiButton(0, cx + 4 + 76, this.height - 28, 75, 20, t('gui.cancel')));
    const ok = this.selectedServer >= 0 && this.selectedServer < this.serverSlotContainer.size();
    this.buttonSelect.enabled = ok;
    this.buttonEdit.enabled = ok;
    this.buttonDelete.enabled = ok;
  }

  override updateScreen(): void {
    this.ticksOpened++;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    const t = (k: string) => I18n.translateToLocal(k);
    if (b.id === 2) {
      const name = this.internetServerList.getServerData(this.selectedServer).serverName;
      this.deleteClicked = true;
      this.mc.displayGuiScreen(new GuiYesNo(this, t('selectServer.deleteQuestion'), "'" + name + "' " + t('selectServer.deleteWarning'), t('selectServer.deleteButton'), t('gui.cancel'), this.selectedServer));
    } else if (b.id === 1) {
      this.joinServer(this.selectedServer);
    } else if (b.id === 4) {
      this.directClicked = true;
      this.mc.displayGuiScreen(new GuiScreenServerList(this, (this.theServerData = new ServerData(t('selectServer.defaultName'), ''))));
    } else if (b.id === 3) {
      this.addClicked = true;
      this.mc.displayGuiScreen(new GuiScreenAddServer(this, (this.theServerData = new ServerData(t('selectServer.defaultName'), ''))));
    } else if (b.id === 7) {
      this.editClicked = true;
      const d = this.internetServerList.getServerData(this.selectedServer);
      this.theServerData = new ServerData(d.serverName, d.serverIP);
      this.theServerData.setHideAddress(d.isHidingAddress());
      this.mc.displayGuiScreen(new GuiScreenAddServer(this, this.theServerData));
    } else if (b.id === 0) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else if (b.id === 8) {
      this.mc.displayGuiScreen(new GuiMultiplayer(this.parentScreen));
    } else {
      this.serverSlotContainer.actionPerformed(b);
    }
  }

  override confirmClicked(ok: boolean, id: number): void {
    if (this.deleteClicked) {
      this.deleteClicked = false;
      if (ok) {
        this.internetServerList.removeServerData(id);
        this.internetServerList.saveServerList();
        this.selectedServer = -1;
      }
      this.mc.displayGuiScreen(this);
    } else if (this.directClicked) {
      this.directClicked = false;
      if (ok) this.connectToServer(this.theServerData!);
      else this.mc.displayGuiScreen(this);
    } else if (this.addClicked) {
      this.addClicked = false;
      if (ok) {
        this.internetServerList.addServerData(this.theServerData!);
        this.internetServerList.saveServerList();
        this.selectedServer = -1;
      }
      this.mc.displayGuiScreen(this);
    } else if (this.editClicked) {
      this.editClicked = false;
      if (ok) {
        const d = this.internetServerList.getServerData(this.selectedServer);
        d.serverName = this.theServerData!.serverName;
        d.serverIP = this.theServerData!.serverIP;
        d.setHideAddress(this.theServerData!.isHidingAddress());
        this.internetServerList.saveServerList();
      }
      this.mc.displayGuiScreen(this);
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    const sel = this.selectedServer;
    const list = this.internetServerList;
    if (key === Keys.F1) {
      this.mc.gameSettings.hideServerAddress = !this.mc.gameSettings.hideServerAddress;
      this.mc.gameSettings.saveOptions();
    } else if (GuiScreen.isShiftKeyDown() && key === Keys.UP) {
      if (sel > 0 && sel < list.countServers()) {
        list.swapServers(sel, sel - 1);
        this.selectedServer--;
        if (sel < list.countServers() - 1) this.serverSlotContainer.scrollBy(-this.serverSlotContainer.rowHeight);
      }
    } else if (GuiScreen.isShiftKeyDown() && key === Keys.DOWN) {
      if (sel < list.countServers() - 1) {
        list.swapServers(sel, sel + 1);
        this.selectedServer++;
        if (sel > 0) this.serverSlotContainer.scrollBy(this.serverSlotContainer.rowHeight);
      }
    } else if (ch === '\r') {
      this.actionPerformed(this.buttonList[2]);
    } else {
      super.keyTyped(ch, key);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.lagTooltip = null;
    this.drawDefaultBackground();
    this.serverSlotContainer.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('multiplayer.title'), Math.trunc(this.width / 2), 20, 0xffffff);
    super.drawScreen(mx, my, pt);
    if (this.lagTooltip !== null) this.drawTooltip(this.lagTooltip, mx, my);
  }

  joinServer(i: number): void {
    if (i < this.internetServerList.countServers()) this.connectToServer(this.internetServerList.getServerData(i));
  }

  private connectToServer(d: ServerData): void {
    this.mc.gameSettings.lastServer = d.serverIP;
    this.mc.displayGuiScreen(new GuiConnecting(this, this.mc, d));
  }

  /** func_74007_a: the ping tooltip. */
  private drawTooltip(s: string, mx: number, my: number): void {
    const x = mx + 12;
    const y = my - 12;
    const w = this.fontRenderer.getStringWidth(s);
    this.drawGradientRect(x - 3, y - 3, x + w + 3, y + 8 + 3, -1073741824, -1073741824);
    this.fontRenderer.drawStringWithShadow(s, x, y, -1);
  }

  drawIcon(x: number, y: number, u: number, v: number, w: number, h: number): void {
    this.drawTexturedModalRect(x, y, u, v, w, h);
  }

  drawText(s: string, x: number, y: number, color: number): void {
    this.drawString(this.fontRenderer, s, x, y, color);
  }

  drawTextCentered(s: string, x: number, y: number, color: number): void {
    this.drawCenteredString(this.fontRenderer, s, x, y, color);
  }
}

/** The server rows plus the "Scanning for games on your local network" row (GuiSlotServer). */
class GuiSlotServer extends GuiSlot {
  constructor(private readonly gui: GuiMultiplayer) {
    super(gui.mc, gui.width, gui.height, 32, gui.height - 64, 36);
  }

  get rowHeight(): number {
    return this.slotHeight;
  }

  size(): number {
    return this.getSize();
  }

  protected getSize(): number {
    return this.gui.internetServerList.countServers() + 1;
  }

  protected elementClicked(i: number, doubleClick: boolean): void {
    const list = this.gui.internetServerList;
    if (i >= list.countServers()) return;
    const prev = this.gui.selectedServer;
    this.gui.selectedServer = i;
    const d = list.getServerData(i);
    const canJoin = i >= 0 && i < this.getSize() && d.protocolVersion === 61;
    const inList = i < list.countServers();
    this.gui.buttonSelect.enabled = canJoin;
    this.gui.buttonEdit.enabled = inList;
    this.gui.buttonDelete.enabled = inList;
    if (doubleClick && canJoin) this.gui.joinServer(i);
    else if (inList && GuiScreen.isShiftKeyDown() && prev >= 0 && prev < list.countServers()) list.swapServers(prev, i);
  }

  protected isSelected(i: number): boolean {
    return i === this.gui.selectedServer;
  }

  protected override getContentHeight(): number {
    return this.getSize() * 36;
  }

  protected drawBackground(): void {
    this.gui.drawDefaultBackground();
  }

  protected drawSlot(i: number, x: number, y: number, _h: number, _t: Tessellator): void {
    if (i < this.gui.internetServerList.countServers()) this.drawServer(i, x, y);
    else this.drawScanning(y);
  }

  private drawScanning(y: number): void {
    const cx = Math.trunc(this.gui.width / 2);
    this.gui.drawTextCentered(I18n.translateToLocal('lanServer.scanning'), cx, y + 1, 0xffffff);
    const phase = Math.trunc(this.gui.ticksOpened / 3) % 4;
    const dots = phase === 1 || phase === 3 ? 'o O o' : phase === 2 ? 'o o O' : 'O o o';
    this.gui.drawTextCentered(dots, cx, y + 12, 0x808080);
  }

  private drawServer(i: number, x: number, y: number): void {
    const d = this.gui.internetServerList.getServerData(i);
    if (threadsPending < 5 && !d.polled) {
      d.polled = true;
      d.pingToServer = -2;
      d.serverMOTD = '';
      d.populationInfo = '';
      pollServer(d);
    }
    const newer = d.protocolVersion > 61;
    const older = d.protocolVersion < 61;
    const mismatch = newer || older;
    const font = this.gui.font;
    this.gui.drawText(d.serverName, x + 2, y + 1, 0xffffff);
    this.gui.drawText(d.serverMOTD, x + 2, y + 12, 0x808080);
    this.gui.drawText(d.populationInfo, x + 215 - font.getStringWidth(d.populationInfo), y + 12, 0x808080);
    if (mismatch) {
      const v = '§4' + d.gameVersion;
      this.gui.drawText(v, x + 200 - font.getStringWidth(v), y + 1, 0x808080);
    }
    if (!this.gui.mc.gameSettings.hideServerAddress && !d.isHidingAddress()) this.gui.drawText(d.serverIP, x + 2, y + 12 + 11, 0x303030);
    else this.gui.drawText(I18n.translateToLocal('selectServer.hiddenAddress'), x + 2, y + 12 + 11, 0x303030);
    GL.color(1, 1, 1, 1);
    this.gui.mc.renderEngine.bindTexture('/gui/icons.png');
    let column = 0;
    let bars: number;
    let tip: string;
    if (mismatch) {
      tip = newer ? 'Client out of date!' : 'Server out of date!';
      bars = 5;
    } else if (d.polled && d.pingToServer !== -2) {
      const p = d.pingToServer;
      bars = p < 0 ? 5 : p < 150 ? 0 : p < 300 ? 1 : p < 600 ? 2 : p < 1000 ? 3 : 4;
      tip = p < 0 ? '(no connection)' : p + 'ms';
    } else {
      column = 1;
      bars = Math.trunc(performance.now() / 100 + i * 2) & 7;
      if (bars > 4) bars = 8 - bars;
      tip = 'Polling..';
    }
    this.gui.drawIcon(x + 205, y, column * 10, 176 + bars * 8, 10, 8);
    const m = 4;
    if (this.mouseX >= x + 205 - m && this.mouseY >= y - m && this.mouseX <= x + 205 + 10 + m && this.mouseY <= y + 8 + m) this.gui.lagTooltip = tip;
  }
}
