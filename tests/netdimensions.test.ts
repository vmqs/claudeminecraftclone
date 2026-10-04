/**
 * The Nether and the End in a LAN game, without a browser: a host with a DimensionManager (Node
 * chunk sources) and a guest over the in-memory transport. The guest goes through a portal (the
 * Respawn packet with the dimension, a new WorldClient, only that dimension's chunks and
 * entities), dies there and respawns in the overworld, then finishes the End (the credits'
 * GameEvent 4 and the respawn with everything kept).
 * Run: node scripts/run-node-test.mjs tests/netdimensions.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { MovementInput } from '../src/client/MovementInput';
import { DamageSource } from '../src/entity/DamageSource';
import { Entity } from '../src/entity/Entity';
import { EntityOtherPlayerMP } from '../src/entity/EntityOtherPlayerMP';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import type { EntityClientPlayerMP } from '../src/net/client/EntityClientPlayerMP';
import { type GuestClient, NetClientHandler } from '../src/net/client/NetClientHandler';
import { PlayerControllerGuest } from '../src/net/client/PlayerControllerGuest';
import type { WorldClient } from '../src/net/client/WorldClient';
import type { Packet } from '../src/net/protocol/Packets';
import type { EntityPlayerMP } from '../src/net/server/EntityPlayerMP';
import { LanServer } from '../src/net/server/LanServer';
import { MemoryHub } from '../src/net/transport/MemoryTransport';
import { DimensionManager } from '../src/world/DimensionManager';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { fakeProvider } from './fakeDimensions';
import { check, report } from './harness';

registerBlockItems();

const info = new WorldInfo();
info.worldName = 'LAN dims';
info.seed = 7n;
info.gameType = 0;
info.terrainType = 'flat';
info.spawnX = 8;
info.spawnY = 4;
info.spawnZ = 8;
info.gameRules.doMobSpawning = false;
const over = new World(info);
const mgr = new DimensionManager(info, over, null);
mgr.providerFactory = fakeProvider;
mgr.load(0);
mgr.tickChunkLoading(0, { x: 8, z: 8, radius: 2 });

const hostMc = {
  theWorld: over,
  thePlayer: null as EntityPlayerSP | null,
  displayGuiScreen() {},
  playSoundFX() {},
  effectRenderer: { addEffect() {} },
  ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer() {},
};
const host = new EntityPlayerSP(hostMc as never, over, 'Alice');
hostMc.thePlayer = host;
host.setLocationAndAngles(4.5, 4, 4.5, 0, 0);
over.spawnEntityInWorld(host);
PlayerSpawning.initializeGameType(host, info);

const hub = new MemoryHub(false);
const lan = new LanServer(
  {
    world: over,
    worlds: () => mgr.worlds(),
    dimensions: () => mgr,
    hostPlayer: () => host,
    hostName: 'Alice',
    printChat() {},
    commandManager: () => null,
    getPossibleCompletions: () => [],
    setExtraLoadCenters: (centers) => {
      const m = new Map<number, { x: number; z: number; radius: number }[]>();
      for (const c of centers) {
        const list = m.get(c.dim ?? 0) ?? [];
        list.push(c);
        m.set(c.dim ?? 0, list);
      }
      mgr.extraCenters = m;
    },
  },
  hub.host(),
  { gameType: EnumGameType.SURVIVAL, allowCommands: true, maxPlayers: 8, viewDistance: 3 },
);
Entity.dimensionTravel = (e, dim) => {
  if (e === host) return;
  if (e.isPlayerEntity) lan.requestTravel(e as never, dim);
  else mgr.transferEntity(e, dim);
};
await lan.start('DIM234');

// ---------------------------------------------------------------------- the guest
const conn = await hub.guest().connect('DIM234', 1000);
const received: Packet[] = [];
const mc = {
  theWorld: null as WorldClient | null,
  thePlayer: null as EntityClientPlayerMP | null,
  currentScreen: null as unknown,
  playRandomMusicIfReady() {},
  sndManager: { playSound() {} },
  displayGuiScreen(s: unknown) {
    mc.currentScreen = s;
  },
  playSoundFX() {},
  effectRenderer: { addEffect() {} },
  ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer() {},
};
let pc: PlayerControllerGuest;
let worldsShown = 0;
let winShown = 0;
const client: GuestClient = {
  username: 'Bob',
  playerClient: mc as never,
  get guestController() {
    return pc;
  },
  startGuestWorld(world, player, type) {
    worldsShown++;
    mc.theWorld = world;
    mc.thePlayer = player;
    player.preparePlayerToSpawn();
    world.spawnEntityInWorld(player);
    player.movementInput = new MovementInput();
    pc.setGameType(type);
  },
  respawnGuestPlayer(player, type) {
    mc.thePlayer = player;
    player.preparePlayerToSpawn();
    mc.theWorld!.spawnEntityInWorld(player);
    player.movementInput = new MovementInput();
    pc.setGameType(type);
  },
  showWinGame(closed) {
    winShown++;
    closed();
  },
  guestDisconnected() {},
  printChat() {},
  setGameType: (t) => pc.setGameType(t),
  autocompleteResponse() {},
};
const handler = new NetClientHandler(client, conn);
const origHandle = (handler as unknown as { handle(p: Packet): void }).handle.bind(handler);
(handler as unknown as { handle(p: Packet): void }).handle = (p: Packet) => {
  received.push(p);
  origHandle(p);
};
pc = new PlayerControllerGuest(mc as never, handler);
handler.start();

function step(n = 1): void {
  for (let i = 0; i < n; i++) {
    mgr.tickChunkLoading(0, { x: host.posX, z: host.posZ, radius: 2 });
    for (const w of mgr.worlds()) {
      w.updateEntities();
      w.tick();
    }
    lan.tick();
    hub.flush();
    handler.processReadPackets();
    const w = mc.theWorld;
    if (w) {
      pc.updateController();
      w.updateEntities();
      w.tick();
    }
    handler.flush();
    hub.flush();
  }
}

const bobOnHost = (): EntityPlayerMP | undefined => lan.guestPlayers()[0];
for (let i = 0; i < 100 && !(mc.thePlayer && handler.positionReceived); i++) step();
check('guest joined in the overworld', !!mc.thePlayer && mc.theWorld?.provider.dimensionId === 0 && mc.thePlayer.dimension === 0);
const loginPacket = received.find((p) => p.type === 'Login') as { dimension?: number } | undefined;
check('Login carries the dimension', loginPacket?.dimension === 0);
step(20);
check('guest sees the host', mc.theWorld!.loadedEntityList.some((e) => e instanceof EntityOtherPlayerMP));

// Into the Nether.
const bob = bobOnHost()!;
bob.inventory.mainInventory[0] = new ItemStack(B.cobblestone, 12, 0);
bob.travelToDimension(-1);
for (let i = 0; i < 60 && (mc.theWorld!.provider.dimensionId !== -1 || !handler.positionReceived); i++) step();
const respawn = received.find((p) => p.type === 'Respawn') as { dimension: number; worldHeight: number } | undefined;
check('Respawn packet with the dimension', respawn?.dimension === -1 && respawn.worldHeight === 256, JSON.stringify(respawn));
check('guest has a Nether world', mc.theWorld!.provider.dimensionId === -1 && mc.theWorld!.provider.hasNoSky && worldsShown === 2);
const nether = mgr.getWorld(-1)!;
const bob2 = bobOnHost()!;
check('host player in the Nether world', bob2.worldObj === nether && nether.playerEntities.includes(bob2) && !over.playerEntities.includes(bob2));
check('a portal was built around the arrival', countAround(nether, bob2, B.portal) === 6, String(countAround(nether, bob2, B.portal)));
step(20);
check('guest got Nether chunks', mc.theWorld!.loadedChunkCount > 0 && handler.positionReceived);
check('guest no longer sees the host in the overworld', !mc.theWorld!.loadedEntityList.some((e) => e instanceof EntityOtherPlayerMP));
check('guest kept its inventory', mc.thePlayer!.inventory.mainInventory[0]?.stackSize === 12, String(mc.thePlayer!.inventory.mainInventory[0]?.stackSize));
const lastPos = [...received].reverse().find((p) => p.type === 'PlayerPosLook') as { x: number; z: number } | undefined;
check('guest placed at the host position', !!lastPos && Math.abs(lastPos.x - bob2.posX) < 0.01 && Math.abs(lastPos.z - bob2.posZ) < 0.01);

// Dying in the Nether: the respawn is in the overworld.
bob2.initialInvulnerability = 0;
bob2.attackEntityFrom(DamageSource.outOfWorld, 1000);
step(25);
handler.addToSendQueue({ type: 'ClientCommand', payload: 1 });
for (let i = 0; i < 40 && mc.theWorld!.provider.dimensionId !== 0; i++) step();
step(5);
check('guest respawned in the overworld', mc.theWorld!.provider.dimensionId === 0 && bobOnHost()!.worldObj === over && bobOnHost()!.getHealth() === 20);

// The End, then its exit portal: the credits and a respawn that keeps everything.
const bob3 = bobOnHost()!;
bob3.inventory.mainInventory[1] = new ItemStack(B.dirt, 5, 0);
bob3.travelToDimension(1);
for (let i = 0; i < 60 && (mc.theWorld!.provider.dimensionId !== 1 || !handler.positionReceived); i++) step();
const bob4 = bobOnHost()!;
check('guest in the End on the platform', mc.theWorld!.provider.dimensionId === 1 && bob4.worldObj === mgr.getWorld(1) && Math.floor(bob4.posY) === 49 && Math.floor(bob4.posX) === 100, `${bob4.posX} ${bob4.posY} ${bob4.posZ}`);
bob4.travelToDimension(1);
for (let i = 0; i < 60 && mc.theWorld!.provider.dimensionId !== 0; i++) step();
step(3);
check('credits shown and respawned in the overworld', winShown === 1 && mc.theWorld!.provider.dimensionId === 0 && bobOnHost()!.worldObj === over);
check('everything kept after the End', bobOnHost()!.inventory.mainInventory[1]?.stackSize === 5);

lan.stop();
report();

function countAround(w: World, e: Entity, id: number): number {
  let n = 0;
  const x0 = Math.floor(e.posX);
  const y0 = Math.floor(e.posY);
  const z0 = Math.floor(e.posZ);
  for (let x = x0 - 4; x <= x0 + 4; x++) for (let y = y0 - 4; y <= y0 + 4; y++) for (let z = z0 - 4; z <= z0 + 4; z++) if (w.getBlockId(x, y, z) === id) n++;
  return n;
}
