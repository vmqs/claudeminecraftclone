/**
 * Survival rules against a real World (stone floor, y 0..3) with the local player class and
 * PlayerControllerMP: game modes, mining times / drops / tool wear, hunger, regeneration,
 * starvation, fall damage, drowning, armour, experience, eating, death and respawn.
 * Run: node scripts/run-node-test.mjs tests/survival.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { Block } from '../src/block/Block';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { MovementInput } from '../src/client/MovementInput';
import { PlayerControllerMP } from '../src/client/PlayerControllerMP';
import { DamageSource } from '../src/entity/DamageSource';
import { ChunkCoordinates } from '../src/entity/EntityLiving';
import { EntityList } from '../src/entity/EntityList';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { Item } from '../src/item/Item';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { existsSync, readFileSync } from 'node:fs';
import { I18n } from '../src/core/I18n';
import { check, report } from './harness';

registerBlockItems();
// Death messages read better translated; without the fetched assets the keys are compared.
const LANG = 'public/assets/vanilla/lang/en_US.lang';
const haveLang = existsSync(LANG);
if (haveLang) I18n.load(readFileSync(LANG, 'utf8'));
const said = (msg: string, key: string, text: string) => (haveLang ? msg === text : msg === key);

/** A world of 3x3 chunks: bedrock at y 0, stone up to y 3, air above. */
function makeWorld(gameType = 0, hardcore = false): World {
  const info = new WorldInfo();
  info.gameType = gameType;
  info.hardcore = hardcore;
  info.spawnX = 8;
  info.spawnY = 4;
  info.spawnZ = 8;
  const w = new World(info);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(new Chunk(w as never, cx, cz));
  for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) for (let y = 0; y < 4; y++) w.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
  return w;
}

class ScriptedInput extends MovementInput {
  queue: number[] = [];
  override updatePlayerMoveState(): void {
    if (this.queue.length > 0) this.moveForward = this.queue.shift()!;
  }
}

interface Session {
  w: World;
  p: EntityPlayerSP;
  pc: PlayerControllerMP;
  chat: string[];
  sounds: string[];
}

function session(gameType = 0, hardcore = false): Session {
  const w = makeWorld(gameType, hardcore);
  const chat: string[] = [];
  const sounds: string[] = [];
  const mc = {
    theWorld: w,
    thePlayer: null as EntityPlayerSP | null,
    playRandomMusicIfReady() {},
    sndManager: { playSound: (name: string) => sounds.push(name) },
    displayGuiScreen() {},
    playSoundFX() {},
    effectRenderer: { addEffect() {} },
    ingameGUI: { getChatGUI: () => ({ printChatMessage: (s: string) => chat.push(s), addTranslatedMessage: (s: string) => chat.push(s) }) },
    gameSettings: { chatVisibility: 0 },
    respawnPlayer() {},
  };
  const p = new EntityPlayerSP(mc as never, w, 'Player');
  mc.thePlayer = p;
  const pc = new PlayerControllerMP(mc as never);
  p.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  w.spawnEntityInWorld(p);
  pc.setGameType(PlayerSpawning.initializeGameType(p, w.worldInfo));
  pc.setPlayerCapabilities(p);
  p.initialInvulnerability = 0;
  p.onGround = true;
  return { w, p, pc, chat, sounds };
}

/** Holds the attack button on (x, y, z) like Minecraft.runTick: click once, then damage every tick. */
function mine(s: Session, x: number, y: number, z: number, maxTicks = 400): number {
  s.pc.clickBlock(x, y, z, 1);
  for (let t = 1; t <= maxTicks; t++) {
    s.p.onGround = true;
    s.pc.onPlayerDamageBlock(x, y, z, 1);
    if (s.w.getBlockId(x, y, z) === 0) return t;
  }
  return -1;
}

function items(w: World): number[] {
  return w.loadedEntityList.filter((e) => EntityList.getEntityString(e) === 'Item' && !e.isDead).map((e) => (e as unknown as { getEntityItem(): ItemStack }).getEntityItem().itemID);
}

function clearItems(w: World): void {
  for (const e of w.loadedEntityList) if (EntityList.getEntityString(e) === 'Item') e.setDead();
  w.updateEntities();
}

