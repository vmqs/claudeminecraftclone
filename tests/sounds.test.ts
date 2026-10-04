/**
 * Every sound (and the effects that come with it) reaches each player exactly once, as in a real
 * 1.5.2 session: in single player, and on both sides of a LAN game (host and guest over the
 * in-memory transport). Each world gets a listener built from RenderGlobal's own IWorldAccess
 * methods, so what is counted is what the game would hand to the SoundManager and the particle
 * renderer. 1.5.2's client RenderGlobal.playSound was empty: only the server's Packet62 and
 * client-only sounds (WorldClient.playSound, the local player's own sounds) were heard.
 * Run: node scripts/run-node-test.mjs tests/sounds.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import '../src/render/particle/ParticleRegistry';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { MovementInput } from '../src/client/MovementInput';
import { PlayerControllerMP } from '../src/client/PlayerControllerMP';
import { setServer, type CommandServer } from '../src/command/CommandServer';
import { CommandHandler } from '../src/command/CommandHandler';
import { Vec3 } from '../src/core/Vec3';
import { DamageSource } from '../src/entity/DamageSource';
import type { Entity } from '../src/entity/Entity';
import { EntityItem } from '../src/entity/EntityItem';
import { EntityList } from '../src/entity/EntityList';
import { EntityLiving } from '../src/entity/EntityLiving';
import { EntityXPOrb } from '../src/entity/EntityXPOrb';
import { installItemEntityFactories } from '../src/entity/ItemHooksInstall';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import type { GuiContainer } from '../src/gui/inventory/GuiContainer';
import { ItemEntityFactories } from '../src/item/ItemEntitySpawning';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { EntityClientPlayerMP } from '../src/net/client/EntityClientPlayerMP';
import { type GuestClient, NetClientHandler } from '../src/net/client/NetClientHandler';
import { PlayerControllerGuest } from '../src/net/client/PlayerControllerGuest';
import type { WorldClient } from '../src/net/client/WorldClient';
import type { EntityPlayerMP } from '../src/net/server/EntityPlayerMP';
import { LanServer } from '../src/net/server/LanServer';
import { MemoryHub } from '../src/net/transport/MemoryTransport';
import { RenderGlobal } from '../src/render/RenderGlobal';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import type { IWorldAccess } from '../src/world/IWorldAccess';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();
installItemEntityFactories(ItemEntityFactories as never);

// ---------------------------------------------------------------------- listeners

/** What one player hears and sees: sound names and particle / effect kinds, in order. */
class Ear {
  sounds: string[] = [];
  effects: string[] = [];
  constructor(readonly label: string) {}
  clear(): void {
    this.sounds.length = 0;
    this.effects.length = 0;
  }
  count(name: string | RegExp): number {
    return this.sounds.filter((s) => (typeof name === 'string' ? s === name : name.test(s))).length;
  }
  countEffect(name: string): number {
    return this.effects.filter((s) => s === name).length;
  }
}

/** Ears by world, for hooks that only know the world (the pickup effect). */
const earOfWorld = new Map<World, Ear>();

/**
 * Attaches RenderGlobal's sound, particle and level-event code to a world for `viewer`, with a
 * sound manager and particle renderer that record into `ear`.
 */
function attachEar(w: World, viewer: () => Entity | null, ear: Ear): { addEffect(fx: object): void } {
  const effectRenderer = {
    addEffect: (fx: object) => ear.effects.push(fx.constructor.name),
    addBlockDestroyEffects: () => ear.effects.push('blockDestroy'),
    addBlockHitEffects: () => ear.effects.push('blockHit'),
  };
  const mc = {
    get renderViewEntity() {
      return viewer();
    },
    sndManager: {
      playSound: (name: string) => ear.sounds.push(name),
      playSoundWithDelay: (name: string) => ear.sounds.push(name),
      playStreaming: (name: string | null) => name && ear.sounds.push('record:' + name),
    },
    effectRenderer,
    gameSettings: { particleSetting: 0 },
    ingameGUI: { setRecordPlayingMessage() {} },
  };
  const rg = Object.create(RenderGlobal.prototype) as RenderGlobal;
  // Particles are only counted (building them needs the particle textures).
  Object.assign(rg, { mc, theWorld: w, spawnParticle: (name: string) => ear.effects.push('particle:' + name) });
  const access: IWorldAccess = {
    markBlockForUpdate() {},
    markBlockForRenderUpdate() {},
    markBlockRangeForRenderUpdate() {},
    playSound: (...a) => rg.playSound(...a),
    playSoundWithDistanceDelay: (...a) => rg.playSoundWithDistanceDelay(...a),
    spawnParticle: (...a) => rg.spawnParticle(...a),
    onEntityCreate() {},
    onEntityDestroy() {},
    playAuxSFX: (...a) => rg.playAuxSFX(...a),
    playRecord: (...a) => rg.playRecord(...a),
    broadcastSound: (...a) => rg.broadcastSound(...a),
    destroyBlockPartially() {},
  };
  w.addWorldAccess(access);
  earOfWorld.set(w, ear);
  return effectRenderer;
}

