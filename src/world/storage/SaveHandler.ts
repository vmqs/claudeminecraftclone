import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { TagCompound } from '../../item/ItemStack';
import type { Chunk } from '../Chunk';
import { World, type WorldInfo } from '../World';
import { readChunkFromNBT, writeChunkToNBT } from './AnvilChunkLoader';
import { NBTError, readNBT, writeCompressedNBT, writeNBT, zlibDeflate, zlibInflate } from './NBT';
import type { SaveBackend } from './SaveBackend';
import { levelDatRoot, worldInfoToNBT } from './WorldInfoNBT';

interface QueuedChunk {
  cx: number;
  cz: number;
  /** Uncompressed chunk NBT, until it is compressed for writing. */
  nbt: Uint8Array | null;
  /** Zlib-compressed NBT. */
  data: Uint8Array | null;
  /** Being written right now. */
  inFlight: boolean;
}

/**
 * One open world's save (AnvilSaveHandler + AnvilChunkLoader): chunks are serialized the moment
 * they unload or are saved (so later changes cannot leak into the snapshot), queued, compressed
 * a few per tick and written to the backend in batches. Reads check the queue first, as
 * AnvilChunkLoader.loadChunk checks its pending list. Chunks the player changed stay cached
 * (compressed) so the bed can be found synchronously on respawn.
 */
export class SaveHandler {
  /** Chunk positions present in the backend. */
  private readonly saved = new Set<number>();
  private readonly queue = new Map<number, QueuedChunk>();
  /** Compressed copies of player-modified chunks (and those around the bed). */
  private readonly keep = new Map<number, Uint8Array>();
  private writeChain: Promise<void> = Promise.resolve();
  private writesInFlight = 0;
  /** The last failed write, shown by the game; cleared by the next successful one. */
  error: string | null = null;
  /** Called when a write fails (the game shows the message). */
  onError: ((message: string) => void) | null = null;
  /** The world's data/ files that changed (maps, idcounts), written with level.dat. */
  worldData: (() => Map<string, Uint8Array>) | null = null;
  /** Total bytes written by the last full save (level.dat's SizeOnDisk). */
  private sizeOnDisk = 0;
  closed = false;

  constructor(
    readonly backend: SaveBackend,
    readonly folder: string,
    positions: Iterable<[number, number]> = [],
  ) {
    for (const [x, z] of positions) this.saved.add(World.chunkKey(x, z));
  }

  get savedChunkCount(): number {
    return this.saved.size;
  }

  get pendingCount(): number {
    return this.queue.size + this.writesInFlight;
  }

  /** Whether a chunk can come from the save (AnvilChunkLoader would find it). */
  hasChunk(cx: number, cz: number): boolean {
    const k = World.chunkKey(cx, cz);
    return this.queue.has(k) || this.saved.has(k);
  }

  /** The chunk's NBT if it is available without the backend (queued or kept), else null. */
  private loadNow(k: number): TagCompound | null {
    const q = this.queue.get(k);
    if (q) return readNBT(q.nbt ?? zlibInflate(q.data!));
    const kept = this.keep.get(k);
    if (kept) return readNBT(zlibInflate(kept));
    return null;
  }

  /** A saved chunk read synchronously from the queue or cache (bed respawn), or null. */
  loadChunkNow(world: World, cx: number, cz: number): Chunk | null {
    const tag = this.loadNow(World.chunkKey(cx, cz));
    return tag ? readChunkFromNBT(world, cx, cz, tag) : null;
  }

  /** AnvilChunkLoader.loadChunk: the saved chunk, or null when missing or unreadable. */
  async loadChunk(world: World, cx: number, cz: number): Promise<Chunk | null> {
    const k = World.chunkKey(cx, cz);
    try {
      let tag = this.loadNow(k);
      if (!tag) {
        const data = await this.backend.getChunk(this.folder, cx, cz);
        // Saved again (or unloaded) while reading: the newer copy wins.
        tag = this.loadNow(k);
        if (!tag) {
          if (!data) return null;
          tag = readNBT(zlibInflate(data));
        }
      }
      return readChunkFromNBT(world, cx, cz, tag);
    } catch (e) {
      console.warn(`Chunk ${cx},${cz} could not be read and will be regenerated`, e instanceof NBTError ? e.message : e);
      return null;
    }
  }

  /** saveChunk: snapshots the chunk now and queues it for writing. */
  saveChunk(chunk: Chunk, world: World): void {
    if (this.closed) return;
    const k = World.chunkKey(chunk.xPosition, chunk.zPosition);
    let nbt: Uint8Array;
    try {
      nbt = writeNBT(writeChunkToNBT(chunk, world));
    } catch (e) {
      console.error(`Chunk ${chunk.xPosition},${chunk.zPosition} could not be saved`, e);
      return;
    }
    this.queue.set(k, { cx: chunk.xPosition, cz: chunk.zPosition, nbt, data: null, inFlight: false });
    this.keep.delete(k);
    if (chunk.playerModified) this.keepModified.add(k);
  }

  /** Chunks whose compressed copy stays in memory after writing. */
  private readonly keepModified = new Set<number>();

  /** Keeps a chunk's compressed copy in memory (bed respawn), loading it from the backend if needed. */
  async keepChunk(cx: number, cz: number): Promise<void> {
    const k = World.chunkKey(cx, cz);
    this.keepModified.add(k);
    if (this.queue.has(k) || this.keep.has(k) || !this.saved.has(k)) return;
    try {
      const data = await this.backend.getChunk(this.folder, cx, cz);
      if (data && !this.queue.has(k)) this.keep.set(k, data);
    } catch {
      // Not cached: the respawn then misses this bed, as a missing chunk would.
    }
  }