// ------------------------------------------------------------------ game modes
{
  const s = session(0);
  const c = s.p.capabilities;
  check('survival world: damage enabled, no flight', !c.disableDamage && !c.allowFlying && !c.isCreativeMode && s.pc.shouldDrawHUD());
  check('survival reach 4.5', s.pc.getBlockReachDistance() === Math.fround(4.5));
  s.p.setGameType(EnumGameType.CREATIVE);
  check('setGameType(creative) reaches the controller', s.pc.isInCreativeMode() && c.disableDamage && c.allowFlying && !s.pc.shouldDrawHUD());
  check('game mode change message', s.chat.includes('gameMode.changed'));
  c.isFlying = true;
  s.p.setGameType(EnumGameType.SURVIVAL);
  check('back to survival stops flying', !c.isFlying && !c.allowFlying && s.pc.isNotCreative());
  s.p.setGameType(EnumGameType.ADVENTURE);
  check('adventure cannot edit', !c.allowEdit && s.pc.shouldDrawHUD());
  check('creative world starts creative', session(1).pc.isInCreativeMode());
  const hc = session(0, true);
  PlayerSpawning.applyDifficulty(hc.w, 1);
  check('hardcore forces hard difficulty', hc.w.difficultySetting === 3);
  PlayerSpawning.applyDifficulty(s.w, 1);
  check('normal worlds take the options difficulty', s.w.difficultySetting === 1);
}

// ------------------------------------------------------------------ mining
{
  // Ticks from the first click until the block is gone (1.5.2: hand 7.5 s, wood 1.15 s, stone 0.6 s,
  // iron 0.4 s, diamond 0.3 s, gold 0.2 s); by hand the float sum of 150 steps stays just
  // below 1, so it takes 151 ticks, as in the original's float arithmetic.
  const cases: [string, number | null, number][] = [
    ['hand', null, 151],
    ['wooden pickaxe', I.pickaxeWood, 23],
    ['stone pickaxe', I.pickaxeStone, 12],
    ['iron pickaxe', I.pickaxeIron, 8],
    ['diamond pickaxe', I.pickaxeDiamond, 6],
    ['golden pickaxe', I.pickaxeGold, 4],
  ];
  let x = 0;
  for (const [name, tool, want] of cases) {
    const s = session(0);
    s.p.inventory.mainInventory[0] = tool === null ? null : new ItemStack(tool, 1, 0);
    s.p.inventory.currentItem = 0;
    const ticks = mine(s, x, 3, 0);
    check(`stone with ${name}: ${want} ticks`, ticks === want, `got ${ticks}`);
    const drops = items(s.w);
    if (tool === null) check('stone by hand drops nothing', drops.length === 0, JSON.stringify(drops));
    else check(`stone with ${name} drops cobblestone`, drops.length === 1 && drops[0] === B.cobblestone, JSON.stringify(drops));
    if (tool !== null) check(`${name} wears by 1`, s.p.inventory.mainInventory[0]?.getItemDamage() === 1);
    check(`${name}: dig sounds every 4th tick`, s.sounds.length === Math.ceil(want / 4), `${s.sounds.length}`);
    x += 2;
  }
  // Dirt by hand: 0.75 s and it drops itself; the 5-tick delay before the next block.
  const s = session(0);
  s.w.setBlock(4, 3, 4, B.dirt);
  s.w.setBlock(5, 3, 4, B.dirt);
  check('dirt by hand: 15 ticks', mine(s, 4, 3, 4) === 15);
  check('dirt drops dirt', items(s.w).includes(B.dirt));
  s.pc.clickBlock(5, 3, 4, 1);
  for (let i = 0; i < 5; i++) s.pc.onPlayerDamageBlock(5, 3, 4, 1);
  check('5 ticks pass before the next block takes damage', s.pc.getCurBlockDamage() === 0, `${s.pc.getCurBlockDamage()}`);
  s.pc.onPlayerDamageBlock(5, 3, 4, 1);
  check('then mining resumes', s.pc.getCurBlockDamage() > 0);
  s.pc.resetBlockRemoving();
  check('releasing the button resets the damage', s.pc.getCurBlockDamage() === 0 && !s.pc.isHitting());
  // Mining in the air is 5 times slower.
  const air = session(0);
  air.pc.clickBlock(0, 3, 0, 1);
  air.p.onGround = false;
  air.pc.onPlayerDamageBlock(0, 3, 0, 1);
  check('off the ground: a fifth of the speed', Math.abs(air.pc.getCurBlockDamage() - 1 / 1.5 / 100 / 5) < 1e-6, `${air.pc.getCurBlockDamage()}`);
  // Obsidian needs a diamond pickaxe.
  const obs = session(0);
  obs.w.setBlock(0, 3, 0, B.obsidian);
  obs.p.inventory.mainInventory[0] = new ItemStack(I.pickaxeIron, 1, 0);
  check('iron pickaxe cannot harvest obsidian', !obs.p.canHarvestBlock(Block.blocksList[B.obsidian]!));
  obs.p.inventory.mainInventory[0] = new ItemStack(I.pickaxeDiamond, 1, 0);
  check('diamond pickaxe: obsidian in 188 ticks', mine(obs, 0, 3, 0, 400) === 188);
  check('diamond pickaxe harvests obsidian', items(obs.w).includes(B.obsidian));
  // A tool on its last use breaks (and still drops the block).
  const last = session(0);
  last.p.inventory.mainInventory[0] = new ItemStack(I.pickaxeGold, 1, 32);
  mine(last, 0, 3, 0);
  check('worn-out tool breaks', last.p.inventory.mainInventory[0] === null);
  check('the breaking tool still harvests', items(last.w).includes(B.cobblestone));
  // Creative: instant, no drops, no wear.
  const cr = session(1);
  cr.p.inventory.mainInventory[0] = new ItemStack(I.pickaxeWood, 1, 0);
  cr.pc.clickBlock(0, 3, 0, 1);
  check('creative breaks at once', cr.w.getBlockId(0, 3, 0) === 0);
  check('creative: no drops, no wear', items(cr.w).length === 0 && cr.p.inventory.mainInventory[0]?.getItemDamage() === 0);
  // Survival placement uses up the stack; creative does not.
  const place = session(0);
  place.p.inventory.mainInventory[0] = new ItemStack(B.cobblestone, 2, 0);
  place.pc.onPlayerRightClick(place.p, place.w, place.p.inventory.mainInventory[0], 3, 3, 3, 1, { xCoord: 3.5, yCoord: 4, zCoord: 3.5 } as never);
  check('survival placement spends the block', place.w.getBlockId(3, 4, 3) === B.cobblestone && place.p.inventory.mainInventory[0]?.stackSize === 1);
}

