import type { CommandHandler } from '../../command/CommandHandler';
import type { ICommandSender } from '../../command/ICommandSender';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { PlayerSpawning, type PlayerSurvivalState } from '../../entity/PlayerSpawning';
import type { ItemStack } from '../../item/ItemStack';
import type { Chunk } from '../../world/Chunk';
import type { EnumGameType } from '../../world/EnumGameType';
import type { Explosion } from '../../world/Explosion';
import type { IWorldAccess } from '../../world/IWorldAccess';
import { World } from '../../world/World';
import type { WorldNetListener } from '../../world/WorldNetListener';
import { describeTileEntity, encodeChunkData } from '../protocol/ChunkCodec';
import type { Packet } from '../protocol/Packets';
import type { HostTransport, NetConnection } from '../transport/Transport';
import { EntityPlayerMP, type PlayerServer } from './EntityPlayerMP';
import { EntityTracker } from './EntityTracker';
import { NetServerHandler, REJOIN_TOKEN_BYTES, toHex } from './NetServerHandler';

/** What the LAN server needs from the host's game client. */
export interface LanHostClient {
  readonly world: World;
  /** The host's own player (it changes on respawn). */
  hostPlayer(): EntityPlayer | null;
  readonly hostName: string;
  /** A line in the host's chat. */
  printChat(msg: string): void;
  commandManager(): CommandHandler | null;
  getPossibleCompletions(sender: EntityPlayer, text: string): string[];
  /** Areas the host must keep loaded besides its own (guests, the spawn). */
  setExtraLoadCenters(centers: { x: number; z: number; radius: number }[]): void;
}

export interface LanSettings {
  /** Game mode of the other players ("Game Mode" on the Open to LAN screen). */
  gameType: EnumGameType;
  /** "Allow Cheats" for the other players. */
  allowCommands: boolean;
  maxPlayers: number;
  /** Chunk radius streamed to guests. */
  viewDistance: number;
}

/** A guest's state kept for the session, so a player who reconnects finds its things again. */
interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  main: (ItemStack | null)[];
  armor: (ItemStack | null)[];
  currentItem: number;
  state: PlayerSurvivalState;
  dead: boolean;
  /** The rejoin token the player was given: only a guest showing it gets this state back. */
  token: string;
  /** When the player left (performance.now()). */
  leftAt: number;
}

export interface PlayerListEntry {
  name: string;
  responseTime: number;
}

/** How long the host ignores a /banned guest's browser tab (a new name from the same tab). */
const BAN_MS = 12 * 60 * 60 * 1000;
/** Guests whose state is kept (the oldest is forgotten first). */
const MAX_SAVED_PLAYERS = 64;
/** How long a departed guest's name stays reserved for its owner (then the name is free again). */
const SAVED_NAME_RESERVED_MS = 30 * 60 * 1000;

const CHUNKS_PER_TICK = 4;
/**
 * Main-thread time per tick for compressing chunks for all guests together (a chunk of normal
 * terrain takes about 2 ms); chunks already compressed for someone else cost nothing and still go.
 */
const ENCODE_BUDGET_MS = 4;
const MAX_PENDING_SENDS = 24;
const PARTICLES_PER_TICK = 200;
const SPAWN_RADIUS = 1;

/**
 * The LAN game a host opened (IntegratedServer.shareToLAN with its ServerConfigurationManager,
 * PlayerManager, EntityTracker and WorldManager): accepts guests, streams them the world around
 * their players, tracks entities for them, forwards world events and runs their commands. The
 * host's World stays authoritative and keeps running the single-player code; this layer only
 * watches it (World.netEvents, an IWorldAccess) and applies what guests do through their
 * EntityPlayerMP.
 */
