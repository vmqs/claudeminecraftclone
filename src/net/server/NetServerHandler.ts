import { Block } from '../../block/Block';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ClickMode, OUTSIDE_WINDOW } from '../../gui/inventory/Container';
import { ContainerBeacon } from '../../gui/inventory/ContainerBeacon';
import { ItemStack } from '../../item/ItemStack';
import { decodeFrame, encodeFrame, GAME_VERSION, PROTOCOL_VERSION, type Packet, type PacketOf, allowedFrom } from '../protocol/Packets';
import { ProtocolError } from '../protocol/PacketBuffer';
import { ABUSE_BAN_MS, type NetConnection } from '../transport/Transport';
import { isValidUsername } from '../Username';
import { isAllowedCreativeStack } from './CreativeItems';
import type { EntityPlayerMP } from './EntityPlayerMP';
import type { LanServer } from './LanServer';

const f = Math.fround;

/** Largest message a guest may send, and the most packets in one. */
export const MAX_GUEST_MESSAGE = 64 * 1024;
const MAX_GUEST_PACKETS = 256;
/** Packets a guest may send per tick on average (a token bucket) before it is kicked. */
const PACKET_RATE = 40;
const PACKET_BURST = 600;
/** Ticks without a message before the guest is dropped (NetServerHandler's 1200-tick timeout, shortened). */
const TIMEOUT_TICKS = 600;
/**
 * Movement packets: a client sends one per tick, so the host applies them at that rate (one per
 * host tick, or 20 a second when the host runs slow), with a little catch-up after jitter, and
 * keeps at most MOVE_QUEUE_MAX waiting.
 */
const MOVE_BURST = 5;
const MOVE_QUEUE_MAX = 40;
/**
 * The farthest one movement packet may go (blocks per client tick): sprint-jumping on ice stays
 * under 1, creative flight with sprint about 1.1, a fall at terminal speed 3.92. More is
 * corrected (setPlayerLocation), unless the host pushed the player (knockback, explosions).
 */
const MAX_STEP_WALK = 1.0;
const MAX_STEP_FLY = 2.5;
const MAX_STEP_UP = 1.5;
const MAX_STEP_DOWN = 4.0;
/** How long a push from the host widens those limits (ticks). */
const PUSH_TICKS = 40;

type Flying = PacketOf<'Flying'>;

const finite = (...v: number[]) => v.every((n) => Number.isFinite(n));

/**
 * One guest's connection on the host (NetLoginHandler + NetServerHandler): the handshake, then
 * every packet the guest sends, checked like the original server did (reach, positions, slots,
 * game mode, chat) plus limits on message size and rate, so a guest can never crash the host.
 */
export class NetServerHandler {
  player: EntityPlayerMP | null = null;
  username = '';
  state: 'handshake' | 'login' | 'play' | 'closed' = 'handshake';
  private readonly incoming: Packet[] = [];
  private readonly outgoing: Packet[] = [];
  private readonly moves: Flying[] = [];
  private currentTicks = 0;
  private lastReceived = 0;
  private tokens = PACKET_BURST;
  private keepAliveId = 0;
  private keepAliveSent = 0;
  private ticksOfLastKeepAlive = 0;
  private chatSpamThresholdCount = 0;
  private creativeItemCreationSpamThresholdTally = 0;
  private lastPosX = 0;
  private lastPosY = 0;
  private lastPosZ = 0;
  /** False after the server moved the player until the guest confirms the new position (hasMoved). */
  private hasMoved = true;
  private ticksForFloatKick = 0;
  /** Moves the guest may still apply now (a token bucket refilled per tick and by the clock). */
  private moveTokens = MOVE_BURST;
  private lastMoveRefill = 0;
  /** A push from the host (knockback, explosion) the guest's next moves may include. */
  private pushH = 0;
  private pushUp = 0;
  private pushTicks = 0;
  /** Loaded chunks on the guest (PlayerManager), by World.chunkKey. */
  readonly loadedChunks = new Set<number>();
  /** Bytes and messages sent (F3 and tests). */
  bytesSent = 0;
  framesSent = 0;

