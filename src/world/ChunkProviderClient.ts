import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import { type EntityDescriptor, EntityList } from '../entity/EntityList';
import type { ChunkPayload, WorldGenRequest, WorldGenResponse } from '../workers/worldgenProtocol';
import { Chunk } from './Chunk';
import { ChunkSection } from './ChunkSection';
import { TileEntity } from './tileentity/TileEntity';
import { World } from './World';
import { StructureLocator } from './gen/StructureLocator';
import type { SaveHandler } from './storage/SaveHandler';
import { WorldGenWorkers } from './WorldGenWorkers';

/**
 * The main thread's chunk source: streams finalized chunks from the world-generation worker
 * around the player, unloads far ones and keeps chunks the player changed in memory so they
 * come back as they were left (there is no disk). The F3 name matches the original
 * client-side cache ("MultiplayerChunkCache").
 */
export class ChunkProviderClient {
  private readonly worker: Worker;
  private readonly requested = new Set<number>();
  /** Chunks from the worker not yet added (from incomingHead on). */
  private incoming: ChunkPayload[] = [];
  private incomingHead = 0;
  /** Unloaded chunks kept in memory (player-modified or holding entities). */
  readonly stored = new Map<number, Chunk>();
  /** Chunks that already received their world-generation animals (regenerating must not add more). */
  private readonly populatedOnce = new Set<number>();
  /** Entities of unloaded unmodified chunks: the terrain is regenerated, the entities come back. */
  readonly storedEntities = new Map<number, Entity[]>();
  private ready = false;
  private spawnWaiters: ((p: { x: number; y: number; z: number }) => void)[] = [];
  private lastCX = Number.NaN;
  private lastCZ = Number.NaN;
  private lastRadius = -1;
  private lastOthers = '';
  /** Chunk radius kept loaded around the player. */
  loadRadius = 9;
  /**
   * More areas to keep loaded, in block coordinates with a chunk radius: a LAN host's guests and
   * the world spawn while it is open to LAN (PlayerManager loaded chunks around every player).
   */
  extraCenters: { x: number; z: number; radius: number }[] = [];

  /**
   * The world's save (single player and LAN host): chunks found there are loaded from it
   * instead of generated, and every chunk is saved when it unloads. Null for worlds that are
   * not saved (tests), which keep the in-memory store above.
   */
  saveHandler: SaveHandler | null = null;
  /** Saved chunks being read, and those read and waiting to be added. */
  private readonly loadingSaved = new Set<number>();
  private readonly savedIncoming: { k: number; cx: number; cz: number; chunk: Chunk | null }[] = [];

  /**
   * An area whose saved chunks stay loaded (no generation): the Teleporter's 128-block portal
   * search reads every chunk that exists around an arrival point (see requestSavedArea).
   */
  pinnedSaved: { cx: number; cz: number; radius: number } | null = null;

  /** The StructureLocator provider this instance installed (removed again on dispose). */
  private readonly locate: (name: string, x: number, y: number, z: number) => Promise<[number, number, number] | null>;

  /** findClosestStructure requests waiting for the worker. */
  private readonly structureWaiters = new Map<number, (pos: [number, number, number] | null) => void>();
  private nextStructureId = 0;

  constructor(
    readonly world: World,
    seed: bigint,
    worldType: string,
    mapFeatures: boolean,
    options: { generatorOptions?: string | null; bonusChest?: boolean } = {},
  ) {
    this.worker = WorldGenWorkers.take();
    this.worker.onmessage = (e: MessageEvent<WorldGenResponse>) => this.onMessage(e.data);
    this.worker.onerror = (e) => console.error('[worldgen]', e.message);
    // The worker generates this world's dimension (the provider's id: 0, -1 or 1).
    const dimension = world.provider.dimensionId;
    this.post({
      type: 'init',
      seed: seed.toString(),
      worldType,
      mapFeatures,
      generatorOptions: options.generatorOptions ?? null,
      bonusChest: options.bonusChest ?? false,
      ...(dimension !== 0 ? { dimension } : {}),
    });
    this.locate = (name, x, y, z) => this.findClosestStructure(name, x, y, z);
    StructureLocator.provider = this.locate;
  }

