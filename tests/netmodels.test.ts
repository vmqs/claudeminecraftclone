/**
 * Player models in a LAN game end to end without a browser (MC|Model): a host World with a
 * LanServer and guests over the in-memory transport, each with its own model registry, as
 * separate browsers would have. Built-in models travel by id; an imported model's file goes from
 * its guest to the host in pieces, is checked and reaches the other guests; changes, departures
 * and hostile data (wrong hash, pieces out of order, a file that is no model) are handled.
 * Run: node scripts/run-node-test.mjs tests/netmodels.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B } from '../src/block/BlockIds';
import { readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { modelHash } from '../src/client/model/PlayerModelFormat';
import { PlayerModelRegistry, type BuiltinModelInfo } from '../src/client/model/PlayerModels';
import { encodeData, encodeWear, MODEL_CHANNEL } from '../src/net/ModelSync';
import { MODEL_CHANGE_TICKS } from '../src/net/server/ModelRelay';
import { MovementInput } from '../src/client/MovementInput';
import { PlayerSkinRegistry } from '../src/client/skin/PlayerSkins';
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
import { MemoryHub } from '../src/net/transport/MemoryTransport';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();


const info = new WorldInfo();
info.worldName = 'Models';
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

/** The host's browser: its own skin and model registries. */
const hostSkins = new PlayerSkinRegistry();
hostSkins.localPlayer = () => host;
const modelsDir = pathJoin(process.cwd(), 'public/models');
const builtinIndex = JSON.parse(readFileSync(pathJoin(modelsDir, 'index.json'), 'utf8')).models as BuiltinModelInfo[];
/** A registry like a browser's: built-ins from public/models, imported files from `stored`. */
function registry(stored: Map<string, Uint8Array>, local: () => object | null): PlayerModelRegistry {
  const r = new PlayerModelRegistry();
  r.localPlayer = local;
  r.loaders = {
    builtinIndex: async () => builtinIndex,
    builtinFile: async (i) => new Uint8Array(readFileSync(pathJoin(modelsDir, i.file))),
    userFile: async (h) => stored.get(h) ?? null,
  };
  return r;
}
const hostModels = registry(new Map(), () => host);
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
    models: hostModels,
  },
  hub.host(),
  { gameType: EnumGameType.CREATIVE, allowCommands: true, maxPlayers: 8, viewDistance: 3 },
);
await lan.start('MODELROOM');

interface Guest {
  name: string;
  handler: NetClientHandler;
  pc: PlayerControllerGuest;
  skins: PlayerSkinRegistry;
  models: PlayerModelRegistry;
  stored: Map<string, Uint8Array>;
  mc: { theWorld: WorldClient | null; thePlayer: EntityClientPlayerMP | null };
  disconnected: string | null;
}
const guests: Guest[] = [];

async function join(name: string, own: Uint8Array | null): Promise<Guest> {
  const conn = await hub.guest().connect('MODELROOM', 1000);
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
  const stored = new Map<string, Uint8Array>();
  const models = registry(stored, () => mc.thePlayer);
  const g: Guest = { name, handler: null as never, pc: null as never, skins, models, stored, mc, disconnected: null };
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
    models,
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

/** The model a guest's renderer would use for the player named `name` (an EntityOtherPlayerMP). */
function seenBy(g: Guest, name: string): string {
  const e = g.mc.theWorld?.loadedEntityList.find((x): x is EntityOtherPlayerMP => x instanceof EntityOtherPlayerMP && x.username === name);
  return e ? g.models.keyFor(e) : 'absent';
}
function hostSees(name: string): string {
  const e = lan.guestPlayers().find((p) => p.username === name);
  return e ? hostModels.keyFor(e) : 'absent';
}
async function settle(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    step(1);
    await new Promise((r) => setTimeout(r, 0));
  }
}

await hostModels.loadBuiltins();
const noobBytes = new Uint8Array(readFileSync(pathJoin(modelsDir, 'roblox_noob/model.mcpm')));
const noobKey = `data:${modelHash(noobBytes)}`;

// Bob wears a built-in model; the host wears Trevor.
hostModels.setLocal('builtin:trevor');
const bob = await join('Bob', null);
bob.models.setLocal('builtin:john_marston');
await settle(40);
check('Bob logged in', bob.handler.state === 'play', String(bob.disconnected));
check('the host sees Bob as John Marston', hostSees('Bob') === 'builtin:john_marston', hostSees('Bob'));
check('Bob sees the host as Trevor', seenBy(bob, 'Alice') === 'builtin:trevor', seenBy(bob, 'Alice'));
check('each wears their own model locally', bob.models.keyFor(bob.mc.thePlayer!) === 'builtin:john_marston' && hostModels.keyFor(host) === 'builtin:trevor');