  constructor(
    readonly server: LanServer,
    readonly conn: NetConnection,
  ) {
    conn.onMessage = (frame) => this.onMessage(frame);
    conn.onClose = (reason) => this.onConnectionLost(reason);
  }

  // ------------------------------------------------------------------ transport

  private onMessage(frame: Uint8Array): void {
    if (this.state === 'closed') return;
    let packets: Packet[];
    try {
      packets = decodeFrame(frame, MAX_GUEST_MESSAGE, MAX_GUEST_PACKETS);
    } catch (e) {
      this.kick(e instanceof ProtocolError ? `Protocol error: ${e.message}` : 'Protocol error', true);
      return;
    }
    this.lastReceived = this.currentTicks;
    for (const p of packets) {
      if (!allowedFrom(p.type, 'client')) {
        this.kick(`Protocol error, unexpected packet ${p.type}`, true);
        return;
      }
    }
    this.tokens -= packets.length;
    if (this.tokens < 0) {
      this.kick('Sending too many packets', true);
      return;
    }
    this.incoming.push(...packets);
    if (this.incoming.length > PACKET_BURST * 2) this.kick('Sending too many packets', true);
  }

  private onConnectionLost(reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.server.playerDisconnected(this, reason);
  }

  sendPacket(p: Packet): void {
    if (this.state === 'closed') return;
    if (p.type === 'Chat' && this.player) {
      if (this.player.getChatVisibility() === 2) return;
    }
    this.outgoing.push(p);
  }

  /** Sends what the tick produced as frames of moderate size (chunks stay one per frame). */
  flush(): void {
    if (this.outgoing.length === 0 || !this.conn.isOpen) {
      this.outgoing.length = 0;
      return;
    }
    let batch: Packet[] = [];
    for (const p of this.outgoing) {
      if (p.type === 'MapChunk') {
        if (batch.length > 0) this.sendFrame(batch);
        batch = [];
        this.sendFrame([p]);
      } else {
        batch.push(p);
        if (batch.length >= 512) {
          this.sendFrame(batch);
          batch = [];
        }
      }
    }
    if (batch.length > 0) this.sendFrame(batch);
    this.outgoing.length = 0;
  }

  private sendFrame(packets: Packet[]): void {
    const frame = encodeFrame(packets);
    this.bytesSent += frame.length;
    this.framesSent++;
    this.conn.send(frame);
  }

  /**
   * Kicks the guest with a reason (Packet255) and lets everyone know it left. `abuse` (data no
   * game client sends: malformed packets, floods) also makes the host ignore that peer for a while.
   */
  kick(reason: string, abuse = false): void {
    if (this.state === 'closed') return;
    console.warn(`[lan] kicking ${this.username || this.conn.peerId}: ${reason}`);
    this.outgoing.length = 0;
    this.outgoing.push({ type: 'KickDisconnect', reason });
    this.flush();
    this.state = 'closed';
    this.conn.close(abuse ? ABUSE_BAN_MS : 0);
    this.server.playerDisconnected(this, reason);
  }

  // ------------------------------------------------------------------ tick

  /** networkTick: handle what arrived, keep-alive, timeouts. */
  networkTick(): void {
    this.currentTicks++;
    this.tokens = Math.min(PACKET_BURST, this.tokens + PACKET_RATE);
    if (this.chatSpamThresholdCount > 0) this.chatSpamThresholdCount--;
    if (this.creativeItemCreationSpamThresholdTally > 0) this.creativeItemCreationSpamThresholdTally--;
    const packets = this.incoming.splice(0);
    for (const p of packets) {
      if (this.state === 'closed') return;
      try {
        this.handle(p);
      } catch (e) {
        console.error('[lan] error handling', p.type, e);
        this.kick('Internal error handling ' + p.type);
        return;
      }
    }
    if (this.state === 'play' && this.currentTicks - this.ticksOfLastKeepAlive > 20) {
      this.ticksOfLastKeepAlive = this.currentTicks;
      this.keepAliveSent = performance.now();
      this.keepAliveId = (Math.random() * 0x7fffffff) | 0;
      this.sendPacket({ type: 'KeepAlive', id: this.keepAliveId });
    }
    if (this.currentTicks - this.lastReceived > TIMEOUT_TICKS) this.kick('Timed out');
  }

