import type { ResourceManager } from '../assets/ResourceManager';
import { SoundManager } from '../audio/SoundManager';
import { Block } from '../block/Block';
import { I18n } from '../core/I18n';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType, type MovingObjectPosition } from '../core/MovingObjectPosition';
import type { EntityLiving } from '../entity/EntityLiving';
import { FontRenderer } from '../gui/FontRenderer';
import { GuiDownloadTerrain } from '../gui/GuiDownloadTerrain';
import { GuiIngame } from '../gui/GuiIngame';
import { GuiIngameMenu } from '../gui/GuiIngameMenu';
import { GuiMainMenu } from '../gui/GuiMainMenu';
import type { GuiScreen } from '../gui/GuiScreen';
import { LoadingScreenRenderer } from '../gui/LoadingScreenRenderer';
import { ScaledResolution } from '../gui/ScaledResolution';
import { Item } from '../item/Item';
import { EntityRenderer } from '../render/EntityRenderer';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { EffectRenderer } from '../render/particle/EffectRenderer';
import { RenderBlocks } from '../render/RenderBlocks';
import { RenderGlobal, WorldRenderer } from '../render/RenderGlobal';
import { TextureManager } from '../render/texture/TextureManager';
import { ChunkProviderClient } from '../world/ChunkProviderClient';
import { ColorizerFoliage, ColorizerGrass, rgbaToIntBuffer } from '../world/biome/Colorizer';
import { World, WorldInfo } from '../world/World';
import { EntityPlayerSP } from './EntityPlayerSP';
import { EnumOptions, GameSettings, type SettingsListener } from './GameSettings';
import { installInput } from './Input';
import { Keyboard, Keys, Mouse } from './Keyboard';
import { KeyBinding } from './KeyBinding';
import { MouseHelper } from './MouseHelper';
import { MovementInputFromOptions } from './MovementInput';
import { PlayerControllerCreative } from './PlayerControllerCreative';
import { Timer } from './Timer';

/** World creation options (WorldSettings). */
export interface WorldSettings {
  seed?: bigint;
  terrainType: string;
  mapFeatures: boolean;
}

interface PendingWorld {
  world: World;
  provider: ChunkProviderClient;
  phase: 'spawn' | 'terrain';
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
  readonly playerController: PlayerControllerCreative;
  theWorld: World | null = null;
  thePlayer: EntityPlayerSP | null = null;
  renderViewEntity: EntityLiving | null = null;
  objectMouseOver: MovingObjectPosition | null = null;
  currentScreen: GuiScreen | null = null;
  chunkProvider: ChunkProviderClient | null = null;
  displayWidth = 854;
  displayHeight = 480;
  inGameHasFocus = false;
  skipRenderWorld = false;
  isGamePaused = false;
  running = true;
  /** "N fps, M chunk updates" for the F3 screen. */
  debug = '';
  static debugFPS = 0;
  username = 'Player';
  /** Called once per frame after rendering (dev hooks, screenshot harness). */
  readonly frameListeners: (() => void)[] = [];
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
    this.loadingScreen = new LoadingScreenRenderer(this);
    this.playerController = new PlayerControllerCreative(this);
    this.updateDisplaySize();
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
    RenderBlocks.itemGL = { color: (r, g, b, a) => GL.color(r, g, b, a), rotate: (a, x, y, z) => GL.rotate(a, x, y, z), translate: (x, y, z) => GL.translate(x, y, z) };
    this.setupGLState();
    await this.renderEngine.preload(['/title/mojang.png']);
    this.loadScreen();

    const rm = this.resources;
    const lang = await rm.getText('lang/en_US.lang', 'vanilla');
    if (lang) I18n.load(lang);
    const splashes = await rm.getText('title/splashes.txt');
    if (splashes) GuiMainMenu.splashes = splashes.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    await this.fontRenderer.readFontData(rm);
    const grass = await this.renderEngine.getTextureContents('/misc/grasscolor.png');
    if (grass) ColorizerGrass.setGrassBiomeColorizer(rgbaToIntBuffer(grass.data));
    const foliage = await this.renderEngine.getTextureContents('/misc/foliagecolor.png');
    if (foliage) ColorizerFoliage.setFoliageBiomeColorizer(rgbaToIntBuffer(foliage.data));
    this.sndManager.init();