  /** Makes this provider answer World.findClosestStructure (the world the player is in). */
  installStructureLocator(): void {
    StructureLocator.provider = this.locate;
  }

  /** World.findClosestStructure ("Stronghold"), answered by the world-generation worker. */
  findClosestStructure(name: string, x: number, y: number, z: number): Promise<[number, number, number] | null> {
    return new Promise((resolve) => {
      const id = this.nextStructureId++;
      this.structureWaiters.set(id, resolve);
      this.post({ type: 'findStructure', id, name, x, y, z });
    });
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
    } else if (m.type === 'structure') {
      const w = this.structureWaiters.get(m.id);
      this.structureWaiters.delete(m.id);
      w?.(m.pos);
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
    const others: [number, number, number][] = this.extraCenters.map((c) => [MathHelper.floor_double(c.x) >> 4, MathHelper.floor_double(c.z) >> 4, c.radius]);
    const othersKey = others.length > 0 ? others.join(';') : '';
    const pin = this.pinnedSaved;
    const within = (kx: number, kz: number, extra: number): boolean => {
      if (Math.abs(kx - cx) <= r + extra && Math.abs(kz - cz) <= r + extra) return true;
      if (pin && Math.abs(kx - pin.cx) <= pin.radius && Math.abs(kz - pin.cz) <= pin.radius) return true;
      for (const [ox, oz, or] of others) if (Math.abs(kx - ox) <= or + extra && Math.abs(kz - oz) <= or + extra) return true;
      return false;
    };
    // Also when the render distance changed while standing still.
    if (cx !== this.lastCX || cz !== this.lastCZ || r !== this.lastRadius || othersKey !== this.lastOthers) {
      this.lastCX = cx;
      this.lastCZ = cz;
      this.lastRadius = r;
      this.lastOthers = othersKey;
      this.post(others.length > 0 ? { type: 'player', cx, cz, radius: r, others } : { type: 'player', cx, cz, radius: r });
      for (const k of this.requested) {
        const [kx, kz] = ChunkProviderClient.unkey(k);
        if (!within(kx, kz, 1)) {
          this.requested.delete(k);
          this.post({ type: 'cancel', cx: kx, cz: kz });
        }
      }
      for (const k of this.loadingSaved) {
        const [kx, kz] = ChunkProviderClient.unkey(k);
        if (!within(kx, kz, 1)) this.loadingSaved.delete(k);
      }
      const drop: Chunk[] = [];
      for (const c of this.world.getLoadedChunks()) if (!within(c.xPosition, c.zPosition, 2)) drop.push(c);
      for (const c of drop) this.unloadChunk(c.xPosition, c.zPosition);
    }
    this.requestArea(cx, cz, r);
    for (const [ox, oz, or] of others) this.requestArea(ox, oz, or);
  }