  private handle(p: Packet): void {
    if (this.state === 'handshake') {
      if (p.type === 'Handshake') this.handleHandshake(p);
      else if (p.type === 'KickDisconnect') this.onConnectionLost('Quitting');
      else this.kick('Protocol error, expected a handshake', true);
      return;
    }
    if (this.state === 'login') return;
    const player = this.player!;
    switch (p.type) {
      case 'KeepAlive':
        if (p.id === this.keepAliveId) player.ping = Math.round((player.ping * 3 + (performance.now() - this.keepAliveSent)) / 4);
        return;
      case 'Flying':
        return this.queueFlying(p);
      case 'Chat':
        return this.handleChat(p.message);
      case 'BlockDig':
        return this.handleBlockDig(p);
      case 'Place':
        return this.handlePlace(p);
      case 'BlockItemSwitch':
        if (p.slot >= 0 && p.slot < 9) player.inventory.currentItem = p.slot;
        return;
      case 'Animation':
        if (p.animate === 1) player.swingItem();
        return;
      case 'EntityAction':
        return this.handleEntityAction(p.state);
      case 'UseEntity':
        return this.handleUseEntity(p.targetEntity, p.leftClick);
      case 'ClientCommand':
        if (p.payload === 1) this.server.respawnPlayer(this);
        return;
      case 'CloseWindow':
        player.closeInventory();
        return;
      case 'WindowClick':
        return this.handleWindowClick(p);
      case 'CreativeSetSlot':
        return this.handleCreativeSetSlot(p.slot, p.item);
      case 'EnchantItem':
        if (player.openContainer.windowId === p.windowId && p.enchantment < 3) {
          player.openContainer.enchantItem(player, p.enchantment);
          player.openContainer.detectAndSendChanges();
        }
        return;
      case 'Transaction':
        return;
      case 'UpdateSign':
        return this.handleUpdateSign(p);
      case 'PlayerAbilities':
        player.capabilities.isFlying = (p.flags & 2) !== 0 && player.capabilities.allowFlying;
        return;
      case 'AutoComplete': {
        if (p.text.length > 100) return;
        const matches = this.server.getPossibleCompletions(player, p.text);
        this.sendPacket({ type: 'AutoComplete', text: matches.join('\u0000') });
        return;
      }
      case 'ClientInfo':
        player.chatVisibility = p.chatVisibility <= 2 ? p.chatVisibility : 0;
        player.renderDistance = Math.max(2, Math.min(this.server.viewDistance, [16, 8, 4, 2][p.viewDistance & 3] ?? 8));
        return;
      case 'CustomPayload':
        return this.handleCustomPayload(p.channel, p.data);
      case 'KickDisconnect':
        this.state = 'closed';
        this.conn.close();
        this.server.playerDisconnected(this, 'Quitting');
        return;
      default:
        this.kick(`Protocol error, unexpected packet ${p.type}`, true);
    }
  }

  // ------------------------------------------------------------------ login

  private handleHandshake(p: PacketOf<'Handshake'>): void {
    if (p.protocolVersion !== PROTOCOL_VERSION) {
      this.kick(p.protocolVersion > PROTOCOL_VERSION ? `Outdated server! I'm still on ${GAME_VERSION}` : `Outdated client! Please use ${GAME_VERSION}`);
      return;
    }
    if (!isValidUsername(p.username)) {
      this.kick('Invalid username!');
      return;
    }
    const refusal = this.server.canJoin(p.username);
    if (refusal) {
      this.kick(refusal);
      return;
    }
    this.username = p.username;
    this.state = 'login';
    this.server.beginLogin(this);
  }

  /** The server created the player and sent the login packets. */
  completeLogin(player: EntityPlayerMP): void {
    this.player = player;
    player.handler = this;
    this.lastPosX = player.posX;
    this.lastPosY = player.posY;
    this.lastPosZ = player.posZ;
    this.state = 'play';
    this.lastReceived = this.currentTicks;
  }