  private compress(q: QueuedChunk): void {
    if (q.data) return;
    q.data = zlibDeflate(q.nbt!);
    q.nbt = null;
  }

  /**
   * Compresses queued chunks for up to `budgetMs` and starts writing what is ready (a few per
   * tick, like ThreadedFileIOBase draining the pending chunks).
   */
  pump(budgetMs: number): void {
    if (this.queue.size === 0) return;
    const t0 = performance.now();
    const batch: QueuedChunk[] = [];
    for (const q of this.queue.values()) {
      if (q.inFlight) continue;
      this.compress(q);
      batch.push(q);
      if (performance.now() - t0 > budgetMs || batch.length >= 64) break;
    }
    this.write(batch);
  }

  private write(batch: QueuedChunk[]): Promise<void> {
    if (batch.length === 0) return this.writeChain;
    const items = batch.map((q) => ({ k: World.chunkKey(q.cx, q.cz), q }));
    for (const { q } of items) q.inFlight = true;
    this.writesInFlight += items.length;
    const run = async (): Promise<void> => {
      if (this.closed) {
        this.writesInFlight -= items.length;
        for (const { q } of items) q.inFlight = false;
        return;
      }
      try {
        await this.backend.putChunks(
          this.folder,
          items.map(({ q }) => ({ cx: q.cx, cz: q.cz, data: q.data! })),
        );
        for (const { k, q } of items) {
          this.saved.add(k);
          // Only drop the queue entry if it was not saved again meanwhile.
          if (this.queue.get(k) === q) {
            this.queue.delete(k);
            if (this.keepModified.has(k)) this.keep.set(k, q.data!);
          }
        }
        this.error = null;
      } catch (e) {
        this.reportError(e);
      } finally {
        this.writesInFlight -= items.length;
        for (const { q } of items) q.inFlight = false;
      }
    };
    this.writeChain = this.writeChain.then(run, run);
    return this.writeChain;
  }

  private reportError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Saving failed:', e);
    if (this.error !== msg) {
      this.error = msg;
      this.onError?.(msg);
    }
  }

  /**
   * Writes everything queued. `progress` gets 0-100 while compressing (the "Saving chunks" bar);
   * yields to the browser between slices so the screen keeps drawing.
   */
  async flush(progress?: (percent: number) => void): Promise<void> {
    const total = this.queue.size;
    let doneCount = 0;
    let slice: QueuedChunk[] = [];
    let t0 = performance.now();
    for (const q of [...this.queue.values()]) {
      if (q.inFlight) continue;
      this.compress(q);
      slice.push(q);
      doneCount++;
      if (performance.now() - t0 > 30 || slice.length >= 128) {
        void this.write(slice);
        slice = [];
        progress?.(Math.floor((doneCount * 100) / Math.max(1, total)));
        await new Promise((r) => setTimeout(r, 0));
        t0 = performance.now();
      }
    }
    await this.write(slice);
    progress?.(100);
    await this.writeChain;
  }

  /** saveWorldInfoWithPlayer: level.dat (gzip NBT) with the player's tag, and the save's size. */
  async saveLevel(info: WorldInfo, player: EntityPlayer | TagCompound | null): Promise<void> {
    if (this.closed) return;
    let tag: TagCompound | null = null;
    if (player && 'writeToNBT' in player && typeof player.writeToNBT === 'function') {
      tag = {};
      (player as EntityPlayer).writeToNBT(tag);
    } else if (player) {
      tag = player as TagCompound;
    }
    info.lastTimePlayed = Date.now();
    const bytes = writeCompressedNBT(levelDatRoot(worldInfoToNBT(info, tag, this.sizeOnDisk)));
    const files = new Map<string, Uint8Array | null>(this.worldData?.() ?? []);
    files.set('level.dat', bytes);
    const run = async (): Promise<void> => {
      if (this.closed) return;
      try {
        await this.backend.putFiles(this.folder, files);
        this.error = null;
      } catch (e) {
        this.reportError(e);
      }
    };
    this.writeChain = this.writeChain.then(run, run);
    await this.writeChain;
  }

  /**
   * saveAllChunks: every loaded chunk is snapshotted and queued, the level is written, and (when
   * `wait`) everything is flushed before the promise resolves.
   */
  async saveAll(world: World, player: EntityPlayer | null, wait: boolean, progress?: (percent: number) => void): Promise<void> {
    for (const c of world.getLoadedChunks()) this.saveChunk(c, world);
    if (wait) await this.flush(progress);
    else this.pump(8);
    await this.saveLevel(world.worldInfo, player);
    try {
      this.sizeOnDisk = await this.backend.folderSize(this.folder);
    } catch {
      // Only for SizeOnDisk.
    }
  }

  /** Runs `fn` before every write of this handler (clearing a reused folder). */
  runFirst(fn: () => Promise<void>): void {
    const run = async (): Promise<void> => {
      try {
        await fn();
      } catch (e) {
        this.reportError(e);
      }
    };
    this.writeChain = this.writeChain.then(run, run);
  }

  /** Waits for queued writes (without compressing more). */
  idle(): Promise<void> {
    return this.writeChain;
  }
}
