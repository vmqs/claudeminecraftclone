import { Block } from '../block/Block';

/**
 * A 16x16x16 slice of a chunk (ExtendedBlockStorage). Arrays are indexed
 * `y << 8 | z << 4 | x` with one byte per value (ids are 0-255 in 1.5.2 vanilla).
 */
export class ChunkSection {
  readonly blocks: Uint8Array;
  readonly meta: Uint8Array;
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  /** Number of non-air blocks. */
  nonAirCount = 0;
  /** Number of blocks that want random ticks. */
  tickRefCount = 0;

  constructor(
    readonly yBase: number,
    data?: { blocks: Uint8Array; meta: Uint8Array; skyLight: Uint8Array; blockLight: Uint8Array },
  ) {
    if (data) {
      this.blocks = data.blocks;
      this.meta = data.meta;
      this.skyLight = data.skyLight;
      this.blockLight = data.blockLight;
      this.recount();
    } else {
      this.blocks = new Uint8Array(4096);
      this.meta = new Uint8Array(4096);
      this.skyLight = new Uint8Array(4096);
      this.blockLight = new Uint8Array(4096);
    }
  }

  getExtBlockID(x: number, y: number, z: number): number {
    return this.blocks[(y << 8) | (z << 4) | x];
  }

  setExtBlockID(x: number, y: number, z: number, id: number): void {
    const i = (y << 8) | (z << 4) | x;
    const old = this.blocks[i];
    const oldTicks = old !== 0 && (Block.blocksList[old]?.getTickRandomly() ?? false);
    const newTicks = id !== 0 && (Block.blocksList[id]?.getTickRandomly() ?? false);
    if (old === 0 && id !== 0) this.nonAirCount++;
    else if (old !== 0 && id === 0) this.nonAirCount--;
    if (oldTicks && !newTicks) this.tickRefCount--;
    else if (!oldTicks && newTicks) this.tickRefCount++;
    this.blocks[i] = id;
  }

  getExtBlockMetadata(x: number, y: number, z: number): number {
    return this.meta[(y << 8) | (z << 4) | x];
  }

  setExtBlockMetadata(x: number, y: number, z: number, m: number): void {
    this.meta[(y << 8) | (z << 4) | x] = m & 15;
  }

  getExtSkylightValue(x: number, y: number, z: number): number {
    return this.skyLight[(y << 8) | (z << 4) | x];
  }

  setExtSkylightValue(x: number, y: number, z: number, v: number): void {
    this.skyLight[(y << 8) | (z << 4) | x] = v;
  }

  getExtBlocklightValue(x: number, y: number, z: number): number {
    return this.blockLight[(y << 8) | (z << 4) | x];
  }

  setExtBlocklightValue(x: number, y: number, z: number, v: number): void {
    this.blockLight[(y << 8) | (z << 4) | x] = v;
  }

  isEmpty(): boolean {
    return this.nonAirCount === 0;
  }

  getNeedsRandomTick(): boolean {
    return this.tickRefCount > 0;
  }

  getYLocation(): number {
    return this.yBase;
  }

  /** removeInvalidBlocks: recounts and clears ids without a registered block. */
  recount(): void {
    this.nonAirCount = 0;
    this.tickRefCount = 0;
    const b = this.blocks;
    for (let i = 0; i < 4096; i++) {
      const id = b[i];
      if (id === 0) continue;
      const block = Block.blocksList[id];
      if (!block) {
        b[i] = 0;
        continue;
      }
      this.nonAirCount++;
      if (block.getTickRandomly()) this.tickRefCount++;
    }
  }
}
