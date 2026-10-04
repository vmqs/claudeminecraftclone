/**
 * The Nether and the End: provider rules, world generation per dimension, the Teleporter
 * (existing portal search, portal creation, the End platform), coordinate scaling and travel,
 * and the DIM-1 / DIM1 save layout.
 *   node scripts/run-node-test.mjs tests/dimensions.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import '../src/entity/ItemHooksInstall';
import '../src/world/tileentity/TileEntities';
import { unzipSync } from 'fflate';
import { BlockIds as B } from '../src/block/BlockIds';
import { Entity } from '../src/entity/Entity';
import { EntityItem } from '../src/entity/EntityItem';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { registerBlockItems } from '../src/item/Items';
import '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { Chunk } from '../src/world/Chunk';
import { fakeProvider } from './fakeDimensions';
import { DimensionManager } from '../src/world/DimensionManager';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import { MemoryBackend } from '../src/world/storage/SaveBackend';
import { SaveFormat } from '../src/world/storage/SaveFormat';
import { exportWorld, importWorld } from '../src/world/storage/WorldTransfer';
import { Teleporter } from '../src/world/Teleporter';
import { World, WorldInfo } from '../src/world/World';
import { getProviderForDimension } from '../src/world/WorldProviders';
import { check, report } from './harness';

registerBlockItems();
const f = Math.fround;

// ---------------------------------------------------------------- providers
{
  const hell = getProviderForDimension(-1)!;
  const end = getProviderForDimension(1)!;
  const surface = getProviderForDimension(0)!;
  check('hell flags', hell.isHellWorld && hell.hasNoSky && hell.dimensionId === -1 && !hell.isSurfaceWorld() && !hell.canRespawnHere());
  check('hell light table min 0.1', hell.lightBrightnessTable[0] === f(0.1), String(hell.lightBrightnessTable[0]));
  check('hell light table max 1', Math.abs(hell.lightBrightnessTable[15] - 1) < 1e-6);
  const fog = hell.getFogColor(0.5, 0);
  check('hell fog', fog.xCoord === f(0.2) && fog.yCoord === f(0.03) && fog.zCoord === f(0.03));
  check('hell celestial angle', hell.calculateCelestialAngle(1234, 0.5) === 0.5);
  check('hell xz fog', hell.doesXZShowFog(0, 0) && end.doesXZShowFog(5, 5) && !surface.doesXZShowFog(0, 0));
  check('end flags', end.hasNoSky && !end.isHellWorld && end.dimensionId === 1 && !end.isSurfaceWorld() && !end.canRespawnHere() && !end.isSkyColored());
  check('end celestial angle', end.calculateCelestialAngle(6000, 0) === 0 && end.calcSunriseSunsetColors(0, 0) === null);
  const ef = end.getFogColor(0, 0);
  check('end fog', ef.xCoord === f(f(160 / 255) * f(0.15)) && ef.yCoord === f(f(128 / 255) * f(0.15)), `${ef.xCoord} ${ef.yCoord} ${ef.zCoord}`);
  const e = end.getEntrancePortalLocation()!;
  check('end entrance', e.x === 100 && e.y === 50 && e.z === 0);
  check('end cloud height', end.getCloudHeight() === 8 && end.getAverageGroundLevel() === 50);
  check('surface', surface.isSurfaceWorld() && surface.canRespawnHere() && surface.getEntrancePortalLocation() === null);
  check('unknown dimension', getProviderForDimension(7) === null);
  const info = new WorldInfo();
  const nether = new World(info, getProviderForDimension(-1)!);
  const over = new World(info, getProviderForDimension(0)!);
  check('actual height', nether.getActualHeight() === 128 && over.getActualHeight() === 256);
  info.gameRules.doMobSpawning = false;
  const t0 = info.worldTime;
  nether.tick();
  check('derived world does not move the clock', info.worldTime === t0);
  over.tick();
  check('overworld moves the clock', info.worldTime === t0 + 1);
}

// ---------------------------------------------------------------- generation per dimension
{
  const gen = new WorldGenServer({ seed: 42n, worldType: 'default', mapFeatures: true, dimension: -1 });
  const p = gen.finalizeChunk(0, 0);
  check('nether chunk biome is hell', p.biomes.every((b) => b === 8));
  let sky = 0;
  for (const s of p.sections) for (const v of s.skyLight) sky += v;
  check('nether chunk has no sky light', sky === 0, String(sky));
  const s0 = p.sections.find((s) => s.y === 0)!;
  // The real ChunkProviderHell (NetherRegistration): bedrock at y 0, a ragged bedrock floor above it.
  check('nether chunk has bedrock and netherrack', s0.blocks[0] === B.bedrock && s0.blocks.some((b) => b === B.netherrack));
  check('nether world provider', gen.world.provider.hasNoSky && gen.world.provider.isHellWorld && gen.world.provider.dimensionId === -1);
  const endGen = new WorldGenServer({ seed: 42n, worldType: 'default', mapFeatures: true, dimension: 1 });
  const ep = endGen.finalizeChunk(0, 0);
  check('end chunk biome is sky', ep.biomes.every((b) => b === 9));
  let endSky = 0;
  let stone = 0;
  for (const s of ep.sections) {
    for (const v of s.skyLight) endSky += v;
    for (const b of s.blocks) if (b === B.whiteStone) stone++;
  }
  check('end chunk has no sky light', endSky === 0);
  check('end chunk has end stone', stone > 0);
  const over = new WorldGenServer({ seed: 42n, worldType: 'default', mapFeatures: true });
  const op = over.finalizeChunk(0, 0);
  let overSky = 0;
  for (const s of op.sections) for (const v of s.skyLight) overSky += v;
  check('overworld chunk keeps its sky light', overSky > 0);
}

// ---------------------------------------------------------------- Teleporter

/** A world of `dim` with chunks -r..r around (0, 0), a solid floor of `floor` up to y `top`. */
function flatWorld(dim: number, r: number, floor: number, top: number, info = new WorldInfo()): World {
  info.gameRules.doMobSpawning = false;
  const w = new World(info, getProviderForDimension(dim)!);
  for (let cx = -r; cx <= r; cx++) {
    for (let cz = -r; cz <= r; cz++) {
      const c = new Chunk(w, cx, cz);
      w.addChunk(c);
    }
  }
  for (let x = -r * 16; x < r * 16 + 16; x++) for (let z = -r * 16; z < r * 16 + 16; z++) for (let y = 1; y <= top; y++) w.setBlock(x, y, z, floor, 0, 2);
  return w;
}

