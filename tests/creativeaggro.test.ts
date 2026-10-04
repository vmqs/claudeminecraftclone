/**
 * Hostile and neutral mobs never go after a Creative player, even one who hits them: no target
 * (new AI attack target, old AI entityToAttack, a ghast's, the dragon's, the wither's heads), no
 * chase, no melee or ranged attack, no creeper fuse, no pigman or wolf anger, no screaming
 * enderman, no silverfish called out of the stone. Survival players get the 1.5.2 behaviour, and
 * a player switching to Creative (/gamemode) is dropped at once.
 * Run: node scripts/run-node-test.mjs tests/creativeaggro.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B } from '../src/block/BlockIds';
import { DamageSource } from '../src/entity/DamageSource';
import type { Entity } from '../src/entity/Entity';
import { EntityList } from '../src/entity/EntityList';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { installItemEntityFactories } from '../src/entity/ItemHooksInstall';
import { ItemEntityFactories } from '../src/item/ItemEntitySpawning';
import { registerBlockItems } from '../src/item/Items';
import { Chunk } from '../src/world/Chunk';
import { EnumGameType } from '../src/world/EnumGameType';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();
installItemEntityFactories(ItemEntityFactories as never);

class TestPlayer extends EntityPlayer {}

/** 9 x 9 flat chunks (entities tick with 32 blocks of chunks around them), night, Normal. */
function makeWorld(): World {
  const info = new WorldInfo();
  info.seed = 4242n;
  info.spawnX = 0;
  info.spawnY = 5;
  info.spawnZ = 0;
  info.worldTime = 18000;
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
  w.skylightSubtracted = w.calculateSkylightSubtracted(1);
  return w;
}

function addPlayer(w: World, creative: boolean, x: number, z: number): TestPlayer {
  const p = new TestPlayer(w);
  p.username = creative ? 'Creative' : 'Survivor';
  (creative ? EnumGameType.CREATIVE : EnumGameType.SURVIVAL).configurePlayerCapabilities(p.capabilities);
  p.setLocationAndAngles(x, 5, z, 0, 0);
  w.spawnEntityInWorld(p);
  return p;
}

function spawn<T extends EntityLiving>(w: World, name: string, x: number, y: number, z: number): T {
  const e = EntityList.createEntityByName(name, w) as T;
  e.setLocationAndAngles(x, y, z, 0, 0);
  w.spawnEntityInWorld(e);
  return e;
}

/** What a mob did to a player: attack attempts (melee or projectile), projectiles fired. */
interface Watch {
  hits: number;
  shots: number;
}

/** Records every damage a player is asked to take from `mobs` (directly or by their projectiles). */
function watchPlayer(p: EntityPlayer, mobs: () => Entity[]): Watch {
  const watch = { hits: 0, shots: 0 };
  const orig = p.attackEntityFrom.bind(p);
  p.attackEntityFrom = (src, n) => {
    const by = src.getEntity();
    if (by && mobs().includes(by)) watch.hits++;
    return orig(src, n);
  };
  return watch;
}

const PROJECTILES = new Set(['Arrow', 'Fireball', 'SmallFireball', 'ThrownPotion', 'WitherSkull']);

/** Projectiles in the world fired by one of `mobs` (shootingEntity / thrower). */
function projectilesBy(w: World, mobs: Entity[]): Entity[] {
  return w.loadedEntityList.filter((e) => {
    if (!PROJECTILES.has(EntityList.getEntityString(e) ?? '')) return false;
    const o = e as unknown as { shootingEntity?: Entity | null; getThrower?: () => Entity | null };
    const by = o.shootingEntity ?? o.getThrower?.() ?? null;
    return !!by && mobs.includes(by);
  });
}

/** The raw targets a mob holds, read without the Creative filter of the getters. */
function rawTargets(e: Entity): Entity[] {
  const o = e as unknown as { attackTarget?: Entity | null; target?: Entity | null; targetedEntity?: Entity | null };
  return [o.attackTarget, o.target, o.targetedEntity].filter((t): t is Entity => !!t);
}