  /** The player was replaced on respawn. */
  setPlayer(player: EntityPlayerMP): void {
    this.player = player;
    player.handler = this;
    this.moves.length = 0;
    this.lastPosX = player.posX;
    this.lastPosY = player.posY;
    this.lastPosZ = player.posZ;
  }

  // ------------------------------------------------------------------ movement

  private queueFlying(p: Flying): void {
    if (!finite(p.x, p.y, p.z, p.stance, p.yaw, p.pitch)) {
      this.kick('Illegal position', true);
      return;
    }
    this.moves.push(p);
    if (this.moves.length > MOVE_QUEUE_MAX) this.moves.splice(0, this.moves.length - MOVE_QUEUE_MAX);
  }

  /**
   * The guest's movement packets for this tick, from EntityPlayerMP.onUpdate: as many as its
   * client can have sent since the last tick (one per tick, or one per 50 ms of real time when
   * the host runs slow), so more packets never mean more movement.
   */
  applyQueuedMovement(): void {
    const now = performance.now();
    const elapsed = this.lastMoveRefill > 0 ? now - this.lastMoveRefill : 50;
    this.lastMoveRefill = now;
    this.moveTokens = Math.min(MOVE_BURST, this.moveTokens + Math.max(1, elapsed / 50));
    if (this.pushTicks > 0 && --this.pushTicks === 0) this.pushH = this.pushUp = 0;
    while (this.moves.length > 0 && this.moveTokens >= 1) {
      if (this.state !== 'play') return;
      this.moveTokens--;
      this.handleFlying(this.moves.shift()!);
    }
  }

  /** The host pushed the guest's player (knockback, an explosion): its next moves may go farther. */
  allowPush(vx: number, vy: number, vz: number): void {
    if (!finite(vx, vy, vz)) return;
    this.pushH = Math.max(this.pushH, Math.sqrt(vx * vx + vz * vz));
    this.pushUp = Math.max(this.pushUp, vy);
    this.pushTicks = PUSH_TICKS;
  }

  /** Whether one move of (dx, dy, dz) is within what the player can do in a tick. */
  private isPlausibleStep(dx: number, dy: number, dz: number): boolean {
    const player = this.player!;
    let speed = player.capabilities.allowFlying ? MAX_STEP_FLY : MAX_STEP_WALK;
    const swift = player.getActivePotionEffect(1);
    if (swift) speed *= 1 + 0.2 * (swift.getAmplifier() + 1);
    const jump = player.getActivePotionEffect(8);
    const up = MAX_STEP_UP + (jump ? 0.1 * (jump.getAmplifier() + 1) : 0);
    return dx * dx + dz * dz <= (speed + this.pushH) ** 2 && dy <= up + this.pushUp && dy >= -MAX_STEP_DOWN - this.pushH;
  }