/** Whether the entity's box overlaps a portal block (BlockPortal.onEntityCollidedWithBlock would run). */
function touchesPortal(w: World, e: Entity): boolean {
  const b = e.boundingBox;
  for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++) for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY); y++) for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ); z++) if (w.getBlockId(x, y, z) === B.portal) return true;
  return false;
}

function countBlocks(w: World, id: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (w.getBlockId(x, y, z) === id) n++;
  return n;
}

{
  // A new portal on flat netherrack: frame and portal next to the arrival point, the entity inside.
  const info = new WorldInfo();
  info.seed = 1234n;
  const w = flatWorld(-1, 3, B.netherrack, 40, info);
  const e = new EntityItem(w, 8.5, 41, 8.5, new ItemStack(B.stone, 1, 0));
  const t = new Teleporter(w);
  t.placeInPortal(e, 64, 70, 64, 0);
  const portals = countBlocks(w, B.portal, -10, 30, -10, 30, 60, 30);
  const obsidian = countBlocks(w, B.obsidian, -10, 30, -10, 30, 60, 30);
  check('makePortal: 6 portal blocks', portals === 6, String(portals));
  check('makePortal: 14 frame blocks (corners included)', obsidian === 14, String(obsidian));
  check('placed in the new portal', touchesPortal(w, e), `${e.posX} ${e.posY} ${e.posZ}`);
  check('portal stands on the floor', countBlocks(w, B.portal, -10, 41, -10, 30, 41, 30) === 2 && Math.floor(e.posY) === 41, String(e.posY));

  // The same arrival column finds it again (cached) and another one nearby searches and finds it.
  const e2 = new EntityItem(w, 30.5, 41, -20.5, new ItemStack(B.stone, 1, 0));
  const found = t.placeInExistingPortal(e2, 0, 0, 0, 0);
  check('existing portal found within 128 blocks', found && touchesPortal(w, e2), `${e2.posX} ${e2.posZ}`);
  const before = countBlocks(w, B.portal, -48, 30, -48, 63, 60, 63);
  t.placeInPortal(new EntityItem(w, -30.5, 41, 40.5, new ItemStack(B.stone, 1, 0)), 0, 0, 0, 0);
  check('no second portal when one is in range', countBlocks(w, B.portal, -48, 30, -48, 63, 60, 63) === before);

  // Nothing solid to stand on: a floating portal on an obsidian ledge at y 70 or above.
  const air = flatWorld(-1, 2, B.netherrack, 0, info);
  const e3 = new EntityItem(air, 4.5, 20, 4.5, new ItemStack(B.stone, 1, 0));
  new Teleporter(air).placeInPortal(e3, 0, 0, 0, 0);
  check('floating portal at y 70', Math.floor(e3.posY) === 70 && touchesPortal(air, e3), String(e3.posY));
  check('floating portal ledge: 3x2 under the portal plus the frame', countBlocks(air, B.obsidian, -20, 69, -20, 30, 69, 30) === 8, String(countBlocks(air, B.obsidian, -20, 69, -20, 30, 69, 30)));

  // Motion and yaw turn with the portal: entering south (dir 0) a portal along x keeps them.
  const w4 = flatWorld(0, 2, B.stone, 63, info);
  for (let x = 0; x < 4; x++) for (let y = 64; y < 69; y++) w4.setBlock(x, y, 0, x === 0 || x === 3 || y === 64 || y === 68 ? B.obsidian : B.portal, 0, 2);
  const e4 = new EntityItem(w4, 20.5, 64, 20.5, new ItemStack(B.stone, 1, 0));
  e4.motionX = 0.1;
  e4.motionZ = 0;
  new Teleporter(w4).placeInExistingPortal(e4, 0, 0, 0, 45);
  check('arrives in front of the portal', Math.abs(e4.posZ - 0.5) <= 1.5 && e4.posX >= 1 && e4.posX <= 3, `${e4.posX} ${e4.posY} ${e4.posZ}`);
  check('arrival height is the portal bottom', e4.posY === 65.5 + e4.yOffset, String(e4.posY));
}

