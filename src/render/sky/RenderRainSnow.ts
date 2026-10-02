import { Block } from '../../block/Block';
import { Material } from '../../block/Material';
import type { Minecraft } from '../../client/Minecraft';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { RenderGlobal } from '../RenderGlobal';

const f = Math.fround;

/** Columns with a precipitation height within this many blocks of the viewer get splashes. */
const SPLASH_RANGE = 10;

/**
 * Falling rain and snow around the viewer (EntityRenderer.renderRainSnow) and the splashes and
 * rain sounds of EntityRenderer.addRainParticles. Both read the client's rain strength.
 *
 * Each column within 5 blocks (10 with Fancy graphics) whose biome has rain or snow gets one
 * camera-facing quad from the precipitation height (or the viewer's feet minus the radius) up
 * to the viewer plus the radius. Rain scrolls down environment/rain.png at a per-column speed;
 * snow drifts environment/snow.png slowly with a per-column random offset.
 */
export class RenderRainSnow {
  private rainXCoords: Float32Array | null = null;
  private rainYCoords: Float32Array | null = null;
  private readonly random = new JavaRandom();
  private rainSoundCounter = 0;

  constructor(private readonly mc: Minecraft) {}

  /** EntityRenderer.addRainParticles: once per tick, splashes (or lava smoke) and the rain sound. */
  addRainParticles(rendererUpdateCount: number): void {
    const w = this.mc.theWorld;
    const view = this.mc.renderViewEntity;
    if (!w || !view) return;
    let strength = w.clientWeather.getRainStrength(1);
    if (!this.mc.gameSettings.fancyGraphics) strength = f(strength / 2);
    if (strength === 0) return;
    const rand = this.random;
    rand.setSeed(BigInt(rendererUpdateCount) * 312987231n);
    const px = MathHelper.floor_double(view.posX);
    const py = MathHelper.floor_double(view.posY);
    const pz = MathHelper.floor_double(view.posZ);
    let soundX = 0;
    let soundY = 0;
    let soundZ = 0;
    let splashes = 0;
    let count = Math.trunc(f(f(100 * strength) * strength));
    const particles = this.mc.gameSettings.particleSetting;
    if (particles === 1) count >>= 1;
    else if (particles === 2) count = 0;
    const rainFx = RenderGlobal.particleFactories.get('rain');
    const smokeFx = RenderGlobal.particleFactories.get('smoke');
    for (let i = 0; i < count; i++) {
      const x = px + rand.nextInt(SPLASH_RANGE) - rand.nextInt(SPLASH_RANGE);
      const z = pz + rand.nextInt(SPLASH_RANGE) - rand.nextInt(SPLASH_RANGE);
      const y = w.getPrecipitationHeight(x, z);
      const id = w.getBlockId(x, y - 1, z);
      const biome = w.getBiomeGenForCoords(x, z);
      if (y > py + SPLASH_RANGE || y < py - SPLASH_RANGE || !biome.canSpawnLightningBolt() || biome.getFloatTemperature() < 0.2) continue;
      const ox = rand.nextFloat();
      const oz = rand.nextFloat();
      const block = id > 0 ? Block.blocksList[id] : null;
      if (!block) continue;
      const fx = f(x + ox);
      const fy = f(y + f(0.1)) - block.getBlockBoundsMinY();
      const fz = f(z + oz);
      if (block.blockMaterial === Material.lava) {
        const smoke = smokeFx?.(w, fx, fy, fz, 0, 0, 0);
        if (smoke) this.mc.effectRenderer.addEffect(smoke);
      } else {
        if (rand.nextInt(++splashes) === 0) {
          soundX = fx;
          soundY = fy;
          soundZ = fz;
        }
        const rain = rainFx?.(w, fx, fy, fz, 0, 0, 0);
        if (rain) this.mc.effectRenderer.addEffect(rain);
      }
    }
    if (splashes > 0 && rand.nextInt(3) < this.rainSoundCounter++) {
      this.rainSoundCounter = 0;
      const covered = soundY > view.posY + 1 && w.getPrecipitationHeight(MathHelper.floor_double(view.posX), MathHelper.floor_double(view.posZ)) > MathHelper.floor_double(view.posY);
      if (covered) w.playSound(soundX, soundY, soundZ, 'ambient.weather.rain', f(0.1), f(0.5), false);
      else w.playSound(soundX, soundY, soundZ, 'ambient.weather.rain', f(0.2), 1, false);
    }
  }

