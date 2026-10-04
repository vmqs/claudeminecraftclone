import { I18n } from '../core/I18n';
import { translateOr } from './ControlsText';
import { Keyboard, Mouse } from './Keyboard';
import { KeyBinding } from './KeyBinding';

/** EnumOptions: option id, translation key, float slider?, boolean toggle? */
export class EnumOptions {
  static readonly values: EnumOptions[] = [];
  private constructor(
    readonly name: string,
    readonly enumString: string,
    readonly enumFloat: boolean,
    readonly enumBoolean: boolean,
  ) {
    EnumOptions.values.push(this);
  }
  static readonly MUSIC = new EnumOptions('MUSIC', 'options.music', true, false);
  static readonly SOUND = new EnumOptions('SOUND', 'options.sound', true, false);
  static readonly INVERT_MOUSE = new EnumOptions('INVERT_MOUSE', 'options.invertMouse', false, true);
  static readonly SENSITIVITY = new EnumOptions('SENSITIVITY', 'options.sensitivity', true, false);
  static readonly FOV = new EnumOptions('FOV', 'options.fov', true, false);
  static readonly GAMMA = new EnumOptions('GAMMA', 'options.gamma', true, false);
  static readonly RENDER_DISTANCE = new EnumOptions('RENDER_DISTANCE', 'options.renderDistance', false, false);
  static readonly VIEW_BOBBING = new EnumOptions('VIEW_BOBBING', 'options.viewBobbing', false, true);
  static readonly ANAGLYPH = new EnumOptions('ANAGLYPH', 'options.anaglyph', false, true);
  static readonly ADVANCED_OPENGL = new EnumOptions('ADVANCED_OPENGL', 'options.advancedOpengl', false, true);
  static readonly FRAMERATE_LIMIT = new EnumOptions('FRAMERATE_LIMIT', 'options.framerateLimit', false, false);
  static readonly DIFFICULTY = new EnumOptions('DIFFICULTY', 'options.difficulty', false, false);
  static readonly GRAPHICS = new EnumOptions('GRAPHICS', 'options.graphics', false, false);
  static readonly AMBIENT_OCCLUSION = new EnumOptions('AMBIENT_OCCLUSION', 'options.ao', false, false);
  static readonly GUI_SCALE = new EnumOptions('GUI_SCALE', 'options.guiScale', false, false);
  static readonly RENDER_CLOUDS = new EnumOptions('RENDER_CLOUDS', 'options.renderClouds', false, true);
  static readonly PARTICLES = new EnumOptions('PARTICLES', 'options.particles', false, false);
  static readonly CHAT_VISIBILITY = new EnumOptions('CHAT_VISIBILITY', 'options.chat.visibility', false, false);
  static readonly CHAT_COLOR = new EnumOptions('CHAT_COLOR', 'options.chat.color', false, true);
  static readonly CHAT_LINKS = new EnumOptions('CHAT_LINKS', 'options.chat.links', false, true);
  static readonly CHAT_OPACITY = new EnumOptions('CHAT_OPACITY', 'options.chat.opacity', true, false);
  static readonly CHAT_LINKS_PROMPT = new EnumOptions('CHAT_LINKS_PROMPT', 'options.chat.links.prompt', false, true);
  static readonly USE_SERVER_TEXTURES = new EnumOptions('USE_SERVER_TEXTURES', 'options.serverTextures', false, true);
  static readonly SNOOPER_ENABLED = new EnumOptions('SNOOPER_ENABLED', 'options.snooper', false, true);
  static readonly USE_FULLSCREEN = new EnumOptions('USE_FULLSCREEN', 'options.fullscreen', false, true);
  static readonly ENABLE_VSYNC = new EnumOptions('ENABLE_VSYNC', 'options.vsync', false, true);
  static readonly SHOW_CAPE = new EnumOptions('SHOW_CAPE', 'options.showCape', false, true);
  static readonly TOUCHSCREEN = new EnumOptions('TOUCHSCREEN', 'options.touchscreen', false, true);
  static readonly CHAT_SCALE = new EnumOptions('CHAT_SCALE', 'options.chat.scale', true, false);
  static readonly CHAT_WIDTH = new EnumOptions('CHAT_WIDTH', 'options.chat.width', true, false);
  static readonly CHAT_HEIGHT_FOCUSED = new EnumOptions('CHAT_HEIGHT_FOCUSED', 'options.chat.height.focused', true, false);
  static readonly CHAT_HEIGHT_UNFOCUSED = new EnumOptions('CHAT_HEIGHT_UNFOCUSED', 'options.chat.height.unfocused', true, false);
  /** Not in 1.5.2: whether the sprint key is held or toggles (Controls screen). */
  static readonly SPRINT_MODE = new EnumOptions('SPRINT_MODE', 'options.sprintMode', false, false);

