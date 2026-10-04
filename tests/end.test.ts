/**
 * The End: terrain against hashes of the real 1.5.2 ChunkProviderEnd.generateTerrain (SHA-256 of
 * the 24x24 chunks around the origin, computed with the original classes), the decorator's
 * spikes, crystals and dragon through the world-generation server.
 *
 *   node scripts/run-node-test.mjs tests/end.test.ts
 */
import '../src/block/Blocks';
import { createHash } from 'node:crypto';
import { BlockIds } from '../src/block/BlockIds';
import { JavaRandom } from '../src/core/JavaRandom';
import { ChunkProviderEnd } from '../src/world/gen/end/ChunkProviderEnd';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import { registerBlockItems } from '../src/item/Items';
import '../src/entity/Entities';
import { EntityList } from '../src/entity/EntityList';
import { EntityDragon } from '../src/entity/EntityDragon';
import { EntityEnderCrystal } from '../src/entity/EntityEnderCrystal';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { EntityXPOrb } from '../src/entity/EntityXPOrb';
import type { Entity } from '../src/entity/Entity';
import { DamageSource } from '../src/entity/DamageSource';
import { MathHelper } from '../src/core/MathHelper';
import { World, WorldInfo } from '../src/world/World';
import { chunkFromTerrain, toTerrainChunk } from '../src/world/gen/TerrainChunk';
import { conquerTheEnd } from '../src/client/WinGame';
import { EndPortalHooks } from '../src/block/EndPortalHooks';
import { Block } from '../src/block/Block';
import { ItemStack } from '../src/item/ItemStack';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { AchievementIds } from '../src/stats/StatIds';
import { check, report } from './harness';

registerBlockItems();

// ------------------------------------------------------------------ terrain
const GOLDEN: [bigint, string, number][] = [
  [123456789n, '6a256777ff45745959e10975e3e0f203e654887523a21408436b05c394b807fa', 1308662],
  [-4172144997902289642n, 'aa337f40bfa052d97e9f3447c0f2bd130aae902e1d2ee533b0051c2b525650c2', 960535],
];
for (const [seed, hash, solid] of GOLDEN) {
  const p = new ChunkProviderEnd(seed, new JavaRandom(1n));
  const h = createHash('sha256');
  let n = 0;
  for (let cx = -12; cx < 12; cx++) {
    for (let cz = -12; cz < 12; cz++) {
      const c = p.provideChunk(cx, cz);
      h.update(c.blocks);
      for (const b of c.blocks) if (b !== 0) n++;
      check(`biomes are Sky ${cx},${cz}`, c.biomes.every((b) => b === 9));
    }
  }
  const got = h.digest('hex');
  check(`end terrain seed ${seed}`, got === hash && n === solid, `${got} ${n}`);
}

// ------------------------------------------------------------------ decoration
{
  const server = new WorldGenServer({ seed: 123456789n, worldType: 'default', mapFeatures: true, dimension: 1, initialRadius: 0 });
  check('dimension 1 uses ChunkProviderEnd', server.provider instanceof ChunkProviderEnd);
  (server.provider as ChunkProviderEnd).populateRand.setSeed(42n);
  const crystals: { x: number; y: number; z: number }[] = [];
  let dragons = 0;
  const R = 6;
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      const payload = server.finalizeChunk(cx, cz);
      for (const e of payload.entities ?? []) {
        if (e.name === 'EnderCrystal') crystals.push(e);
        if (e.name === 'EnderDragon') {
          dragons++;
          check('dragon at 0,128,0', e.x === 0 && e.y === 128 && e.z === 0 && cx === 0 && cz === 0, JSON.stringify(e));
        }
      }
    }
  }
  check('one dragon', dragons === 1, String(dragons));
  check('some spikes', crystals.length >= 3, String(crystals.length));
  const w = server.world;
  for (const c of crystals) {
    const x = Math.floor(c.x);
    const z = Math.floor(c.z);
    // Bedrock under the crystal, an obsidian column of 6-37 below it standing on end stone.
    check(`bedrock under crystal ${x},${c.y},${z}`, w.getBlockId(x, c.y, z) === BlockIds.bedrock);
    let h = 0;
    while (w.getBlockId(x, c.y - 1 - h, z) === BlockIds.obsidian) h++;
    check(`spike height ${x},${z}`, h >= 6 && h <= 37, String(h));
    check(`spike on end stone ${x},${z}`, w.getBlockId(x, c.y - 1 - h, z) === BlockIds.whiteStone);
    // The disc: radius 1..4 with the r^2 + 1 rule.
    let r = 0;
    while (r < 6 && w.getBlockId(x + r + 1, c.y - 1, z) === BlockIds.obsidian) r++;
    check(`spike radius ${x},${z}`, r >= 1 && r <= 4, String(r));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const inside = dx * dx + dz * dz <= r * r + 1;
        if (inside !== (w.getBlockId(x + dx, c.y - 1, z + dz) === BlockIds.obsidian)) check(`spike disc ${x},${z} ${dx},${dz}`, false);
      }
    }
  }
}

