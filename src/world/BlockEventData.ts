/** A queued block event (BlockEventData): chest lids, note blocks, pistons. */
export class BlockEventData {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly blockID: number,
    readonly eventID: number,
    readonly eventParameter: number,
  ) {}

  equals(o: BlockEventData): boolean {
    return this.x === o.x && this.y === o.y && this.z === o.z && this.eventID === o.eventID && this.eventParameter === o.eventParameter && this.blockID === o.blockID;
  }
}