  getEnumFloat(): boolean {
    return this.enumFloat;
  }
  getEnumBoolean(): boolean {
    return this.enumBoolean;
  }
  returnEnumOrdinal(): number {
    return EnumOptions.values.indexOf(this);
  }
  getEnumString(): string {
    return this.enumString;
  }
  static getEnumOptions(ordinal: number): EnumOptions | null {
    return EnumOptions.values[ordinal] ?? null;
  }
}

const RENDER_DISTANCES = ['options.renderDistance.far', 'options.renderDistance.normal', 'options.renderDistance.short', 'options.renderDistance.tiny'];
const DIFFICULTIES = ['options.difficulty.peaceful', 'options.difficulty.easy', 'options.difficulty.normal', 'options.difficulty.hard'];
const GUISCALES = ['options.guiScale.auto', 'options.guiScale.small', 'options.guiScale.normal', 'options.guiScale.large'];
const CHAT_VISIBILITIES = ['options.chat.visibility.full', 'options.chat.visibility.system', 'options.chat.visibility.hidden'];
const PARTICLES = ['options.particles.all', 'options.particles.decreased', 'options.particles.minimal'];
const LIMIT_FRAMERATES = ['performance.max', 'performance.balanced', 'performance.powersaver'];
const AMBIENT_OCCLUSIONS = ['options.ao.off', 'options.ao.min', 'options.ao.max'];

const STORAGE_KEY = 'mc152.options';

/** Hooks GameSettings calls when an option needs the game to react. */
export interface SettingsListener {
  onSoundOptionsChanged?(): void;
  loadRenderers?(): void;
  onFullscreenToggled?(): void;
  /** A chat size or opacity option changed (GuiNewChat re-wraps its lines). */
  onChatOptionsChanged?(): void;
  /** The options were saved (sendSettingsToServer: the integrated server takes the difficulty). */
  onSettingsSaved?(): void;
}

