/**
 * Skins in a LAN game end to end without a browser: a host World with a LanServer and guests
 * (NetClientHandler + WorldClient) over the in-memory transport, each with its own skin
 * registry, as separate browsers would have. Checks that every player sees everyone else's
 * skin (the host's and each guest's), that changes and resets travel, that a departed guest
 * goes back to Steve, and that a guest cannot send anything but a 64x32 picture.
 * Run: node scripts/run-node-test.mjs tests/netskins.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { MovementInput } from '../src/client/MovementInput';
import { PlayerSkinRegistry } from '../src/client/skin/PlayerSkins';
import { SKIN_BYTES } from '../src/client/skin/SkinImage';
import { setServer } from '../src/command/CommandServer';
import { CommandHandler } from '../src/command/CommandHandler';
import { EntityOtherPlayerMP } from '../src/entity/EntityOtherPlayerMP';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { registerBlockItems } from '../src/item/Items';
import type { EntityClientPlayerMP } from '../src/net/client/EntityClientPlayerMP';
import { type GuestClient, NetClientHandler } from '../src/net/client/NetClientHandler';
import { PlayerControllerGuest } from '../src/net/client/PlayerControllerGuest';
import type { WorldClient } from '../src/net/client/WorldClient';
import { encodeFrame } from '../src/net/protocol/Packets';
import { LanServer } from '../src/net/server/LanServer';
import { SKIN_CHANGE_TICKS } from '../src/net/server/SkinRelay';
import { SKIN_CHANNEL } from '../src/net/SkinSync';
import { MemoryHub } from '../src/net/transport/MemoryTransport';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();

/** A 64x32 skin whose first pixel is (r, g, b); the hat area keeps one see-through pixel. */
function skin(r: number, g: number, b: number): Uint8Array {
  const s = new Uint8Array(SKIN_BYTES);
  for (let i = 0; i < s.length; i += 4) s.set([r, g, b, 255], i);
  s[(2 * 64 + 40) * 4 + 3] = 0;
  return s;
}

const info = new WorldInfo();
info.worldName = 'Skins';
info.gameType = 1;
info.spawnX = 8;
info.spawnY = 4;
info.spawnZ = 8;
const hw = new World(info);
hw.mobSpawner = null;
for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) hw.addChunk(new Chunk(hw as never, cx, cz));
for (let x = -32; x < 48; x++) for (let z = -32; z < 48; z++) for (let y = 0; y < 4; y++) w(x, y, z);
function w(x: number, y: number, z: number): void {
  hw.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
}

const noop = () => undefined;
const hostMc = {
  theWorld: hw,
  thePlayer: null as EntityPlayerSP | null,
  playRandomMusicIfReady: noop,
  displayGuiScreen: noop,
  playSoundFX: noop,
  effectRenderer: { addEffect: noop },
  ingameGUI: { getChatGUI: () => ({ printChatMessage: noop, addTranslatedMessage: noop }) },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer: noop,
};
const host = new EntityPlayerSP(hostMc as never, hw, 'Alice');
hostMc.thePlayer = host;
host.setLocationAndAngles(4.5, 4, 4.5, 0, 0);
hw.spawnEntityInWorld(host);
PlayerSpawning.initializeGameType(host, hw.worldInfo);

/** The host's browser: its own skin registry. */
const hostSkins = new PlayerSkinRegistry();
hostSkins.localPlayer = () => host;
const hub = new MemoryHub(false);
const commands = new CommandHandler();
let lan: LanServer;
setServer({
  getWorlds: () => [hw],
  getPlayers: () => [host, ...lan.guestPlayers()],
  sendChatMsg: (msg) => lan.sendChatMsg(msg),
  isSinglePlayer: () => true,
  getCommandManager: () => commands,
  lan: () => null,
});
lan = new LanServer(
  {
    world: hw,
    hostPlayer: () => host,
    hostName: 'Alice',
    printChat: noop,
    commandManager: () => commands,
    getPossibleCompletions: () => [],
    setExtraLoadCenters: noop,
    hostSkin: () => hostSkins.local,
    playerSkin: (name, rgba) => hostSkins.setRemote(name, rgba),
  },
  hub.host(),
  { gameType: EnumGameType.CREATIVE, allowCommands: true, maxPlayers: 8, viewDistance: 3 },
);
await lan.start('SKINROOM');

interface Guest {
  name: string;
  handler: NetClientHandler;
  pc: PlayerControllerGuest;
  skins: PlayerSkinRegistry;
  mc: { theWorld: WorldClient | null; thePlayer: EntityClientPlayerMP | null };
  disconnected: string | null;
}
const guests: Guest[] = [];

