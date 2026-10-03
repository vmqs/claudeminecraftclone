/**
 * World saving: the NBT codec (types, modified UTF-8, limits), region files, and (further down)
 * chunks, level.dat, players, every entity and tile entity through their 1.5.2 NBT.
 * Run: node scripts/run-node-test.mjs tests/persistence.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import '../src/entity/ItemHooksInstall';
import '../src/world/tileentity/TileEntities';
import { unzipSync, zipSync } from 'fflate';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import type { Entity } from '../src/entity/Entity';
import { EntityList } from '../src/entity/EntityList';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack, type TagCompound } from '../src/item/ItemStack';
import { Chunk } from '../src/world/Chunk';
import { ChunkProviderClient } from '../src/world/ChunkProviderClient';
import { EnumGameType } from '../src/world/EnumGameType';
import { TileEntity } from '../src/world/tileentity/TileEntity';
import { TileEntityChest } from '../src/world/tileentity/TileEntityChest';
import { TileEntitySign } from '../src/world/tileentity/TileEntitySign';
import { World, WorldInfo } from '../src/world/World';
import { packNibbles, readChunkFromNBT, unpackNibbles, writeChunkToNBT } from '../src/world/storage/AnvilChunkLoader';
import { NBT, NBTError, NBTType, cloneNBT, nbtTypeOf, readCompressedNBT, readNBT, writeCompressedNBT, writeNBT, zlibDeflate, zlibInflate } from '../src/world/storage/NBT';
import { decodeRegion, encodeRegion, parseRegionFileName, regionFileName } from '../src/world/storage/RegionFile';
import { MemoryBackend } from '../src/world/storage/SaveBackend';
import { SaveFormat } from '../src/world/storage/SaveFormat';
import { levelDatRoot, worldInfoFromNBT, worldInfoToNBT } from '../src/world/storage/WorldInfoNBT';
import { ImportError, exportWorld, importFolderName, importWorld } from '../src/world/storage/WorldTransfer';
import { collectWorldData, installWorldData } from '../src/world/storage/WorldData';
import { getUniqueDataId, loadMapData, MapData, setMapData } from '../src/item/ItemMap';
import { getScoreboard, ScoreObjectiveCriteria } from '../src/command/scoreboard/Scoreboard';
import { InventoryEnderChest } from '../src/world/tileentity/TileEntityEnderChest';
import { check, report } from './harness';

registerBlockItems();

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- NBT
{
  const t: TagCompound = {};
  NBT.setByte(t, 'b', -3);
  NBT.setShort(t, 's', 40000);
  NBT.setInteger(t, 'i', -123456789);
  NBT.setLong(t, 'l', -5n);
  NBT.setFloat(t, 'f', 0.1);
  NBT.setDouble(t, 'd', 0.1);
  NBT.setString(t, 'str', 'héllo\u0000😀');
  NBT.setByteArray(t, 'ba', Uint8Array.of(1, 2, 255));
  NBT.setIntArray(t, 'ia', [1, -2, 3]);
  NBT.setList(t, 'pos', NBTType.Double, [1.5, 2, 3]);
  NBT.setList(t, 'rot', NBTType.Float, [90, 0]);
  NBT.setList(t, 'empty', NBTType.Compound, []);
  const inner: TagCompound = {};
  NBT.setBoolean(inner, 'yes', true);
  NBT.setCompoundTag(t, 'inner', inner);
  // Untyped values (older code): items keep their 1.5.2 types through the hints.
  t.Items = [{ Slot: 3, id: 276, Count: 1, Damage: 7, tag: { ench: [{ id: 16, lvl: 5 }] } }];
  const bytes = writeNBT(t);
  const back = readNBT(bytes);
  check('nbt byte', back.b === -3);
  check('nbt short wraps', back.s === 40000 - 65536, String(back.s));
  check('nbt int', back.i === -123456789);
  check('nbt long', back.l === -5n);
  check('nbt float', back.f === Math.fround(0.1));
  check('nbt double', back.d === 0.1);
  check('nbt string (modified utf-8)', back.str === 'héllo\u0000😀');
  check('nbt byte array', hex(back.ba as Uint8Array) === '0102ff');
  check('nbt int array', JSON.stringify(back.ia) === '[1,-2,3]');
  check('nbt double list', JSON.stringify(back.pos) === '[1.5,2,3]');
  check('nbt float list', JSON.stringify(back.rot) === '[90,0]');
  check('nbt empty list', Array.isArray(back.empty) && (back.empty as unknown[]).length === 0);
  check('nbt bool', NBT.getBoolean(back.inner as TagCompound, 'yes'));
  const item = (back.Items as TagCompound[])[0];
  check('item Slot is a byte', nbtTypeOf(item, 'Slot') === NBTType.Byte);
  check('item id is a short', nbtTypeOf(item, 'id') === NBTType.Short);
  check('item Count is a byte', nbtTypeOf(item, 'Count') === NBTType.Byte);
  check('item Damage is a short', nbtTypeOf(item, 'Damage') === NBTType.Short);
  const ench = ((item.tag as TagCompound).ench as TagCompound[])[0];
  check('ench lvl is a short', nbtTypeOf(ench, 'lvl') === NBTType.Short);
  // Re-encoding the decoded tag gives the same bytes (types are remembered).
  check('nbt re-encode is identical', hex(writeNBT(back)) === hex(bytes));
  check('nbt clone keeps types', hex(writeNBT(cloneNBT(back))) === hex(bytes));
  check('gzip round trip', hex(writeNBT(readCompressedNBT(writeCompressedNBT(back)))) === hex(bytes));
  // Hand-made reference: {"": {a: short 1}}
  check('nbt layout', hex(writeNBT(((x: TagCompound) => (NBT.setShort(x, 'a', 1), x))({}))) === '0a000002000161000100');
  // Malformed input throws NBTError, never something else.
  let bad = 0;
  for (let n = 0; n < bytes.length; n++) {
    try {
      readNBT(bytes.subarray(0, n));
    } catch (e) {
      if (e instanceof NBTError) bad++;
    }
  }
  check('truncated nbt rejected', bad === bytes.length, `${bad}/${bytes.length}`);
  const huge = Uint8Array.of(10, 0, 0, 9, 0, 1, 'x'.charCodeAt(0), 10, 0x7f, 0xff, 0xff, 0xff);
  let hugeOk = false;
  try {
    readNBT(huge);
  } catch (e) {
    hugeOk = e instanceof NBTError;
  }
  check('huge list length rejected', hugeOk);
  let fuzzOk = true;
  for (let i = 0; i < 2000; i++) {
    const f = bytes.slice();
    for (let k = 0; k < 4; k++) f[Math.floor(Math.random() * f.length)] = Math.floor(Math.random() * 256);
    try {
      readNBT(f);
    } catch (e) {
      if (!(e instanceof NBTError)) fuzzOk = false;
    }
  }
  check('fuzzed nbt only throws NBTError', fuzzOk);
}

// ---------------------------------------------------------------- region files
{
  const chunks = [];
  for (let i = 0; i < 40; i++) {
    const t: TagCompound = {};
    NBT.setInteger(t, 'n', i);
    NBT.setByteArray(t, 'pad', new Uint8Array(i * 300).map((_, k) => (k * 7919 + i) & 255));
    chunks.push({ x: i % 32, z: Math.floor(i / 32) + 3, data: zlibDeflate(writeNBT(t)), timestamp: 1000 + i });
  }
  const region = encodeRegion(chunks);
  check('region size is whole sectors', region.length % 4096 === 0);
  const back = decodeRegion(region);
  check('region chunk count', back.length === 40, String(back.length));
  let ok = true;
  for (const c of back) {
    const t = readNBT(c.nbt);
    const i = t.n as number;
    if (c.x !== i % 32 || c.z !== Math.floor(i / 32) + 3 || c.timestamp !== 1000 + i || (t.pad as Uint8Array).length !== i * 300) ok = false;
  }
  check('region chunks round trip', ok);
  check('region names', regionFileName(-1, 2) === 'r.-1.2.mca' && JSON.stringify(parseRegionFileName('r.-1.2.mca')) === '{"rx":-1,"rz":2}' && parseRegionFileName('r.1.mcr') === null);
  const broken = region.slice();
  broken[8192 + 6] ^= 0xff;
  let survived = true;
  try {
    decodeRegion(broken);
  } catch {
    survived = false;
  }
  check('a damaged chunk does not break the region', survived);
}

// ---------------------------------------------------------------- worlds for the checks below

class TestPlayer extends EntityPlayer {}

function flatWorld(radius = 1): World {
  const info = new WorldInfo();
  info.seed = 42n;
  info.terrainType = 'flat';
  const w = new World(info);
  w.mobSpawner = null;
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const c = new Chunk(w, cx, cz);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++) {
          c.setBlockIDWithMetadata(x, 0, z, B.bedrock, 0);
          for (let y = 1; y < 4; y++) c.setBlockIDWithMetadata(x, y, z, B.dirt, 0);
          c.setBlockIDWithMetadata(x, 4, z, B.grass, 0);
        }
      c.biomes.fill(1);
      c.generateSkylightMap();
      w.addChunk(c);
    }
  }
  return w;
}

const bytesOf = (t: TagCompound): string => hex(writeNBT(t));

// ---------------------------------------------------------------- nibble arrays
{
  const src = new Uint8Array(4096).map((_, i) => (i * 7) & 15);
  const packed = packNibbles(src);
  check('nibbles pack to 2048 bytes', packed.length === 2048);
  check('nibble layout: low nibble first', packed[0] === ((src[0] & 15) | (src[1] << 4)));
  check('nibbles round trip', hex(unpackNibbles(packed, new Uint8Array(4096))) === hex(src));
}

// ---------------------------------------------------------------- every entity class
const ENTITY_NAMES = [
  'Item', 'XPOrb', 'Painting', 'Arrow', 'Snowball', 'Fireball', 'SmallFireball', 'ThrownEnderpearl', 'EyeOfEnderSignal', 'ThrownPotion', 'ThrownExpBottle',
  'ItemFrame', 'WitherSkull', 'PrimedTnt', 'FallingSand', 'FireworksRocketEntity', 'Boat', 'MinecartRideable', 'MinecartChest', 'MinecartFurnace',
  'MinecartTNT', 'MinecartHopper', 'MinecartSpawner', 'Creeper', 'Skeleton', 'Spider', 'Giant', 'Zombie', 'Slime', 'Ghast', 'PigZombie', 'Enderman',
  'CaveSpider', 'Silverfish', 'Blaze', 'LavaSlime', 'Bat', 'Witch', 'Pig', 'Sheep', 'Cow', 'Chicken', 'Squid', 'Wolf', 'MushroomCow', 'SnowMan', 'Ozelot',
  'VillagerGolem', 'Villager', 'EnderCrystal',
];
{
  const w = flatWorld();
  let registered = 0;
  const stable: string[] = [];
  const unstable: string[] = [];
  for (const name of ENTITY_NAMES) {
    if (!EntityList.isRegistered(name)) continue;
    registered++;
    const cls = EntityList.getClassFromName(name) as unknown as new (...args: unknown[]) => Entity;
    // Hanging entities and thrown potions as their items make them (a wall position, a potion).
    const e = name === 'Painting' || name === 'ItemFrame' ? new cls(w, 3, 5, 4, 2) : name === 'ThrownPotion' ? new cls(w, 3.5, 5, 4.25, 16421) : EntityList.createEntityByName(name, w)!;
    if (name !== 'Painting' && name !== 'ItemFrame') e.setLocationAndAngles(3.5, 5, 4.25, 45, 10);
    if (name === 'FallingSand') (e as unknown as { blockID: number }).blockID = B.gravel;
    e.motionX = 0.1;
    e.fallDistance = 1.5;
    if (name === 'Item') (e as unknown as { setEntityItemStack(s: ItemStack): void }).setEntityItemStack(new ItemStack(I.diamond, 5));
    if (e.isLivingEntity) (e as EntityLiving).initCreature();
    const t1: TagCompound = {};
    const saved = e.addEntityID(t1);
    if (!saved) {
      unstable.push(name + '(not saved)');
      continue;
    }
    const b1 = writeNBT(t1);
    const back = EntityList.createEntityFromNBT(readNBT(b1), w);
    if (!back || back.constructor !== e.constructor) {
      unstable.push(name + '(not loaded)');
      continue;
    }
    const t2: TagCompound = {};
    back.addEntityID(t2);
    if (hex(writeNBT(t2)) === hex(b1)) stable.push(name);
    else unstable.push(name);
  }
  check('entity classes registered', registered >= 45, String(registered));
  check('every entity saves, loads and saves again to the same bytes', unstable.length === 0, unstable.join(', '));
  check('id is the EntityList name', (() => {
    const t: TagCompound = {};
    EntityList.createEntityByName('Pig', w)!.addEntityID(t);
    return t.id === 'Pig' && nbtTypeOf(t, 'Rotation') === NBTType.List && nbtTypeOf(t, 'Health') === NBTType.Short && nbtTypeOf(t, 'UUIDMost') === NBTType.Long;
  })());
}

// Specific entity state survives.
{
  const w = flatWorld();
  const load = <T extends Entity>(e: Entity): T => {
    const t: TagCompound = {};
    e.addEntityID(t);
    return EntityList.createEntityFromNBT(readNBT(writeNBT(t)), w) as T;
  };
  type Sheep = Entity & { setFleeceColor(c: number): void; getFleeceColor(): number; setSheared(v: boolean): void; getSheared(): boolean; setGrowingAge(a: number): void; getGrowingAge(): number };
  const sheep = EntityList.createEntityByName('Sheep', w) as Sheep;
  sheep.setFleeceColor(11);
  sheep.setSheared(true);
  sheep.setGrowingAge(-1200);
  const sheep2 = load<Sheep>(sheep);
  check('sheep colour, shearing and age', sheep2.getFleeceColor() === 11 && sheep2.getSheared() && sheep2.getGrowingAge() === -1200);
  type Wolf = Entity & { setOwner(n: string): void; setTamed(v: boolean): void; isTamed(): boolean; getOwnerName(): string; setCollarColor(c: number): void; getCollarColor(): number; setSitting(v: boolean): void; isSitting(): boolean };
  const wolf = EntityList.createEntityByName('Wolf', w) as Wolf;
  wolf.setOwner('Steve');
  wolf.setTamed(true);
  wolf.setCollarColor(4);
  wolf.setSitting(true);
  const wolf2 = load<Wolf>(wolf);
  check('tamed wolf owner, collar, sitting', wolf2.isTamed() && wolf2.getOwnerName() === 'Steve' && wolf2.getCollarColor() === 4 && wolf2.isSitting());
  type Creeper = Entity & { powered: boolean; getPowered?(): boolean };
  const creeper = EntityList.createEntityByName('Creeper', w) as Creeper;
  creeper.powered = true;
  check('charged creeper', load<Creeper>(creeper).powered === true);
  type Zombie = Entity & { setChild(v: boolean): void; isChild(): boolean; setVillager(v: boolean): void; isVillager(): boolean };
  const z = EntityList.createEntityByName('Zombie', w) as Zombie;
  z.setChild(true);
  z.setVillager(true);
  const z2 = load<Zombie>(z);
  check('baby zombie villager', z2.isChild() && z2.isVillager());
  type Slime = Entity & { setSlimeSize(n: number): void; getSlimeSize(): number };
  const slime = EntityList.createEntityByName('Slime', w) as Slime;
  slime.setSlimeSize(4);
  check('slime size', load<Slime>(slime).getSlimeSize() === 4);
  type Villager = Entity & { setProfession(n: number): void; getProfession(): number; getRecipes(p: unknown): { length: number; getRecipiesAsTags(): TagCompound } | null };
  const v = EntityList.createEntityByName('Villager', w) as Villager;
  v.setProfession(2);
  const offers = v.getRecipes(null)!;
  const v2 = load<Villager>(v);
  check('villager profession and trades', v2.getProfession() === 2 && offers.length > 0 && bytesOf(v2.getRecipes(null)!.getRecipiesAsTags()) === bytesOf(offers.getRecipiesAsTags()));
  type Living = EntityLiving & { setCustomNameTag(n: string): void; getCustomNameTag(): string };
  const pig = EntityList.createEntityByName('Pig', w) as Living;
  pig.setCustomNameTag('Bacon');
  pig.setEntityHealth(7);
  const pig2 = load<Living>(pig);
  check('custom name and health', pig2.getCustomNameTag() === 'Bacon' && pig2.getHealth() === 7);
  type Chest = Entity & { setInventorySlotContents(i: number, s: ItemStack | null): void; getStackInSlot(i: number): ItemStack | null };
  const cart = EntityList.createEntityByName('MinecartChest', w) as Chest;
  const sword = new ItemStack(I.swordDiamond, 1, 12);
  sword.addEnchantment?.({ effectId: 16 } as never, 3);
  cart.setInventorySlotContents(5, sword);
  cart.setInventorySlotContents(26, new ItemStack(B.cobblestone, 64));
  const cart2 = load<Chest>(cart);
  check('chest minecart items', cart2.getStackInSlot(5)?.itemID === I.swordDiamond && cart2.getStackInSlot(5)?.getItemDamage() === 12 && cart2.getStackInSlot(26)?.stackSize === 64);
  // A zombie riding a pig: the rider carries its mount in "Riding"; the mount alone is not saved.
  const rider = EntityList.createEntityByName('Zombie', w)!;
  const mount = EntityList.createEntityByName('Pig', w)!;
  rider.mountEntity(mount);
  const tm: TagCompound = {};
  check('a ridden entity is not saved on its own', !mount.addEntityID(tm));
  const tr: TagCompound = {};
  rider.addEntityID(tr);
  check('the rider saves its mount', (tr.Riding as TagCompound | undefined)?.id === 'Pig');
  check('unknown entity ids are skipped', EntityList.createEntityFromNBT({ id: 'NoSuchMob' }, w) === null);
  check('legacy Minecart ids', EntityList.createEntityFromNBT({ id: 'Minecart', Type: 1, Pos: [0, 5, 0], Motion: [0, 0, 0], Rotation: [0, 0] }, w) !== null);
}

// ---------------------------------------------------------------- every tile entity
{
  const w = flatWorld();
  const unstable: string[] = [];
  let n = 0;
  for (const id of TileEntity.getRegisteredIds()) {
    const te = TileEntity.createTileEntity(id)!;
    te.xCoord = 5;
    te.yCoord = 6;
    te.zCoord = -7;
    const t1: TagCompound = {};
    te.writeToNBT(t1);
    const b1 = writeNBT(t1);
    const back = TileEntity.createAndLoadEntity(readNBT(b1));
    const t2: TagCompound = {};
    back?.writeToNBT(t2);
    if (!back || hex(writeNBT(t2)) !== hex(b1)) unstable.push(id);
    n++;
  }
  check('tile entity ids', n >= 19, String(n));
  check('every tile entity saves, loads and saves again to the same bytes', unstable.length === 0, unstable.join(', '));
  const chest = new TileEntityChest();
  chest.setInventorySlotContents(0, new ItemStack(I.diamond, 3));
  chest.setInventorySlotContents(26, new ItemStack(B.torchWood, 16));
  const ct: TagCompound = {};
  chest.writeToNBT(ct);
  const items = readNBT(writeNBT(ct)).Items as TagCompound[];
  check('chest Items: Slot byte, id short, Count byte, Damage short', nbtTypeOf(items[0], 'Slot') === NBTType.Byte && nbtTypeOf(items[0], 'id') === NBTType.Short && nbtTypeOf(items[0], 'Count') === NBTType.Byte && nbtTypeOf(items[0], 'Damage') === NBTType.Short);
  const sign = new TileEntitySign();
  sign.signText[0] = 'Hello';
  sign.signText[3] = 'World';
  const st: TagCompound = {};
  sign.writeToNBT(st);
  const sign2 = TileEntity.createAndLoadEntity(readNBT(writeNBT(st))) as TileEntitySign;
  check('sign text', sign2.signText[0] === 'Hello' && sign2.signText[3] === 'World');
  void w;
}

// ---------------------------------------------------------------- chunks
{
  const w = flatWorld();
  w.setBlock(2, 5, 3, B.planks, 2, 3);
  w.setBlock(2, 6, 3, B.cloth, 14, 3);
  w.setBlock(2, 40, 3, B.glowStone, 0, 3);
  w.setBlock(4, 5, 4, B.chest, 0, 3);
  const chest = w.getBlockTileEntity(4, 5, 4) as TileEntityChest;
  chest.setInventorySlotContents(13, new ItemStack(I.appleGold, 2, 1));
  w.setBlock(6, 5, 6, B.signPost, 4, 3);
  (w.getBlockTileEntity(6, 5, 6) as TileEntitySign).signText[1] = 'saved';
  const sheep = EntityList.createEntityByName('Sheep', w)!;
  sheep.setLocationAndAngles(8.5, 5, 8.5, 90, 0);
  w.spawnEntityInWorld(sheep);
  const zombie = EntityList.createEntityByName('Zombie', w)!;
  const pig = EntityList.createEntityByName('Pig', w)!;
  zombie.setLocationAndAngles(10.5, 5, 10.5, 0, 0);
  pig.setLocationAndAngles(10.5, 5, 10.5, 0, 0);
  w.spawnEntityInWorld(pig);
  w.spawnEntityInWorld(zombie);
  zombie.mountEntity(pig);
  const player = new TestPlayer(w);
  player.setLocationAndAngles(1.5, 5, 1.5, 0, 0);
  w.spawnEntityInWorld(player);
  w.scheduleBlockUpdate(2, 5, 3, B.planks, 37, 2);
  const c = w.getChunkFromChunkCoords(0, 0);
  c.biomes[17] = 6;
  const root = writeChunkToNBT(c, w);
  const level = root.Level as TagCompound;
  check('chunk Level keys', ['xPos', 'zPos', 'LastUpdate', 'HeightMap', 'TerrainPopulated', 'Sections', 'Biomes', 'Entities', 'TileEntities', 'TileTicks'].every((k) => k in level));
  check('chunk LastUpdate is a long', nbtTypeOf(level, 'LastUpdate') === NBTType.Long && nbtTypeOf(level, 'HeightMap') === NBTType.IntArray && nbtTypeOf(level, 'Biomes') === NBTType.ByteArray);
  const sec = (level.Sections as TagCompound[])[0];
  check('section arrays', (sec.Blocks as Uint8Array).length === 4096 && (sec.Data as Uint8Array).length === 2048 && (sec.SkyLight as Uint8Array).length === 2048 && (sec.BlockLight as Uint8Array).length === 2048 && nbtTypeOf(sec, 'Y') === NBTType.Byte);
  check('players are not saved in chunks', (level.Entities as TagCompound[]).every((e) => e.id !== undefined) && (level.Entities as TagCompound[]).length === 2, String((level.Entities as TagCompound[]).length));
  const bytes = zlibDeflate(writeNBT(root));
  // Into a fresh world, as after a reload.
  const w2 = new World(w.worldInfo);
  w2.mobSpawner = null;
  const c2 = readChunkFromNBT(w2, 0, 0, readNBT(zlibInflate(bytes)))!;
  w2.addChunk(c2);
  let same = true;
  for (let y = 0; y < 64; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    if (c2.getBlockID(x, y, z) !== c.getBlockID(x, y, z) || c2.getBlockMetadata(x, y, z) !== c.getBlockMetadata(x, y, z)) same = false;
    if (c2.getSavedLightValue(0, x, y, z) !== c.getSavedLightValue(0, x, y, z) || c2.getSavedLightValue(1, x, y, z) !== c.getSavedLightValue(1, x, y, z)) same = false;
  }
  check('blocks, metadata and light round trip', same);
  check('height map and biomes', hex(new Uint8Array(c2.heightMap.buffer)) === hex(new Uint8Array(c.heightMap.buffer)) && c2.biomes[17] === 6);
  check('chest contents', (w2.getBlockTileEntity(4, 5, 4) as TileEntityChest | null)?.getStackInSlot(13)?.itemID === I.appleGold);
  check('sign text in chunk', (w2.getBlockTileEntity(6, 5, 6) as TileEntitySign | null)?.signText[1] === 'saved');
  const ents = w2.loadedEntityList.map((e) => EntityList.getEntityString(e)).sort();
  check('entities come back', JSON.stringify(ents) === '["Pig","Sheep","Zombie"]', JSON.stringify(ents));
  const z2 = w2.loadedEntityList.find((e) => EntityList.getEntityString(e) === 'Zombie');
  check('rider remounted', EntityList.getEntityString(z2?.ridingEntity ?? (z2 as Entity)) === 'Pig');
  check('scheduled tick kept', w2.getPendingBlockUpdates(0, 0).some((t) => t.xCoord === 2 && t.yCoord === 5 && t.zCoord === 3 && t.scheduledTime - w2.getTotalWorldTime() === 37 && t.priority === 2));
  check('chunk re-encodes identically', (() => {
    const again = writeChunkToNBT(c2, w2);
    // Entity UUIDs and order are stable; compare without the entity list order.
    const a = again.Level as TagCompound;
    return hex(writeNBT({ s: a.Sections, b: a.Biomes, h: a.HeightMap, t: a.TileEntities })) === hex(writeNBT({ s: level.Sections, b: level.Biomes, h: level.HeightMap, t: level.TileEntities }));
  })());
  check('missing Level is rejected', readChunkFromNBT(w2, 0, 0, {}) === null);
  const bad = cloneNBT(root);
  ((bad.Level as TagCompound).Sections as TagCompound[])[0].Blocks = new Uint8Array(4096).fill(250);
  const c3 = readChunkFromNBT(new World(new WorldInfo()), 0, 0, bad)!;
  check('unknown block ids become air', c3.getBlockID(0, 0, 0) === 0);
}

// ---------------------------------------------------------------- level.dat and the player
{
  const info = new WorldInfo();
  info.worldName = 'Saved \u00e9 World';
  info.seed = -1234567890123456789n;
  info.terrainType = 'largeBiomes';
  info.gameType = 0;
  info.hardcore = true;
  info.allowCommands = false;
  info.spawnX = 100;
  info.spawnY = 70;
  info.spawnZ = -200;
  info.totalTime = 123456;
  info.worldTime = 23456;
  info.raining = true;
  info.rainTime = 999;
  info.gameRules.keepInventory = true;
  const w = flatWorld();
  const p = new TestPlayer(w);
  p.setLocationAndAngles(5.5, 6, -3.25, 123, -20);
  p.inventory.mainInventory[0] = new ItemStack(I.pickaxeDiamond, 1, 100);
  p.inventory.mainInventory[35] = new ItemStack(B.dirt, 33);
  p.inventory.armorInventory[3] = new ItemStack(I.helmetIron);
  p.inventory.currentItem = 4;
  p.experienceLevel = 7;
  p.experienceTotal = 120;
  p.experience = 0.25;
  p.setEntityHealth(13);
  p.gameType = EnumGameType.SURVIVAL;
  p.capabilities.isFlying = true;
  p.getFoodStats().readNBT({ foodLevel: 9, foodTickTimer: 3, foodSaturationLevel: 1.5, foodExhaustionLevel: 0.5 });
  InventoryEnderChest.forPlayer(p).setInventorySlotContents(2, new ItemStack(I.emerald, 9));
  const ptag: TagCompound = {};
  p.writeToNBT(ptag);
  const bytes = writeCompressedNBT(levelDatRoot(worldInfoToNBT(info, ptag)));
  const data = readCompressedNBT(bytes).Data as TagCompound;
  const back = worldInfoFromNBT(data);
  check('level.dat world info', back.worldName === info.worldName && back.seed === info.seed && back.terrainType === 'largeBiomes' && back.gameType === 0 && back.hardcore && !back.allowCommands && back.spawnZ === -200 && back.totalTime === 123456 && back.worldTime === 23456 && back.raining && back.rainTime === 999 && back.gameRules.keepInventory === true);
  check('level.dat types', nbtTypeOf(data, 'RandomSeed') === NBTType.Long && nbtTypeOf(data, 'version') === NBTType.Int && data.version === 19133 && nbtTypeOf((data.GameRules as TagCompound), 'keepInventory') === NBTType.String);
  const p2 = new TestPlayer(w);
  p2.readFromNBT(data.Player as TagCompound);
  check('player position and look', Math.abs(p2.posX - 5.5) < 1e-9 && Math.abs(p2.posZ + 3.25) < 1e-9 && Math.abs(p2.rotationYaw - 123) < 1e-4);
  check('player inventory', p2.inventory.mainInventory[0]?.getItemDamage() === 100 && p2.inventory.mainInventory[35]?.stackSize === 33 && p2.inventory.armorInventory[3]?.itemID === I.helmetIron && p2.inventory.currentItem === 4);
  check('player xp, health, food, mode, flying', p2.experienceLevel === 7 && p2.experienceTotal === 120 && p2.experience === 0.25 && p2.getHealth() === 13 && p2.getFoodStats().getFoodLevel() === 9 && p2.gameType === EnumGameType.SURVIVAL && p2.capabilities.isFlying);
  check('ender chest', InventoryEnderChest.forPlayer(p2).getStackInSlot(2)?.stackSize === 9);
  const old: TagCompound = {};
  NBT.setString(old, 'generatorName', 'DEFAULT');
  check('versionless default is the 1.1 generator', worldInfoFromNBT(old).terrainType === 'default_1_1');
}

// ---------------------------------------------------------------- saves: list, save handler, export and import
async function saves(): Promise<void> {
  const backend = new MemoryBackend();
  const format = new SaveFormat(backend);
  await format.refresh();
  check('empty save list', format.getSaveList().length === 0);
  const h = format.createWorld('MyWorld');
  const w = flatWorld(2);
  w.worldInfo.worldName = 'My World';
  w.setBlock(-20, 10, 13, B.blockGold, 0, 3);
  const p = new TestPlayer(w);
  p.setLocationAndAngles(0.5, 5, 0.5, 0, 0);
  await h.saveAll(w, p, true);
  check('world listed after saving', format.getSaveList().length === 1 && format.getSaveList()[0].displayName === 'My World' && format.canLoadWorld('MyWorld'));
  check('all chunks saved', (await backend.chunkPositions('MyWorld')).length === 25);
  check('unchanged chunks are not saved again', h.saveChunks(w) === 0);
  w.setBlock(17, 9, 1, B.stone, 0, 3);
  check('a changed chunk is saved again', h.saveChunks(w) === 1);
  await h.flush();
  // Unload a chunk into the queue and read it back before and after the write.
  const prov = { saveHandler: h };
  void prov;
  const c = w.removeChunk(-2, 0)!;
  h.saveChunk(c, w);
  const fromQueue = h.loadChunkNow(new World(new WorldInfo()), -2, 0);
  check('queued chunk readable at once', fromQueue?.getBlockID(-20 & 15, 10, 13) === B.blockGold);
  await h.flush();
  const w3 = new World(new WorldInfo());
  const fromStore = await h.loadChunk(w3, -2, 0);
  check('stored chunk readable', fromStore?.getBlockID(12, 10, 13) === B.blockGold);
  // A second SaveFormat over the same backend (a page reload).
  const format2 = new SaveFormat(backend);
  await format2.refresh();
  const opened = await format2.openWorld('MyWorld');
  check('reopened world', opened.info.worldName === 'My World' && opened.handler.hasChunk(-2, 0) && opened.player !== null);
  await format2.renameWorld('MyWorld', 'Renamed');
  await format2.refresh();
  check('rename', format2.getSaveList()[0].displayName === 'Renamed' && format2.getSaveList()[0].fileName === 'MyWorld');
  // Export to a zip of a 1.5.2 save folder, import it back.
  const zip = await exportWorld(format2, 'MyWorld');
  const files = unzipSync(zip);
  const names = Object.keys(files).sort();
  check('export layout', names.includes('MyWorld/level.dat') && names.includes('MyWorld/region/r.-1.-1.mca') && names.includes('MyWorld/region/r.0.0.mca'), names.join(' '));
  const regionChunks = decodeRegion(files['MyWorld/region/r.-1.0.mca']);
  check('exported region holds Anvil chunks', regionChunks.length === 6 && regionChunks.every((r) => (readNBT(r.nbt).Level as TagCompound).Sections !== undefined), String(regionChunks.length));
  const r = await importWorld(format2, zip, 'MyWorld.zip');
  check('import gets a new folder', r.folder === 'MyWorld-' && r.chunks === 25, JSON.stringify(r));
  const imported = await format2.openWorld(r.folder);
  const ic = await imported.handler.loadChunk(new World(new WorldInfo()), -2, 0);
  check('imported world matches', imported.info.worldName === 'Renamed' && ic?.getBlockID(12, 10, 13) === B.blockGold);
  // A zip of the folder's contents (no top folder) also works.
  const flat: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) flat[k.replace(/^MyWorld\//, '')] = v;
  const r2 = await importWorld(format2, zipSync(flat), 'contents.zip');
  check('import without a top folder', r2.chunks === 25 && r2.folder === 'contents');
  // Bad input never crashes: it is an ImportError.
  const bads: [string, Uint8Array][] = [
    ['not a zip', new TextEncoder().encode('hello world, this is not a zip file')],
    ['no level.dat', zipSync({ 'x/readme.txt': new Uint8Array(4) })],
    ['bad level.dat', zipSync({ 'x/level.dat': new Uint8Array([1, 2, 3, 4]) })],
    ['old format', zipSync({ 'x/region/r.0.0.mcr': new Uint8Array(8192) })],
    ['truncated zip', zip.slice(0, zip.length >> 1)],
  ];
  for (const [label, data] of bads) {
    let ok = false;
    try {
      await importWorld(format2, data, label + '.zip');
    } catch (e) {
      ok = e instanceof ImportError;
    }
    check('import rejects: ' + label, ok);
  }
  check('folder names are cleaned', importFolderName('a/b.c', () => false) === 'a_b_c' && importFolderName('CON', () => false) === '_CON_' && importFolderName('X', (n) => n === 'X') === 'X-');
  // Maps (data/map_<n>.dat) and the id counters (data/idcounts.dat) are saved with level.dat.
  {
    const mw = flatWorld(0);
    const hm = format2.createWorld('Maps');
    hm.worldData = () => collectWorldData(mw);
    const id = getUniqueDataId(mw, 'map');
    const id2 = getUniqueDataId(mw, 'map');
    const md = new MapData('map_' + id2);
    md.xCenter = 64;
    md.zCenter = -128;
    md.scale = 2;
    md.colors[129] = 34;
    setMapData(mw, md.mapName, md);
    await hm.saveAll(mw, null, true);
    const again = collectWorldData(mw);
    const opened2 = await format2.openWorld('Maps');
    const fresh = new World(opened2.info);
    installWorldData(fresh, opened2.data);
    const back = loadMapData(fresh, 'map_1');
    check('maps saved and read back', id === 0 && id2 === 1 && back?.xCenter === 64 && back?.zCenter === -128 && back?.scale === 2 && back?.colors[129] === 34 && opened2.data.has('data/idcounts.dat'));
    check('unchanged maps are not written again', again.size === 0);
    check('map ids continue after loading', getUniqueDataId(fresh, 'map') === 2);
    check('an unused scoreboard is not written', !opened2.data.has('data/scoreboard.dat'));
    // The scoreboard (data/scoreboard.dat): objectives, scores, display slots, teams.
    const board = getScoreboard(fresh);
    const obj = board.addScoreObjective('kills', ScoreObjectiveCriteria.totalKillCount);
    obj.setDisplayName('Kills');
    board.getPlayerScore('Steve', obj).setScore(12);
    board.setObjectiveInDisplaySlot(1, obj);
    const team = board.createTeam('red');
    team.setNamePrefix('\u00a7c');
    board.addPlayerToTeam('Steve', team);
    opened2.handler.worldData = () => collectWorldData(fresh);
    await opened2.handler.saveAll(fresh, null, true);
    const opened3 = await format2.openWorld('Maps');
    const w4 = new World(opened3.info);
    installWorldData(w4, opened3.data);
    const b4 = getScoreboard(w4);
    const o4 = b4.getObjective('kills');
    check('villages.dat written', opened3.data.has('data/villages.dat'));
    const vt: TagCompound = {};
    NBT.setInteger(vt, 'Tick', 1234);
    const village: TagCompound = {};
    for (const [k, v] of [['PopSize', 5], ['Radius', 32], ['Golems', 1], ['Stable', 900], ['Tick', 1200], ['MTick', 0], ['CX', 10], ['CY', 64], ['CZ', -20], ['ACX', 40], ['ACY', 256], ['ACZ', -80]] as [string, number][]) NBT.setInteger(village, k, v);
    const door: TagCompound = {};
    for (const [k, v] of [['X', 10], ['Y', 64], ['Z', -20], ['IDX', 1], ['IDZ', 0], ['TS', 1100]] as [string, number][]) NBT.setInteger(door, k, v);
    NBT.setList(village, 'Doors', NBTType.Compound, [door]);
    const rep: TagCompound = {};
    NBT.setString(rep, 'Name', 'Steve');
    NBT.setInteger(rep, 'S', -3);
    NBT.setList(village, 'Players', NBTType.Compound, [rep]);
    NBT.setList(vt, 'Villages', NBTType.Compound, [village]);
    const vw = new World(new WorldInfo());
    vw.villageCollectionObj.readFromNBT(readNBT(writeNBT(vt)));
    const vt2: TagCompound = {};
    vw.villageCollectionObj.writeToNBT(vt2);
    check('villages round trip', hex(writeNBT(vt2)) === hex(writeNBT(vt)) && vw.villageCollectionObj.getVillageList().length === 1);
    check('scoreboard saved and read back', !!o4 && o4.getDisplayName() === 'Kills' && b4.getPlayerScore('Steve', o4).getScorePoints() === 12 && b4.getObjectiveInDisplaySlot(1) === o4 && b4.getPlayersTeam('Steve')?.getColorPrefix() === '\u00a7c');
  }
  // session.lock: a second session (another tab) on the same world takes it over; the first stops saving.
  {
    const lw = flatWorld(0);
    const first = format2.createWorld('Locked');
    await first.saveAll(lw, null, true);
    // Another tab: its own SaveFormat over the same storage.
    const second = (await new SaveFormat(backend).openWorld('Locked')).handler;
    await second.saveAll(lw, null, true);
    let reported = '';
    first.onError = (m) => (reported = m);
    lw.setBlock(1, 9, 1, B.stone, 0, 3);
    await first.saveAll(lw, null, true);
    check('the older session stops saving', first.closed && reported.includes('another location') && second.error === null, JSON.stringify({ closed: first.closed, reported, err: first.error, second: second.error }));
  }
  // Deleting stops a world's saving and removes everything.
  await format2.deleteWorldDirectory('MyWorld');
  check('delete', !format2.canLoadWorld('MyWorld') && (await backend.chunkPositions('MyWorld')).length === 0 && (await backend.getFile('MyWorld', 'level.dat')) === null);
}

// The chunk provider loads saved chunks instead of generating them, and saves unloading ones.
async function provider(): Promise<void> {
  const g = globalThis as unknown as { Worker?: unknown };
  const posted: unknown[] = [];
  g.Worker = class {
    onmessage: unknown = null;
    onerror: unknown = null;
    postMessage(m: unknown): void {
      posted.push(m);
    }
    terminate(): void {}
  };
  const backend = new MemoryBackend();
  const format = new SaveFormat(backend);
  const src = flatWorld(1);
  src.setBlock(5, 20, 5, B.blockDiamond, 0, 3);
  const h0 = format.createWorld('P');
  await h0.saveAll(src, null, true);
  const opened = await format.openWorld('P');
  const w = new World(opened.info);
  w.mobSpawner = null;
  const pc = new ChunkProviderClient(w, 0n, 'flat', false);
  pc.saveHandler = opened.handler;
  pc.loadRadius = 1;
  pc.updateLoadedArea(0, 0);
  await new Promise((r) => setTimeout(r, 10));
  pc.processIncoming(1000);
  check('saved chunks load without the generator', w.chunkExists(0, 0) && w.getBlockId(5, 20, 5) === B.blockDiamond);
  const requests = posted.filter((m) => (m as { type: string }).type === 'request');
  check('only missing chunks are generated', requests.length === 0, JSON.stringify(requests));
  w.setBlock(6, 20, 6, B.blockEmerald, 0, 3);
  pc.unloadChunk(0, 0);
  check('unloaded chunk queued', opened.handler.pendingCount > 0 && !w.chunkExists(0, 0));
  pc.updateLoadedArea(0.5, 0.5);
  await new Promise((r) => setTimeout(r, 10));
  pc.processIncoming(1000);
  check('it comes back with the change', w.getBlockId(6, 20, 6) === B.blockEmerald);
  pc.dispose();
}

await saves();
await provider();

report();
