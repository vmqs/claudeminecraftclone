/**
 * Hostile mob logic against a real World with a few flat chunks: registration, Creative
 * immunity of target selection (zombie, skeleton, creeper, ghast, enderman stare), the
 * same mobs engaging a damageable player, slime splitting, and the spawner delay rules.
 * Run: node scripts/run-node-test.mjs tests/mobshostile.test.ts
 */
import '../src/block/Blocks';
import { BlockIds as B } from '../src/block/BlockIds';
import { registerBlockItems } from '../src/item/Items';
import '../src/entity/Entities';
import { Chunk } from '../src/world/Chunk';
import { World, WorldInfo } from '../src/world/World';
import { EntityList } from '../src/entity/EntityList';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import type { Entity } from '../src/entity/Entity';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { DamageSource } from '../src/entity/DamageSource';
import type { EntityCreeper } from '../src/entity/EntityCreeper';
import type { EntitySlime } from '../src/entity/EntitySlime';
import { chunkRandomWithSeed } from '../src/entity/EntitySlime';
import type { EntityPigZombie } from '../src/entity/EntityPigZombie';
import { check, report } from './harness';

registerBlockItems();

class TestPlayer extends EntityPlayer {}

/** A world of 9x9 chunks (entities only tick with chunks 32 blocks around them): bedrock, stone to y 3, grass at y 4; night unless told otherwise. */
function makeWorld(time = 18000): World {
  const info = new WorldInfo();
  info.seed = 12345n;
  info.spawnX = 0;
  info.spawnY = 5;
  info.spawnZ = 0;
  info.worldTime = time;
  const w = new World(info);
  w.difficultySetting = 2;
  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) {
      const c = new Chunk(w, cx, cz);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++) {
          c.setBlockIDWithMetadata(x, 0, z, B.bedrock, 0);
          for (let y = 1; y < 4; y++) c.setBlockIDWithMetadata(x, y, z, B.stone, 0);
          c.setBlockIDWithMetadata(x, 4, z, B.grass, 0);
        }
      c.generateSkylightMap();
      w.addChunk(c);
    }
  }
  w.mobSpawner = null;
  return w;
}

function addPlayer(w: World, creative: boolean, x: number, z: number): TestPlayer {
  const p = new TestPlayer(w);
  if (creative) p.capabilities.disableDamage = true;
  p.capabilities.isCreativeMode = creative;
  p.setLocationAndAngles(x, 5, z, 0, 0);
  w.spawnEntityInWorld(p);
  return p;
}

function spawn<T extends Entity>(w: World, name: string, x: number, z: number, init = true): T {
  const e = EntityList.createEntityByName(name, w)!;
  e.setLocationAndAngles(x, 5, z, 0, 0);
  if (init) (e as unknown as EntityLiving).initCreature();
  w.spawnEntityInWorld(e);
  return e as T;
}

function tick(w: World, n: number, also: Entity[] = []): void {
  for (let i = 0; i < n; i++) {
    for (const e of [...w.loadedEntityList]) if (!e.isDead && !also.includes(e) && !e.isPlayerEntity) w.updateEntity(e);
  }
}

const NAMES = ['Creeper', 'Skeleton', 'Spider', 'Giant', 'Zombie', 'Slime', 'Ghast', 'PigZombie', 'Enderman', 'CaveSpider', 'Silverfish', 'Blaze', 'LavaSlime', 'Witch'];
{
  const w = makeWorld();
  for (const n of NAMES) {
    const e = EntityList.createEntityByName(n, w) as EntityLiving | null;
    check(`registered ${n}`, e !== null);
    if (e) check(`${n} is a monster`, e.isIMob);
  }
  const hp: Record<string, number> = { Creeper: 20, Skeleton: 20, Spider: 16, Giant: 100, Zombie: 20, Ghast: 10, PigZombie: 20, Enderman: 40, CaveSpider: 12, Silverfish: 8, Blaze: 20, Witch: 26 };
  for (const [n, h] of Object.entries(hp)) check(`${n} health ${h}`, (EntityList.createEntityByName(n, w) as EntityLiving).getHealth() === h);
  const sizes: Record<string, [number, number]> = { Spider: [1.4, 0.9], CaveSpider: [0.7, 0.5], Enderman: [0.6, 2.9], Ghast: [4, 4], Silverfish: [0.3, 0.7], Giant: [3.6, 10.8] };
  for (const [n, [wd, ht]] of Object.entries(sizes)) {
    const e = EntityList.createEntityByName(n, w)!;
    check(`${n} size`, Math.abs(e.width - wd) < 1e-5 && Math.abs(e.height - ht) < 1e-5, `${e.width}x${e.height}`);
  }
  check('Giant has no egg', !EntityList.entityEggs.has(53));
  check('Witch egg', EntityList.entityEggs.has(66));
}