export class LanServer implements PlayerServer, WorldNetListener, IWorldAccess {
  readonly world: World;
  readonly handlers: NetServerHandler[] = [];
  readonly tracker: EntityTracker;
  code = '';
  private readonly pendingLogins: { h: NetServerHandler; since: number }[] = [];
  private readonly saved = new Map<string, SavedPlayer>();
  /** Lower-case names that died in Hardcore this session (BanEntry "Death in Hardcore"). */
  private readonly hardcoreDead = new Set<string>();
  /** Lower-case names the host banned for the session (/ban), with the reason. */
  readonly bannedNames = new Map<string, string>();
  /** /whitelist: when on, only these lower-case names may join. */
  whitelistOn = false;
  readonly whitelist = new Set<string>();
  private readonly changedBlocks = new Map<number, Set<number>>();
  private readonly changedTiles = new Set<string>();
  private readonly chunkCache = new Map<number, { data: Uint8Array; tick: number }>();
  private readonly particles = new Map<NetServerHandler, Map<string, number[]>>();
  private ticks = 0;
  /** Chunk compression this tick (ENCODE_BUDGET_MS). */
  private encodeMs = 0;
  private encodedThisTick = 0;
  private wasRaining = false;
  private open = false;

  constructor(
    readonly host: LanHostClient,
    readonly transport: HostTransport,
    readonly settings: LanSettings,
  ) {
    this.world = host.world;
    this.tracker = new EntityTracker((e) => (e instanceof EntityPlayerMP ? e.handler ?? null : null));
  }

  get commandsAllowedForAll(): boolean {
    return this.settings.allowCommands;
  }

  get viewDistance(): number {
    return this.settings.viewDistance;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Starts listening under `code` (the room). */
  async start(code: string): Promise<void> {
    this.code = code;
    this.transport.onConnection = (c) => this.onConnection(c);
    await this.transport.start(code);
    this.open = true;
    const w = this.world;
    w.netEvents = this;
    w.addWorldAccess(this);
    for (const e of w.loadedEntityList) this.tracker.addEntity(e);
    this.wasRaining = w.isRaining();
  }

  /** Closes the game: guests see "Server closed", the world goes back to single player. */
  stop(reason = 'Server closed'): void {
    for (const h of [...this.handlers]) h.kick(reason);
    this.handlers.length = 0;
    this.pendingLogins.length = 0;
    this.transport.stop();
    if (this.world.netEvents === this) this.world.netEvents = null;
    this.world.removeWorldAccess(this);
    this.host.setExtraLoadCenters([]);
    this.open = false;
  }

  private onConnection(c: NetConnection): void {
    if (!this.open) {
      c.close();
      return;
    }
    this.handlers.push(new NetServerHandler(this, c));
  }

  // ------------------------------------------------------------------ players

  /**
   * allowUserToConnect: a refusal reason for a guest about to log in, or null. Runs after the
   * handshake and the rejoin token. A second login under a connected player's name wins when it
   * shows that player's token ("You logged in from another location", as 1.5.2 did for every
   * second login); without it the name is taken. A departed guest's name stays reserved for the
   * guest holding its token for a while, so nobody else gets its things.
   */
  private canJoin(h: NetServerHandler): string | null {
    const name = h.username;
    const lower = name.toLowerCase();
    if (this.host.hostName.toLowerCase() === lower) return `The name ${name} is already taken`;
    const ban = this.bannedNames.get(lower);
    if (ban !== undefined) return `You are banned from this game: ${ban}`;
    if (this.hardcoreDead.has(lower)) return "You have died. Game over, man, it's game over!";
    if (this.whitelistOn && !this.whitelist.has(lower)) return 'You are not white-listed on this server!';
    for (const o of this.handlers) {
      if (o === h || (o.state !== 'play' && o.state !== 'login') || o.username.toLowerCase() !== lower) continue;
      if (h.presentedToken !== '' && h.presentedToken === o.token) o.kick('You logged in from another location');
      else return `The name ${name} is already taken`;
    }
    const saved = this.saved.get(lower);
    if (saved && saved.token !== h.presentedToken) {
      if (performance.now() - saved.leftAt < SAVED_NAME_RESERVED_MS) return `${name} left this game a short while ago; to come back as ${name}, rejoin from the same browser, or pick another name`;
      this.saved.delete(lower);
    }
    const count = this.handlers.filter((o) => o !== h && (o.state === 'play' || o.state === 'login')).length;
    if (count + 1 >= this.settings.maxPlayers) return 'The server is full!';
    return null;
  }

  beginLogin(h: NetServerHandler): void {
    this.pendingLogins.push({ h, since: this.ticks });
  }

  private spawnAreaReady(): boolean {
    const info = this.world.worldInfo;
    const cx = info.spawnX >> 4;
    const cz = info.spawnZ >> 4;
    for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) for (let dz = -SPAWN_RADIUS; dz <= SPAWN_RADIUS; dz++) if (!this.world.chunkExists(cx + dx, cz + dz)) return false;
    return true;
  }

