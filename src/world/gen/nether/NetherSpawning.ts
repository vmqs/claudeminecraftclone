import { Biomes } from '../../biome/BiomeGenBase';
import { EnumCreatureType } from '../../biome/SpawnListEntry';
import { PossibleCreatures } from '../../PossibleCreatures';
import { SingleBiomeSource } from '../ChunkProviderFlat';
import { MapGenNetherBridge } from './MapGenNetherBridge';

/**
 * ChunkProviderHell.getPossibleCreatures for the world that runs the mob spawner (the main
 * thread): monsters inside a fortress piece come from the fortress list (blazes, zombie pigmen,
 * skeletons, magma cubes), everything else from the Hell biome. The fortress layouts are
 * recomputed here from the seed (they are a pure function of it) and kept per seed.
 */
let seed: bigint | null = null;
let bridges: MapGenNetherBridge | null = null;
const biomeSource = new SingleBiomeSource(Biomes.hell);

PossibleCreatures.register(-1, (w, type, x, y, z) => {
  if (type !== EnumCreatureType.monster) return null;
  const s = w.getSeed();
  if (!bridges || seed !== s) {
    bridges = new MapGenNetherBridge();
    seed = s;
  }
  return bridges.isInFortress({ seed: s, biomeSource }, x, y, z) ? bridges.spawnList : null;
});