// The client half of a pickup (EntityClientHooks without the Minecraft instance): the item
// flying into the collector.
EntityLiving.collectEffect = (item) => {
  earOfWorld.get(item.worldObj)?.effects.push('EntityPickupFX');
};

// ---------------------------------------------------------------------- worlds and players

/** 5 x 5 chunks: bedrock at y 0, stone up to y 3, a 3 x 3 pond at (12..14, 1..3, 0..2). */
// (Entities only tick with 32 blocks of loaded chunks around them: keep the action within 0..15.)
function makeWorld(gameType: number): World {
  const info = new WorldInfo();
  info.worldName = 'Sounds';
  info.gameType = gameType;
  info.spawnX = 8;
  info.spawnY = 4;
  info.spawnZ = 8;
  const w = new World(info);
  w.mobSpawner = null;
  w.worldInfo.gameRules.doMobSpawning = false as never;
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.addChunk(new Chunk(w as never, cx, cz));
  for (let x = -32; x < 48; x++) for (let z = -32; z < 48; z++) for (let y = 0; y < 4; y++) w.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
  for (let x = 12; x < 15; x++) for (let z = 0; z < 3; z++) for (let y = 1; y < 4; y++) w.setBlock(x, y, z, B.waterStill);
  w.worldInfo.worldTime = 18000;
  return w;
}

interface LocalSide {
  w: World;
  p: EntityPlayerSP;
  pc: PlayerControllerMP;
  ear: Ear;
  screen: GuiContainer | null;
}

/** A world with its local player (EntityPlayerSP) and PlayerControllerMP, heard by `ear`. */
function localSide(name: string, gameType: number): LocalSide {
  const w = makeWorld(gameType);
  const ear = new Ear(name);
  const side = { w, p: null as unknown as EntityPlayerSP, pc: null as unknown as PlayerControllerMP, ear, screen: null as GuiContainer | null };
  const effects = attachEar(w, () => side.p, ear);
  const mc = {
    theWorld: w,
    thePlayer: null as EntityPlayerSP | null,
    playRandomMusicIfReady() {},
    sndManager: { playSound: (n: string) => ear.sounds.push(n) },
    displayGuiScreen(s: unknown) {
      side.screen = (s as GuiContainer | null) ?? null;
    },
    playSoundFX() {},
    effectRenderer: effects,
    ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
    gameSettings: { chatVisibility: 0 },
    respawnPlayer() {},
  };
  const p = new EntityPlayerSP(mc as never, w, name);
  mc.thePlayer = p;
  side.p = p;
  p.setLocationAndAngles(8.5, 4, 8.5, 0, 0);
  w.spawnEntityInWorld(p);
  PlayerSpawning.initializeGameType(p, w.worldInfo);
  p.initialInvulnerability = 0;
  side.pc = new PlayerControllerMP(mc as never);
  side.pc.setGameType(EnumGameType.getByID(gameType));
  return side;
}

function tickLocal(s: LocalSide, n = 1): void {
  for (let i = 0; i < n; i++) {
    s.pc.updateController();
    s.w.updateEntities();
    s.w.tick();
  }
}

function spawnMob(w: World, name: string, x: number, y: number, z: number): EntityLiving {
  const e = EntityList.createEntityByName(name, w) as EntityLiving;
  e.setLocationAndAngles(x, y, z, 0, 0);
  w.spawnEntityInWorld(e);
  return e;
}

/** The step sounds an entity asks for (Entity.playStepSound calls). */
function countSteps(e: Entity): { n: number } {
  const c = { n: 0 };
  const self = e as unknown as { playStepSound(...a: unknown[]): void };
  const orig = self.playStepSound.bind(e);
  self.playStepSound = (...a: unknown[]) => {
    c.n++;
    orig(...a);
  };
  return c;
}

/** The eating sounds a player asks for (EntityPlayer.updateItemUse calls). */
function countItemUse(e: Entity): { n: number } {
  const c = { n: 0 };
  const self = e as unknown as { updateItemUse(stack: ItemStack, n: number): void };
  const orig = self.updateItemUse.bind(e);
  self.updateItemUse = (stack: ItemStack, n: number) => {
    c.n++;
    orig(stack, n);
  };
  return c;
}

const ear1 = (ears: Ear[], name: string | RegExp, label: string, expected = 1) => {
  for (const e of ears) check(`${label}: ${e.label} hears ${String(name)} ${expected}x`, e.count(name) === expected, `${e.count(name)}: ${e.sounds.join(', ')}`);
};

const hit = (x: number, y: number, z: number) => new Vec3(x + 0.5, y + 1, z + 0.5);

