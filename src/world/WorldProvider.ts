import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { WorldProviderInfo } from './IWorld';

const f = Math.fround;

/** WorldProviderSurface: the overworld's sky, light table and celestial maths. */
export class WorldProvider implements WorldProviderInfo {
  dimensionId = 0;
  isHellWorld = false;
  hasNoSky = false;
  /** 'default' | 'flat' | 'largeBiomes' */
  terrainType = 'default';
  readonly lightBrightnessTable = new Float32Array(16);
  private readonly colorsSunriseSunset = new Float32Array(4);

  constructor() {
    this.generateLightBrightnessTable();
  }

  protected generateLightBrightnessTable(): void {
    const minLight = 0;
    for (let i = 0; i <= 15; i++) {
      const v = f(1 - i / 15);
      this.lightBrightnessTable[i] = f(((1 - v) / (v * 3 + 1)) * (1 - minLight) + minLight);
    }
  }

  calculateCelestialAngle(worldTime: number, partialTicks: number): number {
    const t = Math.trunc(worldTime) % 24000;
    let a = f((t + partialTicks) / 24000 - 0.25);
    if (a < 0) a++;
    if (a > 1) a--;
    const b = f(1 - f((Math.cos(a * Math.PI) + 1) / 2));
    return f(a + (b - a) / 3);
  }

  getMoonPhase(worldTime: number): number {
    return Math.trunc(worldTime / 24000) % 8;
  }

  isSurfaceWorld(): boolean {
    return true;
  }

  /** Sunrise/sunset fog and sky tint (r, g, b, alpha) or null. */
  calcSunriseSunsetColors(celestialAngle: number, _partialTicks: number): Float32Array | null {
    const range = 0.4;
    const c = MathHelper.cos(f(celestialAngle * f(Math.PI) * 2)) - 0;
    const centre = -0;
    if (c >= centre - range && c <= centre + range) {
      const t = f(((c - centre) / range) * 0.5 + 0.5);
      let a = f(1 - f((1 - MathHelper.sin(f(t * f(Math.PI)))) * 0.99));
      a = f(a * a);
      this.colorsSunriseSunset[0] = t * 0.3 + 0.7;
      this.colorsSunriseSunset[1] = t * t * 0.7 + 0.2;
      this.colorsSunriseSunset[2] = t * t * 0 + 0.2;
      this.colorsSunriseSunset[3] = a;
      return this.colorsSunriseSunset;
    }
    return null;
  }

  getFogColor(celestialAngle: number, _partialTicks: number): Vec3 {
    let b = f(MathHelper.cos(f(celestialAngle * f(Math.PI) * 2)) * 2 + 0.5);
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    const r = f(f(0.7529412) * f(b * 0.94 + 0.06));
    const g = f(f(0.84705883) * f(b * 0.94 + 0.06));
    const bl = f(1 * f(b * 0.91 + 0.09));
    return new Vec3(r, g, bl);
  }

  getCloudHeight(): number {
    return 128;
  }

  isSkyColored(): boolean {
    return true;
  }

  getAverageGroundLevel(): number {
    return this.terrainType === 'flat' ? 4 : 64;
  }

  getWorldHasVoidParticles(): boolean {
    return this.terrainType !== 'flat' && !this.hasNoSky;
  }

  getVoidFogYFactor(): number {
    return this.terrainType === 'flat' ? 1 : 0.03125;
  }

  doesXZShowFog(_x: number, _z: number): boolean {
    return false;
  }

  getDimensionName(): string {
    return 'Overworld';
  }
}