  /** NetServerHandler.handleFlying: the guest says where it is; the host checks it. */
  private handleFlying(p: Flying): void {
    const player = this.player!;
    const w = this.server.world;
    const moving = (p.flags & 1) !== 0;
    const rotating = (p.flags & 2) !== 0;
    const onGround = (p.flags & 4) !== 0;
    if (!this.hasMoved) {
      const dy = p.y - this.lastPosY;
      if (p.x === this.lastPosX && dy * dy < 0.01 && p.z === this.lastPosZ) this.hasMoved = true;
    }
    if (!this.hasMoved) return;
    if (player.ridingEntity) {
      let yaw = player.rotationYaw;
      let pitch = player.rotationPitch;
      if (rotating) {
        yaw = p.yaw;
        pitch = MathHelper.clamp_float(p.pitch, -90, 90);
      }
      // A rider sends its steering as motion (x and z, with y and stance -999); boats read it
      // from the rider in their next update, which runs before the rider's (and its reset).
      let mx = 0;
      let mz = 0;
      if (moving && p.y === -999 && p.stance === -999) {
        if (Math.abs(p.x) > 1 || Math.abs(p.z) > 1) {
          this.kick('Nope!', true);
          return;
        }
        mx = p.x;
        mz = p.z;
      }
      player.ridingEntity.updateRiderPosition();
      player.onGround = onGround;
      player.setPositionAndRotation(player.posX, player.posY, player.posZ, yaw, pitch);
      player.motionX = mx;
      player.motionZ = mz;
      this.lastPosX = player.posX;
      this.lastPosY = player.posY;
      this.lastPosZ = player.posZ;
      return;
    }
    if (player.isPlayerSleeping()) {
      player.setPositionAndRotation(this.lastPosX, this.lastPosY, this.lastPosZ, player.rotationYaw, player.rotationPitch);
      return;
    }
    const oldY = player.posY;
    this.lastPosX = player.posX;
    this.lastPosY = player.posY;
    this.lastPosZ = player.posZ;
    let x = player.posX;
    let y = player.posY;
    let z = player.posZ;
    let yaw = player.rotationYaw;
    let pitch = player.rotationPitch;
    // A steering packet sent just before the host dismounted the player is not a position.
    const moves = moving && !(p.y === -999 && p.stance === -999);
    if (moves) {
      x = p.x;
      y = p.y;
      z = p.z;
      const stance = p.stance - p.y;
      if (stance > 1.65 || stance < 0.1) {
        this.kick('Illegal stance');
        return;
      }
      if (Math.abs(x) > 3.2e7 || Math.abs(z) > 3.2e7 || y < -1024 || y > 4096) {
        this.kick('Illegal position');
        return;
      }
    }
    if (rotating) {
      yaw = p.yaw;
      pitch = MathHelper.clamp_float(p.pitch, -90, 90);
    }
    player.ySize = 0;
    player.setPositionAndRotation(this.lastPosX, this.lastPosY, this.lastPosZ, yaw, pitch);
    let dx = x - player.posX;
    let dy = y - player.posY;
    let dz = z - player.posZ;
    // "moved too quickly": 1.5.2 compared the move with the server's motion, which barely ever
    // caught anything; here each packet may only cover what a player can move in a tick.
    if (!this.isPlausibleStep(dx, dy, dz)) {
      console.warn(`[lan] ${player.username} moved too quickly! ${dx.toFixed(2)},${dy.toFixed(2)},${dz.toFixed(2)}`);
      this.setPlayerLocation(this.lastPosX, this.lastPosY, this.lastPosZ, yaw, pitch);
      return;
    }
    const shrink = f(0.0625);
    const wasFree = w.getCollidingBoundingBoxes(player, player.boundingBox.copy().contract(shrink, shrink, shrink)).length === 0;
    if (player.onGround && !onGround && dy > 0) player.addExhaustion(f(0.2));
    player.moveEntity(dx, dy, dz);
    player.onGround = onGround;
    player.addMovementStat(dx, dy, dz);
    dx = x - player.posX;
    dy = y - player.posY;
    if (dy > -0.5 || dy < 0.5) dy = 0;
    dz = z - player.posZ;
    const wrong = dx * dx + dy * dy + dz * dz > 0.0625 && !player.isPlayerSleeping() && !player.theItemInWorldManager.isCreative();
    player.setPositionAndRotation(x, y, z, yaw, pitch);
    const nowFree = w.getCollidingBoundingBoxes(player, player.boundingBox.copy().contract(shrink, shrink, shrink)).length === 0;
    if (wasFree && (wrong || !nowFree) && !player.isPlayerSleeping()) {
      this.setPlayerLocation(this.lastPosX, this.lastPosY, this.lastPosZ, yaw, pitch);
      return;
    }
    // A LAN game allows flight (IntegratedServer), so there is no floating kick.
    this.ticksForFloatKick = 0;
    player.onGround = onGround;
    player.updateFlyingState(player.posY - oldY, onGround);
  }