  private chunkReadyAt(x: number, z: number): boolean {
    return this.world.chunkExists(MathHelper.floor_double(x) >> 4, MathHelper.floor_double(z) >> 4);
  }

  private processLogins(): void {
    for (let i = 0; i < this.pendingLogins.length; i++) {
      const { h, since } = this.pendingLogins[i];
      if (h.state !== 'login') {
        this.pendingLogins.splice(i--, 1);
        continue;
      }
      if (!h.loginChecked) {
        h.loginChecked = true;
        const refusal = this.canJoin(h);
        if (refusal) {
          this.pendingLogins.splice(i--, 1);
          h.kick(refusal);
          continue;
        }
      }
      const saved = this.saved.get(h.username.toLowerCase());
      const ready = saved && !saved.dead ? this.chunkReadyAt(saved.x, saved.z) : this.spawnAreaReady();
      if (!ready) {
        if (this.ticks - since > 1200) h.kick('Took too long to log in');
        continue;
      }
      this.pendingLogins.splice(i--, 1);
      this.completeLogin(h, saved ?? null);
    }
  }

  /** initializeConnectionToPlayer: the player, the login packets, the join message. */
  private completeLogin(h: NetServerHandler, saved: SavedPlayer | null): void {
    const w = this.world;
    const p = new EntityPlayerMP(w, h.username, this);
    if (saved) {
      PlayerSpawning.restoreState(p, saved.state, saved.dead);
      for (let i = 0; i < saved.main.length; i++) p.inventory.mainInventory[i] = saved.main[i];
      for (let i = 0; i < saved.armor.length; i++) p.inventory.armorInventory[i] = saved.armor[i];
      p.inventory.currentItem = saved.currentItem;
    }
    if (saved && !saved.dead) p.setLocationAndAngles(saved.x, saved.y, saved.z, saved.yaw, saved.pitch);
    else PlayerSpawning.placeAtWorldSpawn(p, w);
    h.token = saved?.token || h.token || randomToken();
    this.saved.delete(h.username.toLowerCase());
    h.completeLogin(p);
    p.theItemInWorldManager.initializeGameType(saved ? p.gameType : this.settings.gameType);
    const info = w.worldInfo;
    h.sendPacket({
      type: 'Login',
      entityId: p.entityId,
      username: p.username,
      gameType: p.gameType.getID(),
      hardcore: info.hardcore,
      difficulty: w.difficultySetting,
      maxPlayers: this.settings.maxPlayers,
      terrainType: info.terrainType,
      worldName: info.worldName,
      spawnX: info.spawnX,
      spawnY: info.spawnY,
      spawnZ: info.spawnZ,
      viewDistance: this.settings.viewDistance,
      allowCommands: this.settings.allowCommands,
    });
    // The guest keeps this to get its things back when it rejoins (MC|Rejoin).
    h.sendPacket({ type: 'CustomPayload', channel: 'MC|Rejoin', data: fromHex(h.token) });
    h.sendPacket({ type: 'SpawnPosition', x: info.spawnX, y: info.spawnY, z: info.spawnZ });
    p.sendPlayerAbilities();
    h.sendPacket({ type: 'UpdateTime', totalTime: info.totalTime, worldTime: info.worldTime });
    if (w.isRaining()) h.sendPacket({ type: 'GameEvent', reason: 1, value: 0 });
    h.setPlayerLocation(p.posX, p.posY, p.posZ, p.rotationYaw, p.rotationPitch);
    p.inventoryContainer.addCraftingToCrafters(p);
    h.sendPacket({ type: 'BlockItemSwitch', slot: p.inventory.currentItem });
    for (const e of p.getActivePotionEffects?.() ?? []) h.sendPacket({ type: 'EntityEffect', entityId: p.entityId, effectId: e.getPotionID(), amplifier: e.getAmplifier(), duration: e.getDuration(), ambient: e.getIsAmbient() });
    w.spawnEntityInWorld(p);
    // Everyone's entry in the new player's TAB list, and the new player in everyone's.
    for (const entry of this.playerList()) h.sendPacket({ type: 'PlayerInfo', name: entry.name, connected: true, ping: entry.responseTime });
    this.broadcast({ type: 'PlayerInfo', name: p.username, connected: true, ping: 0 }, h);
    this.sendChatMsg(`§e${p.username} joined the game.`);
  }

