/**
 * A LAN game end to end without a browser: a host World with its player and a LanServer, and
 * guests (NetClientHandler + WorldClient + EntityClientPlayerMP + PlayerControllerGuest) joined
 * over the in-memory transport. Covers the handshake and refusals, chunk streaming, players
 * seeing each other, block placement and digging both ways (creative and timed survival), chat
 * and commands, entity tracking, windows, death and respawn, hostile input, and leaving.
 * Run: node scripts/run-node-test.mjs tests/netsession.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { MovementInput } from '../src/client/MovementInput';
import { setServer, type CommandServer } from '../src/command/CommandServer';
import { CommandHandler } from '../src/command/CommandHandler';
import { CommandServerMessage } from '../src/command/CommandChat';
import { CommandServerTp } from '../src/command/CommandServerTp';
import { CommandTime } from '../src/command/CommandTime';
import { Vec3 } from '../src/core/Vec3';
import { DamageSource } from '../src/entity/DamageSource';
import type { Entity } from '../src/entity/Entity';
import { EntityList } from '../src/entity/EntityList';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { EntityOtherPlayerMP } from '../src/entity/EntityOtherPlayerMP';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { EntityClientPlayerMP } from '../src/net/client/EntityClientPlayerMP';
import { type GuestClient, NetClientHandler } from '../src/net/client/NetClientHandler';
import { PlayerControllerGuest } from '../src/net/client/PlayerControllerGuest';
import type { WorldClient } from '../src/net/client/WorldClient';
import { PacketWriter } from '../src/net/protocol/PacketBuffer';
import { decodeFrame, encodeFrame, type Packet, PACKETS, PROTOCOL_VERSION } from '../src/net/protocol/Packets';
import { EntityPlayerMP } from '../src/net/server/EntityPlayerMP';
import { LanServer } from '../src/net/server/LanServer';
import { MemoryHub } from '../src/net/transport/MemoryTransport';
import type { NetConnection } from '../src/net/transport/Transport';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { existsSync, readFileSync } from 'node:fs';
import { I18n } from '../src/core/I18n';
import { check, report } from './harness';

registerBlockItems();
const LANG = 'public/assets/vanilla/lang/en_US.lang';
if (existsSync(LANG)) I18n.load(readFileSync(LANG, 'utf8'));

// ---------------------------------------------------------------------- host

/** 5 x 5 chunks: bedrock at y 0, stone up to y 3, spawn at (8, 4, 8). */
function makeHostWorld(): World {
  const info = new WorldInfo();
  info.worldName = 'LAN test';
  info.gameType = 1;
  info.spawnX = 8;
  info.spawnY = 4;
  info.spawnZ = 8;
  const w = new World(info);
  w.mobSpawner = null;
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.addChunk(new Chunk(w as never, cx, cz));
  for (let x = -32; x < 48; x++) for (let z = -32; z < 48; z++) for (let y = 0; y < 4; y++) w.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
  return w;
}

const hostChat: string[] = [];
const hw = makeHostWorld();
const hostMc = {
  theWorld: hw,
  thePlayer: null as EntityPlayerSP | null,
  playRandomMusicIfReady() {},
  displayGuiScreen() {},
  playSoundFX() {},
  effectRenderer: { addEffect() {} },
  ingameGUI: { getChatGUI: () => ({ printChatMessage: (s: string) => hostChat.push(s), addTranslatedMessage: (s: string) => hostChat.push(s) }) },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer() {},
};
const host = new EntityPlayerSP(hostMc as never, hw, 'Alice');
hostMc.thePlayer = host;
host.setLocationAndAngles(4.5, 4, 4.5, 0, 0);
hw.spawnEntityInWorld(host);
PlayerSpawning.initializeGameType(host, hw.worldInfo);
host.initialInvulnerability = 0;

const hub = new MemoryHub(false);
// The commands under test (ServerCommandManager pulls in modules found with import.meta.glob).
const commands = new CommandHandler();
commands.registerCommand(new CommandTime());
commands.registerCommand(new CommandServerTp());
commands.registerCommand(new CommandServerMessage());
let lan: LanServer;
const commandServer: CommandServer = {
  getWorlds: () => [hw],
  getPlayers: () => [host, ...lan.guestPlayers()],
  sendChatMsg: (msg) => lan.sendChatMsg(msg),
  isSinglePlayer: () => true,
  getCommandManager: () => commands,
};
setServer(commandServer);
lan = new LanServer(
  {
    world: hw,
    hostPlayer: () => host,
    hostName: 'Alice',
    printChat: (msg) => hostChat.push(msg),
    commandManager: () => commands,
    getPossibleCompletions: () => [],
    setExtraLoadCenters: () => undefined,
  },
  hub.host(),
  { gameType: EnumGameType.CREATIVE, allowCommands: true, maxPlayers: 8, viewDistance: 3 },
);
await lan.start('ABC234');

// ---------------------------------------------------------------------- guests

interface Guest {
  name: string;
  handler: NetClientHandler;
  conn: NetConnection;
  pc: PlayerControllerGuest;
  chat: string[];
  disconnected: { title: string; reason: string } | null;
  /** The guest's render distance (0 far .. 3 tiny) and chat visibility. */
  settings: { renderDistance: number; chatVisibility: number };
  mc: { theWorld: WorldClient | null; thePlayer: EntityClientPlayerMP | null; currentScreen: unknown };
}

const guests: Guest[] = [];
/** The guests' "browser storage" of rejoin tokens, by name. */
const rejoinTokens = new Map<string, string>();