{
  // The End: the 5x5 obsidian platform at y 48 and air above it, the player standing on it.
  const info = new WorldInfo();
  const w = new World(info, getProviderForDimension(1)!);
  for (let cx = 4; cx <= 8; cx++) for (let cz = -2; cz <= 2; cz++) w.addChunk(new Chunk(w, cx, cz));
  for (let x = 95; x <= 105; x++) for (let z = -5; z <= 5; z++) for (let y = 45; y <= 55; y++) w.setBlock(x, y, z, B.whiteStone, 0, 2);
  const p = new EntityPlayer(w, 'Steve');
  p.setLocationAndAngles(100, 50, 0, 90, 0);
  new Teleporter(w).placeInPortal(p, 0, 0, 0, 0);
  check('end platform obsidian', countBlocks(w, B.obsidian, 98, 48, -2, 102, 48, 2) === 25);
  check('end platform air above', countBlocks(w, 0, 98, 49, -2, 102, 51, 2) === 75);
  check('end platform keeps the ground around', w.getBlockId(97, 48, 0) === B.whiteStone && w.getBlockId(100, 52, 0) === B.whiteStone);
  check('player on the platform', p.posX === 100 && p.posZ === 0 && p.boundingBox.minY === 49 && p.rotationYaw === 90 && p.rotationPitch === 0, `${p.posX} ${p.boundingBox.minY} ${p.posZ}`);
}