  private requestArea(cx: number, cz: number, r: number): void {
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
        if (this.requested.has(k) || this.loadingSaved.has(k)) continue;
        if (this.saveHandler?.hasChunk(kx, kz, this.world.provider.dimensionId)) {
          this.loadSaved(k, kx, kz);
          continue;
        }
        this.requested.add(k);
        this.post({ type: 'request', cx: kx, cz: kz });
      }
    }
  }

  /**
   * Loads every saved chunk within `radius` of chunk (cx, cz) (nothing is generated) and keeps
   * them while pinnedSaved covers them; true once all of them are in the world.
   */
  requestSavedArea(cx: number, cz: number, radius: number): boolean {
    const h = this.saveHandler;
    if (!h) return true;
    const dim = this.world.provider.dimensionId;
    let ready = true;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const kx = cx + dx;
        const kz = cz + dz;
        if (this.world.chunkExists(kx, kz) || !h.hasChunk(kx, kz, dim)) continue;
        ready = false;
        const k = World.chunkKey(kx, kz);
        if (!this.loadingSaved.has(k)) this.loadSaved(k, kx, kz);
      }
    }
    return ready;
  }

  /** Unloads every chunk (each is saved, or kept in memory without a save). */
  unloadAll(): void {
    for (const c of [...this.world.getLoadedChunks()]) this.unloadChunk(c.xPosition, c.zPosition);
  }

  /** AnvilChunkLoader.loadChunk, asynchronously: the chunk is added by processIncoming. */
  private loadSaved(k: number, cx: number, cz: number): void {
    const h = this.saveHandler!;
    this.loadingSaved.add(k);
    void h.loadChunk(this.world, cx, cz).then((chunk) => {
      if (this.saveHandler === h) this.savedIncoming.push({ k, cx, cz, chunk });
    });
  }

  /** Adds chunks that arrived from the worker, within a time budget (milliseconds). */
  processIncoming(budgetMs: number): number {
    const t0 = performance.now();
    let n = 0;
    while (this.savedIncoming.length > 0) {
      const m = this.savedIncoming.shift()!;
      if (!this.loadingSaved.delete(m.k) || this.world.chunkExists(m.cx, m.cz)) continue;
      if (!m.chunk) {
        // Missing or unreadable in the save: generated again, like the original.
        this.requested.add(m.k);
        this.post({ type: 'request', cx: m.cx, cz: m.cz });
        continue;
      }
      // Never regenerated, so the world-generation animals are not added again.
      this.populatedOnce.add(m.k);
      this.world.addChunk(m.chunk);
      n++;
      if (performance.now() - t0 > budgetMs) return n;
    }
    while (this.incomingHead < this.incoming.length) {
      const m = this.incoming[this.incomingHead++];
      if (this.incomingHead === this.incoming.length) {
        this.incoming = [];
        this.incomingHead = 0;
      } else if (this.incomingHead >= 256) {
        this.incoming = this.incoming.slice(this.incomingHead);
        this.incomingHead = 0;
      }
      if (m.replace) {
        this.replacedChunks++;
        this.replaceChunk(m);
        continue;
      }
      const k = World.chunkKey(m.cx, m.cz);
      if (!this.requested.delete(k) || this.world.chunkExists(m.cx, m.cz)) continue;
      this.world.addChunk(this.makeChunk(m));
      if (!this.populatedOnce.has(k)) {
        this.populatedOnce.add(k);
        this.spawnGeneratedEntities(m);
      }
      const kept = this.storedEntities.get(k);
      if (kept) {
        this.storedEntities.delete(k);
        for (const e of kept) this.world.spawnEntityInWorld(e);
      }
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
    for (const tag of m.tileEntities) {
      const te = TileEntity.createAndLoadEntity(tag);
      if (te) c.addTileEntity(te);
    }
    c.isModified = false;
    c.playerModified = false;
    return c;
  }

  /**
   * A chunk the worker sent again because it changed after it was sent (see worldgen.worker.ts):
   * the blocks, light, height map and biomes of the loaded copy are replaced unless a player has
   * changed it already. Entities, tile entities and ticks stay.
   */
  private replaceChunk(m: ChunkPayload): void {
    if (!this.world.chunkExists(m.cx, m.cz)) return;
    const c = this.world.getChunkFromChunkCoords(m.cx, m.cz);
    if (c.playerModified) return;
    const fresh = this.makeChunk({ ...m, tileEntities: [], pendingTicks: [], entities: [] });
    for (let i = 0; i < 16; i++) c.sections[i] = fresh.sections[i];
    c.heightMap.set(fresh.heightMap);
    c.heightMapMinimum = fresh.heightMapMinimum;
    c.biomes.set(fresh.biomes);
    // A save may already hold the early copy: write the corrected terrain at the next save.
    c.isModified = true;
    const x0 = m.cx * 16;
    const z0 = m.cz * 16;
    this.world.markBlockRangeForRenderUpdate(x0, 0, z0, x0 + 15, 255, z0 + 15);
  }

  /** performWorldGenSpawning's animals, created through EntityList (unknown names are skipped). */
  private spawnGeneratedEntities(m: ChunkPayload): void {
    for (const d of m.entities) {
      const e = EntityList.fromDescriptor(d, this.world);
      if (!e) continue;
      // fromDescriptor places it and reads the generation data (villager Profession, minecart Items).
      this.world.spawnEntityInWorld(e);
      if (e.isLivingEntity && d.init !== false) (e as EntityLiving).initCreature();
    }
  }

  unloadChunk(cx: number, cz: number): void {
    const c = this.world.removeChunk(cx, cz);
    if (!c) return;
    if (this.saveHandler) {
      // ChunkProviderServer.unloadQueuedChunks: saved as it goes; it comes back from the save.
      this.saveHandler.saveChunk(c, this.world);
      return;
    }
    // Generation is deterministic: only chunks changed by players (not by the world's own
    // ticking: leaf decay, grass, fluids settling) are kept whole; of the others only the
    // entities are kept, to be put back into the regenerated terrain.
    const k = World.chunkKey(cx, cz);
    if (c.playerModified) {
      this.stored.set(k, c);
      return;
    }
    const entities = c.entityLists.flat().filter((e) => !e.isPlayerEntity && !e.isDead);
    if (entities.length > 0) this.storedEntities.set(k, entities);
  }

  /**
   * A chunk of the save that can be read right now (queued for writing or cached because the
   * player changed it), put into the world; for the bed check on respawn. Null otherwise.
   */
  loadSavedChunkNow(cx: number, cz: number): Chunk | null {
    if (!this.saveHandler || this.world.chunkExists(cx, cz)) return null;
    const c = this.saveHandler.loadChunkNow(this.world, cx, cz);
    if (c) {
      this.loadingSaved.delete(World.chunkKey(cx, cz));
      this.world.addChunk(c);
    }
    return c;
  }

  /** Chunks that sent again because they changed after an early send (see processIncoming). */
  replacedChunks = 0;

  /** Queue sizes for the performance tools (mc.dev.perf). */
  queueStats(): { incoming: number; requested: number; stored: number; replaced: number } {
    return { incoming: this.incoming.length - this.incomingHead, requested: this.requested.size, stored: this.stored.size, replaced: this.replacedChunks };
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

  /**
   * Leaving a world that stays in the session's world list: every chunk goes to the in-memory
   * store (player-modified chunks whole, the others' entities) and the worker stops.
   */
  suspend(): void {
    for (const c of [...this.world.getLoadedChunks()]) this.unloadChunk(c.xPosition, c.zPosition);
    this.worker.terminate();
    this.incoming = [];
    this.incomingHead = 0;
    this.requested.clear();
    WorldGenWorkers.prewarm();
  }

  /** Takes over the chunk store of a suspended provider for the same world. */
  adoptStore(old: ChunkProviderClient): void {
    for (const [k, c] of old.stored) this.stored.set(k, c);
    for (const [k, e] of old.storedEntities) this.storedEntities.set(k, e);
    for (const k of old.populatedOnce) this.populatedOnce.add(k);
    old.stored.clear();
    old.storedEntities.clear();
  }

  dispose(): void {
    if (StructureLocator.provider === this.locate) StructureLocator.provider = null;
    this.saveHandler = null;
    this.loadingSaved.clear();
    this.savedIncoming.length = 0;
    this.worker.terminate();
    this.incoming = [];
    this.incomingHead = 0;
    this.requested.clear();
    this.stored.clear();
    this.storedEntities.clear();
    WorldGenWorkers.prewarm();
  }

  private static unkey(k: number): [number, number] {
    const cx = Math.floor(k / 0x400000) - 0x200000;
    const cz = (k % 0x400000) - 0x200000;
    return [cx, cz];
  }
}