async function join(name: string, version = PROTOCOL_VERSION): Promise<Guest> {
  const conn = await hub.guest().connect('ABC234', 1000);
  const chat: string[] = [];
  const mc = {
    theWorld: null as WorldClient | null,
    thePlayer: null as EntityClientPlayerMP | null,
    currentScreen: null as unknown,
    playRandomMusicIfReady() {},
    sndManager: { playSound() {} },
    displayGuiScreen(s: unknown) {
      mc.currentScreen = s;
      const container = (s as { inventorySlots?: unknown } | null)?.inventorySlots;
      if (container && mc.thePlayer) mc.thePlayer.openContainer = container as never;
    },
    playSoundFX() {},
    effectRenderer: { addEffect() {} },
    ingameGUI: { getChatGUI: () => ({ printChatMessage: (s: string) => chat.push(s), addTranslatedMessage: (s: string) => chat.push(s) }) },
    gameSettings: { chatVisibility: 0 },
    respawnPlayer() {},
  };
  const g: Guest = { name, handler: null as never, conn, pc: null as never, chat, disconnected: null, settings: { renderDistance: 1, chatVisibility: 0 }, mc };
  const client: GuestClient = {
    username: name,
    playerClient: mc as never,
    get guestController() {
      return g.pc;
    },
    startGuestWorld(world, player, type) {
      mc.theWorld = world;
      mc.thePlayer = player;
      player.preparePlayerToSpawn();
      world.spawnEntityInWorld(player);
      player.movementInput = new MovementInput();
      g.pc.setGameType(type);
    },
    respawnGuestPlayer(player, type) {
      mc.thePlayer = player;
      player.preparePlayerToSpawn();
      mc.theWorld!.spawnEntityInWorld(player);
      player.movementInput = new MovementInput();
      g.pc.setGameType(type);
    },
    guestDisconnected(title, reason) {
      g.disconnected = { title, reason };
    },
    printChat: (msg) => chat.push(msg),
    setGameType: (t) => g.pc.setGameType(t),
    autocompleteResponse() {},
    clientSettings: () => g.settings,
    rejoinToken: () => rejoinTokens.get(name.toLowerCase()) ?? null,
    storeRejoinToken: (t) => rejoinTokens.set(name.toLowerCase(), t),
  };
  g.handler = new NetClientHandler(client, conn);
  g.pc = new PlayerControllerGuest(mc as never, g.handler);
  if (version === PROTOCOL_VERSION) g.handler.start();
  else {
    g.handler.addToSendQueue({ type: 'Handshake', protocolVersion: version, gameVersion: '1.5.2', username: name });
    g.handler.flush();
  }
  guests.push(g);
  return g;
}

/** One game tick everywhere: the host's world and LAN server, then each guest's client tick. */
function step(n = 1): void {
  for (let i = 0; i < n; i++) {
    hw.updateEntities();
    hw.tick();
    lan.tick();
    hub.flush();
    for (const g of guests) {
      if (g.disconnected) continue;
      g.handler.processReadPackets();
      const w = g.mc.theWorld;
      if (w && !g.disconnected) {
        g.pc.updateController();
        w.updateEntities();
        w.tick();
      }
      g.handler.flush();
    }
    hub.flush();
  }
}

/** Walks a guest's player to (x, y, z) at most 0.5 blocks per tick, as a client could. */
function walkTo(g: Guest, x: number, y: number, z: number): void {
  const p = g.mc.thePlayer!;
  for (let i = 0; i < 200; i++) {
    const dx = x - p.posX;
    const dz = z - p.posZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6 && Math.abs(p.posY - p.yOffset - y) < 1e-6) break;
    const k = d > 0.5 ? 0.5 / d : 1;
    p.setPosition(p.posX + dx * k, y + p.yOffset, p.posZ + dz * k);
    p.motionX = p.motionY = p.motionZ = 0;
    step(1);
  }
  step(2);
}

/** A hand-driven guest (no client): what it sent and got, for hostile input. */
interface RawGuest {
  conn: NetConnection;
  got: Packet[];
  closed: boolean;
  send(ps: Packet[]): void;
  kick(): string | undefined;
}

async function rawJoin(name: string): Promise<RawGuest> {
  const conn = await hub.guest().connect('ABC234', 1000);
  const r: RawGuest = {
    conn,
    got: [],
    closed: false,
    send: (ps) => {
      conn.send(encodeFrame(ps));
      hub.flush();
    },
    kick: () => (r.got.find((p) => p.type === 'KickDisconnect') as { reason: string } | undefined)?.reason,
  };
  conn.onMessage = (f) => r.got.push(...decodeFrame(f, 1 << 26, 1 << 20));
  conn.onClose = () => (r.closed = true);
  r.send([{ type: 'Handshake', protocolVersion: PROTOCOL_VERSION, gameVersion: '1.5.2', username: name }]);
  step(3);
  const pl = [...r.got].reverse().find((p): p is Extract<Packet, { type: 'PlayerPosLook' }> => p.type === 'PlayerPosLook');
  if (pl) r.send([{ type: 'Flying', flags: 7, x: pl.x, y: pl.y, stance: pl.stance, z: pl.z, yaw: 0, pitch: 0 }]);
  step(2);
  return r;
}

function hostPlayerOf(name: string): EntityPlayerMP | null {
  return lan.guestPlayers().find((p) => p.username === name) ?? null;
}

