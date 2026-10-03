import { Block } from '../../block/Block';
import type { Entity } from '../../entity/Entity';
import { EntityList } from '../../entity/EntityList';
import type { TagCompound } from '../../item/ItemStack';
import { Chunk } from '../Chunk';
import { ChunkSection } from '../ChunkSection';
import { TileEntity } from '../tileentity/TileEntity';
import type { World } from '../World';
import { NBT, NBTType } from './NBT';

/**
 * A chunk as an Anvil "Level" compound (AnvilChunkLoader.writeChunkToNBT / readChunkFromNBT):
 * xPos, zPos, LastUpdate, TerrainPopulated, HeightMap, Sections [{Y, Blocks, Data, BlockLight,
 * SkyLight}] with 4-bit arrays packed two to a byte (low nibble first), Biomes, Entities,
 * TileEntities and TileTicks.
 */

/** Packs one-value-per-byte nibbles (0-15) into NibbleArray layout. */
export function packNibbles(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length >> 1);
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = (src[i] & 15) | ((src[i + 1] & 15) << 4);
  return out;
}

/** The reverse of packNibbles; short arrays leave the rest 0. */
export function unpackNibbles(src: Uint8Array, out: Uint8Array): Uint8Array {
  const n = Math.min(src.length, out.length >> 1);
  for (let j = 0, i = 0; j < n; j++, i += 2) {
    const b = src[j];
    out[i] = b & 15;
    out[i + 1] = b >> 4;
  }
  return out;
}

/** The entities of a chunk that are saved with it (no players, nothing dead, riders carry their mounts). */
function saveEntities(chunk: Chunk): TagCompound[] {
  const list: TagCompound[] = [];
  for (const l of chunk.entityLists) {
    for (const e of l) {
      const t: TagCompound = {};
      try {
        if (e.addEntityID(t)) list.push(t);
      } catch (err) {
        console.warn('Could not save entity', EntityList.getDebugName(e), err);
      }
    }
  }
  return list;
}

/**
 * writeChunkToNBT: the root compound {Level: {...}} of a region chunk. The scheduled ticks come
 * from the world while the chunk is loaded, else from those it took along when it unloaded.
 */
export function writeChunkToNBT(chunk: Chunk, world: World): TagCompound {
  const level: TagCompound = {};
  NBT.setInteger(level, 'xPos', chunk.xPosition);
  NBT.setInteger(level, 'zPos', chunk.zPosition);
  NBT.setLong(level, 'LastUpdate', world.getTotalWorldTime());
  NBT.setIntArray(level, 'HeightMap', chunk.heightMap);
  NBT.setBoolean(level, 'TerrainPopulated', chunk.isTerrainPopulated);
  const sections: TagCompound[] = [];
  for (const s of chunk.sections) {
    if (!s) continue;
    const t: TagCompound = {};
    NBT.setByte(t, 'Y', (s.yBase >> 4) & 255);
    NBT.setByteArray(t, 'Blocks', s.blocks.slice());
    NBT.setByteArray(t, 'Data', packNibbles(s.meta));
    NBT.setByteArray(t, 'BlockLight', packNibbles(s.blockLight));
    NBT.setByteArray(t, 'SkyLight', world.provider.hasNoSky ? new Uint8Array(2048) : packNibbles(s.skyLight));
    sections.push(t);
  }
  NBT.setList(level, 'Sections', NBTType.Compound, sections);
  NBT.setByteArray(level, 'Biomes', chunk.biomes.slice());
  NBT.setList(level, 'Entities', NBTType.Compound, saveEntities(chunk));
  const tiles: TagCompound[] = [];
  for (const te of chunk.chunkTileEntityMap.values()) {
    if (te.isInvalid()) continue;
    const t: TagCompound = {};
    try {
      te.writeToNBT(t);
      tiles.push(t);
    } catch (err) {
      console.warn('Could not save tile entity', err);
    }
  }
  NBT.setList(level, 'TileEntities', NBTType.Compound, tiles);
  const now = world.getTotalWorldTime();
  const ticks: TagCompound[] = [];
  const tick = (id: number, x: number, y: number, z: number, delay: number, priority: number): void => {
    const t: TagCompound = {};
    NBT.setInteger(t, 'i', id);
    NBT.setInteger(t, 'x', x);
    NBT.setInteger(t, 'y', y);
    NBT.setInteger(t, 'z', z);
    NBT.setInteger(t, 't', delay);
    NBT.setInteger(t, 'p', priority);
    ticks.push(t);
  };
  if (chunk.isChunkLoaded) {
    for (const e of world.getPendingBlockUpdates(chunk.xPosition, chunk.zPosition)) tick(e.blockID, e.xCoord, e.yCoord, e.zCoord, e.scheduledTime - now, e.priority);
  }
  for (const p of chunk.pendingTicks) tick(p[3], p[0], p[1], p[2], p[4], p[6] ?? 0);
  if (ticks.length > 0) NBT.setList(level, 'TileTicks', NBTType.Compound, ticks);
  const root: TagCompound = {};
  NBT.setCompoundTag(root, 'Level', level);
  return root;
}

