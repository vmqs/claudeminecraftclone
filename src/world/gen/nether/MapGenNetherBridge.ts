import type { JavaRandom } from '../../../core/JavaRandom';
import { spawnListEntry, type SpawnListEntry } from '../../biome/SpawnListEntry';
import type { MapGenContext } from '../MapGenBase';
import { MapGenStructure, StructureMap } from '../structure/MapGenStructure';
import { StructureStart } from '../structure/StructureStart';
import { type NetherBridgePiece, NetherBridgeStartPiece } from './NetherBridgePieces';

/**
 * MapGenNetherBridge.spawnList: what spawns inside a fortress's pieces instead of the Hell
 * biome's monsters (blazes, zombie pigmen, skeletons, which turn into wither skeletons in the
 * Nether, and magma cubes).
 */
export const NETHER_BRIDGE_SPAWNS: readonly SpawnListEntry[] = [
  spawnListEntry('Blaze', 10, 2, 3),
  spawnListEntry('PigZombie', 5, 4, 4),
  spawnListEntry('Skeleton', 10, 4, 4),
  spawnListEntry('LavaSlime', 3, 4, 4),
];

/**
 * StructureNetherBridgeStart: the start crossing two blocks into its chunk, then the exits of
 * the queued pieces in random order until none is left; the fortress is then moved to a random
 * height between 48 and 70.
 */
export class StructureNetherBridgeStart extends StructureStart {
  constructor(rand: JavaRandom, cx: number, cz: number) {
    super();
    const start = new NetherBridgeStartPiece(rand, (cx << 4) + 2, (cz << 4) + 2);
    this.components.push(start);
    start.buildComponent(start, this.components, rand);
    const pending: NetherBridgePiece[] = start.pendingChildren;
    while (pending.length > 0) {
      const next = pending.splice(rand.nextInt(pending.length), 1)[0];
      next.buildComponent(start, this.components, rand);
    }
    this.updateBoundingBox();
    this.setRandomHeight(rand, 48, 70);
  }
}

/**
 * MapGenNetherBridge: one fortress at most per 16x16-chunk region, at a random chunk 4-11
 * chunks into it, in a third of the regions. Fortresses do not depend on "Generate Structures"
 * in 1.5.2 (ChunkProviderHell always runs this generator).
 */
export class MapGenNetherBridge extends MapGenStructure {
  readonly spawnList = NETHER_BRIDGE_SPAWNS;
  /** Chunks around which every fortress start has been recorded (for isInFortress). */
  private readonly prepared = new Set<number>();

  protected canSpawnStructureAtCoords(cx: number, cz: number): boolean {
    const rx = cx >> 4;
    const rz = cz >> 4;
    this.rand.setSeed(BigInt(rx ^ (rz << 4)) ^ this.ctx.seed);
    this.rand.nextInt();
    if (this.rand.nextInt(3) !== 0) return false;
    if (cx !== (rx << 4) + 4 + this.rand.nextInt(8)) return false;
    return cz === (rz << 4) + 4 + this.rand.nextInt(8);
  }

  protected getStructureStart(cx: number, cz: number): StructureStart {
    return new StructureNetherBridgeStart(this.rand, cx, cz);
  }

  /**
   * hasStructureAt for a world that did not generate the chunks itself (the main thread's
   * spawner): records the fortress starts within range of (x, z) first, as the server's
   * generator had when it generated or loaded the chunks around.
   */
  isInFortress(ctx: MapGenContext, x: number, y: number, z: number): boolean {
    const k = StructureMap.key(x >> 4, z >> 4);
    if (!this.prepared.has(k)) {
      this.generate(ctx, x >> 4, z >> 4, null);
      this.prepared.add(k);
    }
    return this.hasStructureAt(x, y, z);
  }
}