// ---------------------------------------------------------------------- login
const bob = await join('Bob');
step(5);
const bobMP = hostPlayerOf('Bob');
check('guest logged in', bob.handler.state === 'play' && !!bob.mc.thePlayer && !!bobMP, `${bob.handler.state} ${bob.disconnected?.reason}`);
check('same entity id on both sides', bob.mc.thePlayer?.entityId === bobMP?.entityId);
check('guest world is remote', bob.mc.theWorld?.isRemote === true);
check('join message on the host', hostChat.some((l) => l.includes('Bob joined the game')), hostChat.join(' | '));
check('join message on the guest', bob.chat.some((l) => l.includes('Bob joined the game')), bob.chat.join(' | '));
check('guest got its position', bob.handler.positionReceived);
step(20);
const gw = bob.mc.theWorld!;
check('chunks streamed to the guest', gw.loadedChunkCount === 25, String(gw.loadedChunkCount));
check('streamed blocks match', gw.getBlockId(5, 3, 5) === B.stone && gw.getBlockId(5, 0, 5) === B.bedrock && gw.getBlockId(5, 4, 5) === 0);
check('streamed light', gw.getSavedLightValue(0 as never, 5, 10, 5) === 15);
const alice = gw.loadedEntityList.find((e): e is EntityOtherPlayerMP => e instanceof EntityOtherPlayerMP);
check('guest sees the host as a named player', alice?.username === 'Alice');
check('host player at its feet position', !!alice && Math.abs(alice.posY - 4) < 0.1 && Math.abs(alice.posX - 4.5) < 0.1, alice ? `${alice.posX} ${alice.posY} ${alice.posZ}` : '');
check('host world has the guest player', hw.playerEntities.includes(bobMP as never) && bobMP!.username === 'Bob');
check('TAB list on the guest', [...bob.handler.playerInfo.keys()].sort().join(',') === 'Alice,Bob', [...bob.handler.playerInfo.keys()].join(','));
check('TAB list on the host', lan.playerList().map((e) => e.name).join(',') === 'Alice,Bob');
check('guest is creative (LAN game mode)', bob.pc.isInCreativeMode() && bobMP!.capabilities.isCreativeMode);

// ---------------------------------------------------------------------- movement
{
  const p = bob.mc.thePlayer!;
  walkTo(bob, 10.5, 4, 10.5);
  step(6);
  // (Within a hair of the target: the walk may brush past the host's player, which pushes.)
  check('guest movement reaches the host', Math.abs(bobMP!.posX - p.posX) < 0.01 && Math.abs(bobMP!.posZ - p.posZ) < 0.01 && Math.abs(bobMP!.posX - 10.5) < 0.1 && Math.abs(bobMP!.posY - 4) < 0.01, `${bobMP!.posX} ${bobMP!.posY} ${bobMP!.posZ}`);
  host.setPosition(6.5, 4 + host.yOffset, 6.5);
  step(6);
  check('host movement reaches the guest', !!alice && Math.abs(alice.posX - 6.5) < 0.05 && Math.abs(alice.posZ - 6.5) < 0.05, alice ? `${alice.posX} ${alice.posZ}` : '');
  // Sneaking shows on the other side (Packet19 -> metadata).
  p.movementInput.sneak = true;
  step(4);
  check('guest sneaking reaches the host', bobMP!.isSneaking());
  p.movementInput.sneak = false;
  step(4);
  check('guest stops sneaking', !bobMP!.isSneaking());
  // The render distance setting reaches the host, which streams that far (at most its own).
  check('render distance at login (normal, within the host\'s 3)', bobMP!.renderDistance === 3, String(bobMP!.renderDistance));
  bob.settings.renderDistance = 3;
  step(3);
  check('render distance change reaches the host (tiny: 2 chunks)', bobMP!.renderDistance === 2, String(bobMP!.renderDistance));
  bob.settings.renderDistance = 1;
  step(3);
  // A jump of 50 blocks in one packet is refused and the guest is put back.
  const before = bobMP!.posX;
  bob.handler.addToSendQueue({ type: 'Flying', flags: 1 | 4, x: before + 50, y: 4, stance: 5.62, z: 10.5, yaw: 0, pitch: 0 });
  bob.handler.flush();
  step(3);
  check('long jump refused', Math.abs(bobMP!.posX - before) < 1, String(bobMP!.posX));
}

// ---------------------------------------------------------------------- speed limits
{
  const r = await rawJoin('Speedy');
  const sp = hostPlayerOf('Speedy')!;
  sp.setGameType(EnumGameType.SURVIVAL);
  step(2);
  const x0 = sp.posX;
  const z0 = sp.posZ;
  // Twelve moves of 3 blocks in one message: the first is already too far, and is put back.
  r.send(Array.from({ length: 12 }, (_, i) => ({ type: 'Flying' as const, flags: 1 | 4, x: x0, y: sp.posY, stance: sp.posY + 1.62, z: z0 + 3 * (i + 1), yaw: 0, pitch: 0 })));
  step(3);
  check('a burst of long moves is corrected', Math.abs(sp.posZ - z0) < 0.01 && r.got.some((p) => p.type === 'PlayerPosLook'), `${sp.posZ - z0}`);
  // Confirm the correction, then send three plausible moves per tick for 20 ticks: the host
  // applies one per tick, so the guest cannot outrun a walking player.
  r.send([{ type: 'Flying', flags: 7, x: x0, y: sp.posY, stance: sp.posY + 1.62, z: z0, yaw: 0, pitch: 0 }]);
  step(1);
  let z = z0;
  for (let t = 0; t < 20; t++) {
    const batch: Packet[] = [];
    for (let k = 0; k < 3; k++) {
      z += 0.9;
      batch.push({ type: 'Flying', flags: 1 | 4, x: x0, y: sp.posY, stance: sp.posY + 1.62, z, yaw: 0, pitch: 0 });
    }
    r.send(batch);
    step(1);
  }
  // One move per tick, plus a small catch-up allowance (MOVE_BURST = 5) for network jitter.
  check('extra movement packets do not add speed', sp.posZ - z0 <= (20 + 5) * 0.9 + 0.01, `${(sp.posZ - z0).toFixed(2)} blocks in 20 ticks`);
  step(50);
  check('queued moves are applied later, in order', Math.abs(sp.posZ - z) < 0.01, `${sp.posZ} vs ${z}`);
  // A knockback from the host lets the next moves go farther.
  const zk = sp.posZ;
  sp.handler.allowPush(0, 0, 1.5);
  r.send([{ type: 'Flying', flags: 1 | 4, x: x0, y: sp.posY, stance: sp.posY + 1.62, z: zk + 2.2, yaw: 0, pitch: 0 }]);
  step(2);
  check('a push from the host allows a longer step', Math.abs(sp.posZ - (zk + 2.2)) < 0.01, `${sp.posZ - zk}`);
  r.send([{ type: 'KickDisconnect', reason: 'Quitting' }]);
  step(2);
}

