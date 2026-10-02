import { JavaRandom } from '../../core/JavaRandom';
import type { BiomeSource } from './ChunkProviderGenerate';
import { chunkSeedXor, Long64 } from './Long64';

/** What the carvers and structure generators need from the world while a chunk is generated. */
export interface MapGenContext {
  readonly seed: bigint;
  readonly biomeSource: BiomeSource;
}

/**
 * MapGenBase: visits every chunk within `range` (8) of the chunk being generated with a Random
 * seeded from the world seed and that chunk's position, so features that start in one chunk
 * (caves, ravines, structures) are reproduced identically in every chunk they reach.
 */
export abstract class MapGenBase {
  protected range = 8;
  protected readonly rand = new JavaRandom(0n);
  protected ctx!: MapGenContext;
  private seedFor: bigint | null = null;
  private aH = 0;
  private aL = 0;
  private bH = 0;
  private bL = 0;
  private sH = 0;
  private sL = 0;

  /** generate(provider, world, cx, cz, blocks); blocks is null when only structures are being recreated. */
  generate(ctx: MapGenContext, cx: number, cz: number, blocks: Uint8Array | null): void {
    this.ctx = ctx;
    if (this.seedFor !== ctx.seed) {
      this.seedFor = ctx.seed;
      this.rand.setSeed(ctx.seed);
      [this.aH, this.aL] = Long64.split(this.rand.nextLong());
      [this.bH, this.bL] = Long64.split(this.rand.nextLong());
      [this.sH, this.sL] = Long64.split(ctx.seed);
    }
    const r = this.range;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        chunkSeedXor(x, z, this.aH, this.aL, this.bH, this.bL, this.sH, this.sL);
        this.rand.setSeedHiLo(Long64.hi, Long64.lo);
        this.recursiveGenerate(x, z, cx, cz, blocks);
      }
    }
  }

  protected abstract recursiveGenerate(x: number, z: number, cx: number, cz: number, blocks: Uint8Array | null): void;
}