// ====================================================================== single player
{
  const s = localSide('Alice', 0);
  const { w, p, pc, ear } = s;
  tickLocal(s, 5);
  ear.clear();

  // Placing and breaking blocks (survival: placing spends the stack, breaking takes time).
  const blocks: [number, string, string][] = [
    [B.stone, 'dig.stone', 'dig.stone'],
    [B.planks, 'dig.wood', 'dig.wood'],
    [B.glass, 'step.stone', 'random.glass'],
    [B.cloth, 'dig.cloth', 'dig.cloth'],
  ];
  pc.setGameType(EnumGameType.CREATIVE);
  for (const [id, place, dig] of blocks) {
    p.inventory.mainInventory[0] = new ItemStack(id, 64, 0);
    p.inventory.currentItem = 0;
    ear.clear();
    const ok = pc.onPlayerRightClick(p, w, p.inventory.getCurrentItem(), 10, 3, 8, 1, hit(10, 3, 8));
    check(`sp place ${id}`, ok && w.getBlockId(10, 4, 8) === id);
    ear1([ear], place, `sp place ${id}`);
    check(`sp place ${id}: nothing else heard`, ear.sounds.length === 1, ear.sounds.join(', '));
    ear.clear();
    pc.clickBlock(10, 4, 8, 1);
    check(`sp break ${id}`, w.getBlockId(10, 4, 8) === 0);
    ear1([ear], dig, `sp break ${id}`);
    check(`sp break ${id}: nothing else heard`, ear.sounds.length === 1, ear.sounds.join(', '));
    check(`sp break ${id}: break particles once`, ear.countEffect('blockDestroy') === 1, ear.effects.join(', '));
    tickLocal(s, 6);
  }
  pc.setGameType(EnumGameType.SURVIVAL);

  // Walking a few steps: one sound per step.
  {
    const steps = countSteps(p);
    ear.clear();
    for (let i = 0; i < 20; i++) {
      p.moveEntity(0.25, 0, 0);
      tickLocal(s);
    }
    const heard = ear.count(/^step\./);
    check('sp walking: some steps', steps.n >= 3, String(steps.n));
    check('sp walking: one sound per step', heard === steps.n, `${heard} heard for ${steps.n} steps: ${ear.sounds.join(', ')}`);
    p.setPosition(8.5, 4 + p.yOffset, 8.5);
  }

  // A door opened and closed by the player.
  {
    w.setBlock(6, 4, 10, B.doorWood, 0);
    w.setBlock(6, 5, 10, B.doorWood, 8);
    for (const what of ['open', 'close']) {
      ear.clear();
      pc.onPlayerRightClick(p, w, null, 6, 4, 10, 2, hit(6, 4, 10));
      ear1([ear], /^random\.door_/, `sp door ${what}`);
      check(`sp door ${what}: nothing else`, ear.sounds.length === 1, ear.sounds.join(', '));
    }
  }

  // A chest opened and closed.
  {
    w.setBlock(4, 4, 10, B.chest, 0);
    tickLocal(s, 2);
    ear.clear();
    pc.onPlayerRightClick(p, w, null, 4, 4, 10, 1, hit(4, 4, 10));
    check('sp chest window opened', s.screen !== null);
    tickLocal(s, 15);
    ear1([ear], 'random.chestopen', 'sp chest open');
    ear.clear();
    s.screen?.inventorySlots.onCraftGuiClosed(p);
    s.screen = null;
    tickLocal(s, 20);
    ear1([ear], 'random.chestclosed', 'sp chest close');
  }

  // Hitting and killing a pig, a zombie and a skeleton.
  for (const [name, hurt, death] of [
    ['Pig', 'mob.pig.say', 'mob.pig.death'],
    ['Zombie', 'mob.zombie.hurt', 'mob.zombie.death'],
    ['Skeleton', 'mob.skeleton.hurt', 'mob.skeleton.death'],
  ]) {
    const m = spawnMob(w, name, 10.5, 4, 8.5);
    tickLocal(s, 2);
    ear.clear();
    pc.attackEntity(p, m);
    ear1([ear], hurt, `sp hit ${name}`);
    check(`sp hit ${name}: one sound`, ear.sounds.length === 1, ear.sounds.join(', '));
    tickLocal(s, 12);
    ear.clear();
    m.setEntityHealth(1);
    pc.attackEntity(p, m);
    ear1([ear], death, `sp kill ${name}`);
    check(`sp kill ${name}: one sound`, ear.sounds.length === 1, ear.sounds.join(', '));
    tickLocal(s, 25);
  }

  // A critical hit: one burst of crit particles.
  {
    const m = spawnMob(w, 'Cow', 10.5, 4, 8.5);
    tickLocal(s, 2);
    ear.clear();
    p.fallDistance = 1;
    p.onGround = false;
    pc.attackEntity(p, m);
    check('sp crit particles once', ear.countEffect('EntityCrit2FX') === 1, ear.effects.join(', '));
    ear1([ear], 'mob.cow.hurt', 'sp crit hit');
    p.fallDistance = 0;
    p.onGround = true;
    m.setDead();
    tickLocal(s, 2);
  }

  // The player hurt and killed: their own sounds once.
  {
    ear.clear();
    p.attackEntityFrom(DamageSource.generic, 2);
    ear1([ear], 'damage.hit', 'sp player hurt');
    tickLocal(s, 12);
  }

  // Idle sounds over time: each playLivingSound heard once.
  {
    let calls = 0;
    const orig = EntityLiving.prototype.playLivingSound;
    EntityLiving.prototype.playLivingSound = function (this: EntityLiving) {
      if (!this.isPlayerEntity) calls++;
      orig.call(this);
    };
    const mobs = ['Pig', 'Cow', 'Zombie', 'Skeleton', 'Chicken'].map((n, i) => spawnMob(w, n, 4.5 + i * 2, 4, 14.5));
    pc.setGameType(EnumGameType.CREATIVE);
    ear.clear();
    tickLocal(s, 400);
    const heard = ear.count(/^mob\.(pig|cow|zombie|skeleton|chicken)\.say$/);
    check('sp idle sounds happened', calls >= 5, String(calls));
    check('sp idle sounds once each', heard === calls, `${heard} heard for ${calls} calls`);
    EntityLiving.prototype.playLivingSound = orig;
    for (const m of mobs) m.setDead();
    pc.setGameType(EnumGameType.SURVIVAL);
    tickLocal(s, 2);
  }

  // An explosion.
  {
    ear.clear();
    w.createExplosion(null, 14.5, 4, 14.5, 2, true);
    ear1([ear], 'random.explode', 'sp explosion');
    check('sp explosion: one huge explosion particle', ear.countEffect('particle:hugeexplosion') === 1, ear.effects.filter((e) => !e.includes('explode') && !e.includes('smoke')).join(', '));
    tickLocal(s, 5);
  }

  // Eating: one chomp per updateItemUse and one burp.
  {
    p.getFoodStats().setFoodLevel(10);
    p.inventory.mainInventory[0] = new ItemStack(I.porkCooked, 4, 0);
    p.inventory.currentItem = 0;
    const uses = countItemUse(p);
    ear.clear();
    pc.sendUseItem(p, w, p.inventory.getCurrentItem()!);
    tickLocal(s, 40);
    check('sp eating finished', p.inventory.getCurrentItem()?.stackSize === 3);
    check('sp eating sounds once each', ear.count('random.eat') === uses.n && uses.n > 0, `${ear.count('random.eat')} heard for ${uses.n}`);
    ear1([ear], 'random.burp', 'sp eating burp');
  }

  // A bow shot and the arrow landing.
  {
    p.inventory.mainInventory[0] = new ItemStack(I.bow, 1, 0);
    p.inventory.mainInventory[1] = new ItemStack(I.arrow, 16, 0);
    p.inventory.currentItem = 0;
    p.rotationPitch = 30;
    ear.clear();
    pc.sendUseItem(p, w, p.inventory.getCurrentItem()!);
    tickLocal(s, 20);
    pc.onStoppedUsingItem(p);
    ear1([ear], 'random.bow', 'sp bow shot');
    tickLocal(s, 40);
    ear1([ear], 'random.bowhit', 'sp arrow lands');
    p.rotationPitch = 0;
    for (const e of [...w.loadedEntityList]) if (EntityList.getEntityString(e) === 'Arrow') e.setDead();
    tickLocal(s, 2);
  }

  // Picking up an item and an orb (after clearing the drops of the mobs killed above).
  {
    for (const e of [...w.loadedEntityList]) if (e instanceof EntityItem || e instanceof EntityXPOrb) e.setDead();
    tickLocal(s, 2);
    p.inventory.mainInventory[0] = null;
    const item = new EntityItem(w, p.posX, p.posY - p.yOffset + 0.2, p.posZ, new ItemStack(B.cobblestone, 1, 0));
    item.delayBeforeCanPickup = 0;
    w.spawnEntityInWorld(item);
    ear.clear();
    tickLocal(s, 5);
    check('sp item picked up', item.isDead);
    ear1([ear], 'random.pop', 'sp item pickup');
    check('sp item pickup effect once', ear.countEffect('EntityPickupFX') === 1, ear.effects.join(', '));
    const orb = new EntityXPOrb(w, p.posX, p.posY - p.yOffset + 0.2, p.posZ, 3);
    w.spawnEntityInWorld(orb);
    ear.clear();
    tickLocal(s, 10);
    check('sp orb picked up', orb.isDead);
    ear1([ear], 'random.orb', 'sp orb pickup');
  }

  // Splashing into water: a pig and the player.
  {
    const pig = spawnMob(w, 'Pig', 13.5, 6, 1.5);
    p.setPosition(10.5, 4 + p.yOffset, 1.5);
    ear.clear();
    tickLocal(s, 30);
    check('sp pig fell in', pig.isInWater());
    ear1([ear], 'liquid.splash', 'sp pig splash');
    pig.setDead();
    p.setPosition(13.5, 6 + p.yOffset, 0.5);
    p.motionY = -0.5;
    ear.clear();
    tickLocal(s, 20);
    check('sp player splash once', ear.count('liquid.splash') === 1, ear.sounds.join(', '));
    p.setPosition(8.5, 4 + p.yOffset, 8.5);
    tickLocal(s, 5);
  }
}