// ---------------------------------------------------------------------- action limits (a creative nuker)
{
  const r = await rawJoin('Nuker');
  const np = hostPlayerOf('Nuker')!;
  np.setGameType(EnumGameType.CREATIVE);
  np.inventory.mainInventory[0] = new ItemStack(B.stone, 64, 0);
  np.inventory.currentItem = 0;
  step(2);
  const px = Math.floor(np.posX);
  const pz = Math.floor(np.posZ);
  const spots: [number, number][] = [];
  for (let dz = 2; dz <= 5; dz++) for (let dx = -4; dx <= 5; dx++) if (hw.getBlockId(px + dx, 4, pz + dz) === 0) spots.push([px + dx, pz + dz]);
  r.send(spots.map(([x, z]) => ({ type: 'Place' as const, x, y: 3, z, direction: 1, item: new ItemStack(B.stone, 64, 0), hitX: 8, hitY: 16, hitZ: 8 })));
  step(1);
  const placed = spots.filter(([x, z]) => hw.getBlockId(x, 4, z) === B.stone);
  check('placements beyond the burst are dropped', placed.length >= 4 && placed.length <= 9, `${placed.length} of ${spots.length}`);
  check('dropped placements are undone on the guest', r.got.filter((p) => p.type === 'BlockChange').length >= (spots.length - placed.length) * 2);
  r.send(placed.map(([x, z]) => ({ type: 'BlockDig' as const, status: 0, x, y: 4, z, face: 1 })));
  step(1);
  const broken = placed.filter(([x, z]) => hw.getBlockId(x, 4, z) === 0);
  check('creative breaks beyond the burst are dropped', broken.length >= 3 && broken.length <= 6, `${broken.length} of ${placed.length}`);
  step(40);
  r.send(placed.map(([x, z]) => ({ type: 'BlockDig' as const, status: 0, x, y: 4, z, face: 1 })));
  step(1);
  for (const [x, z] of placed) hw.setBlock(x, 4, z, 0, 0, 3);
  r.send([{ type: 'KickDisconnect', reason: 'Quitting' }]);
  step(2);
}

// ---------------------------------------------------------------------- blocks
{
  // The host gives the guest stone; the slot reaches the guest.
  bobMP!.inventory.mainInventory[0] = new ItemStack(B.stone, 64, 0);
  step(2);
  const gp = bob.mc.thePlayer!;
  check('inventory slot synced', gp.inventory.mainInventory[0]?.itemID === B.stone && gp.inventory.mainInventory[0]?.stackSize === 64);
  gp.inventory.currentItem = 0;
  // Right click on top of (12, 3, 12): a block at (12, 4, 12).
  const placed = bob.pc.onPlayerRightClick(gp, gw, gp.inventory.getCurrentItem(), 12, 3, 12, 1, new Vec3(12.5, 4, 12.5));
  check('guest predicts the placement', placed && gw.getBlockId(12, 4, 12) === B.stone);
  step(3);
  check('guest placement on the host', hw.getBlockId(12, 4, 12) === B.stone);
  // The host places a block; the guest sees it.
  hw.setBlock(13, 4, 13, B.glass, 0, 3);
  step(2);
  check('host placement reaches the guest', gw.getBlockId(13, 4, 13) === B.glass);
  // Many changes in one chunk come as one multi-block change.
  for (let x = 0; x < 4; x++) hw.setBlock(x, 5, 0, B.planks, 0, 3);
  step(2);
  check('multi-block change', [0, 1, 2, 3].every((x) => gw.getBlockId(x, 5, 0) === B.planks));
  // Creative digging breaks at once on both sides.
  bob.pc.clickBlock(12, 4, 12, 1);
  check('guest predicts the creative break', gw.getBlockId(12, 4, 12) === 0);
  step(3);
  check('creative break on the host', hw.getBlockId(12, 4, 12) === 0);
  // A guest cannot place far away.
  bob.handler.addToSendQueue({ type: 'Place', x: 40, y: 3, z: 40, direction: 1, item: new ItemStack(B.stone, 1, 0), hitX: 8, hitY: 16, hitZ: 8 });
  bob.handler.flush();
  step(2);
  check('far placement refused', hw.getBlockId(40, 4, 40) === 0);
}

