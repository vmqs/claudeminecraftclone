import { Block } from '../block/Block';
import type { Entity } from '../entity/Entity';
import { DamageSource, EntityDamageSource } from '../entity/DamageSource';
import { EntityList } from '../entity/EntityList';
import { GuiCreateWorld } from '../gui/GuiCreateWorld';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { SkyDevTools } from '../render/sky/SkyDevTools';
import { SurvivalDevTools } from './SurvivalDevTools';
import { type WeatherKind, WeatherCycle } from '../world/WeatherCycle';
import { Keyboard, Mouse } from './Keyboard';
import type { Minecraft } from './Minecraft';
import { openScreenByName } from '../gui/GuiDebugScreens';
import { PlayerDevTools } from './PlayerDevTools';
import { NetDevTools } from './NetDevTools';
import { AccountDevTools } from './AccountDevTools';
import { ControlsDevTools } from './ControlsDevTools';
import { SaveDevTools } from './SaveDevTools';
import { PerfDevTools } from './PerfDevTools';
import { StatsDevTools } from '../stats/StatsDevTools';
import { EndDevTools } from './EndDevTools';

/** The hotbar of the reference captures: stone, grass, dirt, cobble, planks, log, glass, torch, diamond sword. */
const DEV_HOTBAR = [1, 2, 3, 4, 5, 17, 20, 50, 276];

/** Helpers exposed on `window.mc.dev` for automation (scripts/shot.mjs) and debugging. */
export class DevTools {
  /** Sky and weather helpers (pin, strike, setBiome, fill, helmet). */
  readonly sky: SkyDevTools;
  /** Survival helpers (state, damage, hunger, mining, armour). */
  readonly survival: SurvivalDevTools;
  /** Player helpers (armour, item use, effects, beds, other players). */
  readonly player: PlayerDevTools;
  /** Multiplayer helpers (host, join, state, chat). */
  readonly net: NetDevTools;
  /** Account helpers (skin upload, test skins, state). */
  readonly account: AccountDevTools;
  /** Key bindings, sprint/zoom state, the Controls screen and texture pack imports. */
  readonly controls: ControlsDevTools;
  /** World saving (src/client/SaveDevTools.ts). */
  readonly saves: SaveDevTools;
  /** Performance helpers (frame budget, queues, first meshes, idle tasks). */
  readonly perf: PerfDevTools;
  /** Statistics and achievements (value, add, set, state, hint, pinClock, reset). */
  readonly stats: StatsDevTools;
  /** The End and the bosses (dragon, crystals, exit portal and credits, Wither, portal frames). */
  readonly end: EndDevTools;

  constructor(private readonly mc: Minecraft) {
    this.sky = new SkyDevTools(mc);
    this.survival = new SurvivalDevTools(mc);
    this.player = new PlayerDevTools(mc);
    this.net = new NetDevTools(mc);
    this.account = new AccountDevTools(mc);
    this.controls = new ControlsDevTools(mc);
    this.saves = new SaveDevTools(mc);
    this.perf = new PerfDevTools(mc);
    this.stats = new StatsDevTools(mc);
    this.end = new EndDevTools(mc);
  }

  /** True once the player stands in a loaded, meshed area with no screen open. */
  isInGame(): boolean {
    const mc = this.mc;
    return !!mc.theWorld && !!mc.thePlayer && mc.currentScreen === null && !mc.loadingScreen.active;
  }

  /** Sections still waiting for a mesh within `radius` chunks of the player. */
  pendingSections(radius = 2): number {
    const p = this.mc.thePlayer;
    return p ? this.mc.renderGlobal.pendingNear(p, radius) : -1;
  }

  /** Teleports the player (feet position) and sets the view. */
  tp(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    p.setLocationAndAngles(x, y, z, yaw ?? p.rotationYaw, pitch ?? p.rotationPitch);
    p.prevRotationYaw = p.rotationYaw;
    p.prevRotationPitch = p.rotationPitch;
    p.motionX = p.motionY = p.motionZ = 0;
  }