  /** The connection ended (left, kicked, timed out): remove the player and tell everyone. */
  playerDisconnected(h: NetServerHandler, reason: string): void {
    const i = this.handlers.indexOf(h);
    if (i >= 0) this.handlers.splice(i, 1);
    this.tracker.removePlayer(h);
    this.particles.delete(h);
    const p = h.player;
    if (!p) return;
    console.info(`[lan] ${p.username} lost connection: ${reason}`);
    p.mountEntityAndWakeUp();
    const lower = p.username.toLowerCase();
    if (this.world.worldInfo.hardcore && p.getHealth() <= 0) this.hardcoreDead.add(lower);
    this.saved.delete(lower);
    while (this.saved.size >= MAX_SAVED_PLAYERS) this.saved.delete(this.saved.keys().next().value!);
    this.saved.set(lower, {
      x: p.posX,
      y: p.posY,
      z: p.posZ,
      yaw: p.rotationYaw,
      pitch: p.rotationPitch,
      main: [...p.inventory.mainInventory],
      armor: [...p.inventory.armorInventory],
      currentItem: p.inventory.currentItem,
      state: PlayerSpawning.captureState(p),
      dead: p.getHealth() <= 0,
      token: h.token,
      leftAt: performance.now(),
    });
    // The cursor stack and open windows drop like on a server logout.
    p.closeInventory();
    this.world.removeEntity(p);
    this.tracker.removeEntity(p);
    this.broadcast({ type: 'PlayerInfo', name: p.username, connected: false, ping: 9999 });
    this.sendChatMsg(`§e${p.username} left the game.`);
    h.player = null;
  }

  /** respawnPlayer: a dead guest comes back as a fresh EntityPlayerMP with the same id. */
  respawnPlayer(h: NetServerHandler): void {
    const old = h.player;
    if (!old || old.getHealth() > 0) return;
    const w = this.world;
    if (w.worldInfo.hardcore) {
      // 1.5.2 put a "Death in Hardcore" ban entry; the name stays out for the session.
      this.hardcoreDead.add(old.username.toLowerCase());
      h.kick("You have died. Game over, man, it's game over!");
      return;
    }
    this.tracker.removeEntity(old);
    w.removeEntity(old);
    const p = new EntityPlayerMP(w, old.username, this);
    p.entityId = old.entityId;
    PlayerSpawning.respawn(p, old, w);
    h.setPlayer(p);
    p.theItemInWorldManager.initializeGameType(old.gameType);
    h.sendPacket({ type: 'Respawn', gameType: p.gameType.getID(), difficulty: w.difficultySetting, terrainType: w.worldInfo.terrainType });
    h.setPlayerLocation(p.posX, p.posY, p.posZ, p.rotationYaw, p.rotationPitch);
    h.sendPacket({ type: 'UpdateTime', totalTime: w.worldInfo.totalTime, worldTime: w.worldInfo.worldTime });
    p.sendPlayerAbilities();
    p.setPlayerHealthUpdated();
    p.inventoryContainer.addCraftingToCrafters(p);
    h.sendPacket({ type: 'BlockItemSwitch', slot: p.inventory.currentItem });
    w.spawnEntityInWorld(p);
  }

  /** Every connected player's name and ping, the host first (the TAB list). */
  playerList(): PlayerListEntry[] {
    const out: PlayerListEntry[] = [{ name: this.host.hostName, responseTime: 0 }];
    for (const h of this.handlers) if (h.state === 'play' && h.player) out.push({ name: h.player.username, responseTime: h.player.ping });
    return out;
  }

  // ------------------------------------------------------------------ moderation (/kick, /ban, /pardon, /whitelist)

  private handlerNamed(name: string): NetServerHandler | null {
    const lower = name.toLowerCase();
    return this.handlers.find((h) => (h.state === 'play' || h.state === 'login') && h.username.toLowerCase() === lower) ?? null;
  }

  /** Names of the connected guests. */
  guestNames(): string[] {
    return this.handlers.filter((h) => h.state === 'play').map((h) => h.username);
  }