// Carl imported a model (stored in his browser): its file goes to the host and on to Bob.
const carl = await join('Carl', null);
carl.stored.set(noobKey.slice(5), noobBytes);
carl.models.setLocal(noobKey);
await settle(MODEL_CHANGE_TICKS + 20);
check('the host received the imported file', hostModels.has(noobKey));
check('the host sees Carl in his imported model', hostSees('Carl') === noobKey, hostSees('Carl'));
check('Bob received the file too', bob.models.has(noobKey));
check('Bob sees Carl in it', seenBy(bob, 'Carl') === noobKey, seenBy(bob, 'Carl'));
check('Carl sees the others', seenBy(carl, 'Alice') === 'builtin:trevor' && seenBy(carl, 'Bob') === 'builtin:john_marston', `${seenBy(carl, 'Alice')} ${seenBy(carl, 'Bob')}`);
check('the received model decodes', bob.models.dataFor(noobKey)?.name === 'Roblox Noob');

// A newcomer gets everyone's models, the imported file included.
const dave = await join('Dave', null);
await settle(30);
check('a newcomer sees the imported model', seenBy(dave, 'Carl') === noobKey && dave.models.has(noobKey), seenBy(dave, 'Carl'));
check('a newcomer sees the built-ins', seenBy(dave, 'Alice') === 'builtin:trevor' && seenBy(dave, 'Bob') === 'builtin:john_marston');

// Carl goes back to Steve; the host changes model.
carl.models.setLocal('steve');
hostModels.setLocal('builtin:roblox_noob');
await settle(MODEL_CHANGE_TICKS + 5);
check('back to Steve reaches everyone', hostSees('Carl') === 'steve' && seenBy(bob, 'Carl') === 'steve' && seenBy(dave, 'Carl') === 'steve');
check('the host change reaches everyone', seenBy(bob, 'Alice') === 'builtin:roblox_noob' && seenBy(dave, 'Alice') === 'builtin:roblox_noob');

// Hostile input from Dave: a file whose bytes do not match the hash, pieces out of order, and
// a matching file that is no model. Nobody is kicked; others keep seeing Steve.
const send = (data: Uint8Array) => {
  dave.handler.conn.send(encodeFrame([{ type: 'CustomPayload', channel: MODEL_CHANNEL, data }]));
  hub.flush();
};
const before = lan.models.rejected;
const fake = noobBytes.slice();
fake[100] ^= 255;
send(encodeWear(noobKey, fake.length));
send(encodeData(noobKey.slice(5), 0, fake));
await settle(MODEL_CHANGE_TICKS + 3);
check('a file with the wrong hash is refused', lan.models.rejected === before + 1 && dave.handler.state === 'play' && seenBy(bob, 'Dave') === 'steve', `${lan.models.rejected - before} ${seenBy(bob, 'Dave')}`);
const junk = new Uint8Array(5000).map((_, i) => (i * 31) & 255);
const junkKey = `data:${modelHash(junk)}`;
send(encodeWear(junkKey, junk.length));
send(encodeData(junkKey.slice(5), 100, junk.subarray(100, 200)));
await settle(2);
check('a piece out of order is refused', lan.models.rejected === before + 2, `${lan.models.rejected - before}`);
send(encodeWear(junkKey, junk.length));
send(encodeData(junkKey.slice(5), 0, junk));
await settle(MODEL_CHANGE_TICKS + 3);
check('a file that is no model is refused', lan.models.rejected === before + 3 && !hostModels.has(junkKey) && hostSees('Dave') === 'steve', `${lan.models.rejected - before} ${hostSees('Dave')}`);
send(new Uint8Array([7, 1, 2, 3]));
await settle(2);
check('an unknown message is refused', lan.models.rejected === before + 4 && dave.handler.state === 'play');

// A guest leaves: its model is forgotten everywhere.
bob.handler.disconnect();
await settle(5);
check('a departed guest model is forgotten by the host', hostModels.getRemote('Bob') === 'steve');
check('and by the other guests', dave.models.getRemote('Bob') === 'steve');

lan.stop();
await settle(2);
report();