/** All 1.5.2 options with their defaults, persisted to localStorage in options.txt form. */
export class GameSettings {
  musicVolume = 1;
  soundVolume = 1;
  mouseSensitivity = 0.5;
  invertMouse = false;
  renderDistance = 0;
  viewBobbing = true;
  anaglyph = false;
  advancedOpengl = false;
  limitFramerate = 1;
  fancyGraphics = true;
  ambientOcclusion = 2;
  clouds = true;
  skin = 'Default';
  chatVisibility = 0;
  chatColours = true;
  chatLinks = true;
  chatLinksPrompt = true;
  chatOpacity = 1;
  serverTextures = true;
  snooperEnabled = true;
  fullScreen = false;
  enableVsync = true;
  hideServerAddress = false;
  advancedItemTooltips = false;
  pauseOnLostFocus = true;
  showCape = true;
  touchscreen = false;
  overrideWidth = 0;
  overrideHeight = 0;
  heldItemTooltips = true;
  chatScale = 1;
  chatWidth = 1;
  chatHeightUnfocused = Math.fround(0.44366196);
  chatHeightFocused = 1;
  readonly keyBindForward = new KeyBinding('key.forward', 17);
  readonly keyBindLeft = new KeyBinding('key.left', 30);
  readonly keyBindBack = new KeyBinding('key.back', 31);
  readonly keyBindRight = new KeyBinding('key.right', 32);
  readonly keyBindJump = new KeyBinding('key.jump', 57);
  readonly keyBindInventory = new KeyBinding('key.inventory', 18);
  readonly keyBindDrop = new KeyBinding('key.drop', 16);
  readonly keyBindChat = new KeyBinding('key.chat', 20);
  readonly keyBindSneak = new KeyBinding('key.sneak', 42);
  readonly keyBindAttack = new KeyBinding('key.attack', -100);
  readonly keyBindUseItem = new KeyBinding('key.use', -99);
  readonly keyBindPlayerList = new KeyBinding('key.playerlist', 15);
  readonly keyBindPickBlock = new KeyBinding('key.pickItem', -98);
  readonly keyBindCommand = new KeyBinding('key.command', 53);
  /** Additions to 1.5.2's set: a sprint key (I), OptiFine's zoom (C) and the hotbar slots (1-9). */
  readonly keyBindSprint = new KeyBinding('key.sprint', 23);
  readonly keyBindZoom = new KeyBinding('of.key.zoom', 46);
  readonly keyBindsHotbar: readonly KeyBinding[] = Array.from({ length: 9 }, (_, i) => new KeyBinding(`key.hotbar.${i + 1}`, 2 + i));
  readonly keyBindings: KeyBinding[] = [
    this.keyBindAttack,
    this.keyBindUseItem,
    this.keyBindForward,
    this.keyBindLeft,
    this.keyBindBack,
    this.keyBindRight,
    this.keyBindJump,
    this.keyBindSneak,
    this.keyBindDrop,
    this.keyBindInventory,
    this.keyBindChat,
    this.keyBindPlayerList,
    this.keyBindPickBlock,
    this.keyBindCommand,
    this.keyBindSprint,
    this.keyBindZoom,
    ...this.keyBindsHotbar,
  ];
  /** Sprint key mode: false holds (sprint while down), true toggles (options.txt "toggleSprint"). */
  toggleSprint = false;
  /** Toggle mode: the sprint key's current on/off state (not saved). */
  sprintToggledOn = false;
  difficulty = 2;
  hideGUI = false;
  thirdPersonView = 0;
  showDebugInfo = false;
  showDebugProfilerChart = false;
  lastServer = '';
  noclip = false;
  smoothCamera = false;
  debugCamEnable = false;
  noclipRate = 1;
  debugCamRate = 1;
  fovSetting = 0;
  gammaSetting = 0;
  guiScale = 0;
  particleSetting = 0;
  language = 'en_US';
  listener: SettingsListener | null = null;

  constructor(load = true) {
    if (load) this.loadOptions();
  }

  getKeyBindingDescription(i: number): string {
    return translateOr(this.keyBindings[i].keyDescription);
  }

  getOptionDisplayString(i: number): string {
    return GameSettings.getKeyDisplayString(this.keyBindings[i].keyCode);
  }

  static getKeyDisplayString(code: number): string {
    return code < 0 ? I18n.translateToLocalFormatted('key.mouseButton', code + 101) : Keyboard.getKeyName(code);
  }

  static isKeyDown(k: KeyBinding): boolean {
    return k.keyCode < 0 ? Mouse.isButtonDown(k.keyCode + 100) : Keyboard.isKeyDown(k.keyCode);
  }

  setKeyBinding(i: number, code: number): void {
    this.keyBindings[i].keyCode = code;
    this.saveOptions();
  }

  /** Every binding back to its default ("Reset Keys"). */
  resetKeyBindings(): void {
    for (const k of this.keyBindings) k.keyCode = k.keyCodeDefault;
    KeyBinding.resetKeyBindingArrayAndHash();
    this.saveOptions();
  }

