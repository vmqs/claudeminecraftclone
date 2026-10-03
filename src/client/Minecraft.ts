import type { ResourceManager } from '../assets/ResourceManager';
import { SoundManager } from '../audio/SoundManager';
import { Block } from '../block/Block';
import '../entity/Entities';
import { installEntityClientHooks } from '../entity/ClientEntityHooks';
import '../render/entity/EntityRenderers';
import '../render/particle/ParticleRegistry';
import '../render/tileentity/TileEntityRenderers';
import '../render/sky/SkyRegistry';
import '../world/BlockDynamicsInstall';
import { I18n } from '../core/I18n';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType, type MovingObjectPosition } from '../core/MovingObjectPosition';
import { type CommandServer, getPossibleCompletions, type LanCommandHost, setServer } from '../command/CommandServer';
import { ServerCommandManager } from '../command/ServerCommandManager';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { FontRenderer } from '../gui/FontRenderer';
import { GuiDownloadTerrain } from '../gui/GuiDownloadTerrain';
import { GuiGameOver } from '../gui/GuiGameOver';
import { GuiGameStopped } from '../gui/GuiGameStopped';
import { GuiIngame } from '../gui/GuiIngame';
import { GuiIngameMenu } from '../gui/GuiIngameMenu';
import { initLanguage } from '../gui/GuiLanguage';
import { GuiMainMenu } from '../gui/GuiMainMenu';
import { GuiChat } from '../gui/GuiChat';
import { GuiScreen } from '../gui/GuiScreen';
import { GuiInventory } from '../gui/inventory/GuiInventory';
import { CONTAINER_TEXTURES } from '../gui/inventory/ContainerTextures';
import { SlotArmor } from '../gui/inventory/SlotArmor';
import { LoadingScreenRenderer } from '../gui/LoadingScreenRenderer';
import { ScaledResolution } from '../gui/ScaledResolution';
import { Item } from '../item/Item';
import { EntityRenderer } from '../render/EntityRenderer';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { EffectRenderer } from '../render/particle/EffectRenderer';
import { RenderManager } from '../render/entity/RenderManager';
import { RenderBlocks } from '../render/RenderBlocks';
import { RenderGlobal, WorldRenderer } from '../render/RenderGlobal';
import { BlockDamageOverlay } from '../render/BlockDamageOverlay';
import { TextureManager } from '../render/texture/TextureManager';
import { ChunkProviderClient } from '../world/ChunkProviderClient';
import { ColorizerFoliage, ColorizerGrass, rgbaToIntBuffer } from '../world/biome/Colorizer';
import { World, WorldInfo } from '../world/World';
import { type PlayerSnapshot, SaveFormatMemory } from '../world/storage/SaveFormatMemory';
import { EntityPlayerSP } from './EntityPlayerSP';
import { pickBlock } from './PickBlock';
import { EnumOptions, GameSettings, type SettingsListener } from './GameSettings';
import { installInput } from './Input';
import { Keyboard, Keys, Mouse } from './Keyboard';
import { KeyBinding } from './KeyBinding';
import { MouseHelper } from './MouseHelper';
import { MovementInputFromOptions } from './MovementInput';
import { PlayerControllerMP } from './PlayerControllerMP';
import { PlayerSpawning } from '../entity/PlayerSpawning';
import { Timer } from './Timer';
import { Profiler } from './Profiler';
import { DebugHooks } from '../command/CommandDebug';
import { GuiProfilerChart } from '../gui/GuiProfilerChart';
import { GuiSleepMP } from '../gui/GuiSleepMP';
import { loadChunksAroundBed } from './BedRespawn';
import { EnumGameType } from '../world/EnumGameType';
import { GuiDisconnected } from '../gui/GuiDisconnected';
import { GuiMultiplayer } from '../gui/GuiMultiplayer';
import { LanServer, type LanHostClient } from '../net/server/LanServer';
import { NetClientHandler, type GuestClient } from '../net/client/NetClientHandler';
import { EntityClientPlayerMP } from '../net/client/EntityClientPlayerMP';
import { PlayerControllerGuest } from '../net/client/PlayerControllerGuest';
import type { WorldClient } from '../net/client/WorldClient';
import { CONNECT_TIMEOUT_MS, makeGuestTransport, makeHostTransport } from '../net/NetSession';
import { formatRoomCode, generateRoomCode, normalizeRoomCode } from '../net/RoomCode';
import { loadRejoinToken, saveRejoinToken } from '../net/RejoinTokens';
import { ConnectError, type GuestTransport } from '../net/transport/Transport';
import { loadUsername } from '../net/Username';
import { EntityCrit2FX } from '../render/particle/EntityCrit2FX';
import type { Entity } from '../entity/Entity';
import { installStats, noteWorldLaunch } from '../stats/StatsInstall';
import { ClientStats } from '../stats/ClientStats';
import { StatIds } from '../stats/StatIds';

/** World creation options (WorldSettings). */
export interface WorldSettings {
  seed?: bigint;
  terrainType: string;
  mapFeatures: boolean;
  /** Superflat preset text (FlatGeneratorInfo format), for terrainType 'flat'. */
  generatorOptions?: string;
  /** "Allow Cheats" (default on: worlds are creative). */
  allowCommands?: boolean;
  /** "Bonus Chest". */
  bonusChest?: boolean;
  /** EnumGameType id (0 survival, 1 creative, 2 adventure); creative when absent. */
  gameType?: number;
  hardcore?: boolean;
}

interface PendingWorld {
  world: World;
  provider: ChunkProviderClient;
  phase: 'spawn' | 'terrain';
  /** A world from the session's list: its player goes back where it was. */
  restore?: PlayerSnapshot | null;
}

/**
 * The game client (Minecraft): owns every subsystem and runs the loop
 * (requestAnimationFrame -> Timer -> runTick x n -> render). There is no integrated server;
 * the client World is the simulation.
 */