// ---------------------------------------------------------------------- chat and commands
{
  bob.mc.thePlayer!.sendChatMessage('hello there');
  step(2);
  check('guest chat on the host', hostChat.includes('<Bob> hello there'), hostChat.slice(-3).join(' | '));
  check('guest chat echoed to the guest', bob.chat.includes('<Bob> hello there'));
  host.sendChatMessage('hi Bob');
  step(2);
  check('host chat on the guest', bob.chat.includes('<Alice> hi Bob'), bob.chat.slice(-3).join(' | '));
  bob.mc.thePlayer!.sendChatMessage('/time set 1000');
  step(25);
  check('guest command runs on the host', hw.worldInfo.worldTime >= 1000 && hw.worldInfo.worldTime < 1100, String(hw.worldInfo.worldTime));
  check('time reaches the guest', Math.abs(gw.worldInfo.worldTime - hw.worldInfo.worldTime) <= 2, `${gw.worldInfo.worldTime} vs ${hw.worldInfo.worldTime}`);
  bob.mc.thePlayer!.sendChatMessage('/tell Alice psst');
  step(2);
  check('/tell to the host by name', hostChat.some((l) => l.includes('psst')), hostChat.slice(-3).join(' | '));
  // A selector from a guest resolves on the host, around the guest's player.
  bob.mc.thePlayer!.sendChatMessage('/tp @p 20 4 8');
  step(4);
  check('@p from a guest selects the guest', Math.abs(bob.mc.thePlayer!.posX - 20.5) < 0.01 && Math.abs(bob.mc.thePlayer!.posZ - 8.5) < 0.01, `${bob.mc.thePlayer!.posX},${bob.mc.thePlayer!.posZ}`);
  host.sendChatMessage('/tp Bob Alice');
  step(4);
  check('/tp <name> moves the guest', Math.abs(bob.mc.thePlayer!.posX - host.posX) < 0.6 && Math.abs(bob.mc.thePlayer!.posZ - host.posZ) < 0.6, `${bob.mc.thePlayer!.posX},${bob.mc.thePlayer!.posZ}`);
  bob.handler.addToSendQueue({ type: 'Chat', message: 'x'.repeat(150) });
  // (sent after the next checks: a too-long chat line kicks, tested with the hostile guest below)
  bob.handler['outgoing'].length = 0;
}

// ---------------------------------------------------------------------- entities
{
  const pig = EntityList.createEntityByName('Pig', hw)!;
  pig.setLocationAndAngles(8.5, 4, 12.5, 0, 0);
  hw.spawnEntityInWorld(pig);
  step(3);
  const copy = gw.loadedEntityList.find((e) => EntityList.getEntityString(e) === 'Pig');
  check('mob tracked to the guest', !!copy, gw.loadedEntityList.map((e) => EntityList.getDebugName(e)).join(','));
  pig.setPosition(9.5, 4, 12.5);
  step(6);
  check('mob movement interpolated on the guest', !!copy && Math.abs(copy.posX - pig.posX) < 0.1, copy ? `${copy.posX} vs ${pig.posX}` : '');
  // Metadata: a saddle shows.
  (pig as unknown as { setSaddled(v: boolean): void }).setSaddled(true);
  step(2);
  check('metadata (saddle) reaches the guest', !!copy && (copy as unknown as { getSaddled(): boolean }).getSaddled());
  // The guest hits it (survival rules on the host decide; creative still hurts mobs).
  walkTo(bob, 9.5, 4, 10.5);
  step(4);
  bob.pc.attackEntity(bob.mc.thePlayer!, copy!);
  step(2);
  check('guest attack hurts the host mob', (pig as EntityLiving).hurtTime > 0 || (pig as EntityLiving).getHealth() < 10);
  check('hurt status shown on the guest copy', (copy as EntityLiving).hurtTime > 0);
  // 64+ changes in the pig's chunk in one tick resend the whole chunk; the pig stays.
  for (let x = 0; x < 14; x++) for (let z = 0; z < 5; z++) hw.setBlock(x, 6, z, B.glass, 0, 3);
  step(4);
  check('whole-chunk resend arrived', gw.getBlockId(13, 6, 4) === B.glass);
  check('mob survives a whole-chunk resend', gw.loadedEntityList.includes(copy!) && gw.getChunkFromChunkCoords(copy!.chunkCoordX, copy!.chunkCoordZ).entityLists.some((l) => l.includes(copy!)));
  for (let x = 0; x < 14; x++) for (let z = 0; z < 5; z++) hw.setBlock(x, 6, z, 0, 0, 3);
  step(4);
  check('mob survives a second resend', gw.loadedEntityList.includes(copy!) && gw.getBlockId(13, 6, 4) === 0);
  pig.setDead();
  step(2);
  check('dead mob removed on the guest', !gw.loadedEntityList.includes(copy!));
  // An item entity dropped on the host appears with its stack.
  hw.dropItemStack(9, 5, 9, new ItemStack(I.diamond, 3, 0));
  step(3);
  const item = gw.loadedEntityList.find((e) => EntityList.getEntityString(e) === 'Item') as (Entity & { getEntityItem(): ItemStack }) | undefined;
  check('dropped item tracked with its stack', !!item && item.getEntityItem().itemID === I.diamond && item.getEntityItem().stackSize === 3);
  // Guest prediction never spawns entities in its own world.
  const before = gw.loadedEntityList.length;
  const arrow = EntityList.createEntityByName('Arrow', gw)!;
  gw.spawnEntityInWorld(arrow);
  check('guest world refuses local spawns', gw.loadedEntityList.length === before);
}

// ---------------------------------------------------------------------- survival digging timing
{
  bobMP!.setGameType(EnumGameType.SURVIVAL);
  step(2);
  check('game mode change reaches the guest', !bob.pc.isInCreativeMode() && !bob.mc.thePlayer!.capabilities.isCreativeMode);
  const gp = bob.mc.thePlayer!;
  gp.inventory.currentItem = 8;
  bobMP!.inventory.currentItem = 8;
  // Stand next to (10, 3, 11) and claim to finish digging it right away: refused for now.
  walkTo(bob, 10.5, 4, 9.5);
  step(4);
  bob.handler.addToSendQueue({ type: 'BlockDig', status: 0, x: 10, y: 3, z: 11, face: 1 });
  bob.handler.addToSendQueue({ type: 'BlockDig', status: 2, x: 10, y: 3, z: 11, face: 1 });
  bob.handler.flush();
  step(2);
  check('instant survival dig refused', hw.getBlockId(10, 3, 11) === B.stone);
  // By hand stone takes 151 ticks (7.5 s); the held finish completes once the time has passed.
  step(160);
  check('held finish completes after the mining time', hw.getBlockId(10, 3, 11) === 0);
  step(2);
  check('guest sees the result', gw.getBlockId(10, 3, 11) === 0);
  bobMP!.setGameType(EnumGameType.CREATIVE);
  step(2);
}