  setOptionFloatValue(o: EnumOptions, v: number): void {
    v = Math.fround(v);
    if (o === EnumOptions.MUSIC) {
      this.musicVolume = v;
      this.listener?.onSoundOptionsChanged?.();
    }
    if (o === EnumOptions.SOUND) {
      this.soundVolume = v;
      this.listener?.onSoundOptionsChanged?.();
    }
    if (o === EnumOptions.SENSITIVITY) this.mouseSensitivity = v;
    if (o === EnumOptions.FOV) this.fovSetting = v;
    if (o === EnumOptions.GAMMA) this.gammaSetting = v;
    if (o === EnumOptions.CHAT_OPACITY) this.chatOpacity = v;
    if (o === EnumOptions.CHAT_HEIGHT_FOCUSED) this.chatHeightFocused = v;
    if (o === EnumOptions.CHAT_HEIGHT_UNFOCUSED) this.chatHeightUnfocused = v;
    if (o === EnumOptions.CHAT_WIDTH) this.chatWidth = v;
    if (o === EnumOptions.CHAT_SCALE) this.chatScale = v;
    const chat = [EnumOptions.CHAT_OPACITY, EnumOptions.CHAT_HEIGHT_FOCUSED, EnumOptions.CHAT_HEIGHT_UNFOCUSED, EnumOptions.CHAT_WIDTH, EnumOptions.CHAT_SCALE];
    if (chat.includes(o)) this.listener?.onChatOptionsChanged?.();
  }

  setOptionValue(o: EnumOptions, step: number): void {
    if (o === EnumOptions.INVERT_MOUSE) this.invertMouse = !this.invertMouse;
    if (o === EnumOptions.RENDER_DISTANCE) this.renderDistance = (this.renderDistance + step) & 3;
    if (o === EnumOptions.GUI_SCALE) this.guiScale = (this.guiScale + step) & 3;
    if (o === EnumOptions.PARTICLES) this.particleSetting = (this.particleSetting + step) % 3;
    if (o === EnumOptions.VIEW_BOBBING) this.viewBobbing = !this.viewBobbing;
    if (o === EnumOptions.RENDER_CLOUDS) this.clouds = !this.clouds;
    if (o === EnumOptions.ADVANCED_OPENGL) {
      this.advancedOpengl = !this.advancedOpengl;
      this.listener?.loadRenderers?.();
    }
    if (o === EnumOptions.ANAGLYPH) {
      this.anaglyph = !this.anaglyph;
      // 1.5.2 reloads every texture here, which also rebuilds the chunk meshes with the new colours.
      this.listener?.loadRenderers?.();
    }
    if (o === EnumOptions.FRAMERATE_LIMIT) this.limitFramerate = (this.limitFramerate + step + 3) % 3;
    if (o === EnumOptions.DIFFICULTY) this.difficulty = (this.difficulty + step) & 3;
    if (o === EnumOptions.GRAPHICS) {
      this.fancyGraphics = !this.fancyGraphics;
      this.listener?.loadRenderers?.();
    }
    if (o === EnumOptions.AMBIENT_OCCLUSION) {
      this.ambientOcclusion = (this.ambientOcclusion + step) % 3;
      this.listener?.loadRenderers?.();
    }
    if (o === EnumOptions.CHAT_VISIBILITY) this.chatVisibility = (this.chatVisibility + step) % 3;
    if (o === EnumOptions.CHAT_COLOR) this.chatColours = !this.chatColours;
    if (o === EnumOptions.CHAT_LINKS) this.chatLinks = !this.chatLinks;
    if (o === EnumOptions.CHAT_LINKS_PROMPT) this.chatLinksPrompt = !this.chatLinksPrompt;
    if (o === EnumOptions.USE_SERVER_TEXTURES) this.serverTextures = !this.serverTextures;
    if (o === EnumOptions.SNOOPER_ENABLED) this.snooperEnabled = !this.snooperEnabled;
    if (o === EnumOptions.SHOW_CAPE) this.showCape = !this.showCape;
    if (o === EnumOptions.TOUCHSCREEN) this.touchscreen = !this.touchscreen;
    if (o === EnumOptions.USE_FULLSCREEN) {
      this.fullScreen = !this.fullScreen;
      this.listener?.onFullscreenToggled?.();
    }
    if (o === EnumOptions.ENABLE_VSYNC) this.enableVsync = !this.enableVsync;
    if (o === EnumOptions.SPRINT_MODE) {
      this.toggleSprint = !this.toggleSprint;
      this.sprintToggledOn = false;
    }
    this.saveOptions();
  }