    this.renderEngine.textureMapBlocks.registrars.push((reg) => {
      for (const b of Block.blocksList) if (b) b.registerIcons(reg);
    });
    this.renderEngine.textureMapItems.registrars.push((reg) => {
      for (const it of Item.itemsList) if (it && it.getSpriteNumber() === 1) it.registerIcons(reg);
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

    this.renderGlobal = new RenderGlobal(this);
    this.renderGlobal.initMeshers();
    this.renderEngine.reloadListeners.push(() => {
      RenderBlocks.missingIcon = this.renderEngine.textureMapBlocks.getMissingIcon();
      this.renderGlobal.onTexturesReloaded();
    });
    this.entityRenderer = new EntityRenderer(this);
    this.effectRenderer = new EffectRenderer(null, this.renderEngine);
    this.ingameGUI = new GuiIngame(this);
    this.started = true;
    this.displayGuiScreen(new GuiMainMenu());
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
    if (this.isGamePaused && this.theWorld) {
      const pt = this.timer.renderPartialTicks;
      this.timer.updateTimer();
      this.timer.renderPartialTicks = pt;
    } else {
      this.timer.updateTimer();
    }
    for (let i = 0; i < this.timer.elapsedTicks; i++) this.runTick();
    this.tickLoading();
    this.chunkProvider?.processIncoming(4);
    RenderBlocks.fancyGrass = this.gameSettings.fancyGraphics;
    this.sndManager.setListener(this.thePlayer, this.timer.renderPartialTicks);
    GL.enable(GL.TEXTURE_2D);
    if (this.thePlayer && this.thePlayer.isEntityInsideOpaqueBlock()) this.gameSettings.thirdPersonView = 0;
    GL.beginFrame();
    if (this.loadingScreen.active) this.loadingScreen.draw();
    else if (!this.skipRenderWorld) this.entityRenderer.updateCameraAndRender(this.timer.renderPartialTicks);
    this.screenshotListener();
    for (const l of this.frameListeners) l();
    this.updateDisplaySize();
    this.fpsCounter++;
    this.isGamePaused = this.currentScreen !== null && this.currentScreen.doesGuiPauseGame();
    const now = performance.now();
    while (now >= this.debugUpdateTime + 1000) {
      Minecraft.debugFPS = this.fpsCounter;
      this.debug = `${Minecraft.debugFPS} fps, ${WorldRenderer.chunksUpdated} chunk updates`;
      WorldRenderer.chunksUpdated = 0;
      this.debugUpdateTime += 1000;
      this.fpsCounter = 0;
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
    if (this.rightClickDelayTimer > 0) this.rightClickDelayTimer--;
    if (!this.isGamePaused && this.theWorld) this.ingameGUI.updateTick();
    this.entityRenderer.getMouseOver(1);
    if (!this.isGamePaused && this.theWorld) this.playerController.updateController();
    if (!this.isGamePaused) this.renderEngine.updateDynamicTextures();
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
      this.handleMouseEvents();
      if (this.leftClickCounter > 0) this.leftClickCounter--;
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
        this.entityRenderer.updateRenderer();
        this.renderGlobal.updateClouds();
        if (w.lastLightningBolt > 0) w.lastLightningBolt--;
        w.updateEntities();
        w.tick();
        w.doVoidFogParticles(MathHelper.floor_double(this.thePlayer.posX), MathHelper.floor_double(this.thePlayer.posY), MathHelper.floor_double(this.thePlayer.posZ));
        this.effectRenderer.updateEffects();
      }
    }
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
    }
  }

  private handleKeyBindings(): void {
    const gs = this.gameSettings;
    const p = this.thePlayer!;
    while (gs.keyBindInventory.isPressed());
    while (gs.keyBindDrop.isPressed());
    while (gs.keyBindChat.isPressed());
    if (this.currentScreen === null) gs.keyBindCommand.isPressed();
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

  /** Pick block: puts the targeted block in the hotbar (creative). */
  private clickMiddleMouseButton(): void {
    const mop = this.objectMouseOver;
    if (!mop || mop.typeOfHit !== EnumMovingObjectType.TILE) return;
    const w = this.theWorld!;
    const block = Block.blocksList[w.getBlockId(mop.blockX, mop.blockY, mop.blockZ)];
    if (!block) return;
    const id = block.idPicked(w, mop.blockX, mop.blockY, mop.blockZ);
    if (id === 0 || !Item.itemsList[id]) return;
    const subtypes = Item.itemsList[id]!.getHasSubtypes();
    const src = id < 256 && !block.isFlowerPot() ? id : block.blockID;
    const damage = Block.blocksList[src]?.getDamageValue(w, mop.blockX, mop.blockY, mop.blockZ) ?? 0;
    this.thePlayer!.inventory.setCurrentItem(id, damage, subtypes, true);
  }

  // ------------------------------------------------------------------ screens and focus

  displayGuiScreen(screen: GuiScreen | null): void {
    if (this.currentScreen) this.currentScreen.onGuiClosed();
    if (screen === null && this.theWorld === null) screen = new GuiMainMenu();
    if (screen instanceof GuiMainMenu) this.gameSettings.showDebugInfo = false;
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

  onSoundOptionsChanged(): void {
    this.sndManager.onSoundOptionsChanged();
  }

  shutdown(): void {
    this.loadWorld(null);
    this.running = false;
    GL.clearColor(0, 0, 0, 1);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    document.exitPointerLock?.();
    window.close();
  }

  // ------------------------------------------------------------------ worlds

  /** Creates a world and starts streaming its terrain (the integrated server start-up). */
  launchIntegratedServer(folder: string, name: string, ws: WorldSettings): void {
    this.loadWorld(null);
    const info = new WorldInfo();
    info.worldName = name || folder;
    info.seed = ws.seed ?? new JavaRandom().nextLong();
    info.terrainType = ws.terrainType;
    info.mapFeaturesEnabled = ws.mapFeatures;
    const world = new World(info);
    const provider = new ChunkProviderClient(world, info.seed, ws.terrainType, ws.mapFeatures);
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
    const total = (2 * r + 1) * (2 * r + 1);
    this.loadingScreen.setLoadingProgress(Math.trunc((have * 100) / total));
    if (have < total) return;
    this.pendingWorld = null;
    this.loadingScreen.onNoMoreProgress();
    this.loadWorld(pw.world);
    this.spawnPlayerAtWorldSpawn();
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
    const p = this.thePlayer!;
    const w = this.theWorld!;
    const info = w.worldInfo;
    const rand = new JavaRandom();
    const x = info.spawnX + rand.nextInt(20) - 10;
    const z = info.spawnZ + rand.nextInt(20) - 10;
    const y = w.getTopSolidOrLiquidBlock(x, z);
    p.setLocationAndAngles(x + 0.5, y, z + 0.5, 0, 0);
    while (w.getCollidingBoundingBoxes(p, p.boundingBox).length > 0) p.setPosition(p.posX, p.posY + 1, p.posZ);
  }

  loadWorld(world: World | null): void {
    this.renderViewEntity = null;
    this.objectMouseOver = null;
    this.sndManager.stopAllSounds();
    if (world === null) {
      this.pendingWorld = null;
      this.loadingScreen.onNoMoreProgress();
      this.chunkProvider?.dispose();
      this.chunkProvider = null;
      this.renderGlobal?.setWorldAndLoadRenderers(null);
      this.effectRenderer?.clearEffects(null);
      this.theWorld = null;
      this.thePlayer = null;
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
    this.playerController.setPlayerCapabilities(this.thePlayer);
    this.renderViewEntity = this.thePlayer;
  }

  isSingleplayer(): boolean {
    return true;
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
    return this.chunkProvider?.makeString() ?? '';
  }
}

function shiftDown(): boolean {
  return Keyboard.isKeyDown(Keys.LSHIFT) || Keyboard.isKeyDown(Keys.RSHIFT);
}
