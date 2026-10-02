import { Block } from '../block/Block';
import { GuiCreateWorld } from '../gui/GuiCreateWorld';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { Keyboard, Mouse } from './Keyboard';
import type { Minecraft } from './Minecraft';

/** The hotbar of the reference captures: stone, grass, dirt, cobble, planks, log, glass, torch, diamond sword. */
const DEV_HOTBAR = [1, 2, 3, 4, 5, 17, 20, 50, 276];

/** Helpers exposed on `window.mc.dev` for automation (scripts/shot.mjs) and debugging. */
export class DevTools {
  constructor(private readonly mc: Minecraft) {}

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

  /** Block id under the crosshair, or -1. */
  target(): number {
    const m = this.mc.objectMouseOver;
    if (!m || !this.mc.theWorld) return -1;
    return this.mc.theWorld.getBlockId(m.blockX, m.blockY, m.blockZ);
  }
}

/**
 * URL hooks: ?dev=1 exposes window.mc; ?autostart=1&seed=&type= creates a world directly
 * (&structures=0, &bonus=1 and &preset=<superflat string> as on the More World Options page);
 * ?hotbar=1 fills the hotbar; ?time= sets the world time; ?pos=x,y,z[,yaw,pitch] teleports
 * (feet position); ?fly=1 starts flying.
 */
export function installDevHooks(mc: Minecraft, params: URLSearchParams): void {
  const dev = new DevTools(mc);
  if (params.has('dev')) (window as unknown as { mc: Minecraft & { dev: DevTools } }).mc = Object.assign(mc, { dev });
  if (!params.has('autostart')) return;
  const seed = GuiCreateWorld.parseSeed(params.get('seed') ?? '') ?? undefined;
  const type = params.get('type') ?? 'default';
  mc.launchIntegratedServer('dev', 'New World', {
    seed,
    terrainType: type,
    mapFeatures: params.get('structures') !== '0',
    generatorOptions: params.get('preset') ?? undefined,
    bonusChest: params.get('bonus') === '1',
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
  });
}