// ---------------------------------------------------------------- travel

{
  const info = new WorldInfo();
  info.seed = 99n;
  info.gameRules.doMobSpawning = false;
  const over = new World(info);
  const mgr = new DimensionManager(info, over, null);
  mgr.providerFactory = fakeProvider;
  mgr.load(0);
  mgr.tickChunkLoading(0, { x: 800, z: -160, radius: 2 });
  check('overworld chunks loaded', over.chunkExists(50, -10));

  // Coordinate scaling (transferEntityToWorld).
  const p = new EntityPlayer(over, 'Steve');
  p.setLocationAndAngles(803.7, 70, -161.2, 10, 20);
  const toNether = mgr.arrivalPoint(p, 0, -1);
  check('into the Nether: x/8, z/8, truncated', toNether.x === 100 && toNether.z === -20 && toNether.y === 70 && toNether.place && !toNether.entrance, JSON.stringify(toNether));
  p.setLocationAndAngles(-12.6, 40, 7.9, 0, 0);
  const toOver = mgr.arrivalPoint(p, -1, 0);
  check('out of the Nether: x*8, z*8', toOver.x === -100 && toOver.z === 63, JSON.stringify(toOver));
  const toEnd = mgr.arrivalPoint(p, 0, 1);
  check('into the End: the entrance (100, 50, 0), yaw 90', toEnd.x === 100 && toEnd.y === 50 && toEnd.z === 0 && toEnd.yaw === 90 && toEnd.entrance, JSON.stringify(toEnd));
  p.setLocationAndAngles(5e7, 40, -5e7, 0, 0);
  const far = mgr.arrivalPoint(p, -1, 0);
  check('clamped to the world border', far.x === 29999872 && far.z === -29999872);

  // An item thrown into a portal arrives in the Nether next to a new portal.
  Entity.dimensionTravel = (e, dim) => mgr.transferEntity(e, dim);
  const item = new EntityItem(over, 800.5, 5, -160.5, new ItemStack(B.cobblestone, 3, 0));
  over.spawnEntityInWorld(item);
  item.travelToDimension(-1);
  check('the item left the overworld', item.isDead && mgr.pendingTransfers === 1);
  for (let i = 0; i < 3 && mgr.pendingTransfers > 0; i++) mgr.tickChunkLoading(0, { x: 800, z: -160, radius: 2 });
  const nether = mgr.getWorld(-1)!;
  const arrived = nether.loadedEntityList.find((e) => e instanceof EntityItem) as EntityItem | undefined;
  check('the item arrived in the Nether', !!arrived && mgr.pendingTransfers === 0, String(mgr.pendingTransfers));
  check('its stack came along', arrived?.getEntityItem().itemID === B.cobblestone && arrived?.getEntityItem().stackSize === 3);
  check('it stands in a portal', !!arrived && touchesPortal(nether, arrived), arrived ? `${arrived.posX} ${arrived.posY} ${arrived.posZ}` : '');
  check('the copy has the portal cooldown', (arrived?.timeUntilPortal ?? 0) === 0 || arrived!.timeUntilPortal > 0);
  check('nether world shares the clock', nether.worldInfo === info && nether.derivedInfo);
  // With nothing there for a while, the Nether is unloaded (the overworld stays for the clock).
  for (let i = 0; i < 101; i++) mgr.tickChunkLoading(0, { x: 800, z: -160, radius: 2 });
  check('idle Nether unloaded', mgr.getWorld(-1) === null && mgr.getWorld(0) === over);
  Entity.dimensionTravel = null;
}