// ------------------------------------------------------------------ hunger
{
  const s = session(0);
  s.w.difficultySetting = 2;
  const food = s.p.getFoodStats();
  check('fresh player: 20 food, 5 saturation', food.getFoodLevel() === 20 && food.getSaturationLevel() === 5);
  s.p.addExhaustion(4.5);
  s.p.onUpdate();
  check('4 exhaustion eats a point of saturation first', food.getSaturationLevel() === 4 && food.getFoodLevel() === 20);
  food.setFoodSaturationLevel(0);
  s.p.addExhaustion(4.5);
  s.p.onUpdate();
  check('then a point of food', food.getFoodLevel() === 19);
  // Natural regeneration: food >= 18 heals 1 every 80 ticks.
  s.p.setEntityHealth(10);
  for (let i = 0; i < 80; i++) s.p.onUpdate();
  check('regenerates half a heart per 80 ticks at 18+ food', s.p.getHealth() === 11, `${s.p.getHealth()}`);
  food.setFoodLevel(17);
  for (let i = 0; i < 160; i++) s.p.onUpdate();
  check('no regeneration below 18 food', s.p.getHealth() === 11, `${s.p.getHealth()}`);
  // Exhaustion from attacking, hurting and mining.
  const e0 = food.getExhaustionLevel();
  s.p.attackEntityFrom(DamageSource.cactus, 1);
  check('taking damage costs 0.3 exhaustion', Math.abs(food.getExhaustionLevel() - e0 - 0.3) < 1e-6, `${food.getExhaustionLevel() - e0}`);
  // Starvation by difficulty.
  const starve = (difficulty: number, health: number): number => {
    const t = session(0);
    t.w.difficultySetting = difficulty;
    t.p.getFoodStats().setFoodLevel(0);
    t.p.getFoodStats().setFoodSaturationLevel(0);
    t.p.setEntityHealth(health);
    for (let i = 0; i < 80 * 40; i++) {
      t.p.onUpdate();
      if (t.p.getHealth() <= 0) break;
    }
    return t.p.getHealth();
  };
  check('starving on Easy stops at 10 health', starve(1, 20) === 10);
  check('starving on Normal stops at 1 health', starve(2, 20) === 1);
  check('starving on Hard kills', starve(3, 20) <= 0);
  // Peaceful: never hungry, regenerates every second.
  const peace = session(0);
  peace.w.difficultySetting = 0;
  peace.p.getFoodStats().setFoodSaturationLevel(0);
  peace.p.addExhaustion(10);
  peace.p.setEntityHealth(5);
  for (let i = 0; i < 40; i++) peace.p.onUpdate();
  check('peaceful: no food lost', peace.p.getFoodStats().getFoodLevel() === 20);
  check('peaceful: heals every 20 ticks', peace.p.getHealth() >= 7, `${peace.p.getHealth()}`);
  // Creative players never get hungry.
  const cr = session(1);
  cr.p.addExhaustion(40);
  check('creative: no exhaustion', cr.p.getFoodStats().getExhaustionLevel() === 0);
}