  /** setPlayerLocation: puts the guest's player somewhere (Packet13) and waits for it to confirm. */
  setPlayerLocation(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const player = this.player;
    if (!player) return;
    this.hasMoved = false;
    this.lastPosX = x;
    this.lastPosY = y;
    this.lastPosZ = z;
    this.moves.length = 0;
    player.setPositionAndRotation(x, y, z, yaw, pitch);
    this.sendPacket({ type: 'PlayerPosLook', x, y, stance: y + 1.62, z, yaw, pitch, onGround: false });
  }

  // ------------------------------------------------------------------ blocks

  sendBlockChange(x: number, y: number, z: number): void {
    const w = this.server.world;
    if (y < 0 || y >= 256) return;
    this.sendPacket({ type: 'BlockChange', x, y, z, id: w.getBlockId(x, y, z), meta: w.getBlockMetadata(x, y, z) });
  }

  private handleBlockDig(p: PacketOf<'BlockDig'>): void {
    const player = this.player!;
    if (p.status === 4) {
      player.dropOneItem(false);
      return;
    }
    if (p.status === 3) {
      player.dropOneItem(true);
      return;
    }
    if (p.status === 5) {
      player.stopUsingItem();
      return;
    }
    if (p.status > 2) return;
    const { x, y, z } = p;
    const dx = player.posX - (x + 0.5);
    const dy = player.posY - (y + 0.5) + 1.5;
    const dz = player.posZ - (z + 0.5);
    if (dx * dx + dy * dy + dz * dz > 36 || y < 0 || y >= 256) return;
    if (!this.server.world.blockExists(x, y, z)) return;
    if (p.status === 0) {
      if (this.server.isBlockProtected(x, y, z, player)) this.sendBlockChange(x, y, z);
      else player.theItemInWorldManager.onBlockClicked(x, y, z, p.face % 6);
    } else if (p.status === 2) {
      player.theItemInWorldManager.uncheckedTryHarvestBlock(x, y, z);
      if (this.server.world.getBlockId(x, y, z) !== 0) this.sendBlockChange(x, y, z);
    } else if (p.status === 1) {
      player.theItemInWorldManager.cancelDestroyingBlock(x, y, z);
      if (this.server.world.getBlockId(x, y, z) !== 0) this.sendBlockChange(x, y, z);
    }
  }

  private handlePlace(p: PacketOf<'Place'>): void {
    const player = this.player!;
    const w = this.server.world;
    const held = player.inventory.getCurrentItem();
    let { x, y, z } = p;
    const dir = p.direction;
    let resend = false;
    if (dir === 255) {
      if (!held) return;
      player.theItemInWorldManager.tryUseItem(player, w, held);
    } else if (dir < 6 && (y < 255 || (dir !== 1 && y < 256)) && y >= 0) {
      if (this.hasMoved && player.getDistanceSq(x + 0.5, y + 0.5, z + 0.5) < 64 && w.blockExists(x, y, z) && !this.server.isBlockProtected(x, y, z, player)) {
        player.theItemInWorldManager.activateBlockOrUseItem(player, w, held, x, y, z, dir, f(p.hitX / 16), f(p.hitY / 16), f(p.hitZ / 16));
      }
      resend = true;
    } else {
      if (dir < 6) this.sendPacket({ type: 'Chat', message: '§7Height limit for building is 256' });
      resend = dir < 6;
    }
    if (resend) {
      this.sendBlockChange(x, y, z);
      if (dir === 0) y--;
      else if (dir === 1) y++;
      else if (dir === 2) z--;
      else if (dir === 3) z++;
      else if (dir === 4) x--;
      else if (dir === 5) x++;
      this.sendBlockChange(x, y, z);
    }
    let cur = player.inventory.getCurrentItem();
    if (cur && cur.stackSize === 0) {
      player.inventory.mainInventory[player.inventory.currentItem] = null;
      cur = null;
    }
    if (!cur || cur.getMaxItemUseDuration() === 0) {
      player.playerInventoryBeingManipulated = true;
      player.inventory.mainInventory[player.inventory.currentItem] = ItemStack.copyItemStack(player.inventory.mainInventory[player.inventory.currentItem]);
      const slot = player.openContainer.getSlotFromInventory(player.inventory, player.inventory.currentItem);
      player.openContainer.detectAndSendChanges();
      player.playerInventoryBeingManipulated = false;
      if (slot && !ItemStack.areItemStacksEqual(player.inventory.getCurrentItem(), p.item)) {
        this.sendPacket({ type: 'SetSlot', windowId: player.openContainer.windowId, slot: slot.slotNumber, item: player.inventory.getCurrentItem() });
      }
    }
  }