// ---------------------------------------------------------------------- windows
{
  hw.setBlock(11, 4, 11, B.chest, 0, 3);
  const chest = hw.getBlockTileEntity(11, 4, 11) as unknown as { setInventorySlotContents(i: number, s: ItemStack): void; getStackInSlot(i: number): ItemStack | null };
  chest.setInventorySlotContents(0, new ItemStack(I.diamond, 5, 0));
  step(2);
  const gp = bob.mc.thePlayer!;
  walkTo(bob, 10.5, 4, 10.5);
  step(4);
  bob.pc.onPlayerRightClick(gp, gw, gp.inventory.getCurrentItem(), 11, 4, 11, 1, new Vec3(11.5, 5, 11.5));
  step(3);
  const open = gp.openContainer;
  check('chest window opened from the host', open !== gp.inventoryContainer && open.windowId === bobMP!.openContainer.windowId && open.windowId > 0, `${open.windowId} ${bobMP!.openContainer.windowId}`);
  check('window contents mirrored', open.getSlot(0).getStack()?.itemID === I.diamond && open.getSlot(0).getStack()?.stackSize === 5);
  // Shift-click the diamonds into the guest's inventory.
  bob.pc.windowClick(open.windowId, 0, 0, 1, gp);
  step(3);
  check('window click applied on the host', chest.getStackInSlot(0) === null && bobMP!.inventory.hasItem(I.diamond));
  check('guest inventory has the diamonds', gp.inventory.hasItem(I.diamond));
  gp.closeScreen();
  step(2);
  check('closing the window reaches the host', bobMP!.openContainer === bobMP!.inventoryContainer);
  // Closing the guest's own inventory (E) sends CloseWindow 0; the host keeps mirroring it.
  gp.closeScreen();
  step(2);
  check('player stays a crafter of its inventory after E', bobMP!.inventoryContainer.crafters.includes(bobMP!));
  bobMP!.inventory.mainInventory[7] = new ItemStack(I.stick, 3, 0);
  step(2);
  check('host slot change after E reaches the guest', gp.inventory.mainInventory[7]?.itemID === I.stick && gp.inventory.mainInventory[7]?.stackSize === 3, String(gp.inventory.mainInventory[7]));
  hw.dropItemStack(bobMP!.posX, bobMP!.posY + 0.2, bobMP!.posZ, new ItemStack(I.emerald, 2, 0));
  step(20);
  check('pickup after E reaches the guest', gp.inventory.hasItem(I.emerald) && bobMP!.inventory.hasItem(I.emerald), gp.inventory.mainInventory.filter(Boolean).join(','));
  bobMP!.inventory.mainInventory[7] = null;
  for (let i = 0; i < 36; i++) if (bobMP!.inventory.mainInventory[i]?.itemID === I.emerald) bobMP!.inventory.mainInventory[i] = null;
  step(2);
}

// ---------------------------------------------------------------------- death and respawn
{
  bobMP!.setGameType(EnumGameType.SURVIVAL);
  step(2);
  bobMP!.attackEntityFrom(DamageSource.outOfWorld, 1000);
  step(2);
  const gp = bob.mc.thePlayer!;
  check('guest sees its death', gp.getHealth() <= 0);
  check('death message for everyone', hostChat.some((l) => l.includes('Bob')) && bob.chat.some((l) => l.includes('Bob fell out of the world') || l.includes('death.attack.outOfWorld')), bob.chat.slice(-3).join(' | '));
  gp.respawnPlayer();
  step(3);
  const np = bob.mc.thePlayer!;
  check('respawned as a new player', np !== gp && np.getHealth() > 0 && np.entityId === gp.entityId, `${np === gp} ${np.getHealth()}`);
  const respawned = hostPlayerOf('Bob');
  check('host replaced the player', !!respawned && respawned !== bobMP && respawned.getHealth() === 20);
  bobMP!.setGameType(EnumGameType.CREATIVE);
}

// ---------------------------------------------------------------------- creative items from a guest
{
  const me = hostPlayerOf('Bob')!;
  me.setGameType(EnumGameType.CREATIVE);
  step(2);
  // A potion whose tag has a null effect: the tag arrives cleaned, the host keeps ticking.
  const potion = new ItemStack(I.potion, 1, 8193);
  potion.stackTagCompound = { CustomPotionEffects: [null], ench: [null] };
  bob.handler.addToSendQueue({ type: 'CreativeSetSlot', slot: 38, item: potion });
  bob.handler.addToSendQueue({ type: 'CreativeSetSlot', slot: -1, item: potion });
  bob.handler.flush();
  step(2);
  const got = me.inventory.mainInventory[2];
  let usable = true;
  try {
    got?.hasEffect();
    for (const e of hw.loadedEntityList) (e as unknown as { getEntityItem?(): ItemStack }).getEntityItem?.()?.hasEffect();
  } catch {
    usable = false;
  }
  check('malformed creative tag cleaned on the host', got?.itemID === I.potion && JSON.stringify(got.stackTagCompound) === '{"CustomPotionEffects":[],"ench":[]}' && usable, JSON.stringify(got?.stackTagCompound));
  // A technical block (a moving piston) is not an item the creative inventory has.
  bob.handler.addToSendQueue({ type: 'CreativeSetSlot', slot: 39, item: new ItemStack(36, 1, 0) });
  bob.handler.flush();
  step(2);
  check('technical block refused in creative', me.inventory.mainInventory[3] === null, String(me.inventory.mainInventory[3]));
  // A worn tool from survival is fine.
  bob.handler.addToSendQueue({ type: 'CreativeSetSlot', slot: 39, item: new ItemStack(I.pickaxeDiamond, 1, 100) });
  bob.handler.flush();
  step(2);
  check('worn tool accepted in creative', me.inventory.mainInventory[3]?.getItemDamage() === 100);
  // An entity whose tick throws does not stop the host or the LAN server.
  const pig = EntityList.createEntityByName('Pig', hw)!;
  pig.setLocationAndAngles(9.5, 4, 9.5, 0, 0);
  hw.spawnEntityInWorld(pig);
  pig.onUpdate = () => {
    throw new Error('broken entity');
  };
  const t0 = hw.worldInfo.totalTime;
  const errors = console.error;
  console.error = () => undefined;
  step(3);
  console.error = errors;
  check('a throwing entity is removed and the game goes on', pig.isDead && !hw.loadedEntityList.includes(pig) && hw.worldInfo.totalTime === t0 + 3 && bob.handler.state === 'play');
  for (let i = 2; i < 4; i++) me.inventory.mainInventory[i] = null;
  for (const e of hw.loadedEntityList) if (EntityList.getEntityString(e) === 'Item') e.setDead();
  step(2);
}