  getOptionFloatValue(o: EnumOptions): number {
    if (o === EnumOptions.FOV) return this.fovSetting;
    if (o === EnumOptions.GAMMA) return this.gammaSetting;
    if (o === EnumOptions.MUSIC) return this.musicVolume;
    if (o === EnumOptions.SOUND) return this.soundVolume;
    if (o === EnumOptions.SENSITIVITY) return this.mouseSensitivity;
    if (o === EnumOptions.CHAT_OPACITY) return this.chatOpacity;
    if (o === EnumOptions.CHAT_HEIGHT_FOCUSED) return this.chatHeightFocused;
    if (o === EnumOptions.CHAT_HEIGHT_UNFOCUSED) return this.chatHeightUnfocused;
    if (o === EnumOptions.CHAT_SCALE) return this.chatScale;
    if (o === EnumOptions.CHAT_WIDTH) return this.chatWidth;
    return 0;
  }

  getOptionOrdinalValue(o: EnumOptions): boolean {
    switch (o) {
      case EnumOptions.INVERT_MOUSE:
        return this.invertMouse;
      case EnumOptions.VIEW_BOBBING:
        return this.viewBobbing;
      case EnumOptions.ANAGLYPH:
        return this.anaglyph;
      case EnumOptions.ADVANCED_OPENGL:
        return this.advancedOpengl;
      case EnumOptions.RENDER_CLOUDS:
        return this.clouds;
      case EnumOptions.CHAT_COLOR:
        return this.chatColours;
      case EnumOptions.CHAT_LINKS:
        return this.chatLinks;
      case EnumOptions.CHAT_LINKS_PROMPT:
        return this.chatLinksPrompt;
      case EnumOptions.USE_SERVER_TEXTURES:
        return this.serverTextures;
      case EnumOptions.SNOOPER_ENABLED:
        return this.snooperEnabled;
      case EnumOptions.USE_FULLSCREEN:
        return this.fullScreen;
      case EnumOptions.ENABLE_VSYNC:
        return this.enableVsync;
      case EnumOptions.SHOW_CAPE:
        return this.showCape;
      case EnumOptions.TOUCHSCREEN:
        return this.touchscreen;
      default:
        return false;
    }
  }

  private static getTranslation(keys: string[], i: number): string {
    if (i < 0 || i >= keys.length) i = 0;
    return I18n.translateToLocal(keys[i]);
  }