  // ------------------------------------------------------------------ chat

  private handleChat(raw: string): void {
    const player = this.player!;
    if (player.getChatVisibility() === 2) {
      this.sendPacket({ type: 'Chat', message: 'Cannot send chat message.' });
      return;
    }
    if (raw.length > 100) {
      this.kick('Chat message too long', true);
      return;
    }
    const msg = raw.trim();
    for (const ch of msg) {
      if (ch === '§' || ch < ' ' || ch === '\x7f') {
        this.kick('Illegal characters in chat', true);
        return;
      }
    }
    if (msg.length === 0) return;
    if (msg.startsWith('/')) {
      this.server.executeCommand(player, msg);
    } else {
      if (player.getChatVisibility() === 1) {
        this.sendPacket({ type: 'Chat', message: 'Cannot send chat message.' });
        return;
      }
      const line = `<${player.getEntityName()}> ${msg}`;
      console.info(line);
      this.server.sendChatMsg(line);
    }
    this.chatSpamThresholdCount += 20;
    if (this.chatSpamThresholdCount > 200 && !this.server.commandsAllowedForAll) this.kick('disconnect.spam');
  }

  // ------------------------------------------------------------------ actions and entities

  private handleEntityAction(state: number): void {
    const player = this.player!;
    if (state === 1) player.setSneaking(true);
    else if (state === 2) player.setSneaking(false);
    else if (state === 4) player.setSprinting(true);
    else if (state === 5) player.setSprinting(false);
    else if (state === 3) {
      player.wakeUpPlayer(false, true, true);
      this.hasMoved = false;
    }
  }

  private handleUseEntity(id: number, leftClick: boolean): void {
    const player = this.player!;
    const target = this.server.getEntityById(id);
    if (!target || target === player || target.isDead) return;
    const reach = player.canEntityBeSeen(target) ? 36 : 9;
    if (player.getDistanceSqToEntity(target) >= reach) return;
    if (!leftClick) player.interactWith(target);
    else player.attackTargetEntityWithCurrentItem(target);
  }

  // ------------------------------------------------------------------ windows

  private handleWindowClick(p: PacketOf<'WindowClick'>): void {
    const player = this.player!;
    const c = player.openContainer;
    if (c.windowId !== p.windowId) return;
    const slotOk = p.slot === OUTSIDE_WINDOW || (p.slot >= 0 && p.slot < c.inventorySlots.length) || (p.mode === ClickMode.DRAG && p.slot === OUTSIDE_WINDOW);
    if (!slotOk || p.mode > ClickMode.PICKUP_ALL) {
      player.sendContainerToPlayer(c);
      return;
    }
    if (p.mode === ClickMode.CLONE && !player.capabilities.isCreativeMode) return;
    const result = c.slotClick(p.slot, p.button, p.mode, player);
    if (ItemStack.areItemStacksEqual(p.item, result)) {
      this.sendPacket({ type: 'Transaction', windowId: p.windowId, action: p.action, accepted: true });
      player.playerInventoryBeingManipulated = true;
      c.detectAndSendChanges();
      player.updateHeldItem();
      player.playerInventoryBeingManipulated = false;
    } else {
      this.sendPacket({ type: 'Transaction', windowId: p.windowId, action: p.action, accepted: false });
      c.detectAndSendChanges();
      player.sendContainerToPlayer(c);
    }
  }