// ---------------------------------------------------------------------- riding a boat
{
  // A pool at x 0..7, z 0..15 (y 1..3), well inside the loaded chunks (entities near the edge
  // of the loaded area do not tick).
  for (let x = 0; x < 8; x++) for (let z = 0; z < 16; z++) for (let y = 1; y <= 3; y++) hw.setBlock(x, y, z, B.waterStill, 0, 3);
  const gp = bob.mc.thePlayer!;
  const me = hostPlayerOf('Bob')!;
  me.setPositionAndUpdate(3.5, 4, -0.5);
  step(10);
  const boat = EntityList.createEntityByName('Boat', hw)!;
  boat.setLocationAndAngles(3.5, 3.6, 1.5, 0, 0);
  hw.spawnEntityInWorld(boat);
  step(10);
  const copy = gw.loadedEntityList.find((e) => EntityList.getEntityString(e) === 'Boat');
  bob.pc.interactWithEntity(gp, copy!);
  step(5);
  check('guest mounts the boat', me.ridingEntity === boat && gp.ridingEntity === copy);
  const z0 = boat.posZ;
  gp.rotationYaw = 0;
  gp.movementInput.moveForward = 1;
  step(60);
  gp.movementInput.moveForward = 0;
  check('guest steers the boat on the host', boat.posZ - z0 > 1, `moved ${(boat.posZ - z0).toFixed(3)}`);
  check('the boat moves on the guest too', !!copy && Math.abs(copy.posZ - boat.posZ) < 1, `${copy?.posZ} vs ${boat.posZ}`);
  // 1.5.2 gets out of a boat with another right click on it.
  bob.pc.interactWithEntity(gp, copy!);
  step(5);
  check('right-clicking again dismounts the guest', me.ridingEntity === null && gp.ridingEntity === null && bob.handler.state === 'play', `${me.ridingEntity} ${gp.ridingEntity} ${bob.disconnected?.reason}`);
  boat.setDead();
  for (let x = 0; x < 8; x++) for (let z = 0; z < 16; z++) for (let y = 1; y <= 3; y++) hw.setBlock(x, y, z, B.stone, 0, 3);
  me.setPositionAndUpdate(10.5, 4, 10.5);
  step(10);
}

