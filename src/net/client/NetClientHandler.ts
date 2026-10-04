import { Block } from '../../block/Block';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { EntityLiving } from '../../entity/EntityLiving';
import { EntityOtherPlayerMP } from '../../entity/EntityOtherPlayerMP';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { PotionHooks } from '../../entity/PotionEffects';
import { InventoryBasic } from '../../gui/inventory/InventoryBasic';
import type { IInventory } from '../../gui/inventory/IInventory';
import type { ItemStack } from '../../item/ItemStack';
import { Chunk } from '../../world/Chunk';
import { ChunkSection } from '../../world/ChunkSection';
import { EnumGameType } from '../../world/EnumGameType';
import { Explosion } from '../../world/Explosion';
import { TileEntity } from '../../world/tileentity/TileEntity';
import { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import { TileEntityBrewingStand } from '../../world/tileentity/TileEntityBrewingStand';
import { TileEntityDispenser, TileEntityDropper } from '../../world/tileentity/TileEntityDispenser';
import { TileEntityFurnace } from '../../world/tileentity/TileEntityFurnace';
import { TileEntityHopper } from '../../world/tileentity/TileEntityHopper';
import { World, WorldInfo } from '../../world/World';
import { getProviderForDimension } from '../../world/WorldProviders';
import { shareScoreboard } from '../../command/scoreboard/Scoreboard';
import type { TagCompound } from '../../item/ItemStack';
import { applyMetadata, createFromSpawn } from '../EntityNetData';
import { ChunkCodecLimits, decodeChunkData } from '../protocol/ChunkCodec';
import { decodeFrame, encodeFrame, GAME_VERSION, PROTOCOL_VERSION, type Packet, type PacketOf, allowedFrom } from '../protocol/Packets';
import { ProtocolError } from '../protocol/PacketBuffer';
import type { NetConnection } from '../transport/Transport';
import { WindowType } from '../WindowTypes';
import { EntityClientPlayerMP } from './EntityClientPlayerMP';
import type { PlayerControllerGuest } from './PlayerControllerGuest';
import { INTERPOLATION_STEPS, setRemoteTarget, snapToTarget } from './RemoteEntityTick';
import { WorldClient } from './WorldClient';
import { decodePlayerSkin, encodeOwnSkin, SKIN_CHANNEL } from '../SkinSync';
import { MODEL_CHANNEL, ModelSyncClient } from '../ModelSync';
import type { PlayerModelRegistry } from '../../client/model/PlayerModels';

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Largest message the host may send (a chunk is far smaller), and the most packets in one. */
const MAX_HOST_MESSAGE = 8 * 1024 * 1024;
const MAX_HOST_PACKETS = 8192;
/** Ticks without hearing from the host before giving up (keep-alives come every second). */
const TIMEOUT_TICKS = 600;
const PARTICLE_NAME = /^[A-Za-z0-9_]{1,40}$/;

/** What the guest's handler needs from the game client (Minecraft, or a test stand-in). */
export interface GuestClient {
  readonly username: string;
  /**
   * Login accepted: the world and player exist; show them (Downloading terrain until ready). Also
   * a dimension change (Packet9Respawn to another dimension: `changedDimension`).
   */
  startGuestWorld(world: WorldClient, player: EntityClientPlayerMP, gameType: EnumGameType, changedDimension?: boolean): void;
  /** Packet70GameEvent 4: the End's credits; `closed` asks the host for the respawn. */
  showWinGame?(closed: () => void): void;
  /** Packet9Respawn: the new player replaces the old one. */
  respawnGuestPlayer(player: EntityClientPlayerMP, gameType: EnumGameType): void;
  /** The connection ended; `titleKey` is the disconnect screen's title (a lang key). */
  guestDisconnected(titleKey: string, reason: string): void;
  printChat(msg: string): void;
  /** The game mode changed (Packet70 reason 3). */
  setGameType(t: EnumGameType): void;
  /** The client's (PlayerClient) side of the player, for windows, chat and effects. */
  readonly playerClient: ConstructorParameters<typeof EntityClientPlayerMP>[0];
  /** Tab-completion answer for an open chat screen. */
  autocompleteResponse(names: string[]): void;
  /** Critical-hit particles (EntityCrit2FX), absent in tests. */
  critParticles?(target: Entity, magic: boolean): void;
  /** The guest's controller, for the selected slot the host sets. */
  readonly guestController: PlayerControllerGuest | null;
  /** Render distance (0 far .. 3 tiny) and chat visibility (Packet204ClientInfo); sent when they change. */
  clientSettings?(): { renderDistance: number; chatVisibility: number };
  /** The rejoin token kept for this room and name (hex), if any. */
  rejoinToken?(): string | null;
  /** The host gave this player a rejoin token (MC|Rejoin): keep it for the room and name. */
  storeRejoinToken?(token: string): void;
  /** This player's skin (64x32 RGBA, null for Steve); sent to the host when it changes (MC|Skin). */
  localSkin?(): Uint8Array | null;
  /** Another player's skin from the host (null: Steve). */
  playerSkin?(name: string, rgba: Uint8Array | null): void;
  /** The player-model registry (MC|Model; absent: the game's shared one). */
  readonly models?: PlayerModelRegistry;
}

/**
 * The guest's NetClientHandler: logs in, then turns every packet from the host into changes of
 * the guest's world (chunks, blocks, tile entities, entities, time, weather, effects) and of its
 * player (position, health, inventory, windows, game mode), and sends what the player does.
 * Everything from the host is checked as well (sizes, ids, coordinates), so a broken or hostile
 * host cannot crash the guest.
 */
export class NetClientHandler {
  world: WorldClient | null = null;
  player: EntityClientPlayerMP | null = null;
  state: 'handshake' | 'play' | 'closed' = 'handshake';
  /** The TAB list: name -> ping. */
  readonly playerInfo = new Map<string, number>();
  maxPlayers = 8;
  /** Whether the host's first position for the player arrived (GuiDownloadTerrain waits for it). */
  positionReceived = false;
  private readonly incoming: Packet[] = [];
  private readonly outgoing: Packet[] = [];
  private readonly entities = new Map<number, Entity>();
  /** The host's positions of entities in 1/32 blocks (serverPosX/Y/Z). */
  private readonly serverPos = new Map<number, [number, number, number]>();
  private ticksSinceMessage = 0;
  private disconnectReason: { title: string; reason: string } | null = null;
  bytesReceived = 0;

  constructor(
    readonly client: GuestClient,
    readonly conn: NetConnection,
  ) {
    conn.onMessage = (frame) => this.onMessage(frame);
    conn.onClose = (reason) => this.onClosed(reason);
  }

  /** Sends the handshake (Packet2): protocol version and username. */
  start(): void {
    this.addToSendQueue({ type: 'Handshake', protocolVersion: PROTOCOL_VERSION, gameVersion: GAME_VERSION, username: this.client.username });
    // Coming back to a room: the token the host gave this name gets its things back.
    const token = this.client.rejoinToken?.() ?? null;
    if (token && /^[0-9a-f]{32}$/.test(token)) this.addToSendQueue({ type: 'CustomPayload', channel: 'MC|Rejoin', data: fromHex(token) });
    this.flush();
  }

  addToSendQueue(p: Packet): void {
    if (this.state === 'closed') return;
    this.outgoing.push(p);
  }

  /** Sends what the tick produced as one message. */
  flush(): void {
    if (this.outgoing.length === 0) return;
    if (this.conn.isOpen) this.conn.send(encodeFrame(this.outgoing));
    this.outgoing.length = 0;
  }

  /** Leaves the game (Disconnect in the pause menu): Packet255 "Quitting", then close. */
  disconnect(): void {
    if (this.state === 'closed') return;
    this.outgoing.length = 0;
    this.outgoing.push({ type: 'KickDisconnect', reason: 'Quitting' });
    this.flush();
    this.state = 'closed';
    this.conn.close();
  }

  private onMessage(frame: Uint8Array): void {
    if (this.state === 'closed') return;
    this.bytesReceived += frame.length;
    let packets: Packet[];
    try {
      packets = decodeFrame(frame, MAX_HOST_MESSAGE, MAX_HOST_PACKETS);
    } catch (e) {
      this.fail('disconnect.lost', e instanceof ProtocolError ? `Bad data from the host: ${e.message}` : 'Bad data from the host');
      return;
    }
    for (const p of packets) {
      if (!allowedFrom(p.type, 'server')) {
        this.fail('disconnect.lost', `Bad data from the host: unexpected ${p.type}`);
        return;
      }
    }
    this.ticksSinceMessage = 0;
    this.incoming.push(...packets);
  }

  private onClosed(reason: string): void {
    if (this.state === 'closed') return;
    // A kick arrives just before the connection closes: show its reason, not the closing.
    const kick = this.incoming.find((p): p is PacketOf<'KickDisconnect'> => p.type === 'KickDisconnect');
    if (kick) {
      this.fail('disconnect.disconnected', kick.reason);
      return;
    }
    this.fail('disconnect.lost', reason || 'disconnect.endOfStream');
  }

  /** Ends the session and shows why (handleErrorMessage / handleKickDisconnect). */
  private fail(title: string, reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.disconnectReason = { title, reason };
    this.conn.close();
    this.client.guestDisconnected(title, reason);
  }

  get lastDisconnect(): { title: string; reason: string } | null {
    return this.disconnectReason;
  }

  /** processReadPackets: once per game tick (PlayerControllerMP.updateController in 1.5.2). */
  processReadPackets(): void {
    if (this.state === 'closed') return;
    const packets = this.incoming.splice(0);
    for (const p of packets) {
      if ((this.state as string) === 'closed') return;
      try {
        this.handle(p);
      } catch (e) {
        console.error('[lan] error handling', p.type, e);
      }
    }
    if (this.state === 'play') {
      this.sendClientInfo();
      this.sendSkin();
      this.modelSync.tick();
    }
    if (++this.ticksSinceMessage > TIMEOUT_TICKS) this.fail('disconnect.lost', 'disconnect.timeout');
  }

  // ------------------------------------------------------------------ dispatch

  private handle(p: Packet): void {
    if (this.state === 'handshake') {
      if (p.type === 'Login') this.handleLogin(p);
      else if (p.type === 'KickDisconnect') this.fail('disconnect.disconnected', p.reason);
      return;
    }
    const w = this.world!;
    const player = this.player!;
    switch (p.type) {
      case 'KeepAlive':
        return this.addToSendQueue({ type: 'KeepAlive', id: p.id });
      case 'Chat':
        return this.client.printChat(p.message);
      case 'UpdateTime':
        if (Number.isFinite(p.totalTime) && Number.isFinite(p.worldTime)) {
          w.worldInfo.totalTime = p.totalTime;
          w.worldInfo.worldTime = p.worldTime;
        }
        return;
      case 'PlayerInventory': {
        const e = this.entities.get(p.entityId);
        if (e && e.isLivingEntity && p.slot <= 4) (e as EntityLiving).setCurrentItemOrArmor(p.slot, p.item);
        return;
      }
      case 'SpawnPosition':
        w.worldInfo.spawnX = p.x;
        w.worldInfo.spawnY = p.y;
        w.worldInfo.spawnZ = p.z;
        return;
      case 'UpdateHealth':
        player.setHealthFromServer(p.health);
        player.getFoodStats().setFoodLevel(p.food);
        player.getFoodStats().setFoodSaturationLevel(p.saturation);
        return;
      case 'Respawn':
        return this.handleRespawn(p);
      case 'PlayerPosLook':
        return this.handlePosLook(p);
      case 'BlockItemSwitch':
        if (p.slot >= 0 && p.slot < 9) {
          player.inventory.currentItem = p.slot;
          this.client.guestController?.setCurrentPlayItem(p.slot);
        }
        return;
      case 'Sleep': {
        const e = this.entities.get(p.entityId) ?? (p.entityId === player.entityId ? player : null);
        if (e && e.isPlayerEntity) (e as EntityPlayer).sleepInBedAt(p.x, p.y, p.z);
        return;
      }
      case 'Animation':
        return this.handleAnimation(p.entityId, p.animate);
      case 'NamedEntitySpawn':
        return this.handleNamedSpawn(p);
      case 'Collect': {
        const item = this.entities.get(p.collectedEntityId);
        const by = this.entities.get(p.collectorEntityId) ?? (p.collectorEntityId === player.entityId ? player : null);
        if (item && by && by.isLivingEntity) EntityLiving.collectEffect?.(item, by as EntityLiving);
        if (item) this.removeEntity(p.collectedEntityId);
        return;
      }
      case 'SpawnEntity':
        return this.handleSpawn(p);
      case 'EntityVelocity': {
        const e = this.entities.get(p.entityId) ?? (p.entityId === player.entityId ? player : null);
        if (e) e.setVelocity(p.motionX / 8000, p.motionY / 8000, p.motionZ / 8000);
        return;
      }
      case 'DestroyEntity':
        for (const id of p.entityIds) this.removeEntity(id);
        return;
      case 'RelEntityMove':
      case 'RelEntityMoveLook':
      case 'EntityLook':
      case 'EntityTeleport':
        return this.handleMove(p);
      case 'EntityHeadRotation': {
        const e = this.entities.get(p.entityId);
        if (e && e.isLivingEntity) (e as EntityLiving).setRotationYawHead((p.headYaw * 360) / 256);
        return;
      }
      case 'EntityStatus': {
        const e = this.entities.get(p.entityId) ?? (p.entityId === player.entityId ? player : null);
        e?.handleHealthUpdate(p.status);
        return;
      }
      case 'AttachEntity':
        return this.handleAttach(p.entityId, p.vehicleEntityId);
      case 'EntityMetadata': {
        const e = this.entities.get(p.entityId) ?? (p.entityId === player.entityId ? player : null);
        if (e && e !== player) applyMetadata(e, p.metadata);
        return;
      }
      case 'EntityEffect': {
        if (p.entityId !== player.entityId) return;
        const effect = PotionHooks.createEffect?.(p.effectId, p.duration, p.amplifier);
        if (effect) player.addPotionEffect(effect);
        return;
      }
      case 'RemoveEntityEffect':
        if (p.entityId === player.entityId) player.removePotionEffectClient(p.effectId);
        return;
      case 'Experience':
        player.setXPStats(p.experience, p.total, p.level);
        return;
      case 'UnloadChunk':
        return this.unloadChunk(p.cx, p.cz);
      case 'MapChunk':
        return this.handleMapChunk(p);
      case 'MultiBlockChange':
        return this.handleMultiBlockChange(p);
      case 'BlockChange':
        return this.setBlockFromHost(p.x, p.y, p.z, p.id, p.meta);
      case 'BlockEvent':
        if (p.y >= 0 && p.y < 256 && w.getBlockId(p.x, p.y, p.z) === p.blockId) Block.blocksList[p.blockId]?.onBlockEventReceived(w, p.x, p.y, p.z, p.eventId, p.param);
        return;
      case 'BlockDestroy':
        if (p.y >= 0 && p.y < 256 && p.progress >= -1 && p.progress < 10) w.destroyBlockInWorldPartially(p.entityId, p.x, p.y, p.z, p.progress);
        return;
      case 'Explosion':
        return this.handleExplosion(p);
      case 'AuxSFX':
        if (p.broadcast) w.broadcastSound(p.sfxId, p.x, p.y, p.z, p.data);
        else w.playAuxSFX(p.sfxId, p.x, p.y, p.z, p.data);
        return;
      case 'LevelSound':
        if (/^[a-z0-9_.]{1,64}$/i.test(p.name)) w.playSound(p.x / 8, p.y / 8, p.z / 8, p.name, p.volume, p.pitch / 63, false);
        return;
      case 'WorldParticles':
        if (!PARTICLE_NAME.test(p.name)) return;
        for (let i = 0; i + 5 < p.values.length && i < 6 * 2000; i += 6) {
          const v = p.values;
          w.spawnParticle(p.name, v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5]);
        }
        return;
      case 'GameEvent':
        if (p.reason === 0) player.addChatMessage('tile.bed.notValid');
        else if (p.reason === 1) w.clientWeather.onRainEvent(true);
        else if (p.reason === 2) w.clientWeather.onRainEvent(false);
        else if (p.reason === 3) this.client.setGameType(EnumGameType.getByID(p.value));
        else if (p.reason === 4) {
          // GuiWinGame: the credits, then Packet205ClientCommand(1) asks for the respawn.
          const done = () => this.addToSendQueue({ type: 'ClientCommand', payload: 1 });
          if (this.client.showWinGame) this.client.showWinGame(done);
          else done();
        }
        return;
      case 'Weather': {
        const bolt = World.lightningBoltFactory?.(w, p.x / 32, p.y / 32, p.z / 32);
        if (bolt) {
          bolt.entityId = p.entityId;
          w.addWeatherEffect(bolt);
        }
        return;
      }
      case 'OpenWindow':
        return this.handleOpenWindow(p);
      case 'CloseWindow':
        player.closeScreenFromHost();
        return;
      case 'SetSlot':
        return this.handleSetSlot(p.windowId, p.slot, p.item);
      case 'WindowItems':
        return this.handleWindowItems(p.windowId, p.items);
      case 'UpdateProgressBar':
        if (player.openContainer.windowId === p.windowId && p.windowId !== 0) player.openContainer.updateProgressBar(p.progressBar, p.value);
        return;
      case 'Transaction':
        return;
      case 'UpdateSign':
        return this.handleUpdateSign(p);
      case 'TileEntityData':
        return this.handleTileEntityData(p.x, p.y, p.z, p.tag);
      case 'Statistic':
        return player.incrementStat(p.statisticId, p.amount);
      case 'PlayerInfo':
        if (p.connected) this.playerInfo.set(p.name, p.ping);
        else this.playerInfo.delete(p.name);
        return;
      case 'PlayerAbilities': {
        const c = player.capabilities;
        c.disableDamage = (p.flags & 1) !== 0;
        c.isFlying = (p.flags & 2) !== 0;
        c.allowFlying = (p.flags & 4) !== 0;
        c.isCreativeMode = (p.flags & 8) !== 0;
        if (Number.isFinite(p.flySpeed)) c.setFlySpeed(p.flySpeed);
        if (Number.isFinite(p.walkSpeed)) c.setPlayerWalkSpeed(p.walkSpeed);
        return;
      }
      case 'AutoComplete':
        return this.client.autocompleteResponse(p.text.split('\u0000'));
      case 'CustomPayload':
        if (p.channel === 'MC|Rejoin' && p.data.length === 16) this.client.storeRejoinToken?.([...p.data].map((v) => v.toString(16).padStart(2, '0')).join(''));
        else if (p.channel === MODEL_CHANNEL) this.modelSync.received(p.data);
        else if (p.channel === SKIN_CHANNEL) {
          const skin = decodePlayerSkin(p.data);
          if (skin && skin.name !== player.username) this.client.playerSkin?.(skin.name, skin.rgba);
        }
        return;
      case 'KickDisconnect':
        return this.fail('disconnect.disconnected', p.reason);
      default:
        return;
    }
  }

  // ------------------------------------------------------------------ login and player

  private handleLogin(p: PacketOf<'Login'>): void {
    const info = new WorldInfo();
    info.worldName = p.worldName;
    info.terrainType = p.terrainType === 'flat' || p.terrainType === 'largeBiomes' ? p.terrainType : 'default';
    info.gameType = p.gameType;
    info.hardcore = p.hardcore;
    info.allowCommands = p.allowCommands;
    info.spawnX = p.spawnX;
    info.spawnY = p.spawnY;
    info.spawnZ = p.spawnZ;
    info.raining = false;
    info.thundering = false;
    const w = new WorldClient(info, getProviderForDimension(p.dimension) ?? undefined);
    w.difficultySetting = p.difficulty & 3;
    this.world = w;
    this.maxPlayers = Math.max(1, Math.min(64, p.maxPlayers));
    const player = new EntityClientPlayerMP(this.client.playerClient, w, p.username, this);
    player.entityId = p.entityId;
    this.player = player;
    w.localPlayer = player;
    this.state = 'play';
    const type = EnumGameType.getByID(p.gameType);
    player.gameType = type;
    this.client.startGuestWorld(w, player, type);
    this.sentClientInfo = '';
    this.sendClientInfo();
  }

  /** MC|Model: this player's model to the host, the others' from it. */
  private modelSyncClient: ModelSyncClient | null = null;
  private get modelSync(): ModelSyncClient {
    return (this.modelSyncClient ??= new ModelSyncClient(this, () => this.client.username, this.client.models));
  }

  private sentClientInfo = '';
  /** The skin last sent to the host (undefined: none yet). */
  private sentSkin: Uint8Array | null | undefined = undefined;

  /** MC|Skin: this player's skin, after the login and whenever it changes. */
  private sendSkin(): void {
    if (!this.client.localSkin) return;
    const skin = this.client.localSkin();
    if (skin === this.sentSkin || (skin === null && this.sentSkin === undefined)) return;
    this.sentSkin = skin;
    this.addToSendQueue({ type: 'CustomPayload', channel: SKIN_CHANNEL, data: encodeOwnSkin(skin) });
  }

  /** GameSettings.sendSettingsToServer: the render distance (the host streams that far) and chat visibility. */
  private sendClientInfo(): void {
    const c = this.client.clientSettings?.() ?? { renderDistance: 1, chatVisibility: 0 };
    const info = { viewDistance: c.renderDistance & 3, chatVisibility: Math.max(0, Math.min(2, c.chatVisibility | 0)) };
    const key = `${info.viewDistance}/${info.chatVisibility}`;
    if (key === this.sentClientInfo) return;
    this.sentClientInfo = key;
    this.addToSendQueue({ type: 'ClientInfo', ...info });
  }

  private handleRespawn(p: PacketOf<'Respawn'>): void {
    const old = this.player!;
    const provider = p.dimension !== old.dimension ? getProviderForDimension(p.dimension) : null;
    if (provider) {
      // Another dimension: a new WorldClient (the old world's scoreboard kept), its own player.
      const oldWorld = this.world!;
      const prev = oldWorld.worldInfo;
      const info = new WorldInfo();
      info.worldName = prev.worldName;
      info.terrainType = p.terrainType === 'flat' || p.terrainType === 'largeBiomes' ? p.terrainType : 'default';
      info.gameType = p.gameType;
      info.hardcore = prev.hardcore;
      info.allowCommands = prev.allowCommands;
      info.spawnX = prev.spawnX;
      info.spawnY = prev.spawnY;
      info.spawnZ = prev.spawnZ;
      info.worldTime = prev.worldTime;
      info.totalTime = prev.totalTime;
      const nw = new WorldClient(info, provider);
      shareScoreboard(oldWorld, nw);
      nw.difficultySetting = p.difficulty & 3;
      this.world = nw;
      this.entities.clear();
      this.serverPos.clear();
      this.positionReceived = false;
      const player = new EntityClientPlayerMP(this.client.playerClient, nw, old.username, this);
      player.entityId = old.entityId;
      this.player = player;
      nw.localPlayer = player;
      const type = EnumGameType.getByID(p.gameType);
      player.gameType = type;
      this.client.startGuestWorld(nw, player, type, true);
      return;
    }
    const w = this.world!;
    w.removeEntity(old);
    const player = new EntityClientPlayerMP(this.client.playerClient, w, old.username, this);
    player.entityId = old.entityId;
    w.difficultySetting = p.difficulty & 3;
    this.player = player;
    w.localPlayer = player;
    const type = EnumGameType.getByID(p.gameType);
    player.gameType = type;
    this.client.respawnGuestPlayer(player, type);
  }

  /** handleFlying: the host put the player somewhere; confirm it (Packet13 back). */
  private handlePosLook(p: PacketOf<'PlayerPosLook'>): void {
    const player = this.player!;
    if (![p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite)) return;
    player.ySize = 0;
    player.motionX = player.motionY = player.motionZ = 0;
    player.setPositionAndRotation(p.x, p.y + player.yOffset, p.z, p.yaw, p.pitch);
    // The feet exactly where the host said (eye height added and taken off again can round
    // below a block's top, and the player would sink into it).
    const b = player.boundingBox;
    b.setBounds(b.minX, p.y, b.minZ, b.maxX, p.y + (b.maxY - b.minY), b.maxZ);
    this.addToSendQueue({ type: 'Flying', flags: 1 | 2 | (player.onGround ? 4 : 0), x: player.posX, y: player.boundingBox.minY, stance: player.posY, z: player.posZ, yaw: player.rotationYaw, pitch: player.rotationPitch });
    this.positionReceived = true;
  }

  // ------------------------------------------------------------------ entities

  private entity(id: number): Entity | null {
    return this.entities.get(id) ?? null;
  }

  /** The entity the host calls `id` (including the guest's own player). */
  getEntityByID(id: number): Entity | null {
    if (this.player && id === this.player.entityId) return this.player;
    return this.entity(id);
  }

  private track(e: Entity, id: number, x: number, y: number, z: number): void {
    if (this.player && id === this.player.entityId) return;
    this.removeEntity(id);
    e.entityId = id;
    // The dragon's parts take the ids after it, as on the host (Packet24MobSpawn).
    e.getParts()?.forEach((part, i) => (part.entityId = id + 1 + i));
    this.serverPos.set(id, [Math.floor(x * 32), Math.floor(y * 32), Math.floor(z * 32)]);
    this.entities.set(id, e);
    this.world!.addEntityFromHost(e);
  }

  private removeEntity(id: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    this.entities.delete(id);
    this.serverPos.delete(id);
    this.world?.removeEntity(e);
  }

  private handleNamedSpawn(p: PacketOf<'NamedEntitySpawn'>): void {
    if (![p.x, p.y, p.z].every(Number.isFinite)) return;
    const e = new EntityOtherPlayerMP(this.world!, p.name);
    e.prevPosX = e.lastTickPosX = p.x;
    e.prevPosY = e.lastTickPosY = p.y;
    e.prevPosZ = e.lastTickPosZ = p.z;
    e.setPositionAndRotation(p.x, p.y, p.z, p.yaw, p.pitch);
    e.rotationYawHead = p.headYaw;
    e.inventory.mainInventory[e.inventory.currentItem] = p.currentItem;
    applyMetadata(e, p.metadata);
    this.track(e, p.entityId, p.x, p.y, p.z);
  }

  private handleSpawn(p: PacketOf<'SpawnEntity'>): void {
    if (![p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite)) return;
    const e = createFromSpawn(this.world!, p.name, p.x, p.y, p.z, p.data, (id) => this.getEntityByID(id));
    if (!e) return;
    const hanging = p.name === 'Painting' || p.name === 'ItemFrame';
    if (!hanging) {
      e.setPosition(p.x, p.y, p.z);
      e.rotationYaw = e.prevRotationYaw = p.yaw;
      e.rotationPitch = e.prevRotationPitch = p.pitch;
    }
    e.prevPosX = e.lastTickPosX = e.posX;
    e.prevPosY = e.lastTickPosY = e.posY;
    e.prevPosZ = e.lastTickPosZ = e.posZ;
    if (e.isLivingEntity) {
      const l = e as EntityLiving;
      l.rotationYawHead = l.prevRotationYawHead = p.headYaw;
      l.renderYawOffset = l.prevRenderYawOffset = p.yaw;
    }
    if ([p.motionX, p.motionY, p.motionZ].every(Number.isFinite)) e.setVelocity(p.motionX, p.motionY, p.motionZ);
    applyMetadata(e, p.metadata);
    this.track(e, p.entityId, e.posX, e.posY, e.posZ);
  }

  /** Packet31-34: the host's position in 1/32 blocks, approached over a few ticks. */
  private handleMove(p: PacketOf<'RelEntityMove'> | PacketOf<'RelEntityMoveLook'> | PacketOf<'EntityLook'> | PacketOf<'EntityTeleport'>): void {
    const e = this.entities.get(p.entityId);
    const pos = this.serverPos.get(p.entityId);
    if (!e || !pos) return;
    let yaw = e.rotationYaw;
    let pitch = e.rotationPitch;
    if (p.type === 'EntityTeleport') {
      pos[0] = p.x;
      pos[1] = p.y;
      pos[2] = p.z;
    } else if (p.type === 'RelEntityMove' || p.type === 'RelEntityMoveLook') {
      pos[0] += p.dx;
      pos[1] += p.dy;
      pos[2] += p.dz;
    }
    if (p.type !== 'RelEntityMove') {
      yaw = (p.yaw * 360) / 256;
      pitch = (p.pitch * 360) / 256;
    }
    // Teleports nudge the height a little so the entity does not sink (1/64 block, as 1.5.2).
    const x = pos[0] / 32;
    const y = pos[1] / 32 + (p.type === 'EntityTeleport' ? 0.015625 : 0);
    const z = pos[2] / 32;
    if (e instanceof EntityOtherPlayerMP) e.setPositionAndRotation2(x, y, z, yaw, pitch, INTERPOLATION_STEPS);
    else setRemoteTarget(e, x, y, z, yaw, pitch);
  }

  private handleAnimation(id: number, anim: number): void {
    const e = this.getEntityByID(id);
    if (!e) return;
    if (anim === 1 && e.isLivingEntity) (e as EntityLiving).swingItem();
    else if (anim === 2) e.performHurtAnimation();
    else if (anim === 3 && e.isPlayerEntity) (e as EntityPlayer).wakeUpPlayer(false, false, false);
    else if (anim === 6) this.client.critParticles?.(e, false);
    else if (anim === 7) this.client.critParticles?.(e, true);
  }

  /** Packet39: riding starts or ends (the guest's player too). */
  private handleAttach(id: number, vehicleId: number): void {
    const player = this.player!;
    const rider = id === player.entityId ? player : this.entity(id);
    if (!rider) return;
    const vehicle = vehicleId >= 0 ? this.getEntityByID(vehicleId) : null;
    if (vehicle === rider) return;
    if (rider === player) player.openingFromHost = true;
    try {
      if (vehicle === null) {
        if (rider.ridingEntity) rider.mountEntity(null);
      } else if (rider.ridingEntity !== vehicle) {
        rider.mountEntity(vehicle);
        snapToTarget(vehicle);
      }
    } finally {
      player.openingFromHost = false;
    }
  }

  // ------------------------------------------------------------------ chunks and blocks

  private handleMapChunk(p: PacketOf<'MapChunk'>): void {
    const w = this.world!;
    if (Math.abs(p.cx) > 2000000 || Math.abs(p.cz) > 2000000) return;
    const data = decodeChunkData(p.data);
    const old = w.chunkExists(p.cx, p.cz) ? w.getChunkFromChunkCoords(p.cx, p.cz) : null;
    const c = new Chunk(w, p.cx, p.cz);
    for (const s of data.sections) {
      const sec = new ChunkSection(s.index << 4, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
      if (!sec.isEmpty()) c.sections[s.index] = sec;
    }
    c.biomes.set(data.biomes);
    c.generateHeightMap();
    let min = 2147483647;
    for (let i = 0; i < 256; i++) if (c.heightMap[i] < min) min = c.heightMap[i];
    c.heightMapMinimum = min;
    if (Array.isArray(p.tileEntities)) {
      for (const tag of p.tileEntities.slice(0, ChunkCodecLimits.MAX_TILE_ENTITIES)) {
        if (!tag || typeof tag !== 'object') continue;
        const te = TileEntity.createAndLoadEntity(tag as TagCompound);
        if (!te || te.xCoord >> 4 !== p.cx || te.zCoord >> 4 !== p.cz || te.yCoord < 0 || te.yCoord >= 256) continue;
        c.addTileEntity(te);
      }
    }
    if (old) {
      // A resent chunk (64+ changes in a tick, an explosion): its entities move to the new
      // chunk and stay in the world (removeChunk would unload whatever the old one still holds).
      for (const list of old.entityLists) {
        const moved = [...list];
        list.length = 0;
        for (const e of moved) c.addEntity(e);
      }
      w.removeChunk(p.cx, p.cz);
    }
    c.isModified = false;
    w.addChunk(c);
  }

  private unloadChunk(cx: number, cz: number): void {
    const w = this.world!;
    if (!w.chunkExists(cx, cz)) return;
    const c = w.getChunkFromChunkCoords(cx, cz);
    for (const list of c.entityLists) {
      for (const e of [...list]) {
        if (e === this.player) continue;
        for (const [id, known] of this.entities) {
          if (known === e) {
            this.entities.delete(id);
            this.serverPos.delete(id);
            break;
          }
        }
      }
    }
    w.removeChunk(cx, cz);
  }

  private setBlockFromHost(x: number, y: number, z: number, id: number, meta: number): void {
    const w = this.world!;
    if (y < 0 || y >= 256 || (id !== 0 && !Block.blocksList[id])) return;
    if (!w.chunkExists(x >> 4, z >> 4)) return;
    w.setBlock(x, y, z, id, meta & 15, 3);
  }

  private handleMultiBlockChange(p: PacketOf<'MultiBlockChange'>): void {
    const x0 = p.cx << 4;
    const z0 = p.cz << 4;
    for (const r of p.records) {
      const lx = (r >>> 28) & 15;
      const lz = (r >>> 24) & 15;
      const y = (r >>> 16) & 255;
      const id = (r >>> 4) & 4095;
      this.setBlockFromHost(x0 + lx, y, z0 + lz, id, r & 15);
    }
  }

  private handleTileEntityData(x: number, y: number, z: number, tag: unknown): void {
    const w = this.world!;
    if (y < 0 || y >= 256 || !tag || typeof tag !== 'object' || !w.chunkExists(x >> 4, z >> 4)) return;
    const t: TagCompound = { ...(tag as TagCompound), x, y, z };
    const te = w.getBlockTileEntity(x, y, z);
    if (te && TileEntity.getIdForClass(te.constructor as never) === t.id) {
      te.readFromNBT(t);
      w.markBlockForRenderUpdate(x, y, z);
      return;
    }
    const created = TileEntity.createAndLoadEntity(t);
    if (created) w.setBlockTileEntity(x, y, z, created);
  }

  private handleUpdateSign(p: PacketOf<'UpdateSign'>): void {
    const w = this.world!;
    if (p.y < 0 || p.y >= 256 || !w.blockExists(p.x, p.y, p.z)) return;
    const te = w.getBlockTileEntity(p.x, p.y, p.z) as unknown as { signText?: string[]; onInventoryChanged(): void } | null;
    if (!te || !Array.isArray(te.signText)) return;
    const lines = [p.line0, p.line1, p.line2, p.line3];
    for (let i = 0; i < 4; i++) te.signText[i] = lines[i].slice(0, 15);
    w.markBlockForRenderUpdate(p.x, p.y, p.z);
  }

  private handleExplosion(p: PacketOf<'Explosion'>): void {
    const w = this.world!;
    if (![p.x, p.y, p.z, p.size].every(Number.isFinite) || p.size < 0 || p.size > 64) return;
    const e = new Explosion(w, null, p.x, p.y, p.z, p.size);
    const bx = MathHelper.floor_double(p.x);
    const by = MathHelper.floor_double(p.y);
    const bz = MathHelper.floor_double(p.z);
    for (const r of p.records) {
      const dx = ((r & 255) << 24) >> 24;
      const dy = (((r >> 8) & 255) << 24) >> 24;
      const dz = (((r >> 16) & 255) << 24) >> 24;
      e.affectedBlockPositions.push([bx + dx, by + dy, bz + dz]);
    }
    e.doExplosionB(true);
    const player = this.player!;
    if ([p.motionX, p.motionY, p.motionZ].every(Number.isFinite)) {
      player.motionX += p.motionX;
      player.motionY += p.motionY;
      player.motionZ += p.motionZ;
    }
  }

  // ------------------------------------------------------------------ windows

  private handleOpenWindow(p: PacketOf<'OpenWindow'>): void {
    const player = this.player!;
    const w = this.world!;
    const size = Math.max(0, Math.min(p.slotsCount, 54));
    const title = p.title.slice(0, 64);
    const named = <T extends IInventory>(inv: T): T => {
      if (p.useTitle) (inv as unknown as { setCustomName?(n: string): void; setGuiDisplayName?(n: string): void }).setCustomName?.(title);
      if (p.useTitle) (inv as unknown as { setGuiDisplayName?(n: string): void }).setGuiDisplayName?.(title);
      return inv;
    };
    const tile = <T extends TileEntity>(te: T): T => {
      te.setWorldObj(w);
      te.xCoord = MathHelper.floor_double(player.posX);
      te.yCoord = MathHelper.floor_double(player.posY);
      te.zCoord = MathHelper.floor_double(player.posZ);
      return te;
    };
    player.openingFromHost = true;
    try {
      switch (p.inventoryType) {
        case WindowType.CHEST:
          player.displayGUIChest(new InventoryBasic(title, p.useTitle, Math.ceil(size / 9) * 9));
          break;
        case WindowType.WORKBENCH:
          player.displayGUIWorkbench(MathHelper.floor_double(player.posX), MathHelper.floor_double(player.posY), MathHelper.floor_double(player.posZ));
          break;
        case WindowType.FURNACE:
          player.displayGUIFurnace(named(tile(new TileEntityFurnace())) as unknown as IInventory);
          break;
        case WindowType.DISPENSER:
          player.displayGUIDispenser(named(tile(new TileEntityDispenser())) as unknown as IInventory);
          break;
        case WindowType.DROPPER:
          player.displayGUIDispenser(named(tile(new TileEntityDropper())) as unknown as IInventory);
          break;
        case WindowType.ENCHANTMENT:
          player.displayGUIEnchantment(p.x, p.y, p.z, p.useTitle ? title : null);
          break;
        case WindowType.BREWING_STAND:
          player.displayGUIBrewingStand(named(tile(new TileEntityBrewingStand())) as unknown as IInventory);
          break;
        case WindowType.BEACON:
          player.displayGUIBeacon(named(tile(new TileEntityBeacon())) as unknown as IInventory);
          break;
        case WindowType.ANVIL:
          player.displayGUIAnvil(p.x, p.y, p.z);
          break;
        case WindowType.HOPPER:
          player.displayGUIHopper(named(tile(new TileEntityHopper())) as unknown as IInventory);
          break;
        default:
          return;
      }
    } finally {
      player.openingFromHost = false;
    }
    player.openContainer.windowId = p.windowId;
  }

  private handleSetSlot(windowId: number, slot: number, item: ItemStack | null): void {
    const player = this.player!;
    if (windowId === -1) {
      player.inventory.setItemStack(item);
      return;
    }
    if (windowId === 0 && slot >= 36 && slot < 45) {
      const cur = player.inventoryContainer.inventorySlots[slot]?.getStack() ?? null;
      if (item && (!cur || cur.stackSize < item.stackSize)) item.animationsToGo = 5;
      player.inventoryContainer.putStackInSlot(slot, item);
      return;
    }
    const c = windowId === 0 ? player.inventoryContainer : player.openContainer;
    if (c.windowId === windowId && slot >= 0 && slot < c.inventorySlots.length) c.putStackInSlot(slot, item);
  }

  private handleWindowItems(windowId: number, items: (ItemStack | null)[]): void {
    const player = this.player!;
    const c = windowId === 0 ? player.inventoryContainer : player.openContainer;
    if (c.windowId !== windowId) return;
    for (let i = 0; i < items.length && i < c.inventorySlots.length; i++) c.putStackInSlot(i, items[i]);
  }

  // ------------------------------------------------------------------ queries

  /** The TAB list entries (name and ping), as GuiIngame.playerListProvider wants them. */
  playerList(): { entries: { name: string; responseTime: number }[]; maxPlayers: number } {
    return { entries: [...this.playerInfo].map(([name, responseTime]) => ({ name, responseTime })), maxPlayers: this.maxPlayers };
  }

  get entityCount(): number {
    return this.entities.size;
  }
}