  /**
   * handleCreativeSetSlot: Creative only, slots 1-44, or -1 to drop; stacks the creative
   * inventory (or survival play) can make, of 1-64 (CreativeItems). Tags were sanitised when the
   * packet was read.
   */
  private handleCreativeSetSlot(slot: number, stack: ItemStack | null): void {
    const player = this.player!;
    if (!player.theItemInWorldManager.isCreative()) return;
    const drop = slot < 0;
    const inRange = slot >= 1 && slot < 45;
    const known = stack === null || isAllowedCreativeStack(stack);
    if (!known) {
      // Put the guest's copy of the slot back.
      if (inRange) player.sendContainerToPlayer(player.inventoryContainer);
      return;
    }
    if (inRange) {
      player.inventoryContainer.putStackInSlot(slot, stack);
      // The guest already shows it; remember it so it is not echoed back.
      player.playerInventoryBeingManipulated = true;
      player.inventoryContainer.detectAndSendChanges();
      player.playerInventoryBeingManipulated = false;
    } else if (drop && stack && this.creativeItemCreationSpamThresholdTally < 200) {
      this.creativeItemCreationSpamThresholdTally += 20;
      const e = player.dropPlayerItem(stack) as { setAgeToCreativeDespawnTime?: () => void } | null;
      e?.setAgeToCreativeDespawnTime?.();
    }
  }

  private handleUpdateSign(p: PacketOf<'UpdateSign'>): void {
    const player = this.player!;
    const w = this.server.world;
    if (p.y < 0 || p.y >= 256 || !w.blockExists(p.x, p.y, p.z)) return;
    if (player.getDistanceSq(p.x + 0.5, p.y + 0.5, p.z + 0.5) > 64 * 64) return;
    const te = w.getBlockTileEntity(p.x, p.y, p.z) as unknown as { signText?: string[]; isEditable?: () => boolean; onInventoryChanged(): void } | null;
    if (!te || !Array.isArray(te.signText)) return;
    if (te.isEditable && !te.isEditable()) return;
    const lines = [p.line0, p.line1, p.line2, p.line3].map((l) => (l.length > 15 || [...l].some((ch) => ch === '§' || ch < ' ' || ch === '\x7f') ? '!?' : l));
    for (let i = 0; i < 4; i++) te.signText[i] = lines[i];
    (te as unknown as { setEditable?: (v: boolean) => void }).setEditable?.(false);
    te.onInventoryChanged();
    w.markBlockForUpdate(p.x, p.y, p.z);
  }

  private handleCustomPayload(channel: string, data: Uint8Array): void {
    const player = this.player!;
    const c = player.openContainer as unknown as Record<string, unknown>;
    if (channel === 'MC|ItemName' && typeof c.updateItemName === 'function') {
      const name = new TextDecoder().decode(data).replace(/[§\u0000-\u001f\u007f]/g, '');
      if (name.length <= 30) (c.updateItemName as (n: string) => void).call(c, name);
    } else if (channel === 'MC|Beacon' && player.openContainer instanceof ContainerBeacon && data.length >= 8) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      player.openContainer.applyEffects(view.getInt32(0), view.getInt32(4));
    } else if (channel === 'MC|BEdit' || channel === 'MC|BSign') {
      this.handleBook(channel === 'MC|BSign', data);
    }
  }

  /** Book and quill edits (MC|BEdit) and signing (MC|BSign): only the held book changes. */
  private handleBook(sign: boolean, data: Uint8Array): void {
    const player = this.player!;
    const held = player.inventory.getCurrentItem();
    if (!held || held.itemID !== 386) return;
    let tag: Record<string, unknown>;
    try {
      tag = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const pages = Array.isArray(tag.pages) ? tag.pages.filter((p): p is string => typeof p === 'string').slice(0, 50).map((p) => p.slice(0, 256)) : [];
    held.stackTagCompound ??= {};
    held.stackTagCompound.pages = pages;
    if (sign) {
      const title = typeof tag.title === 'string' ? tag.title.slice(0, 16) : '';
      held.stackTagCompound.author = player.username;
      held.stackTagCompound.title = title;
      held.itemID = 387;
    }
  }

  /** Whether the block is a usable target (it exists in the host's world). */
  static isRealBlock(id: number): boolean {
    return id === 0 || !!Block.blocksList[id];
  }
}