// ------------------------------------------------------------------ sprinting needs food
{
  const trySprint = (foodLevel: number): boolean => {
    const s = session(0);
    s.p.getFoodStats().setFoodLevel(foodLevel);
    const input = new ScriptedInput();
    s.p.movementInput = input;
    input.queue = [0, 1, 0, 1];
    for (let i = 0; i < 4; i++) {
      s.p.onGround = true;
      s.p.onUpdate();
    }
    return s.p.isSprinting();
  };
  check('double-tap forward sprints with 7+ food', trySprint(7));
  check('no sprinting at 6 food', !trySprint(6));
}

// ------------------------------------------------------------------ damage
{
  // Falling 10 blocks: ceil(fallDistance - 3) damage, a fall sound, and the death message family.
  const s = session(0);
  s.p.setLocationAndAngles(0.5, 14, 0.5, 0, 0);
  s.p.onGround = false;
  let maxFall = 0;
  for (let i = 0; i < 100 && !(s.p.onGround && i > 0); i++) {
    maxFall = Math.max(maxFall, s.p.fallDistance);
    s.p.onUpdate();
  }
  const fallDamage = Math.ceil(maxFall - 3);
  check('fall damage = ceil(distance - 3)', s.p.getHealth() === 20 - fallDamage && fallDamage >= 6, `fell ${maxFall}, health ${s.p.getHealth()}`);
  check('creative players take no fall damage', (() => {
    const c = session(1);
    c.p.setLocationAndAngles(0.5, 14, 0.5, 0, 0);
    for (let i = 0; i < 60; i++) c.p.onUpdate();
    return c.p.getHealth() === 20;
  })());
  // Spawn protection: 60 ticks of immunity except for the void.
  const fresh = session(0);
  fresh.p.initialInvulnerability = 60;
  check('spawn protection blocks damage', !fresh.p.attackEntityFrom(DamageSource.cactus, 5) && fresh.p.getHealth() === 20);
  check('spawn protection lets the void through', fresh.p.attackEntityFrom(DamageSource.outOfWorld, 4) && fresh.p.getHealth() === 16);
  // Hurt frames: a weaker hit right after a strong one does nothing, a stronger one only the excess.
  const hf = session(0);
  hf.p.attackEntityFrom(DamageSource.cactus, 4);
  hf.p.attackEntityFrom(DamageSource.cactus, 2);
  check('invulnerability frames ignore weaker hits', hf.p.getHealth() === 16);
  hf.p.attackEntityFrom(DamageSource.cactus, 6);
  check('a stronger hit only deals the difference', hf.p.getHealth() === 14);
  check('hurt time set for the camera and model flash', hf.p.hurtTime === 10 && hf.p.attackedAtYaw === 0);
  // Armour: an iron chestplate (6 points) absorbs 24%, and wears by a quarter of the damage.
  const ar = session(0);
  ar.p.inventory.armorInventory[2] = new ItemStack(I.plateIron, 1, 0);
  check('iron chestplate = 6 armour points', ar.p.getTotalArmorValue() === 6);
  ar.p.attackEntityFrom(DamageSource.cactus, 10);
  check('armour reduces 10 damage to 7', ar.p.getHealth() === 13, `${ar.p.getHealth()}`);
  check('armour wears by damage / 4', ar.p.inventory.armorInventory[2]?.getItemDamage() === 2);
  ar.p.hurtResistantTime = 0;
  ar.p.attackEntityFrom(DamageSource.fall, 3);
  check('fall damage ignores armour', ar.p.getHealth() === 10, `${ar.p.getHealth()}`);
  // Drowning: 300 air, then 2 damage when the counter reaches -20 and every 20 ticks after.
  const dr = session(0);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 4; y <= 8; y++) dr.w.setBlock(x, y, z, B.waterStill);
  let firstHurt = -1;
  for (let i = 1; i <= 360; i++) {
    dr.p.onUpdate();
    if (firstHurt < 0 && dr.p.getHealth() < 20) firstHurt = i;
  }
  check('air runs out after 300 ticks, first drowning hit at 320', firstHurt >= 319 && firstHurt <= 322, `first hit at ${firstHurt}`);
  check('drowning keeps hurting every 20 ticks (2 per hit: 320, 340, 360)', dr.p.getHealth() === 14, `${dr.p.getHealth()}`);
}