  kickPlayer(name: string, reason: string): boolean {
    const h = this.handlerNamed(name);
    if (!h) return false;
    h.kick(reason);
    return true;
  }

  /** Keeps the name out until the room closes; a connected guest is kicked and its tab ignored too. */
  banPlayer(name: string, reason: string): void {
    this.bannedNames.set(name.toLowerCase(), reason);
    this.handlerNamed(name)?.kick(`You are banned from this game: ${reason}`, BAN_MS);
  }

  pardonPlayer(name: string): boolean {
    return this.bannedNames.delete(name.toLowerCase());
  }

  bannedPlayers(): string[] {
    return [...this.bannedNames.keys()];
  }

  /** The guests' players (for commands: @p, /tp, /tell). */
  guestPlayers(): EntityPlayerMP[] {
    return this.handlers.filter((h) => h.state === 'play' && h.player).map((h) => h.player!);
  }

  getEntityById(id: number): Entity | null {
    return this.tracker.getEntity(id);
  }

  /** func_96290_a: spawn protection does not apply to a LAN game. */
  isBlockProtected(_x: number, _y: number, _z: number, _p: EntityPlayer): boolean {
    return false;
  }

  // ------------------------------------------------------------------ chat and commands

  sendChatMsg(msg: string): void {
    this.host.printChat(msg);
    this.broadcast({ type: 'Chat', message: msg });
  }

  executeCommand(sender: ICommandSender, line: string): void {
    this.host.commandManager()?.executeCommand(sender, line);
  }

  getPossibleCompletions(sender: EntityPlayer, text: string): string[] {
    return this.host.getPossibleCompletions(sender, text);
  }

  broadcast(p: Packet, except: NetServerHandler | null = null): void {
    for (const h of this.handlers) if (h !== except && h.state === 'play') h.sendPacket(p);
  }

  /** sendToAllNearExcept: guests whose player is within `range` of the point. */
  private sendNear(x: number, y: number, z: number, range: number, p: Packet, except: EntityPlayer | null = null): void {
    const r2 = range * range;
    for (const h of this.handlers) {
      const pl = h.player;
      if (h.state !== 'play' || !pl || pl === except) continue;
      const dx = pl.posX - x;
      const dy = pl.posY - y;
      const dz = pl.posZ - z;
      if (dx * dx + dy * dy + dz * dz < r2) h.sendPacket(p);
    }
  }

  sendToTracking(e: Entity, p: Packet, self: boolean): void {
    this.tracker.sendToTracking(e, p, self);
  }

  // ------------------------------------------------------------------ tick

  /** One host game tick, after the world's. */
  tick(): void {
    if (!this.open) return;
    this.ticks++;
    for (const h of [...this.handlers]) h.networkTick();
    this.processLogins();
    this.updateLoadCenters();
    // Guests take turns at the front of the queue, so the compression budget is shared fairly.
    this.encodeMs = 0;
    this.encodedThisTick = 0;
    const n = this.handlers.length;
    for (let i = 0; i < n; i++) {
      const h = this.handlers[(i + this.ticks) % n];
      if (h.state === 'play') this.updateChunks(h);
    }
    this.flushBlockChanges();
    this.tracker.update(this.handlers, this.settings.viewDistance * 16 - 16);
    this.flushParticles();
    const w = this.world;
    if (this.ticks % 20 === 0) this.broadcast({ type: 'UpdateTime', totalTime: w.worldInfo.totalTime, worldTime: w.worldInfo.worldTime });
    const raining = w.isRaining();
    if (raining !== this.wasRaining) {
      this.wasRaining = raining;
      this.broadcast({ type: 'GameEvent', reason: raining ? 1 : 2, value: 0 });
    }
    if (this.ticks % 100 === 0) for (const entry of this.playerList()) this.broadcast({ type: 'PlayerInfo', name: entry.name, connected: true, ping: entry.responseTime });
    if (this.ticks % 200 === 0) for (const [k, v] of this.chunkCache) if (this.ticks - v.tick > 200) this.chunkCache.delete(k);
    for (const h of this.handlers) h.flush();
  }

