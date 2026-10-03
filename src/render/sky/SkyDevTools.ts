import type { Minecraft } from '../../client/Minecraft';
import { MathHelper } from '../../core/MathHelper';
import { EntityLightningBolt } from '../../entity/EntityLightningBolt';
import { ItemStack } from '../../item/ItemStack';
import { withClientSkylight } from './ClientWorldView';

/**
 * Sky and weather helpers on `mc.dev.sky` (scripts/scenarios/sky.json). `pin` applies the
 * determinism fixes the reference harness applies before each capture.
 */
export class SkyDevTools {
  constructor(private readonly mc: Minecraft) {}

  /**
   * Freezes the game clock (no ticks, partial tick 0, like the reference harness's `freeze`),
   * optionally sets the time of day, then puts the smoothed per-tick state where the reference
   * captures have it: cloud tick counter 0, no torch flicker, converged fog brightness and
   * vignette. `mc.dev.ticks(n)` still steps a frozen game.
   */
  pin(time?: number): void {
    const mc = this.mc;
    const w = mc.theWorld;
    const p = mc.thePlayer;
    if (!w || !p) return;
    mc.timer.timerSpeed = 0;
    mc.timer.elapsedPartialTicks = 0;
    mc.timer.renderPartialTicks = 0;
    if (time !== undefined) w.worldInfo.worldTime = time;
    mc.renderGlobal.cloudTickCounter = 0;
    const er = mc.entityRenderer;
    er.torchFlickerX = er.torchFlickerDX = er.torchFlickerY = er.torchFlickerDY = 0;
    er.settleFogBrightness();
    er.settleFovModifier();
    er.lightmapUpdateNeeded = true;
    p.renderArmYaw = p.prevRenderArmYaw = p.rotationYaw;
    p.renderArmPitch = p.prevRenderArmPitch = p.rotationPitch;
    const v = 1 - withClientSkylight(w, () => p.getBrightness(1));
    mc.ingameGUI.prevVignetteBrightness = Math.fround(Math.min(1, Math.max(0, v)));
  }

  /** Lets the game clock run again after `pin`. */
  unfreeze(): void {
    this.mc.timer.timerSpeed = 1;
  }

  /** Strikes a lightning bolt at the precipitation height of column (x, z). */
  strike(x: number, z: number): void {
    const w = this.mc.theWorld;
    if (!w) return;
    const y = w.getPrecipitationHeight(MathHelper.floor_double(x), MathHelper.floor_double(z));
    w.addWeatherEffect(new EntityLightningBolt(w, x, y, z));
  }

  /** Sets the biome of every loaded column (e.g. 12 Ice Plains for snow, 2 Desert) and re-meshes. */
  setBiome(id: number): void {
    const w = this.mc.theWorld;
    if (!w) return;
    for (const c of w.getLoadedChunks()) c.biomes.fill(id);
    this.mc.renderGlobal.loadRenderers();
  }

  /** Fills layers y0..y1 within `radius` columns of the player with block `id` (0 clears). */
  fill(id: number, y0: number, y1: number, radius = 40): void {
    const w = this.mc.theWorld;
    const p = this.mc.thePlayer;
    if (!w || !p) return;
    const px = MathHelper.floor_double(p.posX);
    const pz = MathHelper.floor_double(p.posZ);
    for (let x = px - radius; x <= px + radius; x++) {
      for (let z = pz - radius; z <= pz + radius; z++) {
        for (let y = y0; y <= y1; y++) w.setBlock(x, y, z, id, 0, 2);
      }
    }
  }

  /** Puts a block or item in the helmet slot (86 = pumpkin), or empties it. */
  helmet(id: number | null): void {
    const p = this.mc.thePlayer;
    if (p) p.inventory.armorInventory[3] = id === null ? null : new ItemStack(id, 1, 0);
  }
}
