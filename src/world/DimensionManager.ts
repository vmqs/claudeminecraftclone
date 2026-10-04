import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { TagCompound } from '../item/ItemStack';
import { ChunkProviderClient } from './ChunkProviderClient';
import type { SaveHandler } from './storage/SaveHandler';
import { serverPosY, Teleporter } from './Teleporter';
import { World, type WorldInfo } from './World';
import { DIMENSIONS, getProviderForDimension } from './WorldProviders';

/** An area a dimension must keep loaded: block coordinates and a chunk radius. */
export interface LoadCenter {
  x: number;
  z: number;
  radius: number;
}

/** A loaded dimension of the game: its world and (while anything is there) its chunk source. */
export class LoadedDimension {
  /** The chunk source; null while the dimension is idle (only the overworld stays, for the clock). */
  provider: ChunkProviderClient | null = null;
  /** Ticks in a row with nothing keeping its chunks loaded. */
  idleTicks = 0;

  constructor(
    readonly id: number,
    readonly world: World,
  ) {}
}

/** An entity on its way to another dimension, waiting for the chunks around its arrival point. */
interface PendingTransfer {
  dim: number;
  /** The entity's EntityList name and saved state (Entity.copyDataFrom's copy). */
  name: string;
  tag: TagCompound;
  timeUntilPortal: number;
  teleportDirection: number;
  /** Arrival point and angles after the coordinate scaling (transferEntityToWorld). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Where and how it left (Teleporter.placeInPortal's arguments). */
  fromX: number;
  fromY: number;
  fromZ: number;
  fromYaw: number;
  /** Arriving in the End from elsewhere: the platform, no portal search. */
  entrance: boolean;
  /** False when leaving the End for the End (no Teleporter: it just appears at the spawn point). */
  place: boolean;
}

/** Chunk radius around an arrival point that must be loaded (makePortal looks 16 blocks out). */
export const ARRIVAL_RADIUS = 2;
/** Chunk radius of saved chunks read for placeInExistingPortal's 128-block search. */
export const PORTAL_SEARCH_RADIUS = 8;
/** Ticks a dimension with nothing in it stays loaded before it is saved and unloaded. */
const IDLE_TICKS = 100;

/**
 * The integrated server's worlds (MinecraftServer.worldServers): one World per dimension the
 * game uses, the overworld always (it keeps the clock and the weather running), the Nether and
 * the End while a player (or an entity on its way) is there. Each loaded dimension has its own
 * ChunkProviderClient (with its own world-generation worker) and Teleporter, and saves into the
 * same SaveHandler (DIM-1 / DIM1 chunk folders). An idle dimension is saved and unloaded.
 */
export class DimensionManager {
  readonly dims = new Map<number, LoadedDimension>();
  /** Teleporters live as long as the game session (their random keeps going, like the server's). */
  private readonly teleporters = new Map<number, Teleporter>();
  private readonly transfers: PendingTransfer[] = [];
  /** More areas to keep per dimension (a LAN host's guests, the spawn), set by the LAN server. */
  extraCenters = new Map<number, LoadCenter[]>();
  /** The save of the world (every dimension); null for worlds that are not saved (tests). */
  saveHandler: SaveHandler | null = null;
  /** A world was created for a dimension (world data, difficulty, LAN listeners). */
  onWorldCreated: ((w: World) => void) | null = null;
  /** A dimension's world was unloaded. */
  onWorldUnloaded: ((w: World) => void) | null = null;
  /** Makes the chunk source of a dimension (tests replace it). */
  providerFactory: (w: World) => ChunkProviderClient = (w) => {
    const i = this.info;
    return new ChunkProviderClient(w, i.seed, i.terrainType, i.mapFeaturesEnabled, { generatorOptions: i.generatorOptions, bonusChest: i.bonusChest });
  };

  constructor(
    readonly info: WorldInfo,
    overworld: World,
    overworldProvider: ChunkProviderClient | null,
  ) {
    const d = new LoadedDimension(0, overworld);
    d.provider = overworldProvider;
    this.dims.set(0, d);
  }

  get(dim: number): LoadedDimension | undefined {
    return this.dims.get(dim);
  }

  /** The world of a loaded dimension (MinecraftServer.worldServerForDimension). */
  getWorld(dim: number): World | null {
    return this.dims.get(dim)?.world ?? null;
  }

  /** Loaded worlds in the server's order: overworld, Nether, End. */
  worlds(): World[] {
    const out: World[] = [];
    for (const id of DIMENSIONS) {
      const d = this.dims.get(id);
      if (d) out.push(d.world);
    }
    return out;
  }

  /** The dimension of a world this manager runs, or null. */
  dimensionOf(w: World): LoadedDimension | null {
    const d = this.dims.get(w.provider.dimensionId);
    return d && d.world === w ? d : null;
  }