async function join(name: string, own: Uint8Array | null): Promise<Guest> {
  const conn = await hub.guest().connect('SKINROOM', 1000);
  const mc = {
    theWorld: null as WorldClient | null,
    thePlayer: null as EntityClientPlayerMP | null,
    currentScreen: null,
    playRandomMusicIfReady: noop,
    sndManager: { playSound: noop },
    displayGuiScreen: noop,
    playSoundFX: noop,
    effectRenderer: { addEffect: noop },
    ingameGUI: { getChatGUI: () => ({ printChatMessage: noop, addTranslatedMessage: noop }) },
    gameSettings: { chatVisibility: 0 },
    respawnPlayer: noop,
  };
  const skins = new PlayerSkinRegistry();
  skins.localPlayer = () => mc.thePlayer;
  skins.setLocal(own);
  const g: Guest = { name, handler: null as never, pc: null as never, skins, mc, disconnected: null };
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
    respawnGuestPlayer: noop,
    guestDisconnected(_title, reason) {
      g.disconnected = reason;
      skins.clearRemote();
    },
    printChat: noop,
    setGameType: (t) => g.pc.setGameType(t),
    autocompleteResponse: noop,
    localSkin: () => skins.local,
    playerSkin: (n, rgba) => skins.setRemote(n, rgba),
  };
  g.handler = new NetClientHandler(client, conn);
  g.pc = new PlayerControllerGuest(mc as never, g.handler);
  g.handler.start();
  guests.push(g);
  return g;
}

function step(n = 1): void {
  for (let i = 0; i < n; i++) {
    hw.updateEntities();
    hw.tick();
    lan.tick();
    hub.flush();
    for (const g of guests) {
      if (g.disconnected) continue;
      g.handler.processReadPackets();
      if (g.mc.theWorld && !g.disconnected) {
        g.pc.updateController();
        g.mc.theWorld.updateEntities();
        g.mc.theWorld.tick();
      }
      g.handler.flush();
    }
    hub.flush();
  }
}

const first = (s: Uint8Array | null) => (s ? [s[0], s[1], s[2]].join(',') : 'steve');
/** The skin a guest's renderer would use for the player named `name` (an EntityOtherPlayerMP). */
function seenBy(g: Guest, name: string): string {
  const e = g.mc.theWorld?.loadedEntityList.find((x): x is EntityOtherPlayerMP => x instanceof EntityOtherPlayerMP && x.username === name);
  return e ? first(g.skins.skinFor(e)) : 'absent';
}
function hostSees(name: string): string {
  const e = lan.guestPlayers().find((p) => p.username === name);
  return e ? first(hostSkins.skinFor(e)) : 'absent';
}

hostSkins.setLocal(skin(200, 10, 10));
const bob = await join('Bob', skin(10, 200, 10));
step(30);
check('Bob logged in', bob.handler.state === 'play', String(bob.disconnected));
check('the host sees Bob in his skin', hostSees('Bob') === '10,200,10', hostSees('Bob'));
check('Bob sees the host in hers', seenBy(bob, 'Alice') === '200,10,10', seenBy(bob, 'Alice'));
check('each wears their own skin locally', first(bob.skins.skinFor(bob.mc.thePlayer!)) === '10,200,10' && first(hostSkins.skinFor(host)) === '200,10,10');

const carl = await join('Carl', null);
step(30);
check('a Steve guest stays Steve for the host', hostSees('Carl') === 'steve');
check('a newcomer sees the host skin', seenBy(carl, 'Alice') === '200,10,10');
check('a newcomer sees an earlier guest skin', seenBy(carl, 'Bob') === '10,200,10', seenBy(carl, 'Bob'));
check('an earlier guest sees the Steve newcomer', seenBy(bob, 'Carl') === 'steve');

// Carl picks a skin in the Account Manager while playing.
carl.skins.setLocal(skin(10, 10, 220));
step(SKIN_CHANGE_TICKS + 5);
check('a skin change reaches the host', hostSees('Carl') === '10,10,220', hostSees('Carl'));
check('a skin change reaches the other guests', seenBy(bob, 'Carl') === '10,10,220', seenBy(bob, 'Carl'));

// The host changes skin; then resets to Steve.
hostSkins.setLocal(skin(90, 90, 90));
step(3);
check('the host skin change reaches everyone', seenBy(bob, 'Alice') === '90,90,90' && seenBy(carl, 'Alice') === '90,90,90');
hostSkins.setLocal(null);
step(3);
check('the host back to Steve everywhere', seenBy(bob, 'Alice') === 'steve' && seenBy(carl, 'Alice') === 'steve');

// Bob resets to Steve.
bob.skins.setLocal(null);
step(SKIN_CHANGE_TICKS + 5);
check('a guest reset reaches the others', hostSees('Bob') === 'steve' && seenBy(carl, 'Bob') === 'steve');

// A guest leaves: its skin is forgotten everywhere.
carl.handler.disconnect();
step(5);
check('a departed guest skin is forgotten by the host', hostSkins.getRemote('Carl') === null);
check('and by the other guests', bob.skins.getRemote('Carl') === null);

// Hostile input: a skin of the wrong size is ignored, not kicked, and changes nothing.
const before = lan.skins.rejected;
bob.handler.conn.send(encodeFrame([{ type: 'CustomPayload', channel: SKIN_CHANNEL, data: new Uint8Array(1234) }]));
hub.flush();
step(SKIN_CHANGE_TICKS + 3);
check('a malformed skin is rejected', lan.skins.rejected === before + 1 && bob.handler.state === 'play' && hostSees('Bob') === 'steve');

lan.stop();
step(2);
check('closing the room forgets the guests skins on the host', hostSkins.remoteNames().length === 0, hostSkins.remoteNames().join(','));
report();