  /** The host keeps the spawn and every guest's surroundings loaded. */
  private updateLoadCenters(): void {
    const info = this.world.worldInfo;
    const centers = [{ x: info.spawnX, z: info.spawnZ, radius: SPAWN_RADIUS + 1 }];
    for (const h of this.handlers) {
      const p = h.player;
      if (h.state === 'play' && p) centers.push({ x: p.posX, z: p.posZ, radius: this.radiusFor(p) });
    }
    for (const { h } of this.pendingLogins) {
      const s = this.saved.get(h.username.toLowerCase());
      if (s && !s.dead) centers.push({ x: s.x, z: s.z, radius: 1 });
    }
    this.host.setExtraLoadCenters(centers);
  }

  private radiusFor(p: EntityPlayerMP): number {
    return Math.max(2, Math.min(this.settings.viewDistance, p.renderDistance));
  }

  /** PlayerManager: chunks enter and leave the guest's view as its player moves, nearest first. */
  private updateChunks(h: NetServerHandler): void {
    const p = h.player!;
    const w = this.world;
    const cx = MathHelper.floor_double(p.posX) >> 4;
    const cz = MathHelper.floor_double(p.posZ) >> 4;
    const r = this.radiusFor(p);
    for (const k of [...h.loadedChunks]) {
      const kx = Math.floor(k / 0x400000) - 0x200000;
      const kz = (k % 0x400000) - 0x200000;
      if (Math.abs(kx - cx) > r + 1 || Math.abs(kz - cz) > r + 1 || !w.chunkExists(kx, kz)) {
        h.loadedChunks.delete(k);
        h.sendPacket({ type: 'UnloadChunk', cx: kx, cz: kz });
      }
    }
    let sent = 0;
    if (h.conn.pendingSends > MAX_PENDING_SENDS) return;
    for (let ring = 0; ring <= r && sent < CHUNKS_PER_TICK; ring++) {
      for (let dx = -ring; dx <= ring && sent < CHUNKS_PER_TICK; dx++) {
        for (let dz = -ring; dz <= ring && sent < CHUNKS_PER_TICK; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const kx = cx + dx;
          const kz = cz + dz;
          const k = World.chunkKey(kx, kz);
          if (h.loadedChunks.has(k) || !w.chunkExists(kx, kz)) continue;
          if (!this.chunkCache.has(k) && this.encodedThisTick > 0 && this.encodeMs >= ENCODE_BUDGET_MS) return;
          h.sendPacket(this.mapChunkPacket(w.getChunkFromChunkCoords(kx, kz)));
          h.loadedChunks.add(k);
          sent++;
        }
      }
    }
  }