  /** EntityRenderer.renderRainSnow, drawn after the translucent terrain, fogged and lightmapped. */
  render(pt: number, rendererUpdateCount: number, enableLightmap: () => void, disableLightmap: () => void): void {
    const w = this.mc.theWorld;
    const view = this.mc.renderViewEntity;
    if (!w || !view) return;
    const strength = w.clientWeather.getRainStrength(pt);
    if (strength <= 0) return;
    enableLightmap();
    if (!this.rainXCoords || !this.rainYCoords) {
      // Unit vectors perpendicular to the direction from the viewer's column to each column
      // of a 32x32 neighbourhood, so every quad faces the viewer.
      this.rainXCoords = new Float32Array(1024);
      this.rainYCoords = new Float32Array(1024);
      for (let dz = 0; dz < 32; dz++) {
        for (let dx = 0; dx < 32; dx++) {
          const a = dx - 16;
          const b = dz - 16;
          const len = MathHelper.sqrt_float(a * a + b * b);
          this.rainXCoords[(dz << 5) | dx] = f(-b / len);
          this.rainYCoords[(dz << 5) | dx] = f(a / len);
        }
      }
    }
    const xs = this.rainXCoords;
    const zs = this.rainYCoords;
    const vx = MathHelper.floor_double(view.posX);
    const vy = MathHelper.floor_double(view.posY);
    const vz = MathHelper.floor_double(view.posZ);
    const t = Tessellator.instance;
    GL.disable(GL.CULL_FACE);
    GL.normal(0, 1, 0);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.alphaFunc(GL.GREATER, f(0.01));
    const engine = this.mc.renderEngine;
    engine.bindTexture('/environment/snow.png');
    const camX = view.lastTickPosX + (view.posX - view.lastTickPosX) * pt;
    const camY = view.lastTickPosY + (view.posY - view.lastTickPosY) * pt;
    const camZ = view.lastTickPosZ + (view.posZ - view.lastTickPosZ) * pt;
    const camFloorY = MathHelper.floor_double(camY);
    const radius = this.mc.gameSettings.fancyGraphics ? 10 : 5;
    const ticks = f(rendererUpdateCount + pt);
    GL.color(1, 1, 1, 1);
    const rand = this.random;
    /** -1 nothing drawn yet, 0 rain quads open, 1 snow quads open. */
    let drawing = -1;
    for (let z = vz - radius; z <= vz + radius; z++) {
      for (let x = vx - radius; x <= vx + radius; x++) {
        const idx = (z - vz + 16) * 32 + x - vx + 16;
        const ox = f(xs[idx] * f(0.5));
        const oz = f(zs[idx] * f(0.5));
        const biome = w.getBiomeGenForCoords(x, z);
        if (!biome.canSpawnLightningBolt() && !biome.getEnableSnow()) continue;
        const ground = w.getPrecipitationHeight(x, z);
        let y0 = vy - radius;
        let y1 = vy + radius;
        if (y0 < ground) y0 = ground;
        if (y1 < ground) y1 = ground;
        const lightY = ground < camFloorY ? camFloorY : ground;
        if (y0 === y1) continue;
        const colHash = (Math.imul(Math.imul(x, x), 3121) + Math.imul(x, 45238971)) ^ (Math.imul(Math.imul(z, z), 418711) + Math.imul(z, 13761));
        rand.setSeedInt(colHash);
        // WorldChunkManager.getTemperatureAtHeight returns the biome temperature unchanged in 1.5.2.
        const temperature = biome.getFloatTemperature();
        const dx = f(x + f(0.5)) - view.posX;
        const dz = f(z + f(0.5)) - view.posZ;
        const dist = f(MathHelper.sqrt_double(dx * dx + dz * dz) / radius);
        if (temperature >= 0.15) {
          if (drawing !== 0) {
            if (drawing >= 0) t.draw();
            drawing = 0;
            engine.bindTexture('/environment/rain.png');
            t.startDrawingQuads();
          }
          const phase = (rendererUpdateCount + Math.imul(Math.imul(x, x), 3121) + Math.imul(x, 45238971) + Math.imul(Math.imul(z, z), 418711) + Math.imul(z, 13761)) & 31;
          const scroll = f(f(f(phase + pt) / 32) * f(3 + rand.nextFloat()));
          t.setBrightness(w.getLightBrightnessForSkyBlocks(x, lightY, z, 0));
          t.setColorRGBA_F(1, 1, 1, f(f(f(f(1 - f(dist * dist)) * f(0.5)) + f(0.5)) * strength));
          t.setTranslation(-camX, -camY, -camZ);
          const v0 = f(f(y0 / 4) + scroll);
          const v1 = f(f(y1 / 4) + scroll);
          t.addVertexWithUV(f(x - ox) + 0.5, y0, f(z - oz) + 0.5, 0, v0);
          t.addVertexWithUV(f(x + ox) + 0.5, y0, f(z + oz) + 0.5, 1, v0);
          t.addVertexWithUV(f(x + ox) + 0.5, y1, f(z + oz) + 0.5, 1, v1);
          t.addVertexWithUV(f(x - ox) + 0.5, y1, f(z - oz) + 0.5, 0, v1);
          t.setTranslation(0, 0, 0);
        } else {
          if (drawing !== 1) {
            if (drawing >= 0) t.draw();
            drawing = 1;
            engine.bindTexture('/environment/snow.png');
            t.startDrawingQuads();
          }
          const fall = f(f((rendererUpdateCount & 511) + pt) / 512);
          const du = f(rand.nextFloat() + f(f(ticks * f(0.01)) * f(rand.nextGaussian())));
          const dv = f(rand.nextFloat() + f(f(ticks * f(rand.nextGaussian())) * f(0.001)));
          const packed = w.getLightBrightnessForSkyBlocks(x, lightY, z, 0);
          t.setBrightness(Math.trunc((packed * 3 + 15728880) / 4));
          t.setColorRGBA_F(1, 1, 1, f(f(f(f(1 - f(dist * dist)) * f(0.3)) + f(0.5)) * strength));
          t.setTranslation(-camX, -camY, -camZ);
          const v0 = f(f(f(y0 / 4) + fall) + dv);
          const v1 = f(f(f(y1 / 4) + fall) + dv);
          t.addVertexWithUV(f(x - ox) + 0.5, y0, f(z - oz) + 0.5, du, v0);
          t.addVertexWithUV(f(x + ox) + 0.5, y0, f(z + oz) + 0.5, f(1 + du), v0);
          t.addVertexWithUV(f(x + ox) + 0.5, y1, f(z + oz) + 0.5, f(1 + du), v1);
          t.addVertexWithUV(f(x - ox) + 0.5, y1, f(z - oz) + 0.5, du, v1);
          t.setTranslation(0, 0, 0);
        }
      }
    }
    if (drawing >= 0) t.draw();
    GL.enable(GL.CULL_FACE);
    GL.disable(GL.BLEND);
    GL.alphaFunc(GL.GREATER, f(0.1));
    disableLightmap();
  }
}