  look(yaw: number, pitch: number): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    p.rotationYaw = p.prevRotationYaw = yaw;
    p.rotationPitch = p.prevRotationPitch = pitch;
  }

  setTime(t: number): void {
    const w = this.mc.theWorld;
    if (w) w.worldInfo.worldTime = t;
  }

  /** Sets the weather like /weather; unless `ramp`, the 100-tick fades are skipped. */
  weather(kind: WeatherKind, ramp = false): void {
    const w = this.mc.theWorld;
    if (!w) return;
    WeatherCycle.setWeather(w, kind, 1000000);
    if (!ramp) w.clientWeather.skipTransition();
  }

  select(slot: number): void {
    if (this.mc.thePlayer) this.mc.thePlayer.inventory.currentItem = slot;
  }

  fillHotbar(ids: number[] = DEV_HOTBAR): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    ids.forEach((id, i) => {
      if (i < 9 && (Item.itemsList[id] || Block.blocksList[id])) p.inventory.mainInventory[i] = new ItemStack(id, 1, 0);
    });
  }

  /** Puts `count` of item `id` with damage `damage` in inventory slot `slot` (0-8 hotbar, 9-35 main). */
  setStack(slot: number, id: number, count = 1, damage = 0): void {
    const p = this.mc.thePlayer;
    if (p && (Item.itemsList[id] || id === 0)) p.inventory.mainInventory[slot] = id === 0 ? null : new ItemStack(id, count, damage);
  }

  /** Fills the hotbar from [id, damage?] pairs (fillHotbar with damage values). */
  hotbar(stacks: (number | [number, number])[]): void {
    stacks.forEach((s, i) => {
      if (i < 9) this.setStack(i, typeof s === 'number' ? s : s[0], 1, typeof s === 'number' ? 0 : s[1]);
    });
  }

  setFlying(on: boolean): void {
    const p = this.mc.thePlayer;
    if (p) p.capabilities.isFlying = on;
  }

  /** Runs `n` game ticks immediately (no rendering). */
  ticks(n: number): void {
    for (let i = 0; i < n; i++) this.mc.runTick();
  }

  /** Simulates a key press (LWJGL code) as the next tick will see it. */
  key(code: number, down = true, char = '\0'): void {
    Keyboard.push({ key: code, state: down, char, repeat: false });
  }

  /** Holds a key for `hold` ticks, then releases it and runs one more tick. */
  press(code: number, hold = 1): void {
    this.key(code, true);
    this.ticks(hold);
    this.key(code, false);
    this.ticks(1);
  }

  /** Clicks a mouse button over `hold` ticks (0 left, 1 right, 2 middle). */
  click(button: number, hold = 1): void {
    this.mouse(button, true);
    this.ticks(hold);
    this.mouse(button, false);
    this.ticks(1);
  }

  /** Simulates a mouse button (0 left, 1 right, 2 middle). */
  mouse(button: number, down: boolean): void {
    Mouse.push({ button, state: down, dWheel: 0, x: Mouse.x, y: Mouse.y });
  }

  /**
   * Creates an entity by its EntityList name (or the dev label 'Egg' / 'FishHook'), passing the world and then `args` to the class
   * constructor (e.g. newEntity('Arrow', mc.thePlayer, 2) is a fully drawn bow shot). The
   * player can be passed as the string '@p'. Not spawned yet.
   */
  newEntity(name: string, ...args: unknown[]): Entity | null {
    const w = this.mc.theWorld;
    const cls = EntityList.getClassForDebug(name) as (new (...a: unknown[]) => Entity) | null;
    if (!w || !cls) return null;
    return new cls(w, ...args.map((a) => (a === '@p' ? this.mc.thePlayer : a)));
  }

  /** newEntity + World.spawnEntityInWorld; returns the entity (or null). */
  spawn(name: string, ...args: unknown[]): Entity | null {
    const e = this.newEntity(name, ...args);
    if (e) this.mc.theWorld!.spawnEntityInWorld(e);
    return e;
  }

  /** Registries for scenario scripts (Block, Item, ItemStack, EntityList, damage sources). */
  get lib(): {
    Block: typeof Block;
    Item: typeof Item;
    ItemStack: typeof ItemStack;
    EntityList: typeof EntityList;
    DamageSource: typeof DamageSource;
    EntityDamageSource: typeof EntityDamageSource;
  } {
    return { Block, Item, ItemStack, EntityList, DamageSource, EntityDamageSource };
  }

  /** Loaded entities, optionally only those with an EntityList name. */
  entities(name?: string): Entity[] {
    const list = this.mc.theWorld?.loadedEntityList ?? [];
    return name === undefined ? [...list] : list.filter((e) => EntityList.getDebugName(e) === name);
  }

  /** Block id under the crosshair, or -1. */
  target(): number {
    const m = this.mc.objectMouseOver;
    if (!m || !this.mc.theWorld) return -1;
    return this.mc.theWorld.getBlockId(m.blockX, m.blockY, m.blockZ);
  }

  /** Opens a screen by name (src/gui/GuiDebugScreens.ts); false for an unknown name. */
  screen(name: string): boolean {
    return openScreenByName(this.mc, name);
  }
}