// ====================================================================== LAN host and guest

const host = localSide('Alice', 0);
const hw = host.w;
const hub = new MemoryHub(false);
const commands = new CommandHandler();
let lan: LanServer;
const commandServer: CommandServer = {
  getWorlds: () => [hw],
  getPlayers: () => [host.p, ...lan.guestPlayers()],
  sendChatMsg: (msg) => lan.sendChatMsg(msg),
  isSinglePlayer: () => true,
  getCommandManager: () => commands,
};
setServer(commandServer);
lan = new LanServer(
  {
    world: hw,
    hostPlayer: () => host.p,
    hostName: 'Alice',
    printChat: () => undefined,
    commandManager: () => commands,
    getPossibleCompletions: () => [],
    setExtraLoadCenters: () => undefined,
  },
  hub.host(),
  { gameType: EnumGameType.SURVIVAL, allowCommands: true, maxPlayers: 8, viewDistance: 3 },
);
await lan.start('SND234');

interface Guest {
  handler: NetClientHandler;
  pc: PlayerControllerGuest;
  ear: Ear;
  screen: unknown;
  mc: { theWorld: WorldClient | null; thePlayer: EntityClientPlayerMP | null };
}

const conn = await hub.guest().connect('SND234', 1000);
const gEar = new Ear('Bob');
const gEffects = {
  addEffect: (fx: object) => gEar.effects.push(fx.constructor.name),
  addBlockDestroyEffects: () => gEar.effects.push('blockDestroy'),
  addBlockHitEffects: () => gEar.effects.push('blockHit'),
};
const gmc = {
  theWorld: null as WorldClient | null,
  thePlayer: null as EntityClientPlayerMP | null,
  currentScreen: null as unknown,
  playRandomMusicIfReady() {},
  sndManager: { playSound: (n: string) => gEar.sounds.push(n) },
  displayGuiScreen(s: unknown) {
    gmc.currentScreen = s;
    const container = (s as { inventorySlots?: unknown } | null)?.inventorySlots;
    if (container && gmc.thePlayer) gmc.thePlayer.openContainer = container as never;
  },
  playSoundFX() {},
  effectRenderer: gEffects,
  ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer() {},
};
const guest: Guest = { handler: null as never, pc: null as never, ear: gEar, screen: null, mc: gmc };
const client: GuestClient = {
  username: 'Bob',
  playerClient: gmc as never,
  get guestController() {
    return guest.pc;
  },
  startGuestWorld(world, player, type) {
    gmc.theWorld = world;
    gmc.thePlayer = player;
    attachEar(world, () => gmc.thePlayer, gEar);
    player.preparePlayerToSpawn();
    world.spawnEntityInWorld(player);
    player.movementInput = new MovementInput();
    guest.pc.setGameType(type);
  },
  respawnGuestPlayer() {},
  guestDisconnected() {},
  printChat: () => undefined,
  setGameType: (t) => guest.pc.setGameType(t),
  autocompleteResponse() {},
  critParticles: () => gEar.effects.push('EntityCrit2FX'),
  clientSettings: () => ({ renderDistance: 1, chatVisibility: 0 }),
  rejoinToken: () => null,
  storeRejoinToken: () => undefined,
};
guest.handler = new NetClientHandler(client, conn);
guest.pc = new PlayerControllerGuest(gmc as never, guest.handler);
guest.handler.start();
// The host's own controller is the active one for EntityPlayer.gameTypeListener.
host.pc.activate();