// ------------------------------------------------------------------ death messages
{
  const high = session(0);
  high.p.fallDistance = 10;
  high.p.attackEntityFrom(DamageSource.fall, 7);
  const m1 = high.p.combatTracker.getDeathMessage();
  check('a long fall: "fell from a high place"', said(m1, 'death.fell.accident.generic', 'Player fell from a high place'), m1);
  const low = session(0);
  low.p.fallDistance = 4;
  low.p.attackEntityFrom(DamageSource.fall, 1);
  const m2 = low.p.combatTracker.getDeathMessage();
  check('a short fall: "hit the ground too hard"', said(m2, 'death.attack.fall', 'Player hit the ground too hard'), m2);
  const wet = session(0);
  wet.p.attackEntityFrom(DamageSource.drown, 2);
  const m3 = wet.p.combatTracker.getDeathMessage();
  check('drowning: "drowned"', said(m3, 'death.attack.drown', 'Player drowned'), m3);
  check('no damage at all: "died"', session(0).p.combatTracker.getDeathMessage() === 'Player died');
}

// ------------------------------------------------------------------ experience
{
  const s = session(0);
  check('17 points per level below 15', s.p.xpBarCap() === 17);
  s.p.addExperience(17);
  check('17 points: level 1', s.p.experienceLevel === 1 && s.p.experience === 0);
  s.p.addExperience(8);
  check('bar progress is points / cap', Math.abs(s.p.experience - 8 / 17) < 1e-6);
  s.p.experienceLevel = 15;
  check('level 15 needs 17, 16 needs 20, 30 needs 62, 31 needs 69', s.p.xpBarCap() === 17 && ((s.p.experienceLevel = 16), s.p.xpBarCap() === 20) && ((s.p.experienceLevel = 30), s.p.xpBarCap() === 62) && ((s.p.experienceLevel = 31), s.p.xpBarCap() === 69));
}

// ------------------------------------------------------------------ eating
{
  const s = session(0);
  const food = s.p.getFoodStats();
  food.setFoodLevel(10);
  food.setFoodSaturationLevel(0);
  const bread = new ItemStack(I.bread, 2, 0);
  s.p.inventory.mainInventory[0] = bread;
  s.p.inventory.currentItem = 0;
  s.pc.sendUseItem(s.p, s.w, bread);
  check('eating starts (32 ticks)', s.p.isUsingItem() && s.p.getItemInUseCount() === 32);
  for (let i = 0; i < 32; i++) s.p.onUpdate();
  check('bread: +5 food, +6 saturation, one eaten', food.getFoodLevel() === 15 && Math.abs(food.getSaturationLevel() - 6) < 1e-6 && bread.stackSize === 1, `${food.getFoodLevel()} ${food.getSaturationLevel()} ${bread.stackSize}`);
  food.setFoodLevel(20);
  s.pc.sendUseItem(s.p, s.w, bread);
  check('a full player cannot eat bread', !s.p.isUsingItem());
  s.p.inventory.mainInventory[0] = new ItemStack(I.appleGold, 1, 0);
  s.pc.sendUseItem(s.p, s.w, s.p.inventory.mainInventory[0]!);
  check('golden apples are always edible', s.p.isUsingItem());
  const cr = session(1);
  cr.p.getFoodStats().setFoodLevel(5);
  const cBread = new ItemStack(I.bread, 1, 0);
  cr.p.inventory.mainInventory[0] = cBread;
  cr.p.inventory.currentItem = 0;
  cr.pc.sendUseItem(cr.p, cr.w, cBread);
  check('creative players cannot eat', !cr.p.isUsingItem());
  void Item;
}