{
  // Portal timer: a Survival player needs 80 ticks in a portal (then 10 ticks of cooldown), a
  // Creative one goes at once; leaving the portal drains the counter by 4 a tick.
  const info = new WorldInfo();
  const w = flatWorld(0, 1, B.stone, 3, info);
  const trips: number[] = [];
  Entity.dimensionTravel = (_e, dim) => trips.push(dim);
  const p = new EntityPlayer(w, 'Steve');
  p.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  let ticks = 0;
  while (trips.length === 0 && ticks < 200) {
    p.setInPortal();
    p.onEntityUpdate();
    ticks++;
  }
  check('survival player travels after 81 ticks in a portal', trips[0] === -1 && ticks === 81, `${ticks} ${trips}`);
  check('then a cooldown of 10 ticks', p.timeUntilPortal === 9, String(p.timeUntilPortal));
  const c = new EntityPlayer(w, 'Alex');
  c.capabilities.disableDamage = true;
  c.setInPortal();
  c.onEntityUpdate();
  check('creative player travels at once', trips.length === 2);
  const m = new EntityItem(w, 0.5, 4, 0.5, new ItemStack(B.stone, 1, 0));
  m.timeUntilPortal = 5;
  m.setInPortal();
  check('cooldown restarts while in a portal', m.timeUntilPortal === 900);
  Entity.dimensionTravel = null;
}

// ---------------------------------------------------------------- saving

await (async () => {
  const backend = new MemoryBackend();
  const format = new SaveFormat(backend);
  const h = format.createWorld('Dims');
  const info = new WorldInfo();
  info.worldName = 'Dims';
  const nether = flatWorld(-1, 0, B.netherrack, 5, info);
  const end = flatWorld(1, 0, B.whiteStone, 5, info);
  const over = flatWorld(0, 0, B.stone, 5, info);
  await h.loadDimension(-1);
  await h.loadDimension(1);
  h.saveChunks(nether);
  h.saveChunks(end);
  h.saveChunks(over);
  check('dimension chunks queued apart', h.hasChunk(0, 0, -1) && h.hasChunk(0, 0, 1) && h.hasChunk(0, 0, 0) && !h.hasChunk(1, 0, -1));
  await h.flush();
  await h.saveLevel(info, null);
  check('nether chunk in DIM-1', (await backend.chunkPositions('Dims/DIM-1')).length === 1);
  check('end chunk in DIM1', (await backend.chunkPositions('Dims/DIM1')).length === 1);
  check('overworld chunk in the folder', (await backend.chunkPositions('Dims')).length === 1);
  const back = await h.loadChunk(new World(info, getProviderForDimension(-1)!), 0, 0);
  check('nether chunk reads back', back?.getBlockID(3, 2, 3) === B.netherrack);
  // Another session sees the dimension's chunks after loadDimension.
  await format.ensureLoaded();
  const opened = await new SaveFormat(backend).openWorld('Dims');
  check('dimension positions unknown before loading them', !opened.handler.hasChunk(0, 0, -1));
  await opened.handler.loadDimension(-1);
  check('dimension positions after loading them', opened.handler.hasChunk(0, 0, -1) && opened.handler.isDimensionLoaded(-1));
  // Export and import keep DIM-1/region and DIM1/region.
  const zip = await exportWorld(format, 'Dims');
  const names = Object.keys(unzipSync(zip));
  check('export has DIM-1 and DIM1 regions', names.includes('Dims/DIM-1/region/r.0.0.mca') && names.includes('Dims/DIM1/region/r.0.0.mca') && names.includes('Dims/region/r.0.0.mca'), names.join(','));
  const r = await importWorld(format, zip, 'Dims.zip');
  check('import counts every dimension', r.chunks === 3, String(r.chunks));
  check('import restores DIM-1', (await backend.chunkPositions(`${r.folder}/DIM-1`)).length === 1);
  await format.deleteWorldDirectory(r.folder);
  check('delete removes the dimensions too', (await backend.chunkPositions(`${r.folder}/DIM-1`)).length === 0 && (await backend.chunkPositions(`${r.folder}/DIM1`)).length === 0);
  // The player's Dimension tag.
  const p = new EntityPlayer(nether, 'Steve');
  const tag = {};
  p.writeToNBT(tag);
  check('player Dimension tag', (tag as { Dimension?: number }).Dimension === -1);
})();

report();