/** One tick everywhere, as Minecraft.runTick orders it on each side. */
function step(n = 1): void {
  for (let i = 0; i < n; i++) {
    host.pc.updateController();
    hw.updateEntities();
    hw.tick();
    lan.tick();
    hub.flush();
    guest.handler.processReadPackets();
    const w = gmc.theWorld;
    if (w) {
      guest.pc.updateController();
      w.updateEntities();
      w.tick();
    }
    guest.handler.flush();
    hub.flush();
  }
}

step(30);
const gp = gmc.thePlayer!;
const gw = gmc.theWorld!;
const bobMP = lan.guestPlayers().find((pl) => pl.username === 'Bob') as EntityPlayerMP;
check('guest joined', !!gp && !!gw && !!bobMP);
const hp = host.p;
const hEar = host.ear;
const both = [hEar, gEar];
const clearAll = () => both.forEach((e) => e.clear());

/** Moves the guest's player (sent to the host like a walk, no faster than a player could). */
function guestTo(x: number, y: number, z: number): void {
  for (let i = 0; i < 200; i++) {
    const dx = x - gp.posX;
    const dz = z - gp.posZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6 && Math.abs(gp.posY - gp.yOffset - y) < 1e-6) break;
    const k = d > 0.5 ? 0.5 / d : 1;
    gp.setPosition(gp.posX + dx * k, y + gp.yOffset, gp.posZ + dz * k);
    gp.motionX = gp.motionY = gp.motionZ = 0;
    step(1);
  }
  step(3);
}

