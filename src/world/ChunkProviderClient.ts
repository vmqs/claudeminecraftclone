import { MathHelper } from '../core/MathHelper';
import type { ChunkPayload, WorldGenRequest, WorldGenResponse } from '../workers/worldgenProtocol';
import { Chunk } from './Chunk';
import { ChunkSection } from './ChunkSection';
import { World } from './World';

/**
 * The main thread's chunk source: streams finalized chunks from the world-generation worker
 * around the player, unloads far ones and keeps chunks the player changed in memory so they
 * come back as they were left (there is no disk). The F3 name matches the original
 * client-side cache ("MultiplayerChunkCache").
 */
export class ChunkProviderClient {
  private readonly worker: Worker;
  private readonly requested = new Set<number>();
  private readonly incoming: ChunkPayload[] = [];
  /** Unloaded chunks kept in memory (player-modified or holding entities). */
  readonly stored = new Map<number, Chunk>();
  private ready = false;
  private spawnWaiters: ((p: { x: number; y: number; z: number }) => void)[] = [];
  private lastCX = Number.NaN;
  private lastCZ = Number.NaN;
  private lastRadius = -1;
  /** Chunk radius kept loaded around the player. */
  loadRadius = 9;

  constructor(
    readonly world: World,
    seed: bigint,
    worldType: string,
    mapFeatures: boolean,
  ) {
    this.worker = new Worker(new URL('../workers/worldgen.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorldGenResponse>) => this.onMessage(e.data);
    this.worker.onerror = (e) => console.error('[worldgen]', e.message);
    this.post({ type: 'init', seed: seed.toString(), worldType, mapFeatures });
  }

  private post(m: WorldGenRequest): void {
    this.worker.postMessage(m);
  }

  private onMessage(m: WorldGenResponse): void {
    if (m.type === 'ready') this.ready = true;
    else if (m.type === 'spawn') {
      const waiters = this.spawnWaiters;
      this.spawnWaiters = [];
      for (const w of waiters) w({ x: m.x, y: m.y, z: m.z });
    } else if (m.type === 'chunk') this.incoming.push(m);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Asks the generator for the world spawn (WorldServer.createSpawnPosition). */
  findSpawn(): Promise<{ x: number; y: number; z: number }> {
    return new Promise((resolve) => {
      this.spawnWaiters.push(resolve);
      this.post({ type: 'findSpawn' });
    });
  }

  /** Requests missing chunks around (x, z), cancels and unloads far ones. Called every tick. */
  updateLoadedArea(x: number, z: number): void {
    const cx = MathHelper.floor_double(x) >> 4;
    const cz = MathHelper.floor_double(z) >> 4;
    const r = this.loadRadius;
    // Also when the render distance changed while standing still.
    if (cx !== this.lastCX || cz !== this.lastCZ || r !== this.lastRadius) {
      this.lastCX = cx;
      this.lastCZ = cz;
      this.lastRadius = r;
      this.post({ type: 'player', cx, cz, radius: r });
      for (const k of this.requested) {
        const [kx, kz] = ChunkProviderClient.unkey(k);
        if (Math.abs(kx - cx) > r + 1 || Math.abs(kz - cz) > r + 1) {
          this.requested.delete(k);
          this.post({ type: 'cancel', cx: kx, cz: kz });
        }
      }
      const drop: Chunk[] = [];
      for (const c of this.world.getLoadedChunks()) {
        if (Math.abs(c.xPosition - cx) > r + 2 || Math.abs(c.zPosition - cz) > r + 2) drop.push(c);
      }
      for (const c of drop) this.unloadChunk(c.xPosition, c.zPosition);
    }
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const kx = cx + dx;
        const kz = cz + dz;
        if (this.world.chunkExists(kx, kz)) continue;
        const k = World.chunkKey(kx, kz);
        const kept = this.stored.get(k);
        if (kept) {
          this.stored.delete(k);
          this.world.addChunk(kept);
          continue;
        }
        if (this.requested.has(k)) continue;
        this.requested.add(k);
        this.post({ type: 'request', cx: kx, cz: kz });
      }
    }
  }

  /** Adds chunks that arrived from the worker, within a time budget (milliseconds). */
  processIncoming(budgetMs: number): number {
    const t0 = performance.now();
    let n = 0;
    while (this.incoming.length > 0) {
      const m = this.incoming.shift()!;
      const k = World.chunkKey(m.cx, m.cz);
      if (!this.requested.delete(k) || this.world.chunkExists(m.cx, m.cz)) continue;
      this.world.addChunk(this.makeChunk(m));
      n++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return n;
  }

  private makeChunk(m: ChunkPayload): Chunk {
    const c = new Chunk(this.world, m.cx, m.cz);
    for (const s of m.sections) {
      c.sections[s.y >> 4] = new ChunkSection(s.y, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
    }
    c.heightMap.set(m.heightMap);
    let min = 2147483647;
    for (let i = 0; i < 256; i++) if (c.heightMap[i] < min) min = c.heightMap[i];
    c.heightMapMinimum = min;
    c.biomes.set(m.biomes);
    c.pendingTicks = m.pendingTicks;
    c.isModified = false;
    c.playerModified = false;
    return c;
  }

  unloadChunk(cx: number, cz: number): void {
    const c = this.world.removeChunk(cx, cz);
    if (!c) return;
    // Generation is deterministic: only chunks changed by players (not by the world's own
    // ticking: leaf decay, grass, fluids settling) or holding entities need to be kept.
    const hasEntities = c.entityLists.some((l) => l.some((e) => !e.isPlayerEntity));
    if (c.playerModified || hasEntities) this.stored.set(World.chunkKey(cx, cz), c);
  }

  /** Whether every chunk within `radius` of the block position is present. */
  areaLoaded(x: number, z: number, radius: number): boolean {
    const cx = MathHelper.floor_double(x) >> 4;
    const cz = MathHelper.floor_double(z) >> 4;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) if (!this.world.chunkExists(cx + dx, cz + dz)) return false;
    return true;
  }

  makeString(): string {
    return `MultiplayerChunkCache: ${this.world.loadedChunkCount}`;
  }

  dispose(): void {
    this.worker.terminate();
    this.incoming.length = 0;
    this.requested.clear();
    this.stored.clear();
  }

  private static unkey(k: number): [number, number] {
    const cx = Math.floor(k / 0x400000) - 0x200000;
    const cz = (k % 0x400000) - 0x200000;
    return [cx, cz];
  }
}
