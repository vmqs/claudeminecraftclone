import { TileEntity } from './TileEntity';

/** Updates the sensor's block metadata from the sky light (BlockDaylightDetector.updateLightLevel). */
interface LightLevelUpdater {
  updateLightLevel(w: NonNullable<TileEntity['worldObj']>, x: number, y: number, z: number): void;
}

/** A daylight sensor (TileEntityDaylightDetector, "DLDetector"): re-reads the light every 20 ticks. */
export class TileEntityDaylightDetector extends TileEntity {
  override updateEntity(): void {
    const w = this.worldObj;
    if (w && !w.isRemote && w.getTotalWorldTime() % 20 === 0) {
      this.blockType = this.getBlockType();
      const b = this.blockType as unknown as Partial<LightLevelUpdater> | null;
      b?.updateLightLevel?.(w, this.xCoord, this.yCoord, this.zCoord);
    }
  }
}