/**
 * checkedReadChunkFromNBT + readChunkFromNBT: a chunk from its saved root compound (not yet added
 * to the world), or null when the data has no level or sections. Unknown blocks become air,
 * unknown entities and tile entities are skipped; a chunk saved under other coordinates is
 * relocated.
 */
export function readChunkFromNBT(world: World, cx: number, cz: number, root: TagCompound): Chunk | null {
  if (!NBT.hasKey(root, 'Level')) {
    console.warn(`Chunk file at ${cx},${cz} is missing level data, skipping`);
    return null;
  }
  const level = NBT.getCompoundTag(root, 'Level');
  if (!NBT.hasKey(level, 'Sections')) {
    console.warn(`Chunk file at ${cx},${cz} is missing block data, skipping`);
    return null;
  }
  if (NBT.getInteger(level, 'xPos') !== cx || NBT.getInteger(level, 'zPos') !== cz) {
    console.warn(`Chunk file at ${cx},${cz} is in the wrong location; relocating.`);
  }
  const chunk = new Chunk(world, cx, cz);
  const hm = NBT.getIntArray(level, 'HeightMap');
  if (hm.length === 256) chunk.heightMap.set(hm);
  chunk.isTerrainPopulated = NBT.getBoolean(level, 'TerrainPopulated');
  for (const t of NBT.getCompoundList(level, 'Sections')) {
    const y = NBT.getByte(t, 'Y');
    if (y < 0 || y > 15) continue;
    const blocks = new Uint8Array(4096);
    blocks.set(NBT.getByteArray(t, 'Blocks').subarray(0, 4096));
    const add = NBT.hasKey(t, 'Add') ? NBT.getByteArray(t, 'Add') : null;
    for (let i = 0; i < 4096; i++) {
      const hi = add ? (add[i >> 1] >> ((i & 1) * 4)) & 15 : 0;
      // removeInvalidBlocks: ids without a block (or beyond 255) become air.
      if (hi !== 0 || (blocks[i] !== 0 && !Block.blocksList[blocks[i]])) blocks[i] = 0;
    }
    const meta = unpackNibbles(NBT.getByteArray(t, 'Data'), new Uint8Array(4096));
    const blockLight = unpackNibbles(NBT.getByteArray(t, 'BlockLight'), new Uint8Array(4096));
    const skyLight = unpackNibbles(NBT.getByteArray(t, 'SkyLight'), new Uint8Array(4096));
    chunk.sections[y] = new ChunkSection(y << 4, { blocks, meta, skyLight, blockLight });
  }
  let min = 2147483647;
  for (let i = 0; i < 256; i++) if (chunk.heightMap[i] < min) min = chunk.heightMap[i];
  chunk.heightMapMinimum = min;
  const biomes = NBT.getByteArray(level, 'Biomes');
  if (biomes.length === 256) chunk.biomes.set(biomes);
  for (const t of NBT.getCompoundList(level, 'Entities')) {
    const e = EntityList.createEntityFromNBT(t, world);
    chunk.hasEntities = true;
    if (!e) continue;
    chunk.addEntity(e);
    let rider: Entity = e;
    for (let r = t; NBT.hasKey(r, 'Riding'); r = NBT.getCompoundTag(r, 'Riding')) {
      const mount = EntityList.createEntityFromNBT(NBT.getCompoundTag(r, 'Riding'), world);
      if (!mount) break;
      chunk.addEntity(mount);
      rider.mountEntity(mount);
      rider = mount;
    }
  }
  for (const t of NBT.getCompoundList(level, 'TileEntities')) {
    let te: TileEntity | null = null;
    try {
      te = TileEntity.createAndLoadEntity(t);
    } catch (err) {
      console.warn('Skipping a tile entity that failed to load', err);
    }
    if (te) chunk.addTileEntity(te);
  }
  for (const t of NBT.getCompoundList(level, 'TileTicks')) {
    chunk.pendingTicks.push([NBT.getInteger(t, 'x'), NBT.getInteger(t, 'y'), NBT.getInteger(t, 'z'), NBT.getInteger(t, 'i'), NBT.getInteger(t, 't'), 1, NBT.getInteger(t, 'p')]);
  }
  chunk.isModified = false;
  chunk.playerModified = false;
  return chunk;
}