// ------------------------------------------------------------------ death and respawn
{
  const s = session(0);
  s.p.inventory.mainInventory[3] = new ItemStack(B.dirt, 10, 0);
  s.p.inventory.armorInventory[2] = new ItemStack(I.plateIron, 1, 0);
  s.p.experienceLevel = 5;
  s.p.setGameType(EnumGameType.SURVIVAL);
  s.p.attackEntityFrom(DamageSource.lava, 40);
  check('40 lava damage kills', s.p.getHealth() <= 0);
  check('death drops the inventory', s.p.inventory.mainInventory[3] === null && s.p.inventory.armorInventory[2] === null && items(s.w).includes(B.dirt) && items(s.w).includes(I.plateIron));
  check('death message from the combat tracker', s.p.combatTracker.getDeathMessage().length > 0);
  // Respawn: a new player with the old game mode, at a forced spawn point when it is free.
  const fresh = new EntityPlayerSP(s.p.mc, s.w, 'Player');
  s.p.setSpawnChunk(new ChunkCoordinates(10, 4, 10), true);
  s.p.gameType = EnumGameType.ADVENTURE;
  PlayerSpawning.respawn(fresh, s.p, s.w);
  check('respawned player keeps the game mode', fresh.gameType === EnumGameType.ADVENTURE && !fresh.capabilities.allowEdit);
  check('respawned at the forced spawn point', Math.floor(fresh.posX) === 10 && Math.floor(fresh.boundingBox.minY) === 4 && Math.floor(fresh.posZ) === 10, `${fresh.posX},${fresh.boundingBox.minY},${fresh.posZ}`);
  check('respawned player: full health, empty inventory, no xp', fresh.getHealth() === 20 && fresh.inventory.mainInventory.every((x) => x === null) && fresh.experienceLevel === 0);
  // keepInventory keeps items and experience.
  const k = session(0);
  k.w.worldInfo.gameRules.keepInventory = true;
  k.p.inventory.mainInventory[1] = new ItemStack(B.dirt, 3, 0);
  k.p.experienceLevel = 4;
  k.p.attackEntityFrom(DamageSource.outOfWorld, 100);
  const k2 = new EntityPlayerSP(k.p.mc, k.w, 'Player');
  PlayerSpawning.respawn(k2, k.p, k.w);
  check('keepInventory: items and levels survive death', k2.inventory.mainInventory[1]?.stackSize === 3 && k2.experienceLevel === 4);
  // An obstructed spawn point is forgotten with "tile.bed.notValid".
  const o = session(0);
  o.p.setSpawnChunk(new ChunkCoordinates(2, 2, 2), true);
  o.p.attackEntityFrom(DamageSource.outOfWorld, 100);
  const o2 = new EntityPlayerSP(o.p.mc, o.w, 'Player');
  PlayerSpawning.respawn(o2, o.p, o.w);
  check('obstructed spawn: world spawn and the bed message', o2.getBedLocation() === null && o.chat.includes('tile.bed.notValid'));
  // The survival state survives leaving and re-entering the world.
  const st = session(0);
  st.p.setEntityHealth(9);
  st.p.getFoodStats().setFoodLevel(7);
  st.p.experienceLevel = 3;
  const snap = PlayerSpawning.captureState(st.p);
  const back = new EntityPlayerSP(st.p.mc, st.w, 'Player');
  PlayerSpawning.restoreState(back, snap, false);
  check('saved state restores health, food, level and mode', back.getHealth() === 9 && back.getFoodStats().getFoodLevel() === 7 && back.experienceLevel === 3 && back.gameType === EnumGameType.SURVIVAL);
}

report();