  /** Packet51MapChunk of a whole chunk (cached until a block in it changes). */
  private mapChunkPacket(c: Chunk): Packet {
    const k = World.chunkKey(c.xPosition, c.zPosition);
    let cached = this.chunkCache.get(k);
    if (!cached) {
      const t0 = performance.now();
      const sections = [];
      for (let i = 0; i < 16; i++) {
        const s = c.sections[i];
        if (s && !s.isEmpty()) sections.push({ index: i, blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
      }
      cached = { data: encodeChunkData({ sections, biomes: c.biomes }), tick: this.ticks };
      this.chunkCache.set(k, cached);
      this.encodeMs += performance.now() - t0;
      this.encodedThisTick++;
    }
    const tiles = [...c.chunkTileEntityMap.values()].filter((te) => !te.isInvalid()).map((te) => describeTileEntity(te.toDescriptor()));
    return { type: 'MapChunk', cx: c.xPosition, cz: c.zPosition, data: cached.data, tileEntities: tiles };
  }

  /** PlayerInstance.sendChunkUpdate: one change, a few, or the whole chunk again. */
  private flushBlockChanges(): void {
    const w = this.world;
    for (const [k, set] of this.changedBlocks) {
      const kx = Math.floor(k / 0x400000) - 0x200000;
      const kz = (k % 0x400000) - 0x200000;
      const watchers = this.handlers.filter((h) => h.state === 'play' && h.loadedChunks.has(k));
      if (watchers.length === 0 || !w.chunkExists(kx, kz)) continue;
      let packet: Packet;
      if (set.size === 1) {
        const pos = set.values().next().value!;
        const x = (kx << 4) + ((pos >> 12) & 15);
        const z = (kz << 4) + ((pos >> 8) & 15);
        const y = pos & 255;
        packet = { type: 'BlockChange', x, y, z, id: w.getBlockId(x, y, z), meta: w.getBlockMetadata(x, y, z) };
      } else if (set.size < 64) {
        const records: number[] = [];
        for (const pos of set) {
          const lx = (pos >> 12) & 15;
          const lz = (pos >> 8) & 15;
          const y = pos & 255;
          const x = (kx << 4) + lx;
          const z = (kz << 4) + lz;
          records.push((lx << 28) | (lz << 24) | (y << 16) | ((w.getBlockId(x, y, z) & 4095) << 4) | (w.getBlockMetadata(x, y, z) & 15));
        }
        packet = { type: 'MultiBlockChange', cx: kx, cz: kz, records };
      } else {
        packet = this.mapChunkPacket(w.getChunkFromChunkCoords(kx, kz));
      }
      for (const h of watchers) h.sendPacket(packet);
    }
    this.changedBlocks.clear();
    for (const key of this.changedTiles) {
      const [x, y, z] = key.split(',').map(Number);
      const te = w.getBlockTileEntity(x, y, z);
      if (!te) continue;
      const k = World.chunkKey(x >> 4, z >> 4);
      const tag = describeTileEntity(te.toDescriptor());
      for (const h of this.handlers) if (h.state === 'play' && h.loadedChunks.has(k)) h.sendPacket({ type: 'TileEntityData', x, y, z, tag });
    }
    this.changedTiles.clear();
  }

  private flushParticles(): void {
    for (const [h, kinds] of this.particles) {
      for (const [name, values] of kinds) h.sendPacket({ type: 'WorldParticles', name, values });
    }
    this.particles.clear();
  }

  // ------------------------------------------------------------------ WorldNetListener

  blockChanged(x: number, y: number, z: number): void {
    if (y < 0 || y >= 256) return;
    const k = World.chunkKey(x >> 4, z >> 4);
    // The light of a change spreads up to 15 blocks, into the neighbouring chunks too.
    if (this.chunkCache.size > 0) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.chunkCache.delete(World.chunkKey((x >> 4) + dx, (z >> 4) + dz));
    let set = this.changedBlocks.get(k);
    if (!set) this.changedBlocks.set(k, (set = new Set()));
    set.add(((x & 15) << 12) | ((z & 15) << 8) | y);
  }

  tileEntityChanged(x: number, y: number, z: number): void {
    if (this.world.getBlockTileEntity(x, y, z)) this.changedTiles.add(`${x},${y},${z}`);
  }

  entityAnimation(e: Entity, animation: number): void {
    this.tracker.sendToTracking(e, { type: 'Animation', entityId: e.entityId, animate: animation }, false);
  }

  entityStatus(e: Entity, status: number): void {
    this.tracker.sendToTracking(e, { type: 'EntityStatus', entityId: e.entityId, status }, true);
  }

  itemCollected(item: Entity, collector: Entity): void {
    this.tracker.sendToTracking(item, { type: 'Collect', collectedEntityId: item.entityId, collectorEntityId: collector.entityId }, false);
  }

  explosion(e: Explosion): void {
    const records: number[] = [];
    const bx = MathHelper.floor_double(e.explosionX);
    const by = MathHelper.floor_double(e.explosionY);
    const bz = MathHelper.floor_double(e.explosionZ);
    for (const [x, y, z] of e.affectedBlockPositions.slice(0, 16384)) records.push(((x - bx) & 255) | (((y - by) & 255) << 8) | (((z - bz) & 255) << 16));
    for (const h of this.handlers) {
      const p = h.player;
      if (h.state !== 'play' || !p || p.getDistanceSq(e.explosionX, e.explosionY, e.explosionZ) >= 4096) continue;
      const push = e.getPlayerKnockbackMap().get(p);
      if (push) h.allowPush(push.xCoord, push.yCoord, push.zCoord);
      h.sendPacket({ type: 'Explosion', x: e.explosionX, y: e.explosionY, z: e.explosionZ, size: e.explosionSize, records, motionX: push?.xCoord ?? 0, motionY: push?.yCoord ?? 0, motionZ: push?.zCoord ?? 0 });
    }
  }

  blockEvent(x: number, y: number, z: number, blockId: number, eventId: number, param: number): void {
    this.sendNear(x, y, z, 64, { type: 'BlockEvent', x, y, z, blockId, eventId, param });
  }

  lightning(bolt: Entity): void {
    this.sendNear(bolt.posX, bolt.posY, bolt.posZ, 512, { type: 'Weather', entityId: bolt.entityId, x: MathHelper.floor_double(bolt.posX * 32), y: MathHelper.floor_double(bolt.posY * 32), z: MathHelper.floor_double(bolt.posZ * 32) });
  }

  playerSleep(p: EntityPlayer, x: number, y: number, z: number): void {
    const pk: Packet = { type: 'Sleep', entityId: p.entityId, x, y, z };
    this.tracker.sendToTracking(p, pk, true);
    if (p instanceof EntityPlayerMP) p.handler?.setPlayerLocation(p.posX, p.posY, p.posZ, p.rotationYaw, p.rotationPitch);
  }

  playerWake(p: EntityPlayer): void {
    this.tracker.sendToTracking(p, { type: 'Animation', entityId: p.entityId, animate: 3 }, true);
  }

  playerSound(p: EntityPlayer, name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (this.world.localEffectsOnly) return;
    this.sendNear(x, y, z, volume > 1 ? 16 * volume : 16, levelSound(name, x, y, z, volume, pitch), p);
  }

  entityTickFailed(e: Entity, err: unknown): void {
    console.error('[lan] ticking entity failed', e, err);
    if (e instanceof EntityPlayerMP) e.handler?.kick('Internal server error');
    else if (e !== this.host.hostPlayer()) e.setDead();
  }

  // ------------------------------------------------------------------ IWorldAccess (WorldManager)

  markBlockForUpdate(): void {}
  markBlockForRenderUpdate(): void {}
  markBlockRangeForRenderUpdate(): void {}

  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (this.world.localEffectsOnly) return;
    this.sendNear(x, y, z, volume > 1 ? 16 * volume : 16, levelSound(name, x, y, z, volume, pitch), this.world.soundExcept);
  }

  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const w = this.world;
    if (w.localEffectsOnly || this.handlers.length === 0) return;
    const source = w.tickingEntity;
    for (const h of this.handlers) {
      const p = h.player;
      if (h.state !== 'play' || !p || p === source) continue;
      const dx = p.posX - x;
      const dy = p.posY - y;
      const dz = p.posZ - z;
      if (dx * dx + dy * dy + dz * dz > 1024) continue;
      let kinds = this.particles.get(h);
      if (!kinds) this.particles.set(h, (kinds = new Map()));
      let list = kinds.get(name);
      if (!list) {
        if (kinds.size > 32) continue;
        kinds.set(name, (list = []));
      }
      if (list.length >= PARTICLES_PER_TICK * 6) continue;
      list.push(x, y, z, vx, vy, vz);
    }
  }

