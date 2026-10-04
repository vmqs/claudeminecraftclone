import type { CommandHandler } from '../../command/CommandHandler';
import type { ICommandSender } from '../../command/ICommandSender';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { PlayerSpawning, type PlayerSurvivalState } from '../../entity/PlayerSpawning';
import type { ItemStack } from '../../item/ItemStack';
import type { EnumGameType } from '../../world/EnumGameType';
import type { DimensionManager } from '../../world/DimensionManager';
import { serverPosY } from '../../world/Teleporter';
import { World } from '../../world/World';
import { AchievementIds } from '../../stats/StatIds';
import type { Packet } from '../protocol/Packets';
import type { HostTransport, NetConnection } from '../transport/Transport';
import { EntityPlayerMP, type PlayerServer } from './EntityPlayerMP';
import { LanWorld, type LanWorldServer } from './LanWorld';
import { NetServerHandler, REJOIN_TOKEN_BYTES, toHex } from './NetServerHandler';
import { SkinRelay } from './SkinRelay';
import { ModelRelay } from './ModelRelay';

/** What the LAN server needs from the host's game client. */
export interface LanHostClient {
  /** The overworld (the world spawn, logins, respawns). */
  readonly world: World;
  /** Every world the host runs (one per loaded dimension); just `world` without dimensions. */
  worlds?(): World[];
  /** The host's dimensions (loading one, arrivals, Teleporters); absent in tests without them. */
  dimensions?(): DimensionManager | null;
  /** The host's own player (it changes on respawn). */
  hostPlayer(): EntityPlayer | null;
  readonly hostName: string;
  /** A line in the host's chat. */
  printChat(msg: string): void;
  commandManager(): CommandHandler | null;
  getPossibleCompletions(sender: EntityPlayer, text: string): string[];
  /** Areas the host must keep loaded besides its own (guests, the spawn); `dim` defaults to the overworld. */
  setExtraLoadCenters(centers: { x: number; z: number; radius: number; dim?: number }[]): void;
  /** The host player's skin, 64x32 RGBA (null: Steve); see SkinRelay. */
  hostSkin?(): Uint8Array | null;
  /** A guest's skin for the host's renderer (null: Steve again). */
  playerSkin?(name: string, rgba: Uint8Array | null): void;
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
  /** The dimension the player was in. */
  dim: number;
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

/** A guest on its way to another dimension, waiting for the chunks around its arrival point. */
interface GuestArrival {
  h: NetServerHandler;
  dim: number;
  /** Where the trip started (kept for a guest who leaves before arriving). */
  fromDim: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  fromYaw: number;
  place: boolean;
  entrance: boolean;
}

const CHUNKS_PER_TICK = 4;
/**
 * Main-thread time per tick for compressing chunks for all guests together (a chunk of normal
 * terrain takes about 2 ms); chunks already compressed for someone else cost nothing and still go.
 */
const ENCODE_BUDGET_MS = 4;
const MAX_PENDING_SENDS = 24;
const PARTICLES_PER_TICK = 200;
const SPAWN_RADIUS = 1;
/** 1.5.2's world height in Packet9Respawn. */
const WORLD_HEIGHT = 256;

/**
 * The LAN game a host opened (IntegratedServer.shareToLAN with its ServerConfigurationManager,
 * PlayerManager, EntityTracker and WorldManager): accepts guests, streams them the world around
 * their players, tracks entities for them, forwards world events and runs their commands. The
 * host's World stays authoritative and keeps running the single-player code; this layer only
 * watches it (World.netEvents, an IWorldAccess) and applies what guests do through their
 * EntityPlayerMP.
 */
export class LanServer implements PlayerServer, LanWorldServer {
  /** The overworld: spawn, logins and respawns. */
  readonly world: World;
  readonly handlers: NetServerHandler[] = [];
  /** Each of the host's worlds as the LAN game sees it (tracker, block changes, sounds). */
  readonly views = new Map<World, LanWorld>();
  /** Everyone's skins (MC|Skin). */
  readonly skins = new SkinRelay(this);
  /** Everyone's player models (MC|Model). */
  readonly models = new ModelRelay(this);
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
  private readonly particles = new Map<NetServerHandler, Map<string, number[]>>();
  ticks = 0;
  /** Chunk compression this tick (ENCODE_BUDGET_MS), over every world. */
  private encodeMs = 0;
  private encodedThisTick = 0;
  private wasRaining = false;
  private open = false;
  /** Guests whose portal trip waits for the end of the world tick, and those waiting for chunks. */
  private readonly travelRequests: { p: EntityPlayerMP; dim: number }[] = [];
  private readonly arrivals: GuestArrival[] = [];