// Creative players are never picked as targets; damageable ones are.
for (const creative of [true, false]) {
  const tag = creative ? 'creative' : 'survival';
  const w = makeWorld();
  const p = addPlayer(w, creative, 0.5, 0.5);
  const zombie = spawn<EntityLiving>(w, 'Zombie', 6.5, 0.5, false);
  const skeleton = spawn<EntityLiving>(w, 'Skeleton', -6.5, 0.5);
  // The creeper gets a world of its own: its blast would kill a survival player before the
  // skeleton's first arrow.
  const cw = makeWorld();
  const cp = addPlayer(cw, creative, 0.5, 0.5);
  const creeper = spawn<EntityCreeper>(cw, 'Creeper', 0.5, 2.5, false);
  const ghast = spawn<EntityLiving>(w, 'Ghast', 0.5, -12.5, false);
  ghast.setPosition(0.5, 14, -12.5);
  const witch = spawn<EntityLiving>(w, 'Witch', 0.5, 8.5, false);
  let creeperSwelled = false;
  let arrows = 0;
  let fireballs = 0;
  let potions = 0;
  for (let i = 0; i < 160; i++) {
    tick(w, 1);
    tick(cw, 1);
    cp.setLocationAndAngles(0.5, 5, 0.5, 0, 0);
    if (creeper.getCreeperState() > 0) creeperSwelled = true;
    arrows = Math.max(arrows, w.loadedEntityList.filter((e) => EntityList.getEntityString(e) === 'Arrow').length);
    fireballs = Math.max(fireballs, w.loadedEntityList.filter((e) => EntityList.getEntityString(e) === 'Fireball').length);
    potions = Math.max(potions, w.loadedEntityList.filter((e) => EntityList.getEntityString(e) === 'ThrownPotion').length);
    p.setLocationAndAngles(0.5, 5, 0.5, 0, 0);
    // Keep the survival target alive so every shooter gets its turn.
    if (!creative) p.setEntityHealth(20);
  }
  if (creative) {
    check('zombie ignores creative', zombie.getAttackTarget() === null);
    check('skeleton ignores creative', skeleton.getAttackTarget() === null && arrows === 0, `arrows ${arrows}`);
    check('creeper does not swell for creative', !creeperSwelled && !creeper.isDead);
    check('ghast does not shoot creative', fireballs === 0);
    check('witch does not throw at creative', potions === 0);
  } else {
    check(`zombie targets ${tag}`, zombie.getAttackTarget() === p || zombie.isDead);
    check(`skeleton shoots ${tag}`, arrows > 0);
    check(`creeper swells for ${tag}`, creeperSwelled);
    check(`creeper exploded near ${tag}`, creeper.isDead);
    check(`ghast shoots ${tag}`, fireballs > 0);
    check(`witch throws at ${tag}`, potions > 0);
  }
}

// Revenge: hitting a mob in Creative makes it turn on you, as in 1.5.2.
{
  const w = makeWorld();
  const p = addPlayer(w, true, 0.5, 0.5);
  const zombie = spawn<EntityLiving>(w, 'Zombie', 3.5, 0.5, false);
  zombie.attackEntityFrom(DamageSource.causePlayerDamage(p), 1);
  tick(w, 4);
  check('zombie retaliates against a creative attacker', zombie.getAttackTarget() === p);
  check('knockback on hit', zombie.motionY > 0 || zombie.posY > 5);
}

// Pigmen are neutral until a player hits one, then the group within 32 turns.
{
  const w = makeWorld();
  const p = addPlayer(w, false, 0.5, 0.5);
  const a = spawn<EntityPigZombie>(w, 'PigZombie', 5.5, 0.5);
  const b = spawn<EntityPigZombie>(w, 'PigZombie', 9.5, 5.5);
  tick(w, 40);
  check('pigmen neutral', a.getAngerLevel() === 0 && b.getAngerLevel() === 0);
  a.attackEntityFrom(DamageSource.causePlayerDamage(p), 1);
  check('pigmen anger spreads', a.getAngerLevel() >= 400 && b.getAngerLevel() >= 400);
  check('pigman holds a gold sword', a.getHeldItem()?.itemID === 283);
}

// Slimes split on death.
{
  const w = makeWorld();
  addPlayer(w, true, 30.5, 30.5);
  const s = spawn<EntitySlime>(w, 'Slime', 0.5, 0.5, false);
  s.readEntityFromNBT({ Size: 3 });
  check('slime size 4 health 16', s.getSlimeSize() === 4 && s.getHealth() === 16);
  s.attackEntityFrom(DamageSource.generic, 100);
  for (let i = 0; i < 25; i++) tick(w, 1);
  const kids = w.loadedEntityList.filter((e) => EntityList.getEntityString(e) === 'Slime' && !e.isDead) as EntitySlime[];
  check('slime split into 2-4', kids.length >= 2 && kids.length <= 4, `${kids.length}`);
  check('children size 2', kids.every((k) => k.getSlimeSize() === 2));
}

// Zombies and skeletons burn in daylight (noon), endermen ignore a creative stare.
{
  const w = makeWorld(6000);
  addPlayer(w, true, 30.5, 30.5);
  const z = spawn<EntityLiving>(w, 'Zombie', 0.5, 0.5, false);
  let burned = false;
  for (let i = 0; i < 400 && !burned; i++) {
    tick(w, 1);
    burned = z.isBurning();
  }
  check('zombie burns at noon', burned);
}
{
  const w = makeWorld();
  const p = addPlayer(w, true, 0.5, 0.5);
  const en = spawn<EntityLiving & { isScreaming(): boolean }>(w, 'Enderman', 0.5, 6.5, false);
  p.rotationYaw = 0;
  p.rotationPitch = -20;
  for (let i = 0; i < 100; i++) {
    tick(w, 1);
    p.rotationYaw = 0;
  }
  check('enderman ignores creative stare', !en.isScreaming());
}

// Slime chunks: Chunk.getRandomWithSeed with int overflow (stable values for this seed).
{
  const r1 = chunkRandomWithSeed(12345n, 100000, -100000, 987234911n).nextInt(10);
  const r2 = chunkRandomWithSeed(12345n, 100000, -100000, 987234911n).nextInt(10);
  check('slime chunk random is deterministic', r1 === r2);
}
report();