hp.setPosition(8.5, 4 + hp.yOffset, 8.5);
guestTo(8.5, 4, 11.5);
step(5);
check('guest near the host', Math.abs(bobMP.posZ - 11.5) < 0.1, `${bobMP.posX} ${bobMP.posZ}`);

// Placing and breaking, by the host and by the guest.
for (const [who, id, place, dig] of [
  ['host', B.stone, 'dig.stone', 'dig.stone'],
  ['guest', B.stone, 'dig.stone', 'dig.stone'],
  ['host', B.planks, 'dig.wood', 'dig.wood'],
  ['guest', B.glass, 'step.stone', 'random.glass'],
] as [string, number, string, string][]) {
  const pl = who === 'host' ? hp : gp;
  pl.inventory.mainInventory[0] = new ItemStack(id, 64, 0);
  pl.inventory.currentItem = 0;
  if (who === 'guest') bobMP.inventory.mainInventory[0] = new ItemStack(id, 64, 0);
  step(2);
  clearAll();
  if (who === 'host') host.pc.onPlayerRightClick(hp, hw, hp.inventory.getCurrentItem(), 10, 3, 10, 1, hit(10, 3, 10));
  else guest.pc.onPlayerRightClick(gp, gw, gp.inventory.getCurrentItem(), 10, 3, 10, 1, hit(10, 3, 10));
  step(3);
  check(`mp ${who} placed ${id}`, hw.getBlockId(10, 4, 10) === id && gw.getBlockId(10, 4, 10) === id);
  ear1(both, place, `mp ${who} place ${id}`);
  clearAll();
  // Survival breaking takes time: hold the button until the block goes.
  const pc = who === 'host' ? host.pc : guest.pc;
  pc.clickBlock(10, 4, 10, 1);
  for (let i = 0; i < 200 && hw.getBlockId(10, 4, 10) !== 0; i++) {
    pc.onPlayerDamageBlock(10, 4, 10, 1);
    step(1);
  }
  step(3);
  check(`mp ${who} broke ${id}`, hw.getBlockId(10, 4, 10) === 0 && gw.getBlockId(10, 4, 10) === 0);
  ear1(both, dig, `mp ${who} break ${id}`);
  for (const e of both) check(`mp ${who} break ${id}: ${e.label} sees the break particles once`, e.countEffect('blockDestroy') === 1, e.effects.filter((x) => x === 'blockDestroy').join(', '));
  // Drops lie around: pick them up out of the way.
  for (const e of [...hw.loadedEntityList]) if (e instanceof EntityItem) e.setDead();
  step(8);
}

// Walking: each side hears the other's steps once, and its own once.
{
  const hostSteps = countSteps(hp);
  const guestLocal = countSteps(gp);
  const guestServer = countSteps(bobMP);
  clearAll();
  for (let i = 0; i < 32; i++) {
    hp.moveEntity(0.25, 0, 0);
    step(1);
  }
  hp.setPosition(8.5, 4 + hp.yOffset, 8.5);
  step(3);
  check('mp host walked', hostSteps.n >= 3, String(hostSteps.n));
  check('mp host steps: host hears each once', hEar.count(/^step\./) === hostSteps.n, `${hEar.count(/^step\./)} for ${hostSteps.n}`);
  check('mp host steps: guest hears each once', gEar.count(/^step\./) === hostSteps.n, `${gEar.count(/^step\./)} for ${hostSteps.n}`);
  clearAll();
  // The guest walks under its own movement code (moveEntity), which reports to the host.
  for (let i = 0; i < 32; i++) {
    gp.moveEntity(i < 16 ? 0.25 : -0.25, 0, 0);
    gp.motionX = gp.motionY = gp.motionZ = 0;
    step(1);
  }
  step(3);
  check('mp guest walked', guestLocal.n >= 3, String(guestLocal.n));
  check('mp guest steps: guest hears its own once', gEar.count(/^step\./) === guestLocal.n, `${gEar.count(/^step\./)} for ${guestLocal.n}`);
  check('mp guest steps: host hears each once', hEar.count(/^step\./) === guestServer.n && guestServer.n > 0, `${hEar.count(/^step\./)} for ${guestServer.n}`);
}

// Doors, by each player.
hw.setBlock(6, 4, 12, B.doorWood, 0);
hw.setBlock(6, 5, 12, B.doorWood, 8);
step(3);
for (const who of ['host', 'guest', 'host', 'guest']) {
  clearAll();
  if (who === 'host') host.pc.onPlayerRightClick(hp, hw, null, 6, 4, 12, 2, hit(6, 4, 12));
  else {
    gp.inventory.mainInventory[gp.inventory.currentItem] = null;
    bobMP.inventory.mainInventory[bobMP.inventory.currentItem] = null;
    guest.pc.onPlayerRightClick(gp, gw, null, 6, 4, 12, 2, hit(6, 4, 12));
  }
  step(3);
  ear1(both, /^random\.door_/, `mp ${who} door`);
}