  constructor(
    readonly host: LanHostClient,
    readonly transport: HostTransport,
    readonly settings: LanSettings,
  ) {
    this.world = host.world;
  }

  /** The host's worlds now (the overworld alone without dimensions). */
  private hostWorlds(): World[] {
    return this.host.worlds?.() ?? [this.world];
  }

  /** Follows the host's loaded worlds: a view for each new one, none for unloaded ones. */
  private syncWorlds(): void {
    const now = this.hostWorlds();
    for (const w of now) {
      if (this.views.has(w)) continue;
      const v = new LanWorld(this, w);
      v.attach();
      this.views.set(w, v);
    }
    for (const [w, v] of this.views) {
      if (now.includes(w)) continue;
      v.detach();
      this.views.delete(w);
    }
  }

  /** The view of a world (null when the host does not run it). */
  viewOf(w: World): LanWorld | null {
    return this.views.get(w) ?? null;
  }

  hostPlayer(): EntityPlayer | null {
    return this.host.hostPlayer();
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
    this.syncWorlds();
    this.wasRaining = this.world.isRaining();
  }

  /** Closes the game: guests see "Server closed", the world goes back to single player. */
  stop(reason = 'Server closed'): void {
    for (const h of [...this.handlers]) h.kick(reason);
    this.handlers.length = 0;
    this.pendingLogins.length = 0;
    this.transport.stop();
    for (const v of this.views.values()) v.detach();
    this.views.clear();
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

  /** The world of a dimension, loaded if needed (the overworld without dimensions). */
  private worldFor(dim: number): World | null {
    if (dim === 0) return this.world;
    const m = this.host.dimensions?.();
    if (!m) return null;
    try {
      return m.load(dim).world;
    } catch {
      return null;
    }
  }

  private chunkReadyAt(dim: number, x: number, z: number): boolean {
    const w = this.worldFor(dim);
    return !!w && w.chunkExists(MathHelper.floor_double(x) >> 4, MathHelper.floor_double(z) >> 4);
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
      const ready = saved && !saved.dead ? this.chunkReadyAt(saved.dim, saved.x, saved.z) : this.spawnAreaReady();
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
    // ServerConfigurationManager: the player logs into the world of its dimension.
    const w = (saved && !saved.dead ? this.worldFor(saved.dim) : null) ?? this.world;
    this.syncWorlds();
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
      dimension: w.provider.dimensionId,
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
    this.sendEffects(p);
    w.spawnEntityInWorld(p);
    // Everyone's entry in the new player's TAB list, and the new player in everyone's.
    for (const entry of this.playerList()) h.sendPacket({ type: 'PlayerInfo', name: entry.name, connected: true, ping: entry.responseTime });
    this.broadcast({ type: 'PlayerInfo', name: p.username, connected: true, ping: 0 }, h);
    this.skins.joined(h);
    this.models.joined(h);
    this.sendChatMsg(`§e${p.username} joined the game.`);
  }

  /** The connection ended (left, kicked, timed out): remove the player and tell everyone. */
  playerDisconnected(h: NetServerHandler, reason: string): void {
    const i = this.handlers.indexOf(h);
    if (i >= 0) this.handlers.splice(i, 1);
    for (const v of this.views.values()) v.tracker.removePlayer(h);
    this.particles.delete(h);
    const ai = this.arrivals.findIndex((a) => a.h === h);
    if (ai >= 0) {
      // Between two worlds: remembered in the portal it went into.
      const a = this.arrivals[ai];
      this.arrivals.splice(ai, 1);
      if (h.player) {
        h.player.dimension = a.fromDim;
        h.player.setLocationAndAngles(a.fromX, a.fromY, a.fromZ, a.fromYaw, h.player.rotationPitch);
      }
    }
    this.skins.left(h);
    this.models.left(h);
    const p = h.player;
    if (!p) return;
    console.info(`[lan] ${p.username} lost connection: ${reason}`);
    p.mountEntityAndWakeUp();
    const lower = p.username.toLowerCase();
    if (this.world.worldInfo.hardcore && p.getHealth() <= 0) this.hardcoreDead.add(lower);
    this.saved.delete(lower);
    while (this.saved.size >= MAX_SAVED_PLAYERS) this.saved.delete(this.saved.keys().next().value!);
    this.saved.set(lower, {
      dim: p.dimension,
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
    p.worldObj.removeEntity(p);
    this.viewOf(p.worldObj)?.tracker.removeEntity(p);
    this.broadcast({ type: 'PlayerInfo', name: p.username, connected: false, ping: 9999 });
    this.sendChatMsg(`§e${p.username} left the game.`);
    h.player = null;
  }

  /**
   * respawnPlayer(player, 0, keepEverything): a dead guest (or one back from the End's credits)
   * comes back as a fresh EntityPlayerMP with the same id, always in the overworld.
   */
  respawnPlayer(h: NetServerHandler): void {
    const old = h.player;
    const conquered = !!old?.playerConqueredTheEnd;
    if (!old || (old.getHealth() > 0 && !conquered)) return;
    const w = this.world;
    if (w.worldInfo.hardcore && !conquered) {
      // 1.5.2 put a "Death in Hardcore" ban entry; the name stays out for the session.
      this.hardcoreDead.add(old.username.toLowerCase());
      h.kick("You have died. Game over, man, it's game over!");
      return;
    }
    const oldWorld = old.worldObj;
    this.viewOf(oldWorld)?.tracker.removeEntity(old);
    this.viewOf(oldWorld)?.tracker.removePlayer(h);
    oldWorld.removePlayerEntityDangerously(old);
    if (oldWorld !== w) h.loadedChunks.clear();
    const p = new EntityPlayerMP(w, old.username, this);
    p.entityId = old.entityId;
    PlayerSpawning.respawn(p, old, w, conquered);
    h.setPlayer(p);
    p.theItemInWorldManager.initializeGameType(old.gameType);
    h.sendPacket({ type: 'Respawn', dimension: 0, gameType: p.gameType.getID(), difficulty: w.difficultySetting, terrainType: w.worldInfo.terrainType, worldHeight: WORLD_HEIGHT });
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

  /** An entity a guest in world `w` refers to by id (the overworld when not given). */
  getEntityById(id: number, w: World = this.world): Entity | null {
    const tracker = this.viewOf(w)?.tracker;
    if (!tracker) return null;
    const e = tracker.getEntity(id);
    if (e) return e;
    // A part of a multi-part entity (the dragon's follow its id, like WorldServer's id map).
    for (let i = 1; i <= 8; i++) {
      const part = tracker.getEntity(id - i)?.getParts()?.[i - 1];
      if (part && part.entityId === id) return part;
    }
    return null;
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

  sendToTracking(e: Entity, p: Packet, self: boolean): void {
    this.viewOf(e.worldObj)?.tracker.sendToTracking(e, p, self);
  }

  /** A particle for one guest, sent with the others at the end of the tick. */
  addParticle(h: NetServerHandler, name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    let kinds = this.particles.get(h);
    if (!kinds) this.particles.set(h, (kinds = new Map()));
    let list = kinds.get(name);
    if (!list) {
      if (kinds.size > 32) return;
      kinds.set(name, (list = []));
    }
    if (list.length >= PARTICLES_PER_TICK * 6) return;
    list.push(x, y, z, vx, vy, vz);
  }

  private sendEffects(p: EntityPlayerMP): void {
    for (const e of p.getActivePotionEffects?.() ?? []) p.handler.sendPacket({ type: 'EntityEffect', entityId: p.entityId, effectId: e.getPotionID(), amplifier: e.getAmplifier(), duration: e.getDuration(), ambient: e.getIsAmbient() });
  }

  // ------------------------------------------------------------------ dimensions

  /** Entity.travelToDimension of a guest's player: carried out after the world's tick. */
  requestTravel(p: EntityPlayer, dim: number): void {
    if (!(p instanceof EntityPlayerMP) || !p.handler || this.isTravelling(p)) return;
    if (!this.travelRequests.some((r) => r.p === p)) this.travelRequests.push({ p, dim });
  }

  /** Whether the guest's player is between two worlds (its actions are ignored meanwhile). */
  isTravelling(p: EntityPlayer): boolean {
    return this.arrivals.some((a) => a.h.player === p);
  }

  /** EntityPlayerMP.travelToDimension: achievements, the credits, or the trip itself. */
  private travelGuest(p: EntityPlayerMP, target: number): void {
    const h = p.handler;
    const m = this.host.dimensions?.();
    if (!h || h.player !== p || p.isDead || !m) return;
    const from = p.dimension;
    if (from === 1 && target === 1) {
      p.triggerAchievement(AchievementIds.theEnd2);
      p.worldObj.removeEntity(p);
      p.playerConqueredTheEnd = true;
      h.sendPacket({ type: 'GameEvent', reason: 4, value: 0 });
      return;
    }
    if (from === 1 && target === 0) {
      p.triggerAchievement(AchievementIds.theEnd);
      target = 1;
    } else {
      p.triggerAchievement(AchievementIds.portal);
    }
    // transferPlayerToDimension: the Respawn packet first, then the player leaves its world.
    const old = p.worldObj;
    const fromX = p.posX;
    const fromY = serverPosY(p);
    const fromZ = p.posZ;
    const fromYaw = p.rotationYaw;
    const a = m.arrivalPoint(p, from, target);
    const d = m.load(target);
    h.sendPacket({ type: 'Respawn', dimension: target, gameType: p.gameType.getID(), difficulty: old.difficultySetting, terrainType: d.world.worldInfo.terrainType, worldHeight: WORLD_HEIGHT });
    this.viewOf(old)?.tracker.removePlayer(h);
    old.removePlayerEntityDangerously(p);
    p.isDead = false;
    h.loadedChunks.clear();
    p.dimension = target;
    p.setWorld(d.world);
    p.theItemInWorldManager.setWorld(d.world);
    p.setLocationAndAngles(a.x, a.y, a.z, a.yaw, a.pitch);
    this.syncWorlds();
    this.arrivals.push({ h, dim: target, fromDim: from, fromX, fromY, fromZ, fromYaw, place: a.place, entrance: a.entrance });
  }

  /** Guests whose destination chunks are loaded go into their new world (transferEntityToWorld's end). */
  private processArrivals(): void {
    const m = this.host.dimensions?.();
    for (let i = 0; i < this.arrivals.length; i++) {
      const a = this.arrivals[i];
      const p = a.h.player;
      if (!m || !p || a.h.state !== 'play') {
        this.arrivals.splice(i--, 1);
        continue;
      }
      if (!m.arrivalReady(a.dim, p.posX, p.posZ, a.place && !a.entrance)) continue;
      this.arrivals.splice(i--, 1);
      const w = m.getWorld(a.dim)!;
      w.spawnEntityInWorld(p);
      w.updateEntityWithOptionalForce(p, false);
      if (a.place) m.teleporter(a.dim).placeInPortal(p, a.fromX, a.fromY, a.fromZ, a.fromYaw);
      if (!this.arrivals.some((o) => o.dim === a.dim)) m.releaseArrival(a.dim);
      p.timeUntilPortal = p.getPortalCooldown();
      w.updateEntityWithOptionalForce(p, false);
      const h = a.h;
      h.setPlayerLocation(p.posX, p.posY, p.posZ, p.rotationYaw, p.rotationPitch);
      // updateTimeAndWeatherForPlayer, syncPlayerInventory, the effects, a fresh status.
      const info = w.worldInfo;
      h.sendPacket({ type: 'UpdateTime', totalTime: info.totalTime, worldTime: info.worldTime });
      if (w.isRaining()) h.sendPacket({ type: 'GameEvent', reason: 1, value: 0 });
      p.sendContainerToPlayer(p.inventoryContainer);
      h.sendPacket({ type: 'BlockItemSwitch', slot: p.inventory.currentItem });
      p.sendPlayerAbilities();
      p.setPlayerHealthUpdated();
      this.sendEffects(p);
    }
  }

  // ------------------------------------------------------------------ tick

  /** One host game tick, after the world's. */
  tick(): void {
    if (!this.open) return;
    this.ticks++;
    this.syncWorlds();
    for (const h of [...this.handlers]) h.networkTick();
    this.processLogins();
    for (const r of this.travelRequests.splice(0)) this.travelGuest(r.p, r.dim);
    this.processArrivals();
    this.updateLoadCenters();
    // Guests take turns at the front of the queue, so the compression budget is shared fairly.
    this.encodeMs = 0;
    this.encodedThisTick = 0;
    for (const v of this.views.values()) {
      v.encodeMs = 0;
      v.encodedThisTick = 0;
    }
    const n = this.handlers.length;
    for (let i = 0; i < n; i++) {
      const h = this.handlers[(i + this.ticks) % n];
      if (h.state === 'play') this.updateChunks(h);
    }
    for (const v of this.views.values()) {
      v.flushBlockChanges();
      v.tracker.update(v.handlersHere(), this.settings.viewDistance * 16 - 16);
    }
    this.flushParticles();
    const w = this.world;
    if (this.ticks % 20 === 0) this.broadcast({ type: 'UpdateTime', totalTime: w.worldInfo.totalTime, worldTime: w.worldInfo.worldTime });
    const raining = w.isRaining();
    if (raining !== this.wasRaining) {
      this.wasRaining = raining;
      this.broadcast({ type: 'GameEvent', reason: raining ? 1 : 2, value: 0 });
    }
    if (this.ticks % 100 === 0) for (const entry of this.playerList()) this.broadcast({ type: 'PlayerInfo', name: entry.name, connected: true, ping: entry.responseTime });
    if (this.ticks % 200 === 0) for (const v of this.views.values()) v.pruneCache(this.ticks);
    this.skins.tick(this.ticks);
    this.models.tick(this.ticks);
    for (const h of this.handlers) h.flush();
  }

  /** The host keeps the spawn and every guest's surroundings loaded. */
  private updateLoadCenters(): void {
    const info = this.world.worldInfo;
    const centers: { x: number; z: number; radius: number; dim: number }[] = [{ x: info.spawnX, z: info.spawnZ, radius: SPAWN_RADIUS + 1, dim: 0 }];
    for (const h of this.handlers) {
      const p = h.player;
      if (h.state === 'play' && p) centers.push({ x: p.posX, z: p.posZ, radius: this.radiusFor(p), dim: p.worldObj.provider.dimensionId });
    }
    for (const { h } of this.pendingLogins) {
      const s = this.saved.get(h.username.toLowerCase());
      if (s && !s.dead) centers.push({ x: s.x, z: s.z, radius: 1, dim: s.dim });
    }
    this.host.setExtraLoadCenters(centers);
  }

  private radiusFor(p: EntityPlayerMP): number {
    return Math.max(2, Math.min(this.settings.viewDistance, p.renderDistance));
  }

  /** PlayerManager: chunks enter and leave the guest's view as its player moves, nearest first. */
  private updateChunks(h: NetServerHandler): void {
    const p = h.player!;
    const view = this.viewOf(p.worldObj);
    if (!view || this.isTravelling(p)) return;
    const w = view.world;
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
          if (!view.chunkCache.has(k) && this.encodedThisTick > 0 && this.encodeMs >= ENCODE_BUDGET_MS) return;
          const before = view.encodeMs;
          const encoded = view.encodedThisTick;
          h.sendPacket(view.mapChunkPacket(w.getChunkFromChunkCoords(kx, kz)));
          this.encodeMs += view.encodeMs - before;
          this.encodedThisTick += view.encodedThisTick - encoded;
          h.loadedChunks.add(k);
          sent++;
        }
      }
    }
  }

  private flushParticles(): void {
    for (const [h, kinds] of this.particles) {
      for (const [name, values] of kinds) h.sendPacket({ type: 'WorldParticles', name, values });
    }
    this.particles.clear();
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