/** Whether any of the mob's targets (as its own AI reads them) is `p`. */
function targets(e: Entity, p: Entity): boolean {
  const l = e as unknown as EntityLiving & { getEntityToAttack?: () => Entity | null };
  return l.getAttackTarget?.() === p || l.getEntityToAttack?.() === p || rawTargets(e).includes(p);
}

function tick(w: World, n: number, each?: () => void): void {
  for (let i = 0; i < n; i++) {
    w.updateEntities();
    each?.();
  }
}

interface Case {
  name: string;
  /** Spawns the mob(s) next to a player at (0.5, 5, 0.5); the first is the one hit. */
  make(w: World): EntityLiving[];
  /** The mob reacts to a survival player who hit it (1.5.2 behaviour). */
  survival?: (mobs: EntityLiving[], p: EntityPlayer, w: World, watch: Watch) => [boolean, string];
  /** Mob-specific "not provoked" state, checked every tick for the Creative player. */
  calm?: (mobs: EntityLiving[]) => string | null;
}

const at = (dist: number) => (name: string) => (w: World) => [spawn<EntityLiving>(w, name, 0.5, 5, 0.5 + dist)];
const anyTarget = (mobs: EntityLiving[], p: EntityPlayer): [boolean, string] => [mobs.some((m) => targets(m, p)), 'no target'];

const CASES: Case[] = [
  { name: 'Zombie', make: at(4)('Zombie'), survival: (m, p, w, wt) => [targets(m[0], p) && wt.hits > 0, `target ${targets(m[0], p)} hits ${wt.hits}`] },
  {
    name: 'Skeleton',
    make: at(8)('Skeleton'),
    survival: (m, p, w, wt) => [targets(m[0], p) && (projectilesBy(w, m).length > 0 || wt.hits > 0), `arrows ${projectilesBy(w, m).length} hits ${wt.hits}`],
  },
  {
    name: 'WitherSkeleton',
    make: (w) => {
      const s = spawn<EntityLiving>(w, 'Skeleton', 0.5, 5, 6.5);
      (s as unknown as { setSkeletonType(t: number): void }).setSkeletonType(1);
      return [s];
    },
    survival: (m, p) => anyTarget(m, p),
  },
  {
    name: 'Creeper',
    make: at(2.5)('Creeper'),
    survival: (m, p) => [targets(m[0], p) || m[0].isDead, 'swelled'],
    calm: (m) => ((m[0] as unknown as { getCreeperState(): number }).getCreeperState() > 0 ? 'fuse lit' : null),
  },
  { name: 'Spider', make: at(6)('Spider'), survival: (m, p) => anyTarget(m, p) },
  { name: 'CaveSpider', make: at(6)('CaveSpider'), survival: (m, p) => anyTarget(m, p) },
  {
    name: 'Enderman',
    make: at(6)('Enderman'),
    survival: (m, p) => anyTarget(m, p),
    calm: (m) => ((m[0] as unknown as { isScreaming(): boolean }).isScreaming() ? 'screaming' : null),
  },
  {
    name: 'PigZombie',
    make: (w) => [spawn<EntityLiving>(w, 'PigZombie', 0.5, 5, 6.5), spawn<EntityLiving>(w, 'PigZombie', 4.5, 5, 6.5), spawn<EntityLiving>(w, 'PigZombie', -4.5, 5, 8.5)],
    survival: (m, p) => [m.every((z) => (z as unknown as { getAngerLevel(): number }).getAngerLevel() > 0) && m.some((z) => targets(z, p)), 'all angry'],
    calm: (m) => (m.some((z) => (z as unknown as { getAngerLevel(): number }).getAngerLevel() > 0) ? 'angry pigman' : null),
  },
  {
    name: 'Silverfish',
    make: at(6)('Silverfish'),
    survival: (m, p) => anyTarget(m, p),
    calm: (m) => ((m[0] as unknown as { allySummonCooldown: number }).allySummonCooldown > 0 ? 'calling allies' : null),
  },
  { name: 'Blaze', make: (w) => [spawn<EntityLiving>(w, 'Blaze', 0.5, 5, 8.5)], survival: (m, p, w) => [targets(m[0], p), `fireballs ${projectilesBy(w, m).length}`] },
  { name: 'Witch', make: at(8)('Witch'), survival: (m, p) => anyTarget(m, p) },
  { name: 'Slime', make: (w) => [spawn<EntityLiving>(w, 'Slime', 0.5, 5, 1.5)] },
  { name: 'LavaSlime', make: (w) => [spawn<EntityLiving>(w, 'LavaSlime', 0.5, 5, 1.5)] },
  {
    name: 'Ghast',
    make: (w) => [spawn<EntityLiving>(w, 'Ghast', 0.5, 9, 14.5)],
    survival: (m, p) => anyTarget(m, p),
  },
  {
    name: 'Wolf',
    make: (w) => [spawn<EntityLiving>(w, 'Wolf', 0.5, 5, 4.5), spawn<EntityLiving>(w, 'Wolf', 3.5, 5, 6.5)],
    survival: (m, p) => [m.every((x) => (x as unknown as { isAngry(): boolean }).isAngry()) && m.every((x) => targets(x, p)), 'pack angry'],
    calm: (m) => (m.some((x) => (x as unknown as { isAngry(): boolean }).isAngry()) ? 'angry wolf' : null),
  },
  { name: 'VillagerGolem', make: at(4)('VillagerGolem'), survival: (m, p, w, wt) => [targets(m[0], p) && wt.hits > 0, `hits ${wt.hits}`] },
  {
    name: 'WitherBoss',
    make: (w) => [spawn<EntityLiving>(w, 'WitherBoss', 0.5, 6, 10.5)],
    survival: (m, p) => anyTarget(m, p),
    calm: (m) => {
      const wb = m[0] as unknown as { getWatchedTargetId(h: number): number };
      return [0, 1, 2].some((h) => wb.getWatchedTargetId(h) === PLAYER_ID.id) ? 'head on the player' : null;
    },
  },
];