  onEntityCreate(e: Entity): void {
    this.tracker.addEntity(e);
  }

  onEntityDestroy(e: Entity): void {
    this.tracker.removeEntity(e);
  }

  playAuxSFX(player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void {
    if (this.world.localEffectsOnly && type !== 2001) return;
    this.sendNear(x, y, z, 64, { type: 'AuxSFX', sfxId: type, x, y, z, data, broadcast: false }, player);
  }

  broadcastSound(type: number, x: number, y: number, z: number, data: number): void {
    this.broadcast({ type: 'AuxSFX', sfxId: type, x, y, z, data, broadcast: true });
  }

  destroyBlockPartially(entityId: number, x: number, y: number, z: number, progress: number): void {
    for (const h of this.handlers) {
      const p = h.player;
      if (h.state !== 'play' || !p || p.entityId === entityId) continue;
      const dx = x - p.posX;
      const dy = y - p.posY;
      const dz = z - p.posZ;
      if (dx * dx + dy * dy + dz * dz < 1024) h.sendPacket({ type: 'BlockDestroy', entityId, x, y, z, progress });
    }
  }
}

function randomToken(): string {
  const b = new Uint8Array(REJOIN_TOKEN_BYTES);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function levelSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): Packet {
  return { type: 'LevelSound', name, x: Math.trunc(x * 8), y: Math.trunc(y * 8), z: Math.trunc(z * 8), volume, pitch: Math.max(0, Math.min(255, Math.trunc(pitch * 63))) };
}