  /** Button label for an option, e.g. "Render Distance: Far". */
  getKeyBinding(o: EnumOptions): string {
    if (o === EnumOptions.SPRINT_MODE) return translateOr('options.sprintMode') + ': ' + translateOr(this.toggleSprint ? 'options.key.toggle' : 'options.key.hold');
    const t = (k: string) => I18n.translateToLocal(k);
    const prefix = t(o.getEnumString()) + ': ';
    if (o.getEnumFloat()) {
      const v = this.getOptionFloatValue(o);
      if (o === EnumOptions.SENSITIVITY) {
        if (v === 0) return prefix + t('options.sensitivity.min');
        return v === 1 ? prefix + t('options.sensitivity.max') : prefix + Math.trunc(v * 200) + '%';
      }
      if (o === EnumOptions.FOV) {
        if (v === 0) return prefix + t('options.fov.min');
        return v === 1 ? prefix + t('options.fov.max') : prefix + Math.trunc(70 + v * 40);
      }
      if (o === EnumOptions.GAMMA) {
        if (v === 0) return prefix + t('options.gamma.min');
        return v === 1 ? prefix + t('options.gamma.max') : prefix + '+' + Math.trunc(v * 100) + '%';
      }
      if (o === EnumOptions.CHAT_OPACITY) return prefix + Math.trunc(v * 90 + 10) + '%';
      // GuiNewChat.calculateChatboxHeight / Width: floor of the float value.
      if (o === EnumOptions.CHAT_HEIGHT_UNFOCUSED || o === EnumOptions.CHAT_HEIGHT_FOCUSED) return prefix + Math.floor(Math.fround(Math.fround(v * 160) + 20)) + 'px';
      if (o === EnumOptions.CHAT_WIDTH) return prefix + Math.floor(Math.fround(Math.fround(v * 280) + 40)) + 'px';
      return v === 0 ? prefix + t('options.off') : prefix + Math.trunc(v * 100) + '%';
    }
    if (o.getEnumBoolean()) return prefix + t(this.getOptionOrdinalValue(o) ? 'options.on' : 'options.off');
    if (o === EnumOptions.RENDER_DISTANCE) return prefix + GameSettings.getTranslation(RENDER_DISTANCES, this.renderDistance);
    if (o === EnumOptions.DIFFICULTY) return prefix + GameSettings.getTranslation(DIFFICULTIES, this.difficulty);
    if (o === EnumOptions.GUI_SCALE) return prefix + GameSettings.getTranslation(GUISCALES, this.guiScale);
    if (o === EnumOptions.CHAT_VISIBILITY) return prefix + GameSettings.getTranslation(CHAT_VISIBILITIES, this.chatVisibility);
    if (o === EnumOptions.PARTICLES) return prefix + GameSettings.getTranslation(PARTICLES, this.particleSetting);
    if (o === EnumOptions.FRAMERATE_LIMIT) return prefix + GameSettings.getTranslation(LIMIT_FRAMERATES, this.limitFramerate);
    if (o === EnumOptions.AMBIENT_OCCLUSION) return prefix + GameSettings.getTranslation(AMBIENT_OCCLUSIONS, this.ambientOcclusion);
    if (o === EnumOptions.GRAPHICS) return prefix + t(this.fancyGraphics ? 'options.graphics.fancy' : 'options.graphics.fast');
    return prefix;
  }

  /** options.txt lines, same keys as the original. */
  private serialize(): string {
    const lines = [
      `music:${this.musicVolume}`,
      `sound:${this.soundVolume}`,
      `invertYMouse:${this.invertMouse}`,
      `mouseSensitivity:${this.mouseSensitivity}`,
      `fov:${this.fovSetting}`,
      `gamma:${this.gammaSetting}`,
      `viewDistance:${this.renderDistance}`,
      `guiScale:${this.guiScale}`,
      `particles:${this.particleSetting}`,
      `bobView:${this.viewBobbing}`,
      `anaglyph3d:${this.anaglyph}`,
      `advancedOpengl:${this.advancedOpengl}`,
      `fpsLimit:${this.limitFramerate}`,
      `difficulty:${this.difficulty}`,
      `fancyGraphics:${this.fancyGraphics}`,
      `ao:${this.ambientOcclusion}`,
      `clouds:${this.clouds}`,
      `skin:${this.skin}`,
      `lastServer:${this.lastServer}`,
      `lang:${this.language}`,
      `chatVisibility:${this.chatVisibility}`,
      `chatColors:${this.chatColours}`,
      `chatLinks:${this.chatLinks}`,
      `chatLinksPrompt:${this.chatLinksPrompt}`,
      `chatOpacity:${this.chatOpacity}`,
      `serverTextures:${this.serverTextures}`,
      `snooperEnabled:${this.snooperEnabled}`,
      `fullscreen:${this.fullScreen}`,
      `enableVsync:${this.enableVsync}`,
      `hideServerAddress:${this.hideServerAddress}`,
      `advancedItemTooltips:${this.advancedItemTooltips}`,
      `pauseOnLostFocus:${this.pauseOnLostFocus}`,
      `showCape:${this.showCape}`,
      `touchscreen:${this.touchscreen}`,
      `overrideHeight:${this.overrideHeight}`,
      `overrideWidth:${this.overrideWidth}`,
      `heldItemTooltips:${this.heldItemTooltips}`,
      `chatHeightFocused:${this.chatHeightFocused}`,
      `chatHeightUnfocused:${this.chatHeightUnfocused}`,
      `chatScale:${this.chatScale}`,
      `chatWidth:${this.chatWidth}`,
      `toggleSprint:${this.toggleSprint}`,
    ];
    for (const k of this.keyBindings) lines.push(`key_${k.keyDescription}:${k.keyCode}`);
    return lines.join('\n');
  }

