import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { WorldProviderInfo } from './IWorld';

const f = Math.fround;

/** A block position (ChunkCoordinates). */
export interface BlockPos {
  x: number;
  y: number;
  z: number;
}

/**
 * WorldProvider (the overworld's rules are WorldProviderSurface's): the sky, light table and
 * celestial maths of a dimension, and whether players respawn there. WorldProviderHell and
 * WorldProviderEnd override it; `getProviderForDimension` (WorldProviders.ts) makes the one
 * for a dimension id.
 */
export class WorldProvider implements WorldProviderInfo {
  dimensionId = 0;
  isHellWorld = false;
  hasNoSky = false;
  /** 'default' | 'flat' | 'largeBiomes' */
  terrainType = 'default';
  readonly lightBrightnessTable = new Float32Array(16);
  private readonly colorsSunriseSunset = new Float32Array(4);

  constructor() {
    this.registerWorldChunkManager();
    this.generateLightBrightnessTable();
  }

  /** Sets the dimension's flags (the biome source itself lives in the world-generation worker). */
  protected registerWorldChunkManager(): void {}

  protected generateLightBrightnessTable(): void {
    const minLight = 0;
    for (let i = 0; i <= 15; i++) {
      const v = f(1 - i / 15);
      this.lightBrightnessTable[i] = f(((1 - v) / (v * 3 + 1)) * (1 - minLight) + minLight);
    }
  }

  calculateCelestialAngle(worldTime: number, partialTicks: number): number {
    const t = Math.trunc(worldTime) % 24000;
    let a = f(f(f(t + partialTicks) / 24000) - f(0.25));
    if (a < 0) a = f(a + 1);
    if (a > 1) a = f(a - 1);
    const b = f(1 - f((Math.cos(a * Math.PI) + 1) / 2));
    return f(a + f(f(b - a) / 3));
  }

  getMoonPhase(worldTime: number): number {
    return Math.trunc(worldTime / 24000) % 8;
  }

  isSurfaceWorld(): boolean {
    return true;
  }

  /** Sunrise/sunset fog and sky tint (r, g, b, alpha) or null. */
  calcSunriseSunsetColors(celestialAngle: number, _partialTicks: number): Float32Array | null {
    const range = f(0.4);
    const c = MathHelper.cos(f(f(celestialAngle * f(Math.PI)) * 2));
    const centre = -0;
    if (c >= f(centre - range) && c <= f(centre + range)) {
      const t = f(f(f(f(c - centre) / range) * f(0.5)) + f(0.5));
      let a = f(1 - f(f(1 - MathHelper.sin(f(t * f(Math.PI)))) * f(0.99)));
      a = f(a * a);
      this.colorsSunriseSunset[0] = f(f(t * f(0.3)) + f(0.7));
      this.colorsSunriseSunset[1] = f(f(f(t * t) * f(0.7)) + f(0.2));
      this.colorsSunriseSunset[2] = f(f(f(t * t) * 0) + f(0.2));
      this.colorsSunriseSunset[3] = a;
      return this.colorsSunriseSunset;
    }
    return null;
  }

  getFogColor(celestialAngle: number, _partialTicks: number): Vec3 {
    let b = f(f(MathHelper.cos(f(f(celestialAngle * f(Math.PI)) * 2)) * 2) + f(0.5));
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    const r = f(f(0.7529412) * f(f(b * f(0.94)) + f(0.06)));
    const g = f(f(0.84705883) * f(f(b * f(0.94)) + f(0.06)));
    const bl = f(1 * f(f(b * f(0.91)) + f(0.09)));
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

  /** Whether players may respawn (and beds work) here. */
  canRespawnHere(): boolean {
    return true;
  }

  /** canCoordinateBeSpawn: the spawn search's test of a column (grass on top in the overworld). */
  canCoordinateBeSpawn(firstUncoveredBlock: number): boolean {
    return firstUncoveredBlock === 2;
  }

  /** Where entities arrive from another dimension when there is no portal to find (the End's platform). */
  getEntrancePortalLocation(): BlockPos | null {
    return null;
  }

  getDimensionName(): string {
    return 'Overworld';
  }
}
