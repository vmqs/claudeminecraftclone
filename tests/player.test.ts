/**
 * Player state against a small real World: sleeping in beds (refusals, lying down, skipping the
 * night, getting up, spawn point, bed respawn checks), FOV modifiers (flying, speed potions, bow
 * zoom), nausea, blindness and sprinting, potion ticking and swirl colours.
 * Run: node scripts/run-node-test.mjs tests/player.test.ts
 */
import '../src/block/Blocks';
import { Block } from '../src/block/Block';
import { BlockBed } from '../src/block/BlockBed';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { EntityPlayerSP, type PlayerClient } from '../src/client/EntityPlayerSP';
import { ChunkCoordinates } from '../src/entity/EntityLiving';
import { EntityMob } from '../src/entity/EntityMob';
import { EntityOtherPlayerMP } from '../src/entity/EntityOtherPlayerMP';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { DamageSource } from '../src/entity/DamageSource';
import { hashMapOrder, potionLevelSuffix } from '../src/gui/inventory/InventoryEffectRenderer';
import { PotionId } from '../src/entity/PotionEffects';
import { installPotionHooks } from '../src/entity/ItemHooksInstall';
import { registerBlockItems } from '../src/item/Items';
import '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { Potion } from '../src/potion/Potion';
import { PotionEffect } from '../src/potion/PotionEffect';
import { Chunk } from '../src/world/Chunk';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();
installPotionHooks(Potion, PotionEffect);

const f = Math.fround;

function makeWorld(): World {
  const info = new WorldInfo();
  info.gameRules.doMobSpawning = false;
  const w = new World(info);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.addChunk(new Chunk(w, cx, cz));
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) w.setBlock(x, 3, z, B.stone, 0, 2);
  return w;
}

const chat: string[] = [];
const client: PlayerClient = {
  displayGuiScreen: () => {},
  playSoundFX: () => {},
  effectRenderer: { addEffect: () => {} },
  ingameGUI: { getChatGUI: () => ({ addTranslatedMessage: (k: string) => chat.push(k), printChatMessage: (m: string) => chat.push(m) }) as never },
  gameSettings: { chatVisibility: 0 },
  respawnPlayer: () => {},
};

function makePlayer(w: World, x: number, z: number): EntityPlayerSP {
  const p = new EntityPlayerSP(client, w, 'Player');
  p.capabilities.setCreative();
  p.setLocationAndAngles(x + 0.5, 4, z + 0.5, 0, 0);
  w.spawnEntityInWorld(p);
  return p;
}

/** Places a bed with its foot at (x, 4, z) and its head one block towards `dir`. */
function placeBed(w: World, x: number, z: number, dir: number): [number, number] {
  const [dx, dz] = BlockBed.footBlockToHeadBlockMap[dir];
  w.setBlock(x, 4, z, B.bed, dir, 3);
  w.setBlock(x + dx, 4, z + dz, B.bed, dir | 8, 3);
  return [x + dx, z + dz];
}

const bed = Block.blocksList[B.bed]!;

// ---------------------------------------------------------------- refusals
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  placeBed(w, 2, 0, 0);
  w.setWorldTime(6000);
  w.tick();
  chat.length = 0;
  bed.onBlockActivated(w, 2, 4, 0, p, 1, 0.5, 0.5, 0.5);
  check('day: refused', !p.isPlayerSleeping());
  check('day: "You can only sleep at night"', chat.includes('tile.bed.noSleep'), chat.join());

  w.setWorldTime(18000);
  w.tick();
  class TestMob extends EntityMob {
    getMaxHealth(): number {
      return 20;
    }
  }
  const mob = new TestMob(w);
  mob.setLocationAndAngles(8, 4, 0, 0, 0);
  w.spawnEntityInWorld(mob);
  chat.length = 0;
  bed.onBlockActivated(w, 2, 4, 0, p, 1, 0.5, 0.5, 0.5);
  check('monster near: refused (also in Creative)', !p.isPlayerSleeping());
  check('monster near: "monsters nearby"', chat.includes('tile.bed.notSafe'), chat.join());
  mob.setDead();
  w.removeEntity(mob);
  // removeEntity only marks it dead; drop it from the list the AABB query reads.
  w.updateEntities();

  p.setLocationAndAngles(10.5, 4, 0.5, 0, 0);
  chat.length = 0;
  bed.onBlockActivated(w, 2, 4, 0, p, 1, 0.5, 0.5, 0.5);
  check('too far: refused silently', !p.isPlayerSleeping() && chat.length === 0, chat.join());
}