export class Minecraft implements SettingsListener {
  static instance: Minecraft;
  readonly timer = new Timer(20);
  readonly gameSettings: GameSettings;
  readonly renderEngine: TextureManager;
  readonly fontRenderer: FontRenderer;
  readonly mouseHelper: MouseHelper;
  readonly sndManager: SoundManager;
  readonly loadingScreen: LoadingScreenRenderer;
  renderGlobal!: RenderGlobal;
  entityRenderer!: EntityRenderer;
  effectRenderer!: EffectRenderer;
  ingameGUI!: GuiIngame;
  /** The controller for the current game: single player's, or a guest's networked one. */
  playerController: PlayerControllerMP;
  private readonly singlePlayerController: PlayerControllerMP;
  theWorld: World | null = null;
  thePlayer: EntityPlayerSP | null = null;
  renderViewEntity: EntityLiving | null = null;
  objectMouseOver: MovingObjectPosition | null = null;
  currentScreen: GuiScreen | null = null;
  chunkProvider: ChunkProviderClient | null = null;
  /** The integrated server's commands; recreated for every world. */
  commandManager: ServerCommandManager | null = null;
  /** What commands see as MinecraftServer: this client's world and player. */
  private readonly commandServer: CommandServer = {
    getWorlds: () => (this.theWorld ? [this.theWorld] : []),
    getPlayers: () => [...(this.thePlayer ? [this.thePlayer] : []), ...(this.lanServer?.guestPlayers() ?? [])],
    sendChatMsg: (msg) => (this.lanServer ? this.lanServer.sendChatMsg(msg) : this.ingameGUI.getChatGUI().printChatMessage(msg)),
    isSinglePlayer: () => true,
    getCommandManager: () => this.commandManager!,
    lan: () => (this.netHandler ? null : this.lanCommandHost),
  };
  /** /publish and the LAN host's moderation commands. */
  private readonly lanCommandHost: LanCommandHost = this.makeLanCommandHost();