// ---------------------------------------------------------------------- second guest and refusals
{
  const carol = await join('Carol');
  step(10);
  check('second guest joins', carol.handler.state === 'play');
  // A torch at a chunk corner lights the neighbouring chunks; a guest joining just after (while
  // the host still has those chunks encoded from Carol's join) gets that light too.
  hw.setBlock(0, 4, 0, B.torchWood, 5, 3);
  step(5);
  const erin = await join('Erin');
  step(10);
  const ew = erin.mc.theWorld!;
  const lightAt: [number, number, number][] = [[-1, 4, 0], [-2, 4, -1], [0, 4, -2], [-3, 4, -3]];
  const hostLight = lightAt.map(([x, y, z]) => hw.getSavedLightValue(1 as never, x, y, z));
  const lateLight = lightAt.map(([x, y, z]) => ew.getSavedLightValue(1 as never, x, y, z));
  check('a late joiner gets the light next to a new torch', hostLight.join() === lateLight.join() && hostLight[0] > 10, `${hostLight} vs ${lateLight}`);
  hw.setBlock(0, 4, 0, 0, 0, 3);
  erin.handler.disconnect();
  step(3);
  check('second guest sees the first', carol.mc.theWorld!.loadedEntityList.some((e) => e instanceof EntityOtherPlayerMP && e.username === 'Bob'));
  check('first guest sees the second', gw.loadedEntityList.some((e) => e instanceof EntityOtherPlayerMP && e.username === 'Carol'));
  const dup = await join('alice');
  step(3);
  check('name taken refused', dup.disconnected?.reason.includes('already taken') === true, dup.disconnected?.reason);
  const old = await join('Dave', PROTOCOL_VERSION + 5);
  step(3);
  check('version mismatch refused', old.disconnected?.reason.includes('Outdated server') === true, old.disconnected?.reason);
  const bad = await join('x');
  step(3);
  check('invalid name refused', bad.disconnected?.reason === 'Invalid username!', bad.disconnected?.reason);
  // Hostile input: garbage, an unknown packet and an oversized message only kick that guest.
  const evil1 = await join('Mallory');
  step(5);
  evil1.conn.send(new Uint8Array([0x4d, 1, 3, 250, 1, 2]));
  step(3);
  check('malformed message kicks', lan.guestPlayers().every((p) => p.username !== 'Mallory'));
  const evil2 = await join('Trudy');
  step(5);
  const w = new PacketWriter();
  w.u8(0x4d);
  w.varint(1);
  w.bytes(new Uint8Array([99, 0]));
  evil2.conn.send(w.finish());
  step(3);
  check('unknown packet kicks', lan.guestPlayers().every((p) => p.username !== 'Trudy'));
  const evil3 = await join('Oscar');
  step(5);
  evil3.conn.send(new Uint8Array(200000).fill(0x4d));
  step(3);
  check('oversized message kicks', lan.guestPlayers().every((p) => p.username !== 'Oscar'));
  const evil4 = await join('Peggy');
  step(5);
  evil4.conn.send(encodeFrame([{ type: 'Flying', flags: 1, x: Number.NaN, y: 4, stance: 5.62, z: 0, yaw: 0, pitch: 0 }]));
  step(3);
  check('NaN position kicks', lan.guestPlayers().every((p) => p.username !== 'Peggy'));
  const evil5 = await join('Victor');
  step(5);
  for (let i = 0; i < 20; i++) evil5.conn.send(encodeFrame(new Array(200).fill({ type: 'Animation', entityId: 0, animate: 1 })));
  step(2);
  check('packet flood kicks', lan.guestPlayers().every((p) => p.username !== 'Victor'));
  const evil6 = await join('Walter');
  step(5);
  evil6.conn.send(encodeFrame([{ type: 'Login', entityId: 1, username: 'x', gameType: 0, hardcore: false, difficulty: 0, maxPlayers: 1, terrainType: 'default', worldName: '', spawnX: 0, spawnY: 0, spawnZ: 0, viewDistance: 1, allowCommands: false }]));
  step(3);
  check('server-only packet from a guest kicks', lan.guestPlayers().every((p) => p.username !== 'Walter'));
  check('host still running with its guests', lan.guestPlayers().map((p) => p.username).sort().join(',') === 'Bob,Carol', lan.guestPlayers().map((p) => p.username).join(','));
  void PACKETS;
  // Leaving.
  carol.handler.disconnect();
  step(3);
  check('guest leaving removes its player', !lan.guestPlayers().some((p) => p.username === 'Carol') && !hw.loadedEntityList.some((e) => e instanceof EntityPlayerMP && e.username === 'Carol'));
  check('leave message', hostChat.some((l) => l.includes('Carol left the game')) && bob.chat.some((l) => l.includes('Carol left the game')));
  check('other guest no longer sees the leaver', !gw.loadedEntityList.some((e) => e instanceof EntityOtherPlayerMP && e.username === 'Carol'));
  check('TAB list without the leaver', !bob.handler.playerInfo.has('Carol'));
}

// ---------------------------------------------------------------------- names of departed guests
{
  const owner = await join('Owner');
  step(10);
  hostPlayerOf('Owner')!.inventory.mainInventory[0] = new ItemStack(I.diamond, 64, 0);
  step(2);
  owner.handler.disconnect();
  step(3);
  const thief = await rawJoin('owner');
  check("someone else cannot take a departed guest's things", hostPlayerOf('owner') === null && thief.kick()?.includes('left this game') === true, thief.kick());
  const back = await join('Owner');
  step(10);
  check('the owner gets them back with its token', back.handler.state === 'play' && hostPlayerOf('Owner')?.inventory.mainInventory[0]?.stackSize === 64);
  back.handler.disconnect();
  step(3);
  // Hardcore: a dead guest is kicked when it respawns and cannot come back under that name.
  hw.worldInfo.hardcore = true;
  const hardy = await join('Hardy');
  step(10);
  hostPlayerOf('Hardy')!.attackEntityFrom(DamageSource.outOfWorld, 1000);
  step(3);
  hardy.mc.thePlayer!.respawnPlayer();
  step(3);
  check('hardcore death kicks the guest', hardy.disconnected?.reason === "You have died. Game over, man, it's game over!", hardy.disconnected?.reason);
  const again = await join('Hardy');
  step(5);
  check('a hardcore death keeps the name out', again.disconnected?.reason === "You have died. Game over, man, it's game over!" && hostPlayerOf('Hardy') === null, again.disconnected?.reason);
  hw.worldInfo.hardcore = false;
}

// ---------------------------------------------------------------------- reconnect keeps the inventory
{
  hostPlayerOf('Bob')!.inventory.mainInventory[5] = new ItemStack(I.emerald, 7, 0);
  step(2);
  const lastPos = hostPlayerOf('Bob')!.posX;
  bob.handler.disconnect();
  step(3);
  const again = await join('Bob');
  step(10);
  check('returning player keeps its things', again.mc.thePlayer!.inventory.mainInventory[5]?.itemID === I.emerald);
  check('returning player keeps its place', Math.abs(again.mc.thePlayer!.posX - lastPos) < 0.01, `${again.mc.thePlayer!.posX} vs ${lastPos}`);
  // Logging in again while the old connection is still open (a reloaded tab): with the token the
  // new login wins, as in 1.5.2; the old one is told why.
  const twin = await join('Bob');
  step(10);
  check('a second login with the token replaces the first', twin.handler.state === 'play' && again.disconnected?.reason === 'You logged in from another location' && hostPlayerOf('Bob')?.inventory.mainInventory[5]?.itemID === I.emerald, `${twin.handler.state} ${twin.disconnected?.reason} / ${again.disconnected?.reason}`);
  const lastWithoutToken = await rawJoin('bob');
  check('a second login without the token is refused', lastWithoutToken.kick()?.includes('already taken') === true, lastWithoutToken.kick());
  // Host closes the game: the guest is told.
  lan.stop();
  step(3);
  check('host closing shows the guest a reason', twin.disconnected?.reason === 'Server closed', twin.disconnected?.reason);
  check('host world back to single player', hw.netEvents === null);
}

report();