  loadOptions(): void {
    let text: string | null = null;
    try {
      text = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!text) return;
    const f = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) ? Math.fround(v) : 0;
    };
    const i = (s: string) => parseInt(s, 10) | 0;
    const b = (s: string) => s === 'true';
    for (const line of text.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const k = line.slice(0, idx);
      const v = line.slice(idx + 1);
      switch (k) {
        case 'music': this.musicVolume = f(v); break;
        case 'sound': this.soundVolume = f(v); break;
        case 'mouseSensitivity': this.mouseSensitivity = f(v); break;
        case 'fov': this.fovSetting = f(v); break;
        case 'gamma': this.gammaSetting = f(v); break;
        case 'invertYMouse': this.invertMouse = b(v); break;
        case 'viewDistance': this.renderDistance = i(v) & 3; break;
        case 'guiScale': this.guiScale = i(v) & 3; break;
        case 'particles': this.particleSetting = i(v) % 3; break;
        case 'bobView': this.viewBobbing = b(v); break;
        case 'anaglyph3d': this.anaglyph = b(v); break;
        case 'advancedOpengl': this.advancedOpengl = b(v); break;
        case 'fpsLimit': this.limitFramerate = i(v) % 3; break;
        case 'difficulty': this.difficulty = i(v) & 3; break;
        case 'fancyGraphics': this.fancyGraphics = b(v); break;
        case 'ao': this.ambientOcclusion = v === 'true' ? 2 : v === 'false' ? 0 : i(v) % 3; break;
        case 'clouds': this.clouds = b(v); break;
        case 'skin': this.skin = v; break;
        case 'lastServer': this.lastServer = v; break;
        case 'lang': this.language = v; break;
        case 'chatVisibility': this.chatVisibility = i(v) % 3; break;
        case 'chatColors': this.chatColours = b(v); break;
        case 'chatLinks': this.chatLinks = b(v); break;
        case 'chatLinksPrompt': this.chatLinksPrompt = b(v); break;
        case 'chatOpacity': this.chatOpacity = f(v); break;
        case 'serverTextures': this.serverTextures = b(v); break;
        case 'snooperEnabled': this.snooperEnabled = b(v); break;
        case 'fullscreen': this.fullScreen = b(v); break;
        case 'enableVsync': this.enableVsync = b(v); break;
        case 'hideServerAddress': this.hideServerAddress = b(v); break;
        case 'advancedItemTooltips': this.advancedItemTooltips = b(v); break;
        case 'pauseOnLostFocus': this.pauseOnLostFocus = b(v); break;
        case 'showCape': this.showCape = b(v); break;
        case 'touchscreen': this.touchscreen = b(v); break;
        case 'overrideHeight': this.overrideHeight = i(v); break;
        case 'overrideWidth': this.overrideWidth = i(v); break;
        case 'heldItemTooltips': this.heldItemTooltips = b(v); break;
        case 'chatHeightFocused': this.chatHeightFocused = f(v); break;
        case 'chatHeightUnfocused': this.chatHeightUnfocused = f(v); break;
        case 'chatScale': this.chatScale = f(v); break;
        case 'chatWidth': this.chatWidth = f(v); break;
        case 'toggleSprint': this.toggleSprint = b(v); break;
        default:
          for (const kb of this.keyBindings) if (k === `key_${kb.keyDescription}`) kb.keyCode = i(v);
      }
    }
    KeyBinding.resetKeyBindingArrayAndHash();
  }

  saveOptions(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.serialize());
    } catch {
      /* storage unavailable */
    }
    this.listener?.onSettingsSaved?.();
  }

  shouldRenderClouds(): boolean {
    return this.renderDistance < 2 && this.clouds;
  }
}