// ------------------------------------------------------------------ the dragon
class TestPlayer extends EntityPlayer {}

/** A world holding the End island's terrain (-R..R chunks), without decoration. */
function endWorld(R = 7): World {
  const info = new WorldInfo();
  info.seed = 123456789n;
  const w = new World(info);
  w.provider.dimensionId = 1;
  w.difficultySetting = 2;
  const gen = new ChunkProviderEnd(info.seed, new JavaRandom(5n));
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      const c = chunkFromTerrain(w, toTerrainChunk(cx, cz, gen.provideChunk(cx, cz)));
      c.generateSkylightMap();
      w.addChunk(c);
    }
  }
  w.mobSpawner = null;
  return w;
}

function tickAll(w: World, n: number): void {
  for (let i = 0; i < n; i++) for (const e of [...w.loadedEntityList]) if (!e.isDead) w.updateEntity(e);
}

const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

{
  const w = endWorld();
  check('EnderDragon is registered as id 63', EntityList.createEntityByName('EnderDragon', w) instanceof EntityDragon);
  const d = new EntityDragon(w);
  d.setLocationAndAngles(0, 128, 0, 30, 0);
  w.spawnEntityInWorld(d);
  // Parts follow the dragon's ids, as in 1.5.2 (guests number them the same way).
  check('part ids follow the dragon', d.dragonPartArray.every((p, i) => p.entityId === d.entityId + 1 + i));
  check('dragon 16x8, no clip, immune to fire', d.width === 16 && d.height === 8 && d.noClip);
  w.updateEntity(d);
  // The layout of one tick with a level ring buffer (no pitch).
  const yaw = d.rotationYaw;
  const r = Math.fround((Math.fround(yaw * Math.fround(Math.PI))) / 180);
  const s = MathHelper.sin(r);
  const c = MathHelper.cos(r);
  const body = d.dragonPartBody;
  check('body ahead of the centre', near(body.posX, d.posX + Math.fround(s * 0.5)) && near(body.posZ, d.posZ - Math.fround(c * 0.5)) && near(body.posY, d.posY), `${body.posX} ${body.posZ}`);
  check('body 5x3', body.width === 5 && body.height === 3);
  check('wings 4.5 to the sides, 2 up', near(d.dragonPartWing1.posX, d.posX + c * 4.5) && near(d.dragonPartWing2.posZ, d.posZ - s * 4.5) && near(d.dragonPartWing1.posY, d.posY + 2));
  check('wing sizes 4x2 and 4x3', d.dragonPartWing1.height === 2 && d.dragonPartWing2.height === 3 && d.dragonPartWing1.width === 4);
  const hr = Math.fround(r - Math.fround(d['randomYawVelocity' as keyof EntityDragon] as number * Math.fround(0.01)));
  check('head 5.5 ahead', near(d.dragonPartHead.posX, d.posX + MathHelper.sin(hr) * 5.5, 1e-2) && near(d.dragonPartHead.posZ, d.posZ - MathHelper.cos(hr) * 5.5, 1e-2), `${d.dragonPartHead.posX - d.posX} ${d.dragonPartHead.posZ - d.posZ}`);
  check('head 3x3, tails 2x2', d.dragonPartHead.width === 3 && d.dragonPartTail3.width === 2);
  const t3 = d.dragonPartTail3;
  check('third tail piece 7.5 behind, 1.5 up', near(t3.posX, d.posX - (s * 1.5 + s * 6), 0.05) && near(t3.posZ, d.posZ + (c * 1.5 + c * 6), 0.05) && near(t3.posY, d.posY + 1.5, 0.05), `${t3.posX - d.posX} ${t3.posZ - d.posZ} ${t3.posY - d.posY}`);
  // Entity queries return the parts next to the dragon; the dragon itself cannot be hit.
  const found = w.getEntitiesWithinAABBExcludingEntity(null, d.boundingBox.expand(8, 8, 8));
  check('queries return all 7 parts', d.dragonPartArray.every((p) => found.includes(p)));
  check('dragon not collidable, parts are', !d.canBeCollidedWith() && d.dragonPartHead.canBeCollidedWith());
  check('part equals its dragon', d.dragonPartBody.isEntityEqual(d) && d.dragonPartBody.getMultiPartOwner() === d);

  // Damage: only players and explosions, a quarter (+1) away from the head.
  const p = new TestPlayer(w);
  p.setLocationAndAngles(d.posX, d.posY - 30, d.posZ, 0, 0);
  w.spawnEntityInWorld(p);
  const h0 = d.getHealth();
  d.attackEntityFrom(DamageSource.causePlayerDamage(p), 20);
  check('direct hits do nothing', d.getHealth() === h0);
  d.dragonPartBody.attackEntityFrom(DamageSource.generic, 20);
  check('non-player damage ignored', d.getHealth() === h0);
  d.dragonPartBody.attackEntityFrom(DamageSource.causePlayerDamage(p), 20);
  check('body takes 20/4+1 = 6', d.getHealth() === h0 - 6, String(h0 - d.getHealth()));
  d['hurtResistantTime' as keyof EntityDragon] = 0 as never;
  d.dragonPartHead.attackEntityFrom(DamageSource.setExplosionSource(null), 12);
  check('head takes explosions in full', d.getHealth() === h0 - 18, String(h0 - d.getHealth()));
  p.setDead();
  tickAll(w, 1);

  // Flight: 400 ticks without players stays over the island.
  let maxR = 0;
  let minY = 1000;
  for (let i = 0; i < 400; i++) {
    tickAll(w, 1);
    maxR = Math.max(maxR, Math.hypot(d.posX, d.posZ));
    minY = Math.min(minY, d.posY);
  }
  check('circles the island', maxR < 120 && maxR > 5 && minY > 20, `${maxR} ${minY}`);

  // Healing from a crystal within 32 blocks, 1 health per 10 ticks.
  const crystal = new EntityEnderCrystal(w, d.posX + 10, d.posY, d.posZ);
  w.spawnEntityInWorld(crystal);
  d.setEntityHealth(100);
  for (let i = 0; i < 60 && !d.healingEnderCrystal; i++) w.updateEntity(d);
  check('links to the nearest crystal', d.healingEnderCrystal === crystal);
  const before = d.getHealth();
  for (let i = 0; i < 40; i++) {
    crystal.setPosition(d.posX + 10, d.posY, d.posZ);
    w.updateEntity(d);
    if (d.healingEnderCrystal !== crystal) d.healingEnderCrystal = crystal;
  }
  check('heals 1 per 10 ticks', d.getHealth() - before === 4, String(d.getHealth() - before));
  crystal.setDead();
  d['hurtResistantTime' as keyof EntityDragon] = 0 as never;
  const hb = d.getHealth();
  w.updateEntity(d);
  check('a destroyed crystal costs 10 health', d.getHealth() === hb - 10 && d.healingEnderCrystal === null, String(hb - d.getHealth()));

  // Block destruction: stone in the body goes, obsidian stays and slows the dragon.
  const bx = Math.floor(d.dragonPartBody.posX);
  const by = Math.floor(d.dragonPartBody.posY) + 1;
  const bz = Math.floor(d.dragonPartBody.posZ);
  w.setBlock(bx, by, bz, BlockIds.stone);
  w.setBlock(bx + 1, by, bz, BlockIds.obsidian);
  d.motionX = d.motionY = d.motionZ = 0;
  w.updateEntity(d);
  const b2 = d.dragonPartBody.boundingBox;
  const inBody = (x: number, y: number, z: number) => x >= Math.floor(b2.minX) && x <= Math.floor(b2.maxX) && y >= Math.floor(b2.minY) && y <= Math.floor(b2.maxY) && z >= Math.floor(b2.minZ) && z <= Math.floor(b2.maxZ);
  if (inBody(bx, by, bz)) check('stone destroyed', w.getBlockId(bx, by, bz) === 0);
  if (inBody(bx + 1, by, bz)) check('obsidian kept and slows', w.getBlockId(bx + 1, by, bz) === BlockIds.obsidian && d.slowed);

  // Death: 200 ticks, 12000 experience, the exit portal with the egg.
  for (const e of [...w.loadedEntityList]) if (e instanceof EntityXPOrb) e.setDead();
  d.setPosition(3.5, 90, -2.5);
  d['hurtResistantTime' as keyof EntityDragon] = 0 as never;
  d.dragonPartHead.attackEntityFrom(DamageSource.setExplosionSource(null), 1000);
  check('dragon dying', d.getHealth() <= 0 && !d.isDead);
  let xp = 0;
  const seen = new Set<Entity>();
  for (let i = 0; i < 210 && !d.isDead; i++) {
    w.updateEntity(d);
    for (const e of w.loadedEntityList) if (e instanceof EntityXPOrb && !seen.has(e)) {
      seen.add(e);
      xp += (e as unknown as { xpValue: number }).xpValue;
    }
  }
  check('dead after 200 ticks', d.isDead && d.deathTicks === 200, String(d.deathTicks));
  check('12000 experience', xp === 12000, String(xp));
  const px = Math.floor(d.posX);
  const pz = Math.floor(d.posZ);
  check('egg on the pillar', w.getBlockId(px, 68, pz) === BlockIds.dragonEgg && w.getBlockId(px, 67, pz) === BlockIds.bedrock);
  check('torches', [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dz]) => w.getBlockId(px + dx, 66, pz + dz) === BlockIds.torchWood));
  let portals = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (w.getBlockId(px + dx, 64, pz + dz) === BlockIds.endPortal) portals++;
  check('end portal ring (20 blocks)', portals === 20, String(portals));
  check('bedrock rim and floor', w.getBlockId(px + 3, 64, pz) === BlockIds.bedrock && w.getBlockId(px + 2, 63, pz) === BlockIds.bedrock && w.getBlockId(px, 64, pz) === BlockIds.bedrock);
}

