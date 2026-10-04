import { Vec3 } from '../core/Vec3';
import { WorldProvider } from './WorldProvider';

const f = Math.fround;

/**
 * WorldProviderHell: the Nether (dimension -1). No sky and no sky light, a light table that
 * never drops below 0.1, a fixed dark red fog that shows close by, and the midnight celestial
 * angle (so compasses and clocks spin and the day never comes). Portals scale coordinates by 8.
 */
export class WorldProviderHell extends WorldProvider {
  protected override registerWorldChunkManager(): void {
    this.isHellWorld = true;
    this.hasNoSky = true;
    this.dimensionId = -1;
  }

  protected override generateLightBrightnessTable(): void {
    const minLight = f(0.1);
    for (let i = 0; i <= 15; i++) {
      const v = f(1 - f(i / 15));
      this.lightBrightnessTable[i] = f(f(f(f(1 - v) / f(f(v * 3) + 1)) * f(1 - minLight)) + minLight);
    }
  }

  override getFogColor(_celestialAngle: number, _partialTicks: number): Vec3 {
    return new Vec3(f(0.2), f(0.03), f(0.03));
  }

  override isSurfaceWorld(): boolean {
    return false;
  }

  override canCoordinateBeSpawn(_firstUncoveredBlock: number): boolean {
    return false;
  }

  override calculateCelestialAngle(_worldTime: number, _partialTicks: number): number {
    return 0.5;
  }

  override canRespawnHere(): boolean {
    return false;
  }

  override doesXZShowFog(_x: number, _z: number): boolean {
    return true;
  }

  override getDimensionName(): string {
    return 'Nether';
  }
}
