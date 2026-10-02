import { FlatGeneratorInfo, type FlatLayerInfo } from '../world/gen/FlatGeneratorInfo';

/** String.hashCode */
function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * The iteration order of a java.util.HashMap<String, ?> as the Java 6/7 runtimes 1.5.2 shipped
 * with produced it (supplemental hash, 16 buckets, newest entry first in a bucket), so preset
 * strings come out like the original's ("stronghold,biome_1,village,...").
 */
export function javaHashMapOrder(keys: Iterable<string>): string[] {
  const list = [...keys];
  let capacity = 16;
  while (list.length > capacity * 0.75) capacity *= 2;
  const buckets: string[][] = [];
  for (const k of list) {
    let h = javaHash(k);
    h ^= (h >>> 20) ^ (h >>> 12);
    h = h ^ (h >>> 7) ^ (h >>> 4);
    const i = h & (capacity - 1);
    (buckets[i] ??= []).unshift(k);
  }
  const out: string[] = [];
  for (const b of buckets) if (b) out.push(...b);
  return out;
}

/** FlatLayerInfo.toString: "[NxID][:META]". */
function layerToString(l: FlatLayerInfo): string {
  let s = String(l.blockId);
  if (l.count > 1) s = l.count + 'x' + s;
  if (l.meta > 0) s = s + ':' + l.meta;
  return s;
}

/** FlatGeneratorInfo.toString: "2;layers;biome;features" (the format createFlatGeneratorFromString reads). */
export function flatGeneratorToString(info: FlatGeneratorInfo): string {
  let s = '2;' + info.flatLayers.map(layerToString).join(',') + ';' + info.biome;
  if (info.worldFeatures.size > 0) {
    s += ';';
    s += javaHashMapOrder(info.worldFeatures.keys())
      .map((name) => {
        const opts = info.worldFeatures.get(name)!;
        if (opts.size === 0) return name.toLowerCase();
        return name.toLowerCase() + '(' + javaHashMapOrder(opts.keys()).map((k) => k + '=' + opts.get(k)).join(' ') + ')';
      })
      .join(',');
  } else {
    s += ';';
  }
  return s;
}

/** A row of "Select a Preset" (GuiFlatPresetsItem). */
export interface FlatPreset {
  iconId: number;
  presetName: string;
  presetData: string;
}

/** [count, blockId] from the top layer down, as the presets are written. */
type Layers = [number, number][];

function preset(name: string, icon: number, biome: number, features: string[] | null, layers: Layers): FlatPreset {
  const info = new FlatGeneratorInfo();
  for (let i = layers.length - 1; i >= 0; i--) info.flatLayers.push({ count: layers[i][0], blockId: layers[i][1], meta: 0, minY: 0 });
  info.biome = biome;
  info.updateLayers();
  if (features) for (const f of features) info.worldFeatures.set(f, new Map());
  return { iconId: icon, presetName: name, presetData: flatGeneratorToString(info) };
}

// Block and item ids, and BiomeGenBase ids (plains 1, desert 2, extremeHills 3, icePlains 12).
const STONE = 1;
const GRASS = 2;
const DIRT = 3;
const COBBLESTONE = 4;
const BEDROCK = 7;
const WATER_MOVING = 8;
const WATER_STILL = 9;
const SAND = 12;
const SANDSTONE = 24;
const TALL_GRASS = 31;
const SNOW = 78;
const FEATHER = 288;
const REDSTONE = 331;

/** GuiFlatPresets' static list. */
export const FLAT_PRESETS: FlatPreset[] = [
  preset('Classic Flat', GRASS, 1, ['village'], [[1, GRASS], [2, DIRT], [1, BEDROCK]]),
  preset("Tunnelers' Dream", STONE, 3, ['biome_1', 'dungeon', 'decoration', 'stronghold', 'mineshaft'], [[1, GRASS], [5, DIRT], [230, STONE], [1, BEDROCK]]),
  preset('Water World', WATER_MOVING, 1, ['village', 'biome_1'], [[90, WATER_STILL], [5, SAND], [5, DIRT], [5, STONE], [1, BEDROCK]]),
  preset('Overworld', TALL_GRASS, 1, ['village', 'biome_1', 'decoration', 'stronghold', 'mineshaft', 'dungeon', 'lake', 'lava_lake'], [[1, GRASS], [3, DIRT], [59, STONE], [1, BEDROCK]]),
  preset('Snowy Kingdom', SNOW, 12, ['village', 'biome_1'], [[1, SNOW], [1, GRASS], [3, DIRT], [59, STONE], [1, BEDROCK]]),
  preset('Bottomless Pit', FEATHER, 1, ['village', 'biome_1'], [[1, GRASS], [3, DIRT], [2, COBBLESTONE]]),
  preset('Desert', SAND, 2, ['village', 'biome_1', 'decoration', 'stronghold', 'mineshaft', 'dungeon'], [[8, SAND], [52, SANDSTONE], [3, STONE], [1, BEDROCK]]),
  preset('Redstone Ready', REDSTONE, 2, null, [[52, SANDSTONE], [3, STONE], [1, BEDROCK]]),
];