// ---------------------------------------------------------------- sleeping through the night
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  const [hx, hz] = placeBed(w, 1, 0, 3); // dir 3: head towards +x
  w.setWorldTime(18000 + 24000 * 3);
  w.tick();
  check('night', !w.isDaytime());
  chat.length = 0;
  bed.onBlockActivated(w, 1, 4, 0, p, 1, 0.5, 0.5, 0.5); // the foot: redirected to the head
  check('sleeps', p.isPlayerSleeping(), chat.join());
  check('playerLocation is the head', p.playerLocation?.posX === hx && p.playerLocation?.posZ === hz);
  check('bed occupied', BlockBed.isBedOccupied(w.getBlockMetadata(hx, 4, hz)));
  check('size 0.2 and yOffset 0.2', p.width === f(0.2) && p.height === f(0.2) && p.yOffset === f(0.2));
  check('lies at x+0.9 (dir 3), y+0.9375', Math.abs(p.posX - (hx + 0.9)) < 1e-6 && Math.abs(p.posY - (4 + 0.9375)) < 1e-6, `${p.posX} ${p.posY}`);
  check('render offset dir 3 = (-1.8, 0, 0)', p.sleepOffsetX === f(-1.8) && p.sleepOffsetZ === 0);
  check('bed orientation dir 3 = 180', p.getBedOrientationInDegrees() === 180);
  check('not sneaking while asleep', !p.isSneaking());
  check('not inside opaque block while asleep', !p.isEntityInsideOpaqueBlock());

  // A second player cannot take the same bed.
  const q = makePlayer(w, 0, 1);
  chat.length = 0;
  bed.onBlockActivated(w, hx, 4, hz, q, 1, 0.5, 0.5, 0.5);
  check('occupied bed refused', !q.isPlayerSleeping() && chat.includes('tile.bed.occupied'), chat.join());
  w.removeEntity(q);

  const t0 = w.getWorldTime();
  let ticks = 0;
  while (p.isPlayerSleeping() && ticks < 200) {
    p.onUpdate();
    w.tick();
    ticks++;
  }
  check('wakes after ~100 ticks', ticks >= 100 && ticks <= 102, String(ticks));
  check('morning: time skipped to the next day', w.getWorldTime() % 24000 <= 2 && w.getWorldTime() > t0, String(w.getWorldTime()));
  check('bed free again', !BlockBed.isBedOccupied(w.getBlockMetadata(hx, 4, hz)));
  check('full size again', p.height === f(1.8) && p.yOffset === f(1.62));
  check('stands next to the bed', Math.abs(p.posX - Math.floor(p.posX) - 0.5) < 1e-6 && Math.abs(p.boundingBox.minY - 4.1) < 1e-4, `${p.posX} ${p.boundingBox.minY}`);
  check('spawn point = bed', p.getBedLocation()?.posX === hx && p.getBedLocation()?.posZ === hz && !p.isSpawnForced());
  check('dark overlay fades from 100', p.getSleepTimer() === 100, String(p.getSleepTimer()));
  for (let i = 0; i < 10; i++) p.onUpdate();
  check('overlay gone after 10 ticks', p.getSleepTimer() === 0, String(p.getSleepTimer()));

  // Respawn checks.
  const spot = EntityPlayer.verifyRespawnCoordinates(w, p.getBedLocation()!, false);
  check('respawn next to the bed', !!spot && Math.abs(spot.posX - hx) <= 2 && spot.posY === 4, JSON.stringify(spot));
  w.setBlockToAir(hx, 4, hz);
  check('bed gone: no respawn point', EntityPlayer.verifyRespawnCoordinates(w, new ChunkCoordinates(hx, 4, hz), false) === null);
  check('forced spawn in the open', EntityPlayer.verifyRespawnCoordinates(w, new ChunkCoordinates(5, 4, 5), true) !== null);
  check('forced spawn inside stone refused', EntityPlayer.verifyRespawnCoordinates(w, new ChunkCoordinates(5, 3, 5), true) === null);
}