  teleporter(dim: number): Teleporter {
    const w = this.load(dim).world;
    let t = this.teleporters.get(dim);
    if (!t) this.teleporters.set(dim, (t = new Teleporter(w)));
    t.world = w;
    return t;
  }

  /** The dimension, its world created and its chunk source started if needed. */
  load(dim: number): LoadedDimension {
    let d = this.dims.get(dim);
    if (!d) {
      const provider = getProviderForDimension(dim);
      if (!provider) throw new Error(`There is no dimension ${dim}`);
      const w = new World(this.info, provider);
      d = new LoadedDimension(dim, w);
      this.dims.set(dim, d);
      this.onWorldCreated?.(w);
    }
    if (!d.provider) {
      d.provider = this.providerFactory(d.world);
      const h = this.saveHandler;
      if (h) {
        // The saved chunk list of DIM-1 / DIM1 is read first; until then nothing is requested.
        if (h.isDimensionLoaded(dim)) d.provider.saveHandler = h;
        else {
          const p = d.provider;
          void h.loadDimension(dim).then(() => {
            if (d!.provider === p) p.saveHandler = h;
          });
        }
      }
    }
    d.idleTicks = 0;
    return d;
  }

  /** Whether the dimension's chunk source runs and knows its saved chunks. */
  isReady(dim: number): boolean {
    const d = this.dims.get(dim);
    if (!d?.provider) return false;
    return !this.saveHandler || d.provider.saveHandler === this.saveHandler;
  }

  /**
   * Whether an arrival at (x, z) can be placed: the chunks within ARRIVAL_RADIUS exist and every
   * saved chunk within PORTAL_SEARCH_RADIUS is loaded (only those can hold a portal). Loads them.
   */
  arrivalReady(dim: number, x: number, z: number, searchPortals: boolean): boolean {
    const d = this.dims.get(dim);
    if (!d?.provider || !this.isReady(dim)) return false;
    const cx = MathHelper.floor_double(x) >> 4;
    const cz = MathHelper.floor_double(z) >> 4;
    let ready = true;
    if (searchPortals) {
      d.provider.pinnedSaved = { cx, cz, radius: PORTAL_SEARCH_RADIUS };
      if (!d.provider.requestSavedArea(cx, cz, PORTAL_SEARCH_RADIUS)) ready = false;
    }
    for (let dz = -ARRIVAL_RADIUS; dz <= ARRIVAL_RADIUS; dz++) for (let dx = -ARRIVAL_RADIUS; dx <= ARRIVAL_RADIUS; dx++) if (!d.world.chunkExists(cx + dx, cz + dz)) ready = false;
    return ready;
  }

  /** The portal search is done: its saved chunks may unload again. */
  releaseArrival(dim: number): void {
    const p = this.dims.get(dim)?.provider;
    if (p) p.pinnedSaved = null;
  }

  /**
   * ServerConfigurationManager.transferEntityToWorld's first half: where an entity leaving
   * `from` for `to` arrives before the Teleporter places it (x and z divided by 8 into the
   * Nether, multiplied by 8 out of it, clamped to the world border; the End's entrance).
   * Returns the position and yaw; `entrance` when the End's platform is to be built.
   */
  arrivalPoint(e: Entity, from: number, to: number): { x: number; y: number; z: number; yaw: number; pitch: number; entrance: boolean; place: boolean } {
    let x = e.posX;
    let z = e.posZ;
    let y = serverPosY(e);
    let yaw = e.rotationYaw;
    let pitch = e.rotationPitch;
    let entrance = false;
    if (to === -1) {
      x /= 8;
      z /= 8;
    } else if (to === 0) {
      x *= 8;
      z *= 8;
    } else {
      const spot = from === 1 ? { x: this.info.spawnX, y: this.info.spawnY, z: this.info.spawnZ } : this.load(to).world.provider.getEntrancePortalLocation();
      if (spot) {
        x = spot.x;
        y = spot.y;
        z = spot.z;
      }
      yaw = 90;
      pitch = 0;
      entrance = true;
    }
    const place = from !== 1;
    if (place) {
      x = MathHelper.clamp_int(Math.trunc(x), -29999872, 29999872);
      z = MathHelper.clamp_int(Math.trunc(z), -29999872, 29999872);
    }
    return { x, y, z, yaw, pitch, entrance, place };
  }

