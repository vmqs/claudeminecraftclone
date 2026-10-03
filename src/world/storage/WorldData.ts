import { getScoreboard, Scoreboard } from '../../command/scoreboard/Scoreboard';
import { MapData, mapStorageOf } from '../../item/ItemMap';
import type { TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import type { World } from '../World';
import { scoreboardFromNBT, scoreboardToNBT } from './ScoreboardData';
import { NBT, readCompressedNBT, readNBT, writeCompressedNBT, writeNBT } from './NBT';

/**
 * The save folder's data/ files (MapStorage): filled maps as data/map_<n>.dat (gzip NBT
 * {data: {dimension, xCenter, zCenter, scale, width, height, colors}}) and data/idcounts.dat
 * (uncompressed NBT of short counters, {map: n}), the villages as data/villages.dat and the
 * scoreboard as data/scoreboard.dat.
 * They are read when a world opens (map items look their data up synchronously) and written with
 * level.dat when they changed.
 */

/** MapData.writeToNBT. */
export function mapDataToNBT(m: MapData): TagCompound {
  const t: TagCompound = {};
  NBT.setByte(t, 'dimension', m.dimension);
  NBT.setInteger(t, 'xCenter', m.xCenter);
  NBT.setInteger(t, 'zCenter', m.zCenter);
  NBT.setByte(t, 'scale', m.scale);
  NBT.setShort(t, 'width', 128);
  NBT.setShort(t, 'height', 128);
  NBT.setByteArray(t, 'colors', m.colors);
  return t;
}

/** MapData.readFromNBT (smaller maps are centred, scale clamped to 0..4). */
export function mapDataFromNBT(name: string, t: TagCompound): MapData {
  const m = new MapData(name);
  m.dimension = NBT.getByte(t, 'dimension');
  m.xCenter = NBT.getInteger(t, 'xCenter');
  m.zCenter = NBT.getInteger(t, 'zCenter');
  m.scale = Math.max(0, Math.min(4, NBT.getByte(t, 'scale')));
  const w = NBT.getShort(t, 'width');
  const h = NBT.getShort(t, 'height');
  const colors = NBT.getByteArray(t, 'colors');
  if (w === 128 && h === 128) m.colors.set(colors.subarray(0, 16384));
  else if (w > 0 && h > 0 && w <= 128 && h <= 128) {
    const ox = (128 - w) >> 1;
    const oz = (128 - h) >> 1;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) m.colors[x + ox + (z + oz) * 128] = colors[x + z * w] ?? 0;
  }
  m.markDirty();
  return m;
}

/** What was last written, so only changed maps are saved again. */
const savedVersions = new WeakMap<MapData, number>();
const savedIds = new WeakMap<object, string>();
const savedBoards = new WeakMap<object, string>();
const savedVillages = new WeakMap<object, string>();

function hexOf(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Puts the saved maps and id counters into a world before it runs. */
export function installWorldData(w: IWorld, files: Map<string, Uint8Array>): void {
  const s = mapStorageOf(w);
  for (const [path, bytes] of files) {
    try {
      if (path === 'data/villages.dat') {
        const villages = (w as World).villageCollectionObj;
        villages.readFromNBT(NBT.getCompoundTag(readCompressedNBT(bytes), 'data'));
        const t: TagCompound = {};
        villages.writeToNBT(t);
        savedVillages.set(w, hexOf(writeNBT(t)));
        continue;
      }
      if (path === 'data/scoreboard.dat') {
        const board = getScoreboard(w as World);
        scoreboardFromNBT(board, NBT.getCompoundTag(readCompressedNBT(bytes), 'data'));
        savedBoards.set(w, hexOf(writeNBT(scoreboardToNBT(board))));
        continue;
      }
      if (path === 'data/idcounts.dat') {
        const t = readNBT(bytes);
        for (const k of Object.keys(t)) s.ids.set(k, NBT.getShort(t, k));
        savedIds.set(w, idsKey(s.ids));
        continue;
      }
      const m = /^data\/(map_-?\d+)\.dat$/.exec(path);
      if (!m) continue;
      const data = mapDataFromNBT(m[1], NBT.getCompoundTag(readCompressedNBT(bytes), 'data'));
      s.data.set(m[1], data);
      savedVersions.set(data, data.version);
    } catch (e) {
      console.warn(`Unreadable ${path}`, e);
    }
  }
}

function idsKey(ids: Map<string, number>): string {
  return JSON.stringify([...ids.entries()].sort());
}

/** saveAllData: the files of maps changed since they were written, and idcounts when it changed. */
export function collectWorldData(w: IWorld): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const s = mapStorageOf(w);
  for (const [name, m] of s.data) {
    if (savedVersions.get(m) === m.version) continue;
    const root: TagCompound = {};
    NBT.setCompoundTag(root, 'data', mapDataToNBT(m));
    out.set(`data/${name}.dat`, writeCompressedNBT(root));
    savedVersions.set(m, m.version);
  }
  const board = writeNBT(scoreboardToNBT(getScoreboard(w as World)));
  const boardKey = hexOf(board);
  // Like ScoreboardSaveData, nothing is written until the scoreboard changed.
  if (!savedBoards.has(w)) savedBoards.set(w, hexOf(writeNBT(scoreboardToNBT(new Scoreboard()))));
  if (savedBoards.get(w) !== boardKey) {
    const root: TagCompound = {};
    NBT.setCompoundTag(root, 'data', readNBT(board));
    out.set('data/scoreboard.dat', writeCompressedNBT(root));
    savedBoards.set(w, boardKey);
  }
  // villages.dat whenever it changed (VillageCollection marks itself dirty every 400 ticks, so
  // 1.5.2 rewrites it on most saves).
  const vt: TagCompound = {};
  (w as World).villageCollectionObj.writeToNBT(vt);
  const villages = writeNBT(vt);
  const vKey = hexOf(villages);
  if (savedVillages.get(w) !== vKey) {
    const root: TagCompound = {};
    NBT.setCompoundTag(root, 'data', readNBT(villages));
    out.set('data/villages.dat', writeCompressedNBT(root));
    savedVillages.set(w, vKey);
  }
  const key = idsKey(s.ids);
  if (s.ids.size > 0 && savedIds.get(w) !== key) {
    const t: TagCompound = {};
    for (const [k, v] of s.ids) NBT.setShort(t, k, v);
    out.set('data/idcounts.dat', writeNBT(t));
    savedIds.set(w, key);
  }
  return out;
}