// ---------------------------------------------------------------- leaving and losing the bed
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  const [hx, hz] = placeBed(w, 0, 2, 0);
  w.setWorldTime(14000);
  w.tick();
  bed.onBlockActivated(w, hx, 4, hz, p, 1, 0.5, 0.5, 0.5);
  check('sleeps (dir 0)', p.isPlayerSleeping() && p.sleepOffsetZ === f(-1.8) && p.getBedOrientationInDegrees() === 90);
  for (let i = 0; i < 20; i++) {
    p.onUpdate();
    w.tick();
  }
  p.wakeUpPlayer(false, true, true); // "Leave Bed"
  check('left the bed', !p.isPlayerSleeping() && p.getBedLocation() !== null && p.getSleepTimer() === 100);
  check('night not skipped', w.getWorldTime() < 14100);

  bed.onBlockActivated(w, hx, 4, hz, p, 1, 0.5, 0.5, 0.5);
  check('sleeps again', p.isPlayerSleeping());
  w.setBlockToAir(hx, 4, hz);
  p.onUpdate();
  check('bed broken: woken', !p.isPlayerSleeping());
}

// ---------------------------------------------------------------- FOV, nausea, blindness
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  p.onLivingUpdate = EntityPlayer.prototype.onLivingUpdate; // no keyboard input in Node
  p.landMovementFactor = p.capabilities.getWalkSpeed();
  check('FOV 1 standing', p.getFOVMultiplier() === 1, String(p.getFOVMultiplier()));
  p.capabilities.isFlying = true;
  check('FOV x1.1 flying', p.getFOVMultiplier() === f(1.1), String(p.getFOVMultiplier()));
  p.capabilities.isFlying = false;
  p.addPotionEffect(new PotionEffect(PotionId.moveSpeed, 200, 1));
  check('FOV with Speed II = (1.4+1)/2', Math.abs(p.getFOVMultiplier() - 1.2) < 1e-6, String(p.getFOVMultiplier()));
  p.clearActivePotions();
  p.addPotionEffect(new PotionEffect(PotionId.moveSlowdown, 200, 0));
  check('FOV with Slowness I = (0.85+1)/2', Math.abs(p.getFOVMultiplier() - 0.925) < 1e-6, String(p.getFOVMultiplier()));
  p.clearActivePotions();
  const bow = new ItemStack(I.bow, 1, 0);
  p.inventory.mainInventory[p.inventory.currentItem] = bow;
  p.setItemInUse(bow, bow.getMaxItemUseDuration() - 10);
  check('bow half drawn: zoom 1 - 0.25*0.15', Math.abs(p.getFOVMultiplier() - (1 - 0.25 * 0.15)) < 1e-6, String(p.getFOVMultiplier()));
  p.clearItemInUse();
  p.setItemInUse(bow, bow.getMaxItemUseDuration() - 40);
  check('bow fully drawn: zoom 0.85', Math.abs(p.getFOVMultiplier() - 0.85) < 1e-6, String(p.getFOVMultiplier()));
  p.clearItemInUse();
}