const PLAYER_ID = { id: -1 };

for (const c of CASES) {
  for (const creative of [true, false]) {
    const w = makeWorld();
    const p = addPlayer(w, creative, 0.5, 0.5);
    PLAYER_ID.id = p.entityId;
    const mobs = c.make(w);
    const watch = watchPlayer(p, () => mobs);
    tick(w, 2);
    // The player punches the first mob.
    const hit = mobs[0].attackEntityFrom(DamageSource.causePlayerDamage(p), 1);
    check(`${c.name} (${creative ? 'creative' : 'survival'}) takes the hit`, hit || mobs[0].isEntityInvulnerable() || c.name === 'WitherBoss');
    const start = mobs.map((m) => m.getDistanceToEntity(p));
    let targeted = 0;
    let provoked: string | null = null;
    let closest = Infinity;
    tick(w, creative ? 200 : 120, () => {
      if (!creative) {
        p.setEntityHealth(20);
        p.hurtResistantTime = 0;
        return;
      }
      p.setPosition(0.5, 5 + p.yOffset, 0.5);
      for (const m of mobs) {
        if (rawTargets(m).includes(p) || targets(m, p)) targeted++;
        closest = Math.min(closest, m.getDistanceToEntity(p));
      }
      provoked ??= c.calm?.(mobs) ?? null;
    });
    if (creative) {
      check(`${c.name}: never targets a Creative attacker`, targeted === 0, `${targeted} ticks`);
      check(`${c.name}: never attacks a Creative attacker`, watch.hits === 0, `${watch.hits} hits`);
      // (On Normal the wither also spits skulls at random spots now and then: its heads are checked instead.)
      if (c.name !== 'WitherBoss') check(`${c.name}: never shoots at a Creative attacker`, projectilesBy(w, mobs).length === 0, `${projectilesBy(w, mobs).length}`);
      check(`${c.name}: not provoked`, provoked === null, String(provoked));
      // A chase ends next to the player; wandering mobs stay apart (start 2.5-14 blocks).
      if (!['Slime', 'LavaSlime', 'Creeper'].includes(c.name)) check(`${c.name}: does not come at the player`, closest > 1.4, `closest ${closest.toFixed(2)}, start ${start.map((d) => d.toFixed(1)).join('/')}`);
    } else if (c.survival) {
      const [ok, detail] = c.survival(mobs, p, w, watch);
      check(`${c.name}: goes after a Survival attacker`, ok, detail);
    }
  }
}