// A chest opened and closed by the guest.
{
  hw.setBlock(4, 4, 12, B.chest, 0);
  step(3);
  clearAll();
  guest.pc.onPlayerRightClick(gp, gw, null, 4, 4, 12, 1, hit(4, 4, 12));
  step(15);
  check('mp guest chest window', gp.openContainer !== gp.inventoryContainer);
  ear1(both, 'random.chestopen', 'mp guest chest open');
  clearAll();
  gp.closeScreen();
  step(20);
  ear1(both, 'random.chestclosed', 'mp guest chest close');
}

// Mobs hit and killed by each player.
for (const [who, name, hurt, death] of [
  ['guest', 'Pig', 'mob.pig.say', 'mob.pig.death'],
  ['host', 'Zombie', 'mob.zombie.hurt', 'mob.zombie.death'],
  ['guest', 'Skeleton', 'mob.skeleton.hurt', 'mob.skeleton.death'],
]) {
  const m = spawnMob(hw, name, 9.5, 4, 10);
  step(4);
  const copy = guest.handler.getEntityByID(m.entityId);
  check(`mp ${name} on the guest`, !!copy);
  clearAll();
  if (who === 'host') host.pc.attackEntity(hp, m);
  else guest.pc.attackEntity(gp, copy!);
  step(3);
  ear1(both, hurt, `mp ${who} hits ${name}`);
  step(12);
  m.setEntityHealth(1);
  clearAll();
  if (who === 'host') host.pc.attackEntity(hp, m);
  else guest.pc.attackEntity(gp, copy!);
  step(3);
  ear1(both, death, `mp ${who} kills ${name}`);
  step(25);
  for (const e of [...hw.loadedEntityList]) if (e instanceof EntityItem || e instanceof EntityXPOrb) e.setDead();
  step(2);
}

// Players hurt: each player hears their own and the other's hurt once.
{
  clearAll();
  bobMP.attackEntityFrom(DamageSource.generic, 1);
  step(3);
  ear1(both, 'damage.hit', 'mp guest hurt');
  step(15);
  clearAll();
  hp.attackEntityFrom(DamageSource.generic, 1);
  step(3);
  ear1(both, 'damage.hit', 'mp host hurt');
  step(15);
}

// Mob idle sounds over time.
{
  let calls = 0;
  const orig = EntityLiving.prototype.playLivingSound;
  EntityLiving.prototype.playLivingSound = function (this: EntityLiving) {
    if (this.worldObj === hw && !this.isPlayerEntity) calls++;
    orig.call(this);
  };
  const mobs = ['Pig', 'Cow', 'Chicken'].map((n, i) => spawnMob(hw, n, 6.5 + i * 2, 4, 9.5));
  // Keep them close to both players.
  step(3);
  clearAll();
  for (let i = 0; i < 300; i++) {
    for (const m of mobs) {
      m.motionX = m.motionZ = 0;
      m.setPosition(m.posX, m.posY, m.posZ);
    }
    step(1);
  }
  const re = /^mob\.(pig|cow|chicken)\.say$/;
  check('mp idle sounds happened', calls >= 3, String(calls));
  for (const e of both) check(`mp idle sounds: ${e.label} hears each once`, e.count(re) === calls, `${e.count(re)} for ${calls}`);
  EntityLiving.prototype.playLivingSound = orig;
  for (const m of mobs) m.setDead();
  step(3);
}

// An explosion between them.
{
  clearAll();
  hw.createExplosion(null, 8.5, 4, 14.5, 1, false);
  step(3);
  ear1(both, 'random.explode', 'mp explosion');
  for (const e of both) check(`mp explosion: ${e.label} sees one explosion particle`, e.countEffect('particle:largeexplode') === 1, e.effects.filter((x) => x.includes('explode')).join(', '));
}

// The guest picks up an item and an orb.
{
  gp.inventory.mainInventory[0] = null;
  bobMP.inventory.mainInventory[0] = null;
  // Seen by the guest first (tracked), then brought to its feet.
  const item = new EntityItem(hw, bobMP.posX + 3, bobMP.posY - bobMP.yOffset + 0.2, bobMP.posZ, new ItemStack(B.cobblestone, 1, 0));
  item.delayBeforeCanPickup = 0;
  hw.spawnEntityInWorld(item);
  step(5);
  clearAll();
  item.setPosition(bobMP.posX, bobMP.posY - bobMP.yOffset + 0.2, bobMP.posZ);
  item.motionX = item.motionY = item.motionZ = 0;
  step(6);
  check('mp guest picked the item up', item.isDead);
  ear1(both, 'random.pop', 'mp guest item pickup');
  for (const e of both) check(`mp guest item pickup: ${e.label} sees it fly once`, e.countEffect('EntityPickupFX') === 1, e.effects.join(', '));
  const orb = new EntityXPOrb(hw, bobMP.posX, bobMP.posY - bobMP.yOffset + 0.2, bobMP.posZ, 3);
  hw.spawnEntityInWorld(orb);
  clearAll();
  step(10);
  check('mp guest picked the orb up', orb.isDead);
  ear1(both, 'random.orb', 'mp guest orb pickup');
}