  /**
   * Entity.travelToDimension for anything but a player: the entity leaves its world now and a
   * copy (EntityList name + saved state) arrives once the destination's chunks are loaded.
   */
  transferEntity(e: Entity, to: number): void {
    const from = e.worldObj.provider.dimensionId;
    const name = EntityList.getEntityString(e);
    const fromX = e.posX;
    const fromY = e.posY;
    const fromZ = e.posZ;
    const fromYaw = e.rotationYaw;
    const p = this.arrivalPoint(e, from, to);
    e.worldObj.removeEntity(e);
    e.isDead = false;
    if (!name) {
      e.setDead();
      return;
    }
    // copyDataFrom's state; the copy is moved to the arrival point when it is created.
    const tag: TagCompound = {};
    try {
      e.writeToNBT(tag);
    } catch (err) {
      console.warn('[dimensions] an entity could not be copied to the other dimension', err);
      e.setDead();
      return;
    }
    this.load(to);
    this.transfers.push({
      dim: to,
      name,
      tag,
      timeUntilPortal: e.timeUntilPortal,
      teleportDirection: e.getTeleportDirection(),
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      fromX,
      fromY,
      fromZ,
      fromYaw,
      entrance: p.entrance,
      place: p.place,
    });
    e.setDead();
  }

  /** Entities still waiting to arrive somewhere. */
  get pendingTransfers(): number {
    return this.transfers.length;
  }

  /** Places waiting entities whose arrival area is ready (once per tick). */
  private processTransfers(): void {
    for (let i = 0; i < this.transfers.length; i++) {
      const t = this.transfers[i];
      if (!this.arrivalReady(t.dim, t.x, t.z, t.place && !t.entrance)) continue;
      this.transfers.splice(i--, 1);
      const w = this.load(t.dim).world;
      const e = EntityList.createEntityByName(t.name, w);
      if (!e) continue;
      try {
        e.readFromNBT(t.tag);
      } catch (err) {
        console.warn('[dimensions] an arriving entity could not be read', err);
        continue;
      }
      e.dimension = t.dim;
      e.timeUntilPortal = t.timeUntilPortal;
      (e as unknown as { teleportDirection: number }).teleportDirection = t.teleportDirection;
      e.setLocationAndAngles(t.x, t.y, t.z, t.yaw, t.pitch);
      if (t.place) this.teleporter(t.dim).placeInPortal(e, t.fromX, t.fromY, t.fromZ, t.fromYaw);
      w.spawnEntityInWorld(e);
      if (!this.transfers.some((o) => o.dim === t.dim)) this.releaseArrival(t.dim);
    }
  }

  /**
   * Chunk loading of every dimension, once per tick: around the client's own player (`main`
   * in `mainDim`), the LAN server's areas and the arrival points of entities on their way.
   * A dimension with nothing to keep for IDLE_TICKS ticks is saved and unloaded.
   */
  tickChunkLoading(mainDim: number | null, main: LoadCenter | null): void {
    this.processTransfers();
    for (const d of [...this.dims.values()]) {
      const centers: LoadCenter[] = [];
      if (main && mainDim === d.id) centers.push(main);
      for (const c of this.extraCenters.get(d.id) ?? []) centers.push(c);
      for (const t of this.transfers) if (t.dim === d.id) centers.push({ x: t.x, z: t.z, radius: ARRIVAL_RADIUS });
      if (centers.length === 0) {
        if (d.provider && ++d.idleTicks >= IDLE_TICKS) this.unload(d.id);
        continue;
      }
      d.idleTicks = 0;
      if (!d.provider) this.load(d.id);
      if (!this.isReady(d.id)) continue;
      const p = d.provider!;
      p.loadRadius = centers[0].radius;
      p.extraCenters = centers.slice(1);
      p.updateLoadedArea(centers[0].x, centers[0].z);
    }
  }

  /** Adds arrived chunks of every dimension: `current` first with most of the budget. */
  processIncoming(current: World | null, budgetMs: number): void {
    const cur = current ? this.dimensionOf(current) : null;
    cur?.provider?.processIncoming(budgetMs);
    for (const d of this.dims.values()) if (d !== cur && d.provider) d.provider.processIncoming(Math.max(1, budgetMs / 4));
  }

  /** Removes portals not visited lately from every Teleporter's cache. */
  tickTeleporters(): void {
    const time = this.info.totalTime;
    for (const t of this.teleporters.values()) t.removeStalePortalLocations(time);
  }

  /**
   * Saves and unloads a dimension: every chunk goes to the save, the worker stops. The
   * overworld's World stays (it runs the clock); the others are dropped.
   */
  unload(dim: number): void {
    const d = this.dims.get(dim);
    if (!d) return;
    if (d.provider) {
      d.provider.unloadAll();
      d.provider.dispose();
      d.provider = null;
    }
    d.idleTicks = 0;
    if (dim !== 0) {
      this.dims.delete(dim);
      this.onWorldUnloaded?.(d.world);
    }
  }

  /** Every loaded dimension but `except` (saving, closing). */
  others(except: World | null): LoadedDimension[] {
    return [...this.dims.values()].filter((d) => d.world !== except);
  }

  /** Stops every chunk source without saving (the world is closed elsewhere or discarded). */
  dispose(): void {
    for (const d of this.dims.values()) {
      d.provider?.dispose();
      d.provider = null;
    }
    this.transfers.length = 0;
  }
}