// /gamemode creative in the middle of a fight: every mob lets go at once and stays calm.
{
  const w = makeWorld();
  const p = addPlayer(w, false, 0.5, 0.5);
  const zombie = spawn<EntityLiving>(w, 'Zombie', 0.5, 5, 4.5);
  const skeleton = spawn<EntityLiving>(w, 'Skeleton', 6.5, 5, 0.5);
  const creeper = spawn<EntityLiving>(w, 'Creeper', -2.5, 5, 0.5);
  const spider = spawn<EntityLiving>(w, 'Spider', 0.5, 5, -5.5);
  const pig = spawn<EntityLiving>(w, 'PigZombie', 4.5, 5, 4.5);
  const wolf = spawn<EntityLiving>(w, 'Wolf', -4.5, 5, 4.5);
  const blaze = spawn<EntityLiving>(w, 'Blaze', -6.5, 5, -4.5);
  const ghast = spawn<EntityLiving>(w, 'Ghast', 0.5, 9, 16.5);
  const mobs = [zombie, skeleton, creeper, spider, pig, wolf, blaze, ghast];
  const watch = watchPlayer(p, () => mobs);
  for (const m of mobs) m.attackEntityFrom(DamageSource.causePlayerDamage(p), 1);
  let fighting = 0;
  tick(w, 30, () => {
    p.setEntityHealth(20);
    p.setPosition(0.5, 5 + p.yOffset, 0.5);
  });
  for (const m of mobs) if (targets(m, p)) fighting++;
  check('gamemode: mobs fight the survival player first', fighting >= 6, `${fighting} of ${mobs.length}`);
  const creeperFuse = (creeper as unknown as { getCreeperState(): number }).getCreeperState();
  p.setGameType(EnumGameType.CREATIVE);
  const shotsBefore = projectilesBy(w, mobs).length;
  const hitsBefore = watch.hits;
  let targeted = 0;
  let fuse = 0;
  tick(w, 100, () => {
    p.setPosition(0.5, 5 + p.yOffset, 0.5);
    for (const m of mobs) if (targets(m, p)) targeted++;
    if (!creeper.isDead && (creeper as unknown as { getCreeperState(): number }).getCreeperState() > 0) fuse++;
  });
  check('gamemode: no mob holds the player after the switch', targeted === 0, `${targeted} mob-ticks`);
  check('gamemode: no more attacks', watch.hits === hitsBefore, `${watch.hits - hitsBefore}`);
  check('gamemode: no more projectiles', projectilesBy(w, mobs).length <= shotsBefore, `${projectilesBy(w, mobs).length} vs ${shotsBefore}`);
  check('gamemode: the creeper fuse goes out', fuse === 0 && !creeper.isDead, `fuse ticks ${fuse} (was ${creeperFuse}), dead ${creeper.isDead}`);
  check('gamemode: the wolf calms down', !(wolf as unknown as { isAngry(): boolean }).isAngry());
  // Back to Survival: the mobs pick the player up again by the usual rules (sight, range).
  p.setGameType(EnumGameType.SURVIVAL);
  tick(w, 40, () => {
    p.setEntityHealth(20);
    p.setPosition(0.5, 5 + p.yOffset, 0.5);
  });
  check('gamemode: survival again, zombies and skeletons see the player again', targets(zombie, p) || targets(skeleton, p));
}

// The ender dragon never picks a Creative player for its flight target.
{
  const w = makeWorld();
  const p = addPlayer(w, true, 0.5, 0.5);
  const dragon = spawn<EntityLiving>(w, 'EnderDragon', 0.5, 40, 0.5);
  const d = dragon as unknown as { setNewTarget(): void; target: Entity | null };
  let picked = 0;
  for (let i = 0; i < 100; i++) {
    d.setNewTarget();
    if (d.target === p) picked++;
  }
  check('dragon never targets a Creative player', picked === 0, String(picked));
  const s = addPlayer(w, false, 4.5, 4.5);
  for (let i = 0; i < 100; i++) {
    d.setNewTarget();
    if (d.target === s) picked++;
  }
  check('dragon targets a Survival player', picked > 20, String(picked));
  d.target = s;
  s.setGameType(EnumGameType.CREATIVE);
  tick(w, 1);
  check('dragon drops a player who switched to Creative', d.target !== s);
}

report();