// ---------------------------------------------------------------- potion ticking
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  p.addPotionEffect(new PotionEffect(PotionId.confusion, 200, 0));
  const before = p.timeInPortal;
  EntityPlayerSP.prototype.onLivingUpdate.call(p);
  check('nausea warps the view', p.timeInPortal > before && Math.abs(p.timeInPortal - 0.006666667) < 1e-6, String(p.timeInPortal));
  p.addPotionEffect(new PotionEffect(PotionId.invisibility, 100, 0));
  p.onUpdate();
  check('invisibility hides the player', p.isInvisible());
  p.clearActivePotions();
  p.onUpdate();
  check('milk/clear: visible again', !p.isInvisible() && p.getActivePotionEffects().length === 0);
  const regen = new PotionEffect(PotionId.regeneration, 60, 0);
  p.addPotionEffect(regen);
  for (let i = 0; i < 59; i++) p.onUpdate();
  check('effect counts down', p.getActivePotionEffect(PotionId.regeneration)?.getDuration() === 1);
  p.onUpdate();
  check('effect runs out', !p.isPotionActive(PotionId.regeneration));
  p.addPotionEffect(new PotionEffect(PotionId.moveSpeed, 100, 0));
  p.addPotionEffect(new PotionEffect(PotionId.moveSpeed, 50, 1));
  const sp = p.getActivePotionEffect(PotionId.moveSpeed)!;
  check('stronger effect wins on combine', sp.getAmplifier() === 1 && sp.getDuration() === 50);
  p.addPotionEffect(new PotionEffect(PotionId.harm, 1, 0));
  const hp = p.getHealth();
  p.onUpdate();
  check('instant damage cannot hurt a Creative player', p.getHealth() === hp);
}

// ---------------------------------------------------------------- other players, hurt in bed, effect list
{
  const w = makeWorld();
  const p = makePlayer(w, 0, 0);
  const [hx, hz] = placeBed(w, 4, 4, 2);
  w.setWorldTime(6000);
  w.tick();
  const other = new EntityOtherPlayerMP(w, 'Alex');
  other.setLocationAndAngles(hx + 0.5, 4, hz + 0.5, 0, 0);
  w.spawnEntityInWorld(other);
  check('other player: feet at posY (yOffset 0)', other.yOffset === 0 && other.boundingBox.minY === 4);
  check('other player lies down by day (Packet17Sleep, no checks)', other.sleepInBedAt(hx, 4, hz) === 'OK' && other.isPlayerSleeping());
  check('other player: dir 2 lies at z+0.1, offset z +1.8, orientation 270', Math.abs(other.posZ - (hz + 0.1)) < 1e-6 && other.sleepOffsetZ === f(1.8) && other.getBedOrientationInDegrees() === 270);
  check('other player: lies a quarter block higher until updated', other.sleepOffsetY === f(0.25));
  check('other players show their name tag', other.getAlwaysRenderNameTag());
  w.removeEntity(other);

  w.setWorldTime(18000);
  w.tick();
  p.setLocationAndAngles(hx + 0.5, 4, hz - 1.5, 0, 0);
  bed.onBlockActivated(w, hx, 4, hz, p, 1, 0.5, 0.5, 0.5);
  check('sleeps (dir 2)', p.isPlayerSleeping());
  p.capabilities.disableDamage = false;
  p.attackEntityFrom(DamageSource.generic, 1);
  check('hurt in bed: woken without a new spawn point', !p.isPlayerSleeping() && p.getBedLocation() === null && p.getSleepTimer() === 100);
  p.capabilities.disableDamage = true;
  for (let i = 0; i < 5; i++) p.onUpdate();
  p.wakeUpPlayer(false, true, true);
  check('waking an awake player keeps the fade going', p.getSleepTimer() === 105, String(p.getSleepTimer()));

  p.setItemInUse(new ItemStack(I.bow, 1, 0), 100);
  check('item use raises the eating flag', p.isEating());
  p.clearItemInUse();
  check('and clears it', !p.isEating());
}
{
  const e = (id: number) => new PotionEffect(id, 100, 0);
  const order = hashMapOrder([e(1), e(3), e(8), e(12), e(16), e(13)]).map((x) => x.getPotionID());
  check('effect list in Java HashMap order (16 first)', order.join() === '16,1,3,8,12,13', order.join());
  const order2 = hashMapOrder([e(1), e(17)]).map((x) => x.getPotionID());
  check('same bucket: the later effect first (Java 7 HashMap)', order2.join() === '17,1', order2.join());
  check('level suffixes', potionLevelSuffix(0) === '' && potionLevelSuffix(1) === ' II' && potionLevelSuffix(3) === ' IV' && potionLevelSuffix(4) === '');
}

report();