/**
 * URL hooks: ?dev=1 exposes window.mc; ?autostart=1&seed=&type= creates a world directly
 * (&structures=0, &bonus=1 and &preset=<superflat string> as on the More World Options page);
 * ?hotbar=1 fills the hotbar; ?time= sets the world time; ?pos=x,y,z[,yaw,pitch] teleports
 * (feet position); ?fly=1 starts flying; ?mode=survival|hardcore|adventure picks the game mode;
 * ?mobs=0 turns natural mob spawning off.
 */
export function installDevHooks(mc: Minecraft, params: URLSearchParams): void {
  const dev = new DevTools(mc);
  if (params.has('dev')) (window as unknown as { mc: Minecraft & { dev: DevTools } }).mc = Object.assign(mc, { dev });
  if (!params.has('autostart')) return;
  const seed = GuiCreateWorld.parseSeed(params.get('seed') ?? '') ?? undefined;
  const type = params.get('type') ?? 'default';
  // ?mode=survival|hardcore|adventure|creative (Creative when absent, like the earlier dev worlds).
  const mode = params.get('mode') ?? 'creative';
  const gameType = mode === 'creative' ? 1 : mode === 'adventure' ? 2 : 0;
  mc.launchIntegratedServer('dev', 'New World', {
    seed,
    terrainType: type,
    mapFeatures: params.get('structures') !== '0',
    generatorOptions: params.get('preset') ?? undefined,
    bonusChest: params.get('bonus') === '1',
    gameType,
    hardcore: mode === 'hardcore',
    allowCommands: mode !== 'hardcore',
    dimension: Number(params.get('dim') ?? 0) || undefined,
  });
  let applied = false;
  mc.frameListeners.push(() => {
    if (applied || !mc.thePlayer || !mc.theWorld) return;
    applied = true;
    if (params.has('hotbar')) dev.fillHotbar();
    const time = params.get('time');
    if (time !== null) dev.setTime(Number(time));
    const pos = params.get('pos');
    if (pos) {
      const v = pos.split(',').map(Number);
      dev.tp(v[0], v[1], v[2], v[3], v[4]);
    }
    if (params.get('fly') === '1') dev.setFlying(true);
    // ?mobs=0: no natural spawning (gamerule doMobSpawning false) and the mobs of the first
    // ticks removed, for captures that must not be pushed or attacked while chunks load.
    if (params.get('mobs') === '0') {
      const w = mc.theWorld;
      w.worldInfo.gameRules.doMobSpawning = false;
      for (const e of w.loadedEntityList) if (e.isLivingEntity && !e.isPlayerEntity) e.setDead();
    }
  });
}