// ------------------------------------------------------------------ the exit portal
{
  const w = endWorld(2);
  const screens: unknown[] = [];
  const stats: number[] = [];
  class LocalPlayer extends EntityPlayer {
    readonly mc = { displayGuiScreen: (s: unknown) => screens.push(s) };
    override triggerAchievement(id: number): void {
      stats.push(id);
    }
  }
  const p = new LocalPlayer(w);
  p.setLocationAndAngles(0.5, 70, 0.5, 0, 0);
  w.spawnEntityInWorld(p);
  p.inventory.mainInventory[0] = new ItemStack(BlockIds.obsidian, 17, 0);
  p.experienceLevel = 30;
  check('exit portal hook installed', EndPortalHooks.enterExitPortal === conquerTheEnd);
  w.setBlock(0, 70, 0, BlockIds.endPortal);
  // The portal block itself would vanish in the End unless placed by the dragon's death.
  check('end portals vanish in the End unless the boss was defeated', w.getBlockId(0, 70, 0) === 0);
  Block.blocksList[BlockIds.endPortal]!.onEntityCollidedWithBlock(w, 0, 70, 0, p);
  Block.blocksList[BlockIds.endPortal]!.onEntityCollidedWithBlock(w, 0, 70, 0, p);
  check('conquered the End once', p.playerConqueredTheEnd && screens.length === 1 && (screens[0] as object).constructor.name === 'GuiWinGame', String(screens.length));
  check('The End. achievement', stats.includes(AchievementIds.theEnd2));
  const q = new LocalPlayer(w);
  PlayerSpawning.respawn(q, p, w);
  check('respawn keeps inventory and levels', q.inventory.mainInventory[0]?.stackSize === 17 && q.experienceLevel === 30 && !q.playerConqueredTheEnd);
  const o = new LocalPlayer(w);
  const overworld = new World(new WorldInfo());
  Block.blocksList[BlockIds.endPortal]!.onEntityCollidedWithBlock(overworld, 0, 70, 0, o);
  check('no credits from an overworld portal', !o.playerConqueredTheEnd);
}

report();
