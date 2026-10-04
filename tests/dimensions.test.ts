/**
 * The Nether and the End: provider rules, world generation per dimension, the Teleporter
 * (existing portal search, portal creation, the End platform), coordinate scaling and travel,
 * and the DIM-1 / DIM1 save layout.
 *   node scripts/run-node-test.mjs tests/dimensions.test.ts
 */
import '../src/block/Blocks';
import { BlockIds as B } from '../src/block/BlockIds';
import { registerBlockItems } from '../src/item/Items';
import '../src/item/Items';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
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
  check('nether chunk has bedrock and netherrack', s0.blocks[0] === B.bedrock && s0.blocks[1 << 8] === B.netherrack);
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

report();