  private makeLanCommandHost(): LanCommandHost {
    const mc = this;
    const lan = () => {
      if (!mc.lanServer) throw new Error('The world is not open to LAN');
      return mc.lanServer;
    };
    return {
      get isOpen() {
        return mc.lanServer?.isOpen === true;
      },
      publish: async () => {
        const code = formatRoomCode(await mc.shareToLan(EnumGameType.SURVIVAL, false));
        GuiScreen.setClipboardString(code);
        mc.ingameGUI.getChatGUI().printChatMessage(`Room code: §e${code}§r - share it with friends (copied to the clipboard)`);
        return code;
      },
      guestNames: () => mc.lanServer?.guestNames() ?? [],
      kickPlayer: (name, reason) => lan().kickPlayer(name, reason),
      banPlayer: (name, reason) => lan().banPlayer(name, reason),
      pardonPlayer: (name) => lan().pardonPlayer(name),
      bannedPlayers: () => mc.lanServer?.bannedPlayers() ?? [],
      get whitelistOn() {
        return mc.lanServer?.whitelistOn === true;
      },
      set whitelistOn(on: boolean) {
        lan().whitelistOn = on;
      },
      get whitelist() {
        return lan().whitelist;
      },
    };
  }
  /** The LAN game this client hosts (IntegratedServer.shareToLAN), if open. */
  lanServer: LanServer | null = null;
  /** The connection to a host while playing as a guest (NetClientHandler). */
  netHandler: NetClientHandler | null = null;
  private guestTransport: GuestTransport | null = null;
  /** The room code this guest joined (for its rejoin token). */
  private guestRoomCode: string | null = null;
  displayWidth = 854;
  displayHeight = 480;
  inGameHasFocus = false;
  skipRenderWorld = false;
  isGamePaused = false;
  running = true;
  /** "N fps, M chunk updates" for the F3 screen. */
  debug = '';
  static debugFPS = 0;
  /** The player's name (launcher username): kept in localStorage, editable on the multiplayer screens. */
  username = loadUsername();
  /** Called once per frame after rendering (dev hooks, screenshot harness). */
  readonly frameListeners: (() => void)[] = [];
  /** Frame profiler: sections for the Shift+F3 pie chart. */
  readonly mcProfiler = new Profiler();
  private readonly profilerChart = new GuiProfilerChart(this.mcProfiler);
  private pendingWorld: PendingWorld | null = null;
  private leftClickCounter = 0;
  private rightClickDelayTimer = 0;
  private fpsCounter = 0;
  private debugUpdateTime = performance.now();
  private isTakingScreenshot = false;
  private joinPlayerCounter = 0;
  private started = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly resources: ResourceManager,
  ) {
    Minecraft.instance = this;
    this.gameSettings = new GameSettings();
    this.gameSettings.listener = this;
    this.renderEngine = new TextureManager(resources);
    this.fontRenderer = new FontRenderer('/font/default.png', this.renderEngine, false);
    this.mouseHelper = new MouseHelper(canvas);
    this.mouseHelper.onGrabFailed = () => this.onPointerLockFailed();
    this.sndManager = new SoundManager(this.gameSettings, resources);
    installEntityClientHooks(this);
    this.loadingScreen = new LoadingScreenRenderer(this);
    this.playerController = this.singlePlayerController = new PlayerControllerMP(this);
    this.updateDisplaySize();
    installStats(this);
  }

  get mouseX(): number {
    return Mouse.x;
  }

  get mouseY(): number {
    return Mouse.y;
  }

  /** Display.isActive: the page has focus (always true under automation). */
  isDisplayActive(): boolean {
    return navigator.webdriver || document.hasFocus();
  }

  // ------------------------------------------------------------------ start-up

  /** startGame: loads fonts, colormaps, language, sounds and stitches the atlases. */
  async startGame(): Promise<void> {
    installInput({
      canvas: this.canvas,
      wantsPointerLock: () => this.theWorld !== null && this.currentScreen === null && !this.loadingScreen.active,
      requestPointerLock: () => this.mouseHelper.requestLock(),
      onPointerLockGained: () => {
        if (this.theWorld && this.currentScreen === null && !this.inGameHasFocus) this.setIngameFocus();
      },
      onPointerLockLost: () => this.onPointerLockLost(),
    });
    Tessellator.drawHandler = (mode, data, count, flags) => GL.drawDynamic(mode, data, count, flags);
    RenderBlocks.itemGL = { color: (r, g, b, a) => GL.color(r, g, b, a), rotate: (a, x, y, z) => GL.rotate(a, x, y, z), translate: (x, y, z) => GL.translate(x, y, z), enableRescaleNormal: () => GL.enable(GL.RESCALE_NORMAL) };
    this.setupGLState();
    await this.renderEngine.preload(['/title/mojang.png']);
    this.loadScreen();

    const rm = this.resources;
    const lang = await rm.getText('lang/en_US.lang', 'vanilla');
    if (lang) I18n.load(lang);
    const splashes = await rm.getText('title/splashes.txt');
    if (splashes) GuiMainMenu.splashes = splashes.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    await this.fontRenderer.readFontData(rm);
    await initLanguage(this);
    await this.loadColormaps();
    this.sndManager.init();

    this.renderEngine.textureMapBlocks.registrars.push((reg) => {
      for (const b of Block.blocksList) if (b) b.registerIcons(reg);
      BlockDamageOverlay.registerIcons(reg);
      RenderManager.instance.updateIcons(reg);
    });
    this.renderEngine.textureMapItems.registrars.push((reg) => {
      for (const it of Item.itemsList) if (it && it.getSpriteNumber() === 1) it.registerIcons(reg);
      SlotArmor.registerIcons(reg);
      RenderManager.instance.updateItemIcons(reg);
    });
    await this.renderEngine.refreshTextureMaps();
    RenderBlocks.missingIcon = this.renderEngine.textureMapBlocks.getMissingIcon();
    await this.renderEngine.preload([
      '/gui/gui.png',
      '/gui/icons.png',
      '/gui/background.png',
      '/title/mclogo.png',
      '/environment/sun.png',
      '/environment/moon_phases.png',
      '/environment/clouds.png',
      '/particles.png',
      '%blur%/misc/vignette.png',
      '/misc/pumpkinblur.png',
      '/misc/water.png',
      '/mob/char.png',
      ...[0, 1, 2, 3, 4, 5].map((i) => `/title/bg/panorama${i}.png`),
    ]);
    void this.renderEngine.preload([...CONTAINER_TEXTURES]);

    this.renderGlobal = new RenderGlobal(this);
    this.renderGlobal.initMeshers();
    this.renderEngine.reloadListeners.push(() => {
      RenderBlocks.missingIcon = this.renderEngine.textureMapBlocks.getMissingIcon();
      void this.loadColormaps().then(() => this.renderGlobal.onTexturesReloaded());
    });
    this.entityRenderer = new EntityRenderer(this);
    this.effectRenderer = new EffectRenderer(null, this.renderEngine);
    this.ingameGUI = new GuiIngame(this);
    this.started = true;
    this.displayGuiScreen(new GuiMainMenu());
  }

  /** Grass and foliage colormaps (ColorizerGrass/Foliage), which a texture pack may replace. */
  private async loadColormaps(): Promise<void> {
    const grass = await this.renderEngine.getTextureContents('/misc/grasscolor.png');
    if (grass) ColorizerGrass.setGrassBiomeColorizer(rgbaToIntBuffer(grass.data));
    const foliage = await this.renderEngine.getTextureContents('/misc/foliagecolor.png');
    if (foliage) ColorizerFoliage.setFoliageBiomeColorizer(rgbaToIntBuffer(foliage.data));
  }

  private setupGLState(): void {
    GL.enable(GL.TEXTURE_2D);
    GL.shadeModel(GL.SMOOTH);
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.enable(GL.ALPHA_TEST);
    GL.alphaFunc(GL.GREATER, 0.1);
    GL.cullFace(GL.BACK);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.matrixMode(GL.MODELVIEW);
  }

  /** The white Mojang splash shown while resources load. */
  private loadScreen(): void {
    const sr = this.getScaledResolution();
    GL.viewport(0, 0, this.displayWidth, this.displayHeight);
    GL.clearColor(0, 0, 0, 0);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, sr.getScaledWidth_double(), sr.getScaledHeight_double(), 0, 1000, 3000);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -2000);
    GL.disable(GL.LIGHTING);
    GL.enable(GL.TEXTURE_2D);
    GL.disable(GL.FOG);
    this.renderEngine.bindTexture('/title/mojang.png');
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.setColorOpaque_I(0xffffff);
    t.addVertexWithUV(0, this.displayHeight, 0, 0, 0);
    t.addVertexWithUV(this.displayWidth, this.displayHeight, 0, 0, 0);
    t.addVertexWithUV(this.displayWidth, 0, 0, 0, 0);
    t.addVertexWithUV(0, 0, 0, 0, 0);
    t.draw();
    GL.color(1, 1, 1, 1);
    const x = Math.trunc((sr.getScaledWidth() - 256) / 2);
    const y = Math.trunc((sr.getScaledHeight() - 256) / 2);
    const k = 1 / 256;
    t.startDrawingQuads();
    t.setColorOpaque_I(0xffffff);
    t.addVertexWithUV(x, y + 256, 0, 0, 256 * k);
    t.addVertexWithUV(x + 256, y + 256, 0, 256 * k, 256 * k);
    t.addVertexWithUV(x + 256, y, 0, 256 * k, 0);
    t.addVertexWithUV(x, y, 0, 0, 0);
    t.draw();
  }

  // ------------------------------------------------------------------ loop

  run(): void {
    document.addEventListener('visibilitychange', () => this.updateBackgroundTicking());
    const frame = () => {
      if (!this.running) return;
      try {
        this.runGameLoop();
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private runGameLoop(): void {
    if (!this.started) return;
    const prof = this.mcProfiler;
    prof.startSection('root');
    if (this.isGamePaused && this.theWorld) {
      const pt = this.timer.renderPartialTicks;
      this.timer.updateTimer();
      this.timer.renderPartialTicks = pt;
    } else {
      this.timer.updateTimer();
    }
    prof.startSection('tick');
    for (let i = 0; i < this.timer.elapsedTicks; i++) this.runTick();
    this.tickLoading();
    this.chunkProvider?.processIncoming(4);
    prof.endStartSection('preRenderErrors');
    RenderBlocks.fancyGrass = this.gameSettings.fancyGraphics;
    RenderBlocks.anaglyphEnable = this.gameSettings.anaglyph;
    RenderBlocks.aoLevel = this.gameSettings.ambientOcclusion;
    prof.endStartSection('sound');
    this.sndManager.setListener(this.thePlayer, this.timer.renderPartialTicks);
    if (!this.isGamePaused) this.sndManager.updateScheduledSounds();
    prof.endSection();
    prof.startSection('render');
    prof.startSection('display');
    GL.enable(GL.TEXTURE_2D);
    if (this.thePlayer && this.thePlayer.isEntityInsideOpaqueBlock()) this.gameSettings.thirdPersonView = 0;
    GL.beginFrame();
    prof.endSection();
    if (this.loadingScreen.active) this.loadingScreen.draw();
    else if (!this.skipRenderWorld) {
      prof.endStartSection('gameRenderer');
      this.entityRenderer.updateCameraAndRender(this.timer.renderPartialTicks);
      prof.endSection();
    }
    prof.endSection();
    if (this.gameSettings.showDebugInfo && this.gameSettings.showDebugProfilerChart && !this.loadingScreen.active) {
      if (!prof.profilingEnabled) prof.clearProfiling();
      prof.profilingEnabled = true;
      this.profilerChart.draw(this);
    } else {
      prof.profilingEnabled = false;
    }
    prof.startSection('root');
    this.screenshotListener();
    for (const l of this.frameListeners) l();
    this.updateDisplaySize();
    this.fpsCounter++;
    // A game open to LAN, or one joined over the network, never pauses (IntegratedServer.getPublic).
    this.isGamePaused = this.currentScreen !== null && this.currentScreen.doesGuiPauseGame() && !this.lanServer && !this.netHandler;
    const now = performance.now();
    while (now >= this.debugUpdateTime + 1000) {
      Minecraft.debugFPS = this.fpsCounter;
      this.debug = `${Minecraft.debugFPS} fps, ${WorldRenderer.chunksUpdated} chunk updates`;
      WorldRenderer.chunksUpdated = 0;
      this.debugUpdateTime += 1000;
      this.fpsCounter = 0;
    }
    prof.endSection();
  }

  private backgroundTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * A hidden tab gets no animation frames, but a LAN game must keep running for the others: game
   * ticks then come from a timer (browsers slow it down, so a hidden host runs at reduced speed).
   */
  private updateBackgroundTicking(): void {
    const need = typeof document !== 'undefined' && document.hidden && (this.lanServer !== null || this.netHandler !== null);
    if (need && !this.backgroundTimer) {
      this.backgroundTimer = setInterval(() => {
        if (!document.hidden) return;
        try {
          this.timer.updateTimer();
          for (let i = 0; i < this.timer.elapsedTicks; i++) this.runTick();
          this.chunkProvider?.processIncoming(8);
        } catch (e) {
          console.error(e);
        }
      }, 50);
    } else if (!need && this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  /** Follows the canvas' CSS size at device-pixel resolution (the resize check of the loop). */
  private updateDisplaySize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height && w === this.displayWidth && h === this.displayHeight) return;
    this.canvas.width = w;
    this.canvas.height = h;
    GL.pixelRatio = dpr;
    this.resize(w, h);
  }

  private resize(w: number, h: number): void {
    this.displayWidth = w <= 0 ? 1 : w;
    this.displayHeight = h <= 0 ? 1 : h;
    if (this.currentScreen) {
      const sr = this.getScaledResolution();
      this.currentScreen.setWorldAndResolution(this, sr.getScaledWidth(), sr.getScaledHeight());
    }
  }

  getScaledResolution(): ScaledResolution {
    return new ScaledResolution(this.gameSettings.guiScale, this.displayWidth, this.displayHeight);
  }

  // ------------------------------------------------------------------ tick

  runTick(): void {
    const prof = this.mcProfiler;
    if (this.rightClickDelayTimer > 0) this.rightClickDelayTimer--;
    // NetClientHandler.processReadPackets (1.5.2 ran it from the controller and GuiConnecting).
    this.netHandler?.processReadPackets();
    prof.startSection('stats');
    prof.endStartSection('gui');
    if (!this.isGamePaused && this.theWorld) this.ingameGUI.updateTick();
    prof.endStartSection('pick');
    this.entityRenderer.getMouseOver(1);
    prof.endStartSection('gameMode');
    if (!this.isGamePaused && this.theWorld) this.playerController.updateController();
    prof.endStartSection('textures');
    if (!this.isGamePaused) this.renderEngine.updateDynamicTextures();
    if (this.currentScreen === null && this.thePlayer) {
      if (this.thePlayer.getHealth() <= 0) this.displayGuiScreen(null);
      else if (this.thePlayer.isPlayerSleeping() && this.theWorld) this.displayGuiScreen(new GuiSleepMP());
    } else if (this.currentScreen instanceof GuiSleepMP && !this.thePlayer?.isPlayerSleeping()) {
      this.displayGuiScreen(null);
    }
    if (this.currentScreen) this.leftClickCounter = 10000;
    if (this.currentScreen) {
      this.currentScreen.handleInput();
      if (this.currentScreen) this.currentScreen.updateScreen();
    }
    if (this.loadingScreen.active) {
      // The original blocked in a loop while loading: input is dropped.
      while (Mouse.next());
      while (Keyboard.next());
    } else if (this.currentScreen === null || this.currentScreen.allowUserInput) {
      prof.endStartSection('mouse');
      this.handleMouseEvents();
      if (this.leftClickCounter > 0) this.leftClickCounter--;
      prof.endStartSection('keyboard');
      this.handleKeyboardEvents();
      if (this.thePlayer) this.handleKeyBindings();
    }
    const w = this.theWorld;
    if (w && this.thePlayer) {
      if (this.chunkProvider) {
        this.chunkProvider.loadRadius = this.renderGlobal.renderRadius + 1;
        this.chunkProvider.updateLoadedArea(this.thePlayer.posX, this.thePlayer.posZ);
      }
      if (++this.joinPlayerCounter === 30) this.joinPlayerCounter = 0;
      if (!this.isGamePaused) {
        prof.endStartSection('gameRenderer');
        this.entityRenderer.updateRenderer();
        prof.endStartSection('levelRenderer');
        this.renderGlobal.updateClouds();
        prof.endStartSection('level');
        if (w.lastLightningBolt > 0) w.lastLightningBolt--;
        const serverProf = DebugHooks.profiler;
        serverProf.startSection('root');
        serverProf.startSection('levels');
        serverProf.startSection('entities');
        w.updateEntities();
        serverProf.endStartSection('tick');
        w.tick();
        serverProf.endStartSection('connection');
        this.lanServer?.tick();
        serverProf.endSection();
        serverProf.endSection();
        serverProf.endSection();
        prof.endStartSection('animateTick');
        w.doVoidFogParticles(MathHelper.floor_double(this.thePlayer.posX), MathHelper.floor_double(this.thePlayer.posY), MathHelper.floor_double(this.thePlayer.posZ));
        prof.endStartSection('particles');
        this.effectRenderer.updateEffects();
      } else {
        // Paused with nobody else around never happens in a LAN game; keep the host serving anyway.
        this.lanServer?.tick();
      }
    }
    this.netHandler?.flush();
    prof.endSection();
  }

  private handleMouseEvents(): void {
    while (Mouse.next()) {
      const button = Mouse.getEventButton();
      if (button >= 0) {
        KeyBinding.setKeyBindState(button - 100, Mouse.getEventButtonState());
        if (Mouse.getEventButtonState()) KeyBinding.onTick(button - 100);
      }
      const wheel = Mouse.getEventDWheel();
      if (wheel !== 0 && this.thePlayer && this.currentScreen === null) this.thePlayer.inventory.changeCurrentItem(wheel);
      if (this.currentScreen === null) {
        if (!this.inGameHasFocus && Mouse.getEventButtonState() && this.theWorld) this.setIngameFocus();
      } else {
        this.currentScreen.handleMouseInput();
      }
    }
  }

  private handleKeyboardEvents(): void {
    const gs = this.gameSettings;
    while (Keyboard.next()) {
      const key = Keyboard.getEventKey();
      const down = Keyboard.getEventKeyState();
      KeyBinding.setKeyBindState(key, down);
      if (down) KeyBinding.onTick(key);
      if (!down) continue;
      if (key === Keys.F11) {
        this.toggleFullscreen();
        continue;
      }
      if (this.currentScreen) {
        this.currentScreen.handleKeyboardInput();
        continue;
      }
      const f3 = Keyboard.isKeyDown(Keys.F3);
      if (key === Keys.ESCAPE) this.displayInGameMenu();
      if (key === Keys.T && f3) {
        void this.renderEngine.refreshTextures();
        this.renderGlobal.loadRenderers();
      }
      if (key === Keys.F && f3) gs.setOptionValue(EnumOptions.RENDER_DISTANCE, shiftDown() ? -1 : 1);
      if (key === Keys.A && f3) this.renderGlobal.loadRenderers();
      if (key === Keys.H && f3) {
        gs.advancedItemTooltips = !gs.advancedItemTooltips;
        gs.saveOptions();
      }
      if (key === Keys.P && f3) {
        gs.pauseOnLostFocus = !gs.pauseOnLostFocus;
        gs.saveOptions();
      }
      if (key === Keys.F1) gs.hideGUI = !gs.hideGUI;
      if (key === Keys.F3) {
        gs.showDebugInfo = !gs.showDebugInfo;
        gs.showDebugProfilerChart = shiftDown();
      }
      if (key === Keys.F5) {
        gs.thirdPersonView++;
        if (gs.thirdPersonView > 2) gs.thirdPersonView = 0;
      }
      if (key === Keys.F8) gs.smoothCamera = !gs.smoothCamera;
      if (this.thePlayer) for (let i = 0; i < 9; i++) if (key === Keys['1'] + i) this.thePlayer.inventory.currentItem = i;
      if (gs.showDebugInfo && gs.showDebugProfilerChart) {
        if (key === Keys['0']) this.profilerChart.select(0);
        for (let i = 0; i < 9; i++) if (key === Keys['1'] + i) this.profilerChart.select(i + 1);
      }
    }
  }

  private handleKeyBindings(): void {
    const gs = this.gameSettings;
    const p = this.thePlayer!;
    while (gs.keyBindInventory.isPressed()) this.displayGuiScreen(new GuiInventory(p));
    while (gs.keyBindDrop.isPressed()) p.dropOneItem(GuiScreen.isCtrlKeyDown());
    const chatAllowed = gs.chatVisibility !== 2;
    while (gs.keyBindChat.isPressed() && chatAllowed) this.displayGuiScreen(new GuiChat());
    if (this.currentScreen === null && gs.keyBindCommand.isPressed() && chatAllowed) this.displayGuiScreen(new GuiChat('/'));
    if (p.isUsingItem()) {
      if (!gs.keyBindUseItem.pressed) this.playerController.onStoppedUsingItem(p);
      while (gs.keyBindAttack.isPressed());
      while (gs.keyBindUseItem.isPressed());
      while (gs.keyBindPickBlock.isPressed());
    } else {
      while (gs.keyBindAttack.isPressed()) this.clickMouse(0);
      while (gs.keyBindUseItem.isPressed()) this.clickMouse(1);
      while (gs.keyBindPickBlock.isPressed()) this.clickMiddleMouseButton();
    }
    if (gs.keyBindUseItem.pressed && this.rightClickDelayTimer === 0 && !p.isUsingItem()) this.clickMouse(1);
    this.sendClickBlockToController(0, this.currentScreen === null && gs.keyBindAttack.pressed && this.inGameHasFocus);
  }

  private sendClickBlockToController(button: number, held: boolean): void {
    if (!held) this.leftClickCounter = 0;
    if (button !== 0 || this.leftClickCounter <= 0) {
      const mop = this.objectMouseOver;
      if (held && mop && mop.typeOfHit === EnumMovingObjectType.TILE && button === 0) {
        this.playerController.onPlayerDamageBlock(mop.blockX, mop.blockY, mop.blockZ, mop.sideHit);
        if (this.thePlayer!.canCurrentToolHarvestBlock(mop.blockX, mop.blockY, mop.blockZ)) {
          this.effectRenderer.addBlockHitEffects(mop.blockX, mop.blockY, mop.blockZ, mop.sideHit);
          this.thePlayer!.swingItem();
        }
      } else {
        this.playerController.resetBlockRemoving();
      }
    }
  }

  private clickMouse(button: number): void {
    if (button === 0 && this.leftClickCounter > 0) return;
    const p = this.thePlayer!;
    const w = this.theWorld!;
    if (button === 0) p.swingItem();
    if (button === 1) this.rightClickDelayTimer = 4;
    let useItem = true;
    const held = p.inventory.getCurrentItem();
    const mop = this.objectMouseOver;
    if (mop === null) {
      if (button === 0 && this.playerController.isNotCreative()) this.leftClickCounter = 10;
    } else if (mop.typeOfHit === EnumMovingObjectType.ENTITY) {
      if (button === 0) this.playerController.attackEntity(p, mop.entityHit!);
      if (button === 1 && this.playerController.interactWithEntity(p, mop.entityHit!)) useItem = false;
    } else if (mop.typeOfHit === EnumMovingObjectType.TILE) {
      if (button === 0) {
        this.playerController.clickBlock(mop.blockX, mop.blockY, mop.blockZ, mop.sideHit);
      } else {
        const size = held ? held.stackSize : 0;
        if (this.playerController.onPlayerRightClick(p, w, held, mop.blockX, mop.blockY, mop.blockZ, mop.sideHit, mop.hitVec)) {
          useItem = false;
          p.swingItem();
        }
        if (!held) return;
        if (held.stackSize === 0) p.inventory.mainInventory[p.inventory.currentItem] = null;
        else if (held.stackSize !== size || this.playerController.isInCreativeMode()) this.entityRenderer.itemRenderer.resetEquippedProgress();
      }
    }
    if (useItem && button === 1) {
      const cur = p.inventory.getCurrentItem();
      if (cur && this.playerController.sendUseItem(p, w, cur)) this.entityRenderer.itemRenderer.resetEquippedProgress2();
    }
  }

  /** Pick block (middle click): selects the targeted block's item, or puts it in the hotbar in Creative. */
  private clickMiddleMouseButton(): void {
    pickBlock(this.thePlayer!, this.theWorld!, this.objectMouseOver, (stack, slot) => this.playerController.sendSlotPacket(stack, slot));
  }

  // ------------------------------------------------------------------ screens and focus

  displayGuiScreen(screen: GuiScreen | null): void {
    if (this.currentScreen) this.currentScreen.onGuiClosed();
    if (screen === null && this.theWorld === null) screen = new GuiMainMenu();
    else if (screen === null && this.thePlayer && this.thePlayer.getHealth() <= 0) screen = new GuiGameOver();
    if (screen instanceof GuiMainMenu) {
      this.gameSettings.showDebugInfo = false;
      this.ingameGUI?.getChatGUI().clearChatMessages();
    }
    this.currentScreen = screen;
    if (screen) {
      this.setIngameNotInFocus();
      const sr = this.getScaledResolution();
      screen.setWorldAndResolution(this, sr.getScaledWidth(), sr.getScaledHeight());
      this.skipRenderWorld = false;
    } else {
      this.setIngameFocus();
    }
  }

  setIngameFocus(): void {
    if (!this.isDisplayActive()) return;
    if (!this.inGameHasFocus) {
      this.inGameHasFocus = true;
      // The pause menu paused the looping entity sounds; any way back into the game resumes them.
      this.sndManager.resumeAllSounds();
      this.mouseHelper.grabMouseCursor();
      this.displayGuiScreen(null);
      this.leftClickCounter = 10000;
    }
  }

  setIngameNotInFocus(): void {
    if (this.inGameHasFocus) {
      KeyBinding.unPressAllKeys();
      this.inGameHasFocus = false;
      this.mouseHelper.ungrabMouseCursor();
    }
  }

  displayInGameMenu(): void {
    if (this.currentScreen === null && this.theWorld) {
      this.displayGuiScreen(new GuiIngameMenu());
      this.sndManager.pauseAllSounds();
    }
  }

  private onPointerLockLost(): void {
    if (!this.inGameHasFocus || navigator.webdriver) return;
    this.displayInGameMenu();
    if (this.inGameHasFocus) this.setIngameNotInFocus();
  }

  /** The browser refused the lock: stay unfocused until the next click (as an inactive window). */
  private onPointerLockFailed(): void {
    if (navigator.webdriver) return;
    if (this.inGameHasFocus) {
      KeyBinding.unPressAllKeys();
      this.inGameHasFocus = false;
      Mouse.grabbed = false;
    }
  }

  toggleFullscreen(): void {
    const gs = this.gameSettings;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      gs.fullScreen = false;
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
      gs.fullScreen = true;
    }
  }

  onFullscreenToggled(): void {
    this.toggleFullscreen();
  }

  loadRenderers(): void {
    this.renderGlobal?.loadRenderers();
  }

  onChatOptionsChanged(): void {
    this.ingameGUI?.getChatGUI().refreshChat();
  }

  onSoundOptionsChanged(): void {
    this.sndManager.onSoundOptionsChanged();
  }

  /** Options were saved (sendSettingsToServer): the integrated server takes the difficulty. */
  onSettingsSaved(): void {
    if (this.theWorld) PlayerSpawning.applyDifficulty(this.theWorld, this.gameSettings.difficulty);
  }

  /** Quit Game: closes the tab when the page was opened by a script, otherwise says it stopped. */
  shutdown(): void {
    this.loadWorld(null);
    this.sndManager.closeMinecraft();
    document.exitPointerLock?.();
    window.close();
    this.displayGuiScreen(new GuiGameStopped());
  }

  // ------------------------------------------------------------------ worlds

  /** Creates a world and starts streaming its terrain (the integrated server start-up). */
  launchIntegratedServer(folder: string, name: string, ws: WorldSettings | null): void {
    this.loadWorld(null);
    noteWorldLaunch(ws !== null);
    if (ws === null) {
      this.resumeIntegratedServer(folder);
      return;
    }
    const info = new WorldInfo();
    info.worldName = name || folder;
    info.seed = ws.seed ?? new JavaRandom().nextLong();
    info.terrainType = ws.terrainType;
    info.mapFeaturesEnabled = ws.mapFeatures;
    info.generatorOptions = ws.generatorOptions ?? '';
    info.allowCommands = ws.allowCommands ?? true;
    info.gameType = ws.gameType ?? 1;
    info.hardcore = ws.hardcore ?? false;
    info.bonusChest = ws.bonusChest ?? false;
    SaveFormatMemory.instance.create(folder, info);
    const world = new World(info);
    const provider = new ChunkProviderClient(world, info.seed, ws.terrainType, ws.mapFeatures, { generatorOptions: info.generatorOptions, bonusChest: info.bonusChest });
    this.chunkProvider = provider;
    this.pendingWorld = { world, provider, phase: 'spawn' };
    this.loadingScreen.resetProgressAndMessage(I18n.translateToLocal('menu.loadingLevel'));
    this.loadingScreen.resetProgresAndWorkingMessage(I18n.translateToLocal('menu.generatingTerrain'));
    void provider.findSpawn().then((s) => {
      if (this.pendingWorld?.provider !== provider) return;
      info.spawnX = s.x;
      info.spawnY = s.y;
      info.spawnZ = s.z;
      this.pendingWorld.phase = 'terrain';
    });
  }

  /** Play on a world of this session: the suspended world continues with a new generator worker. */
  private resumeIntegratedServer(folder: string): void {
    const saves = SaveFormatMemory.instance;
    const e = saves.resume(folder);
    if (!e || !e.world || !e.provider) return;
    const info = e.info;
    const provider = new ChunkProviderClient(e.world, info.seed, info.terrainType, info.mapFeaturesEnabled, { generatorOptions: info.generatorOptions, bonusChest: info.bonusChest });
    provider.adoptStore(e.provider);
    e.provider.dispose();
    this.chunkProvider = provider;
    this.pendingWorld = { world: e.world, provider, phase: 'terrain', restore: e.player };
    saves.markResumed(e);
    this.loadingScreen.resetProgressAndMessage(I18n.translateToLocal('menu.loadingLevel'));
    this.loadingScreen.resetProgresAndWorkingMessage(I18n.translateToLocal('menu.generatingTerrain'));
  }

  /** Spawn-area loading (MinecraftServer.initialWorldChunkLoad, on a smaller radius). */
  private tickLoading(): void {
    const pw = this.pendingWorld;
    if (!pw || pw.phase !== 'terrain') return;
    const info = pw.world.worldInfo;
    const r = 2;
    pw.provider.loadRadius = r + 1;
    pw.provider.updateLoadedArea(info.spawnX, info.spawnZ);
    pw.provider.processIncoming(12);
    let have = 0;
    const cx = info.spawnX >> 4;
    const cz = info.spawnZ >> 4;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (pw.world.chunkExists(cx + dx, cz + dz)) have++;
    // No progress bar: 1.5.2's integrated server never reports a percentage on this screen.
    if (have < (2 * r + 1) * (2 * r + 1)) return;
    this.pendingWorld = null;
    this.loadingScreen.onNoMoreProgress();
    this.loadWorld(pw.world);
    if (pw.restore && !pw.restore.dead) SaveFormatMemory.restorePlayer(this.thePlayer!, pw.restore);
    else this.spawnPlayerAtWorldSpawn();
    if (pw.restore?.state) PlayerSpawning.restoreState(this.thePlayer!, pw.restore.state, pw.restore.dead);
    this.playerController.setGameType(PlayerSpawning.initializeGameType(this.thePlayer!, pw.world.worldInfo));
    const provider = pw.provider;
    this.displayGuiScreen(
      new GuiDownloadTerrain(() => {
        const p = this.thePlayer;
        if (!p || !provider.areaLoaded(p.posX, p.posZ, 2)) return false;
        return this.renderGlobal.pendingNear(p, 1) === 0;
      }),
    );
  }

  /** EntityPlayerMP's spawn: a random spot within 10 blocks of the world spawn, on the ground. */
  private spawnPlayerAtWorldSpawn(): void {
    PlayerSpawning.placeAtWorldSpawn(this.thePlayer!, this.theWorld!);
  }

  loadWorld(world: World | null): void {
    ClientStats.sync();
    this.renderViewEntity = null;
    this.objectMouseOver = null;
    this.sndManager.playStreaming(null, 0, 0, 0);
    this.sndManager.stopAllSounds();
    if (world === null) {
      this.stopMultiplayer();
      this.pendingWorld = null;
      this.loadingScreen.onNoMoreProgress();
      // The world stays in the session's world list (the integrated server's save on shutdown).
      const kept = !!this.theWorld && !!this.chunkProvider && SaveFormatMemory.instance.saveAndSuspend(this.theWorld, this.chunkProvider, this.thePlayer);
      if (!kept) this.chunkProvider?.dispose();
      this.chunkProvider = null;
      this.renderGlobal?.setWorldAndLoadRenderers(null);
      this.effectRenderer?.clearEffects(null);
      this.theWorld = null;
      this.thePlayer = null;
      this.commandManager = null;
      setServer(null);
      return;
    }
    this.theWorld = world;
    this.renderGlobal.setWorldAndLoadRenderers(world);
    this.effectRenderer.clearEffects(world);
    if (!this.thePlayer) {
      this.thePlayer = new EntityPlayerSP(this, world, this.username);
      this.playerController.flipPlayer(this.thePlayer);
    }
    this.thePlayer.preparePlayerToSpawn();
    world.spawnEntityInWorld(this.thePlayer);
    this.thePlayer.movementInput = new MovementInputFromOptions(this.gameSettings);
    PlayerSpawning.applyDifficulty(world, this.gameSettings.difficulty);
    this.playerController.setGameType(PlayerSpawning.initializeGameType(this.thePlayer, world.worldInfo));
    this.playerController.setPlayerCapabilities(this.thePlayer);
    this.renderViewEntity = this.thePlayer;
    this.commandManager = new ServerCommandManager();
    setServer(this.commandServer);
  }

  /**
   * The Respawn button: the server's respawnPlayer plus setDimensionAndSpawnPlayer. A fresh
   * player (what keepInventory saves, the same game mode) appears at its bed or near the world
   * spawn.
   */
  respawnPlayer(): void {
    const w = this.theWorld;
    const old = this.thePlayer;
    if (!w || !old) return;
    w.removeEntity(old);
    this.renderViewEntity = null;
    const p = new EntityPlayerSP(this, w, this.username);
    p.entityId = old.entityId;
    this.thePlayer = p;
    this.renderViewEntity = p;
    p.preparePlayerToSpawn();
    // The client flips the new player, then the server's position packet sets its real angles.
    // Kept-in-memory chunks around the bed come back first so the bed can be found.
    loadChunksAroundBed(old, w, this.chunkProvider);
    this.playerController.flipPlayer(p);
    PlayerSpawning.respawn(p, old, w);
    this.playerController.setGameType(p.gameType);
    w.spawnEntityInWorld(p);
    p.movementInput = new MovementInputFromOptions(this.gameSettings);
    this.playerController.setPlayerCapabilities(p);
    if (this.currentScreen instanceof GuiGameOver) this.displayGuiScreen(null);
  }

  /** Always false, as in 1.5.2: every command goes to the (integrated) server. */
  handleClientCommand(_msg: string): boolean {
    return false;
  }

  /** Packet203AutoComplete's answer. */
  getPossibleCompletions(player: EntityPlayer, text: string): string[] | null {
    if (this.netHandler) {
      // Packet203: the host answers a tick or more later (GuiChat.receiveCompletions).
      this.netHandler.addToSendQueue({ type: 'AutoComplete', text });
      return null;
    }
    return getPossibleCompletions(player, text);
  }

  /** False while playing on someone else's LAN game. */
  isSingleplayer(): boolean {
    return this.netHandler === null;
  }

  // ------------------------------------------------------------------ multiplayer

  /** Swaps the player controller (a guest's networked one, or back to single player's). */
  private setPlayerController(c: PlayerControllerMP): void {
    this.playerController = c;
    c.activate();
  }

  /** Ends any LAN game or guest connection (leaving a world). */
  private stopMultiplayer(): void {
    if (this.lanServer) {
      this.lanServer.stop();
      this.lanServer = null;
    }
    if (this.netHandler) {
      this.netHandler.disconnect();
      this.netHandler = null;
    }
    this.guestTransport?.cancel();
    this.guestTransport = null;
    if (this.playerController !== this.singlePlayerController) this.setPlayerController(this.singlePlayerController);
    GuiIngame.playerListProvider = null;
    this.updateBackgroundTicking();
  }

  /**
   * Open to LAN (IntegratedServer.shareToLAN): the world becomes a room other players join with
   * the returned code. Other players get `gameType`; `allowCommands` is their "Allow Cheats".
   */
  async shareToLan(gameType: EnumGameType, allowCommands: boolean): Promise<string> {
    const w = this.theWorld;
    if (!w || this.netHandler) throw new Error('Not in a single player world');
    if (this.lanServer) return this.lanServer.code;
    if (this.thePlayer) this.thePlayer.username = this.username;
    const mc = this;
    const host: LanHostClient = {
      world: w,
      hostPlayer: () => this.thePlayer,
      get hostName() {
        return mc.thePlayer?.username ?? mc.username;
      },
      printChat: (msg) => this.ingameGUI.getChatGUI().printChatMessage(msg),
      commandManager: () => this.commandManager,
      getPossibleCompletions: (p, text) => getPossibleCompletions(p, text),
      setExtraLoadCenters: (centers) => {
        if (this.chunkProvider) this.chunkProvider.extraCenters = centers;
      },
    };
    // IntegratedPlayerList's view distance (10); each guest gets at most its own render radius.
    const server = new LanServer(host, makeHostTransport(), { gameType, allowCommands, maxPlayers: 8, viewDistance: 10 });
    await server.start(generateRoomCode());
    if (this.theWorld !== w) {
      server.stop();
      throw new Error('The world was closed');
    }
    this.lanServer = server;
    GuiIngame.playerListProvider = () => ({ entries: server.playerList(), maxPlayers: server.settings.maxPlayers });
    this.updateBackgroundTicking();
    return server.code;
  }

  /**
   * Direct Connect with a room code (GuiConnecting's connection thread): finds the host, then
   * logs in. `onConnected` runs when the peer link is up ("Logging in..."), `onFailed` with the
   * reason when it could not be made.
   */
  connectToRoom(input: string, onConnected: () => void, onFailed: (reason: string) => void): void {
    this.loadWorld(null);
    const code = normalizeRoomCode(input);
    if (!code) {
      onFailed(`"${input}" is not a room code (8 letters and digits, like ABCD-EFGH)`);
      return;
    }
    const transport = makeGuestTransport();
    this.guestTransport = transport;
    this.guestRoomCode = code;
    transport.connect(code, CONNECT_TIMEOUT_MS).then(
      (conn) => {
        if (this.guestTransport !== transport) {
          conn.close();
          return;
        }
        const handler = new NetClientHandler(this.guestClient, conn);
        this.netHandler = handler;
        this.setPlayerController(new PlayerControllerGuest(this, handler));
        handler.start();
        this.updateBackgroundTicking();
        onConnected();
      },
      (e: unknown) => {
        if (this.guestTransport !== transport) return;
        this.guestTransport = null;
        onFailed(e instanceof ConnectError ? e.reason : String(e));
      },
    );
  }

  /** Cancel on the connecting screen. */
  cancelConnect(): void {
    this.stopMultiplayer();
  }

  /** The guest side of Minecraft for the network handler. */
  private readonly guestClient: GuestClient = this.makeGuestClient();

  private makeGuestClient(): GuestClient {
    const mc = this;
    return {
      get username() {
        return mc.username;
      },
      get playerClient() {
        return mc;
      },
      get guestController() {
        return mc.playerController instanceof PlayerControllerGuest ? mc.playerController : null;
      },
      startGuestWorld: (world, player, type) => this.startGuestWorld(world, player, type),
      respawnGuestPlayer: (player, type) => this.respawnGuestPlayer(player, type),
      guestDisconnected: (title, reason) => this.guestDisconnected(title, reason),
      printChat: (msg) => this.ingameGUI.getChatGUI().printChatMessage(msg),
      setGameType: (type) => this.playerController.setGameType(type),
      autocompleteResponse: (names) => {
        if (this.currentScreen instanceof GuiChat) this.currentScreen.receiveCompletions(names);
      },
      critParticles: (target: Entity, magic: boolean) => {
        if (this.theWorld) this.effectRenderer.addEffect(new EntityCrit2FX(this.theWorld, target, magic ? 'magicCrit' : undefined));
      },
      clientSettings: () => ({ renderDistance: this.gameSettings.renderDistance, chatVisibility: this.gameSettings.chatVisibility }),
      rejoinToken: () => (this.guestRoomCode ? loadRejoinToken(this.guestRoomCode, this.username) : null),
      storeRejoinToken: (token) => {
        if (this.guestRoomCode) saveRejoinToken(this.guestRoomCode, this.username, token);
      },
    };
  }

  /** NetClientHandler.handleLogin: the host's world (loadWorld with the network's player). */
  private startGuestWorld(world: WorldClient, player: EntityClientPlayerMP, type: EnumGameType): void {
    ClientStats.readStat(StatIds.joinMultiplayer);
    this.renderViewEntity = null;
    this.objectMouseOver = null;
    this.sndManager.playStreaming(null, 0, 0, 0);
    this.sndManager.stopAllSounds();
    this.pendingWorld = null;
    this.chunkProvider = null;
    this.theWorld = world;
    this.renderGlobal.setWorldAndLoadRenderers(world);
    this.effectRenderer.clearEffects(world);
    this.thePlayer = player;
    this.playerController.flipPlayer(player);
    player.preparePlayerToSpawn();
    world.spawnEntityInWorld(player);
    player.movementInput = new MovementInputFromOptions(this.gameSettings);
    this.playerController.setGameType(type);
    this.renderViewEntity = player;
    this.commandManager = null;
    setServer(null);
    GuiIngame.playerListProvider = () => this.netHandler?.playerList() ?? { entries: [], maxPlayers: 8 };
    const handler = this.netHandler;
    let waited = 0;
    this.displayGuiScreen(
      new GuiDownloadTerrain(() => {
        const p = this.thePlayer;
        if (!p || !handler || this.netHandler !== handler) return true;
        if (++waited > 1200) return true;
        if (!handler.positionReceived) return false;
        const cx = MathHelper.floor_double(p.posX) >> 4;
        const cz = MathHelper.floor_double(p.posZ) >> 4;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!world.chunkExists(cx + dx, cz + dz)) return false;
        return this.renderGlobal.pendingNear(p, 1) === 0;
      }),
    );
  }

  /** Packet9Respawn: the new player takes the old one's place. */
  private respawnGuestPlayer(player: EntityClientPlayerMP, type: EnumGameType): void {
    const w = this.theWorld;
    if (!w) return;
    this.thePlayer = player;
    this.renderViewEntity = player;
    player.preparePlayerToSpawn();
    this.playerController.flipPlayer(player);
    this.playerController.setGameType(type);
    w.spawnEntityInWorld(player);
    player.movementInput = new MovementInputFromOptions(this.gameSettings);
    if (this.currentScreen instanceof GuiGameOver) this.displayGuiScreen(null);
  }

  /** The connection ended: back to the menus with the reason (GuiDisconnected). */
  private guestDisconnected(title: string, reason: string): void {
    this.netHandler = null;
    this.loadWorld(null);
    this.displayGuiScreen(new GuiDisconnected(new GuiMultiplayer(new GuiMainMenu()), title, 'disconnect.genericReason', I18n.translateToLocal(reason)));
  }

  // ------------------------------------------------------------------ misc

  private screenshotListener(): void {
    if (Keyboard.isKeyDown(Keys.F2)) {
      if (!this.isTakingScreenshot) {
        this.isTakingScreenshot = true;
        this.saveScreenshot();
      }
    } else {
      this.isTakingScreenshot = false;
    }
  }

  /** ScreenShotHelper: downloads the current frame as yyyy-MM-dd_HH.mm.ss.png. */
  saveScreenshot(): void {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const name = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`;
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  playRandomMusicIfReady(): void {
    this.sndManager.playRandomMusicIfReady();
  }

  playSoundFX(name: string, volume: number, pitch: number): void {
    this.sndManager.playSoundFX(name, volume, pitch);
  }

  debugInfoRenders(): string {
    return this.renderGlobal.getDebugInfoRenders();
  }

  getEntityDebug(): string {
    return this.renderGlobal.getDebugInfoEntities();
  }

  debugInfoEntities(): string {
    return `P: ${this.effectRenderer.getStatistics()}. T: All: ${this.theWorld?.loadedEntityList.length ?? 0}`;
  }

  getWorldProviderName(): string {
    return this.chunkProvider?.makeString() ?? (this.theWorld ? `MultiplayerChunkCache: ${this.theWorld.loadedChunkCount}` : '');
  }
}

function shiftDown(): boolean {
  return Keyboard.isKeyDown(Keys.LSHIFT) || Keyboard.isKeyDown(Keys.RSHIFT);
}
