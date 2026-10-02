/**
 * A wooden door of a village (VillageDoorInfo): its position, which side is "inside" (towards
 * fewer sky-lit blocks), when a villager last passed near it, and how often villagers were
 * kept from opening it at night.
 */
export class VillageDoorInfo {
  isDetachedFromVillageFlag = false;
  private doorOpeningRestrictionCounter = 0;

  constructor(
    readonly posX: number,
    readonly posY: number,
    readonly posZ: number,
    readonly insideDirectionX: number,
    readonly insideDirectionZ: number,
    public lastActivityTimestamp: number,
  ) {}

  getDistanceSquared(x: number, y: number, z: number): number {
    const dx = x - this.posX;
    const dy = y - this.posY;
    const dz = z - this.posZ;
    return dx * dx + dy * dy + dz * dz;
  }

  getInsideDistanceSquare(x: number, y: number, z: number): number {
    const dx = x - this.posX - this.insideDirectionX;
    const dy = y - this.posY;
    const dz = z - this.posZ - this.insideDirectionZ;
    return dx * dx + dy * dy + dz * dz;
  }

  getInsidePosX(): number {
    return this.posX + this.insideDirectionX;
  }

  getInsidePosY(): number {
    return this.posY;
  }

  getInsidePosZ(): number {
    return this.posZ + this.insideDirectionZ;
  }

  isInside(x: number, z: number): boolean {
    return (x - this.posX) * this.insideDirectionX + (z - this.posZ) * this.insideDirectionZ >= 0;
  }

  resetDoorOpeningRestrictionCounter(): void {
    this.doorOpeningRestrictionCounter = 0;
  }

  incrementDoorOpeningRestrictionCounter(): void {
    this.doorOpeningRestrictionCounter++;
  }

  getDoorOpeningRestrictionCounter(): number {
    return this.doorOpeningRestrictionCounter;
  }
}