// The guest eats.
{
  bobMP.getFoodStats().setFoodLevel(10);
  gp.getFoodStats().setFoodLevel(10);
  for (const pl of [gp, bobMP]) pl.inventory.mainInventory[0] = new ItemStack(I.porkCooked, 4, 0);
  gp.inventory.currentItem = 0;
  step(3);
  const local = countItemUse(gp);
  const server = countItemUse(bobMP);
  clearAll();
  guest.pc.sendUseItem(gp, gw, gp.inventory.getCurrentItem()!);
  step(45);
  check('mp guest ate', server.n > 0 && local.n > 0, `${local.n} ${server.n}`);
  check('mp guest eating: guest hears its own chomps once', gEar.count('random.eat') === local.n, `${gEar.count('random.eat')} for ${local.n}`);
  check('mp guest eating: host hears each chomp once', hEar.count('random.eat') === server.n, `${hEar.count('random.eat')} for ${server.n}`);
  ear1(both, 'random.burp', 'mp guest burp');
}

// The guest shoots an arrow.
{
  for (const pl of [gp, bobMP]) {
    pl.inventory.mainInventory[0] = new ItemStack(I.bow, 1, 0);
    pl.inventory.mainInventory[1] = new ItemStack(I.arrow, 16, 0);
  }
  gp.rotationPitch = 30;
  gp.rotationYaw = 180;
  step(3);
  clearAll();
  guest.pc.sendUseItem(gp, gw, gp.inventory.getCurrentItem()!);
  step(20);
  guest.pc.onStoppedUsingItem(gp);
  step(2);
  ear1(both, 'random.bow', 'mp guest bow shot');
  step(40);
  ear1(both, 'random.bowhit', 'mp guest arrow lands');
}

// Particles on both sides: the host's crit, a tamed wolf's hearts (status 7), a spawner's flames,
// the host's sprint dust. Each player sees each once (guests make their own copies of status,
// tile-entity and player effects; the host forwards none of those).
{
  const cow = spawnMob(hw, 'Cow', 9.5, 4, 10);
  step(4);
  clearAll();
  hp.fallDistance = 1;
  hp.onGround = false;
  hp.inventory.mainInventory[hp.inventory.currentItem] = null;
  host.pc.attackEntity(hp, cow);
  hp.fallDistance = 0;
  hp.onGround = true;
  step(3);
  for (const e of both) check(`mp host crit: ${e.label} sees it once`, e.countEffect('EntityCrit2FX') === 1, e.effects.join(', '));
  ear1(both, 'mob.cow.hurt', 'mp host crit hit');
  cow.setDead();

  const wolf = spawnMob(hw, 'Wolf', 9.5, 4, 10);
  step(4);
  clearAll();
  hw.setEntityState(wolf, 7);
  step(3);
  for (const e of both) check(`mp tamed hearts: ${e.label} sees 7`, e.countEffect('particle:heart') === 7, String(e.countEffect('particle:heart')));
  wolf.setDead();
  step(2);

  // A note block played by the guest: its note and its particle once each.
  hw.setBlock(4, 4, 8, B.music, 0);
  step(3);
  clearAll();
  guest.pc.onPlayerRightClick(gp, gw, null, 4, 4, 8, 1, hit(4, 4, 8));
  step(3);
  ear1(both, /^note\./, 'mp guest note block');
  for (const e of both) check(`mp note particle: ${e.label} sees it once`, e.countEffect('particle:note') === 1, String(e.countEffect('particle:note')));
  hw.setBlock(4, 4, 8, 0, 0);

  hw.setBlock(6, 4, 8, B.mobSpawner, 0);
  step(3);
  clearAll();
  step(20);
  const hostFlames = hEar.countEffect('particle:flame');
  const guestFlames = gEar.countEffect('particle:flame');
  check('mp spawner flames on the host', hostFlames >= 15, String(hostFlames));
  check('mp spawner flames on the guest, not doubled', guestFlames >= 15 && guestFlames <= 21, `${guestFlames} (host ${hostFlames})`);
  hw.setBlock(6, 4, 8, 0, 0);
  step(3);

  hp.setPosition(8.5, 4 + hp.yOffset, 6.5);
  step(3);
  clearAll();
  // Sprinting east under its own movement (the sprint key), well fed.
  hp.getFoodStats().setFoodLevel(20);
  hp.rotationYaw = -90;
  hp.movementInput.moveForward = 1;
  hp.movementInput.sprint = true;
  step(20);
  hp.movementInput.moveForward = 0;
  hp.movementInput.sprint = false;
  step(3);
  const dust = (e: Ear) => e.effects.filter((x) => x.startsWith('particle:tilecrack_')).length;
  check('mp host sprint dust on the host', dust(hEar) >= 15, String(dust(hEar)));
  check('mp host sprint dust on the guest, not doubled', dust(gEar) <= dust(hEar) + 3 && dust(gEar) >= 10, `${dust(gEar)} (host ${dust(hEar)})`);
}

report();
