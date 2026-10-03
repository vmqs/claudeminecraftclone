import type { TagCompound } from '../../item/ItemStack';
import { WorldInfo } from '../World';
import { NBT } from './NBT';

/** level.dat's "version" for Anvil worlds (SaveFormatOld / AnvilSaveConverter: 19133). */
export const ANVIL_VERSION = 19133;

const WORLD_TYPES = ['default', 'flat', 'largeBiomes', 'default_1_1'];

/** WorldType.parseWorldType (case-insensitive), "default" when unknown. */
function parseWorldType(name: string): string {
  const lower = name.toLowerCase();
  return WORLD_TYPES.find((t) => t.toLowerCase() === lower) ?? 'default';
}

/**
 * WorldInfo.updateTagCompound: the "Data" compound of level.dat, with the single player's tag
 * under "Player" (as the integrated server writes it). `sizeOnDisk` is the save's size in bytes.
 */
export function worldInfoToNBT(info: WorldInfo, player: TagCompound | null, sizeOnDisk = 0): TagCompound {
  const t: TagCompound = {};
  NBT.setLong(t, 'RandomSeed', info.seed);
  NBT.setString(t, 'generatorName', info.terrainType);
  NBT.setInteger(t, 'generatorVersion', info.terrainType === 'default' ? 1 : 0);
  NBT.setString(t, 'generatorOptions', info.generatorOptions);
  NBT.setInteger(t, 'GameType', info.gameType);
  NBT.setBoolean(t, 'MapFeatures', info.mapFeaturesEnabled);
  NBT.setInteger(t, 'SpawnX', info.spawnX);
  NBT.setInteger(t, 'SpawnY', info.spawnY);
  NBT.setInteger(t, 'SpawnZ', info.spawnZ);
  NBT.setLong(t, 'Time', info.totalTime);
  NBT.setLong(t, 'DayTime', info.worldTime);
  NBT.setLong(t, 'SizeOnDisk', sizeOnDisk);
  NBT.setLong(t, 'LastPlayed', info.lastTimePlayed);
  NBT.setString(t, 'LevelName', info.worldName);
  NBT.setInteger(t, 'version', ANVIL_VERSION);
  NBT.setInteger(t, 'rainTime', info.rainTime);
  NBT.setBoolean(t, 'raining', info.raining);
  NBT.setInteger(t, 'thunderTime', info.thunderTime);
  NBT.setBoolean(t, 'thundering', info.thundering);
  NBT.setBoolean(t, 'hardcore', info.hardcore);
  NBT.setBoolean(t, 'allowCommands', info.allowCommands);
  NBT.setBoolean(t, 'initialized', true);
  const rules: TagCompound = {};
  for (const [k, v] of Object.entries(info.gameRules)) NBT.setString(rules, k, v ? 'true' : 'false');
  NBT.setCompoundTag(t, 'GameRules', rules);
  // Not a 1.5.2 key (the original ignores it): lets regenerated spawn chunks keep the chest.
  if (info.bonusChest) NBT.setBoolean(t, 'BonusChest', true);
  if (player) NBT.setCompoundTag(t, 'Player', player);
  return t;
}

/** The level.dat root ({Data: ...}). */
export function levelDatRoot(data: TagCompound): TagCompound {
  const root: TagCompound = {};
  NBT.setCompoundTag(root, 'Data', data);
  return root;
}

/** new WorldInfo(NBTTagCompound): the world's settings, time and weather from level.dat's "Data". */
export function worldInfoFromNBT(t: TagCompound): WorldInfo {
  const info = new WorldInfo();
  info.seed = NBT.getLong(t, 'RandomSeed');
  if (NBT.hasKey(t, 'generatorName')) {
    let type = parseWorldType(NBT.getString(t, 'generatorName'));
    // A versioned "default" of generator version 0 (or none) is the 1.1 generator.
    if (type === 'default' && (NBT.hasKey(t, 'generatorVersion') ? NBT.getInteger(t, 'generatorVersion') : 0) === 0) type = 'default_1_1';
    info.terrainType = type;
    if (NBT.hasKey(t, 'generatorOptions')) info.generatorOptions = NBT.getString(t, 'generatorOptions');
  }
  const gameType = NBT.getInteger(t, 'GameType');
  info.gameType = gameType >= 0 && gameType <= 2 ? gameType : 0;
  info.mapFeaturesEnabled = NBT.hasKey(t, 'MapFeatures') ? NBT.getBoolean(t, 'MapFeatures') : true;
  info.spawnX = NBT.getInteger(t, 'SpawnX');
  info.spawnY = NBT.getInteger(t, 'SpawnY');
  info.spawnZ = NBT.getInteger(t, 'SpawnZ');
  info.totalTime = Number(NBT.getLong(t, 'Time'));
  info.worldTime = NBT.hasKey(t, 'DayTime') ? Number(NBT.getLong(t, 'DayTime')) : info.totalTime;
  info.lastTimePlayed = Number(NBT.getLong(t, 'LastPlayed'));
  info.worldName = NBT.getString(t, 'LevelName');
  info.rainTime = NBT.getInteger(t, 'rainTime');
  info.raining = NBT.getBoolean(t, 'raining');
  info.thunderTime = NBT.getInteger(t, 'thunderTime');
  info.thundering = NBT.getBoolean(t, 'thundering');
  info.hardcore = NBT.getBoolean(t, 'hardcore');
  info.allowCommands = NBT.hasKey(t, 'allowCommands') ? NBT.getBoolean(t, 'allowCommands') : info.gameType === 1;
  info.bonusChest = NBT.getBoolean(t, 'BonusChest');
  if (NBT.hasKey(t, 'GameRules')) {
    const rules = NBT.getCompoundTag(t, 'GameRules');
    for (const k of Object.keys(rules)) info.gameRules[k] = NBT.getString(rules, k).toLowerCase() === 'true';
  }
  return info;
}

/** The single player's tag in level.dat, or null. */
export function playerTagOf(t: TagCompound): TagCompound | null {
  return NBT.hasKey(t, 'Player') ? NBT.getCompoundTag(t, 'Player') : null;
}
