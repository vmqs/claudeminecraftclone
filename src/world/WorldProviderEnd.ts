import { Block } from '../block/Block';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import { type BlockPos, WorldProvider } from './WorldProvider';

const f = Math.fround;

/**
 * WorldProviderEnd: The End (dimension 1). No sky light, a fixed celestial angle of 0, the
 * tunnel-textured sky box (RenderGlobal.renderSky), a dark purple fog that shows close by, and
 * the entrance platform at (100, 50, 0) where every traveller from the overworld arrives.
 */
export class WorldProviderEnd extends WorldProvider {
  protected override registerWorldChunkManager(): void {
    this.dimensionId = 1;
    this.hasNoSky = true;
  }

  override calculateCelestialAngle(_worldTime: number, _partialTicks: number): number {
    return 0;
  }

  override calcSunriseSunsetColors(_celestialAngle: number, _partialTicks: number): Float32Array | null {
    return null;
  }

  override getFogColor(celestialAngle: number, _partialTicks: number): Vec3 {
    const color = 0xa080a0;
    let b = f(f(MathHelper.cos(f(f(celestialAngle * f(Math.PI)) * 2)) * 2) + f(0.5));
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    const k = f(f(b * 0) + f(0.15));
    const r = f(f(((color >> 16) & 255) / 255) * k);
    const g = f(f(((color >> 8) & 255) / 255) * k);
    const bl = f(f((color & 255) / 255) * k);
    return new Vec3(r, g, bl);
  }

  override isSkyColored(): boolean {
    return false;
  }

  override canRespawnHere(): boolean {
    return false;
  }

  override isSurfaceWorld(): boolean {
    return false;
  }

  override getCloudHeight(): number {
    return 8;
  }

  /** A column whose top block blocks movement. */
  override canCoordinateBeSpawn(firstUncoveredBlock: number): boolean {
    if (firstUncoveredBlock === 0) return false;
    return Block.blocksList[firstUncoveredBlock]?.blockMaterial.blocksMovement() ?? false;
  }

  override getEntrancePortalLocation(): BlockPos {
    return { x: 100, y: 50, z: 0 };
  }

  override getAverageGroundLevel(): number {
    return 50;
  }

  override doesXZShowFog(_x: number, _z: number): boolean {
    return true;
  }

  override getDimensionName(): string {
    return 'The End';
  }
}
