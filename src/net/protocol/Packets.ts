import { Item } from '../../item/Item';
import { ItemStack, type TagCompound } from '../../item/ItemStack';
import { sanitizeItemTag } from './ItemTags';
import { PacketReader, PacketWriter, ProtocolError } from './PacketBuffer';

/**
 * The multiplayer packets. Ids, names and contents follow 1.5.2's Packet classes (Packet0KeepAlive
 * ... Packet255KickDisconnect) where they exist; the wire format is this game's own: a packet is
 * its id byte followed by its fields in declaration order (see PacketBuffer for the encodings).
 * Messages on a connection are frames of length-prefixed packets (encodeFrame / decodeFrame).
 *
 * Field types:
 *   u8 i8 u16 i16 i32 f32 f64 bool varint   numbers (big-endian, as Java's DataOutputStream)
 *   str      UTF-8 text, at most 32767 bytes        name   UTF-8 text, at most 64 bytes
 *   bytes    a byte string, at most 4 MiB           json   JSON text (tags), at most 256 KiB
 *   item     an ItemStack or null                    items  a list of those (window contents)
 *   meta     entity metadata entries [index, value]  i32s / f32s  number lists (65536 max)
 */

export const PROTOCOL_VERSION = 1;
/** The game version shown on mismatches ("Outdated server!"). */
export const GAME_VERSION = '1.5.2';

declare const __BUILD_ID__: string | undefined;
/** The commit of this build (vite's define; 'dev' in tests), named on version mismatches. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/*
 * Never change the layouts of Handshake (id 2) and KickDisconnect (id 255): a host and a guest of
 * different builds must still read each other's handshake and the refusal that names the
 * versions, or a version mismatch turns into "Protocol error" (tests/netprotocol.test.ts pins
 * their bytes). Other packets change together with PROTOCOL_VERSION.
 */

const MAX_STR = 32767;
const MAX_NAME = 64;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_JSON = 256 * 1024;
const MAX_LIST = 65536;
const MAX_ITEMS = 256;
const MAX_TAG = 32767;

export type FieldType = 'u8' | 'i8' | 'u16' | 'i16' | 'i32' | 'f32' | 'f64' | 'bool' | 'varint' | 'str' | 'name' | 'bytes' | 'json' | 'item' | 'items' | 'meta' | 'i32s' | 'f32s';

/** One metadata entry: slot index and value (DataWatcher's WatchableObject). */
export type MetaValue = number | boolean | string | ItemStack | null;
export type MetaEntry = [number, MetaValue];

type ValueOf<T> = T extends 'bool'
  ? boolean
  : T extends 'str' | 'name'
    ? string
    : T extends 'bytes'
      ? Uint8Array
      : T extends 'json'
        ? unknown
        : T extends 'item'
          ? ItemStack | null
          : T extends 'items'
            ? (ItemStack | null)[]
            : T extends 'meta'
              ? MetaEntry[]
              : T extends 'i32s' | 'f32s'
                ? number[]
                : number;

/** Who may send a packet: the server (host), the client (guest) or both. */
export type Direction = 's2c' | 'c2s' | 'both';

interface PacketDef {
  readonly id: number;
  readonly dir: Direction;
  readonly fields: Readonly<Record<string, FieldType>>;
}

const def = <F extends Record<string, FieldType>>(id: number, dir: Direction, fields: F) => ({ id, dir, fields }) as const;

export const PACKETS = {
  /** Packet0KeepAlive: the server sends a random id every second; the client echoes it (ping). */
  KeepAlive: def(0, 'both', { id: 'i32' }),
  /** Packet1Login: the server's answer to the handshake, the guest's player and world. */
  Login: def(1, 's2c', {
    entityId: 'i32',
    username: 'name',
    gameType: 'u8',
    hardcore: 'bool',
    difficulty: 'u8',
    maxPlayers: 'u8',
    terrainType: 'name',
    worldName: 'str',
    spawnX: 'i32',
    spawnY: 'i32',
    spawnZ: 'i32',
    viewDistance: 'u8',
    allowCommands: 'bool',
  }),
  /** Packet2ClientProtocol: the guest's protocol version and username. */
  Handshake: def(2, 'c2s', { protocolVersion: 'u16', gameVersion: 'name', username: 'name' }),
  /** Packet3Chat: a chat line (server) or chat text / command (client, 100 characters). */
  Chat: def(3, 'both', { message: 'str' }),
  /** Packet4UpdateTime: world age and time of day. */
  UpdateTime: def(4, 's2c', { totalTime: 'f64', worldTime: 'f64' }),
  /** Packet5PlayerInventory: equipment of an entity (0 held, 1-4 armour from the boots up). */
  PlayerInventory: def(5, 's2c', { entityId: 'i32', slot: 'u8', item: 'item' }),
  /** Packet6SpawnPosition: the world spawn (compass). */
  SpawnPosition: def(6, 's2c', { x: 'i32', y: 'i32', z: 'i32' }),
  /** Packet7UseEntity: right click (interact) or left click (attack) on an entity. */
  UseEntity: def(7, 'c2s', { targetEntity: 'i32', leftClick: 'bool' }),
  /** Packet8UpdateHealth: the guest's own health, food and saturation. */
  UpdateHealth: def(8, 's2c', { health: 'i16', food: 'i16', saturation: 'f32' }),
  /** Packet9Respawn: the guest's player was recreated (after death or a mode change). */
  Respawn: def(9, 's2c', { gameType: 'u8', difficulty: 'u8', terrainType: 'name' }),
  /** Packet10Flying .. Packet13PlayerLookMove from the guest: flags 1 moving, 2 rotating, 4 on ground. */
  Flying: def(10, 'c2s', { flags: 'u8', x: 'f64', y: 'f64', stance: 'f64', z: 'f64', yaw: 'f32', pitch: 'f32' }),
  /** Packet13PlayerLookMove from the server: puts the guest's player there (spawn, teleport, correction). */
  PlayerPosLook: def(13, 's2c', { x: 'f64', y: 'f64', stance: 'f64', z: 'f64', yaw: 'f32', pitch: 'f32', onGround: 'bool' }),
  /** Packet14BlockDig: 0 start, 1 abort, 2 finish digging, 3 drop stack, 4 drop item, 5 release use. */
  BlockDig: def(14, 'c2s', { status: 'u8', x: 'i32', y: 'i16', z: 'i32', face: 'u8' }),
  /** Packet15Place: use the held item on a block face (direction 255: in the air). */
  Place: def(15, 'c2s', { x: 'i32', y: 'i16', z: 'i32', direction: 'u8', item: 'item', hitX: 'u8', hitY: 'u8', hitZ: 'u8' }),
  /** Packet16BlockItemSwitch: the selected hotbar slot. */
  BlockItemSwitch: def(16, 'both', { slot: 'i16' }),
  /** Packet17Sleep: an entity lies down in the bed at (x, y, z). */
  Sleep: def(17, 's2c', { entityId: 'i32', x: 'i32', y: 'i32', z: 'i32' }),
  /** Packet18Animation: 1 swing arm, 2 hurt, 3 wake up, 6 critical hit, 7 magic critical hit. */
  Animation: def(18, 'both', { entityId: 'i32', animate: 'u8' }),
  /** Packet19EntityAction: 1/2 sneak on/off, 3 leave bed, 4/5 sprint on/off. */
  EntityAction: def(19, 'c2s', { entityId: 'i32', state: 'u8' }),
  /** Packet20NamedEntitySpawn: another player comes into view. */
  NamedEntitySpawn: def(20, 's2c', { entityId: 'i32', name: 'name', x: 'f64', y: 'f64', z: 'f64', yaw: 'f32', pitch: 'f32', headYaw: 'f32', currentItem: 'item', metadata: 'meta' }),
  /** Packet22Collect: an item or orb flies into a collector. */
  Collect: def(22, 's2c', { collectedEntityId: 'i32', collectorEntityId: 'i32' }),
  /**
   * Packet23VehicleSpawn / Packet24MobSpawn / Packet25EntityPainting / Packet26EntityExpOrb in
   * one: the entity's EntityList name (or "Egg", "FishHook", "LightningBolt"), position, angles,
   * motion, class-specific spawn data and its metadata.
   */
  SpawnEntity: def(24, 's2c', {
    entityId: 'i32',
    name: 'name',
    x: 'f64',
    y: 'f64',
    z: 'f64',
    yaw: 'f32',
    pitch: 'f32',
    headYaw: 'f32',
    motionX: 'f32',
    motionY: 'f32',
    motionZ: 'f32',
    data: 'json',
    metadata: 'meta',
  }),
  /** Packet28EntityVelocity: motion in 1/8000 blocks per tick. */
  EntityVelocity: def(28, 's2c', { entityId: 'i32', motionX: 'i16', motionY: 'i16', motionZ: 'i16' }),
  /** Packet29DestroyEntity. */
  DestroyEntity: def(29, 's2c', { entityIds: 'i32s' }),
  /** Packet31RelEntityMove: position change in 1/32 blocks. */
  RelEntityMove: def(31, 's2c', { entityId: 'i32', dx: 'i8', dy: 'i8', dz: 'i8' }),
  /** Packet32EntityLook: angles in 1/256 turns. */
  EntityLook: def(32, 's2c', { entityId: 'i32', yaw: 'i8', pitch: 'i8' }),
  /** Packet33RelEntityMoveLook. */
  RelEntityMoveLook: def(33, 's2c', { entityId: 'i32', dx: 'i8', dy: 'i8', dz: 'i8', yaw: 'i8', pitch: 'i8' }),
  /** Packet34EntityTeleport: absolute position in 1/32 blocks. */
  EntityTeleport: def(34, 's2c', { entityId: 'i32', x: 'i32', y: 'i32', z: 'i32', yaw: 'i8', pitch: 'i8' }),
  /** Packet35EntityHeadRotation. */
  EntityHeadRotation: def(35, 's2c', { entityId: 'i32', headYaw: 'i8' }),
  /** Packet38EntityStatus: handleHealthUpdate (2 hurt, 3 dead, 6/7 taming, 10 eating grass ...). */
  EntityStatus: def(38, 's2c', { entityId: 'i32', status: 'i8' }),
  /** Packet39AttachEntity: riding (vehicle -1 to dismount). */
  AttachEntity: def(39, 's2c', { entityId: 'i32', vehicleEntityId: 'i32' }),
  /** Packet40EntityMetadata: changed metadata entries. */
  EntityMetadata: def(40, 's2c', { entityId: 'i32', metadata: 'meta' }),
  /** Packet41EntityEffect: a potion effect on the guest's player. */
  EntityEffect: def(41, 's2c', { entityId: 'i32', effectId: 'u8', amplifier: 'u8', duration: 'i32', ambient: 'bool' }),
  /** Packet42RemoveEntityEffect. */
  RemoveEntityEffect: def(42, 's2c', { entityId: 'i32', effectId: 'u8' }),
  /** Packet43Experience: bar progress, level and total. */
  Experience: def(43, 's2c', { experience: 'f32', level: 'i16', total: 'i32' }),
  /** Packet50PreChunk (unload): the guest drops the chunk. */
  UnloadChunk: def(50, 's2c', { cx: 'i32', cz: 'i32' }),
  /** Packet51MapChunk: a whole chunk (ChunkCodec: deflated sections, light and biomes) and its tile entities. */
  MapChunk: def(51, 's2c', { cx: 'i32', cz: 'i32', data: 'bytes', tileEntities: 'json' }),
  /** Packet52MultiBlockChange: records (x << 28 | z << 24 | y << 16 | id << 4 | meta) in one chunk. */
  MultiBlockChange: def(52, 's2c', { cx: 'i32', cz: 'i32', records: 'i32s' }),
  /** Packet53BlockChange. */
  BlockChange: def(53, 's2c', { x: 'i32', y: 'i16', z: 'i32', id: 'u16', meta: 'u8' }),
  /** Packet54PlayNoteBlock: a block event (note blocks, pistons, chest lids). */
  BlockEvent: def(54, 's2c', { x: 'i32', y: 'i16', z: 'i32', blockId: 'u16', eventId: 'u8', param: 'i32' }),
  /** Packet55BlockDestroy: another player's crack progress on a block (0-9, -1 to clear). */
  BlockDestroy: def(55, 's2c', { entityId: 'i32', x: 'i32', y: 'i16', z: 'i32', progress: 'i8' }),
  /** Packet60Explosion: the blown-up blocks (relative bytes) and the push on the guest's player. */
  Explosion: def(60, 's2c', { x: 'f64', y: 'f64', z: 'f64', size: 'f32', records: 'i32s', motionX: 'f32', motionY: 'f32', motionZ: 'f32' }),
  /** Packet61DoorChange: playAuxSFX (door sounds, smoke, block break particles 2001, ...). */
  AuxSFX: def(61, 's2c', { sfxId: 'i32', x: 'i32', y: 'i16', z: 'i32', data: 'i32', broadcast: 'bool' }),
  /** Packet62LevelSound: position in 1/8 blocks, pitch in 1/63 steps (0-255). */
  LevelSound: def(62, 's2c', { name: 'name', x: 'i32', y: 'i32', z: 'i32', volume: 'f32', pitch: 'u8' }),
  /** Packet63WorldParticles: one particle kind, (x, y, z, vx, vy, vz) for each. */
  WorldParticles: def(63, 's2c', { name: 'name', values: 'f32s' }),
  /** Packet70GameEvent: 0 bed invalid, 1 rain starts, 2 rain stops, 3 game mode changed. */
  GameEvent: def(70, 's2c', { reason: 'u8', value: 'u8' }),
  /** Packet71Weather: a lightning bolt. */
  Weather: def(71, 's2c', { entityId: 'i32', x: 'i32', y: 'i32', z: 'i32' }),
  /** Packet100OpenWindow: a container window opened on the server (type: see WindowTypes). */
  OpenWindow: def(100, 's2c', { windowId: 'u8', inventoryType: 'u8', title: 'str', slotsCount: 'u8', useTitle: 'bool', x: 'i32', y: 'i32', z: 'i32' }),
  /** Packet101CloseWindow. */
  CloseWindow: def(101, 'both', { windowId: 'u8' }),
  /** Packet102WindowClick: the click and the stack the guest saw in the slot. */
  WindowClick: def(102, 'c2s', { windowId: 'u8', slot: 'i16', button: 'u8', action: 'u16', mode: 'u8', item: 'item' }),
  /** Packet103SetSlot (window -1 slot -1 is the cursor stack). */
  SetSlot: def(103, 's2c', { windowId: 'i8', slot: 'i16', item: 'item' }),
  /** Packet104WindowItems. */
  WindowItems: def(104, 's2c', { windowId: 'u8', items: 'items' }),
  /** Packet105UpdateProgressBar: furnace, brewing stand and enchanting table values. */
  UpdateProgressBar: def(105, 's2c', { windowId: 'u8', progressBar: 'i16', value: 'i16' }),
  /** Packet106Transaction: whether a window click was accepted. */
  Transaction: def(106, 'both', { windowId: 'u8', action: 'u16', accepted: 'bool' }),
  /** Packet107CreativeSetSlot: the creative inventory sets a slot of the player's window (-1 drops). */
  CreativeSetSlot: def(107, 'c2s', { slot: 'i16', item: 'item' }),
  /** Packet108EnchantItem: an enchanting table offer was clicked. */
  EnchantItem: def(108, 'c2s', { windowId: 'u8', enchantment: 'u8' }),
  /** Packet130UpdateSign: four lines (the guest's edit, or the server's copy). */
  UpdateSign: def(130, 'both', { x: 'i32', y: 'i16', z: 'i32', line0: 'str', line1: 'str', line2: 'str', line3: 'str' }),
  /** Packet132TileEntityData: a tile entity's description (spawner mob, skull, beacon, command block). */
  TileEntityData: def(132, 's2c', { x: 'i32', y: 'i16', z: 'i32', tag: 'json' }),
  /** Packet201PlayerInfo: an entry of the TAB list. */
  PlayerInfo: def(201, 's2c', { name: 'name', connected: 'bool', ping: 'i16' }),
  /** Packet202PlayerAbilities: 1 invulnerable, 2 flying, 4 may fly, 8 creative. */
  PlayerAbilities: def(202, 'both', { flags: 'u8', flySpeed: 'f32', walkSpeed: 'f32' }),
  /** Packet203AutoComplete: the text before the cursor, or the matches joined by NUL. */
  AutoComplete: def(203, 'both', { text: 'str' }),
  /** Packet204ClientInfo: render distance (0 far .. 3 tiny) and chat visibility. */
  ClientInfo: def(204, 'c2s', { viewDistance: 'u8', chatVisibility: 'u8' }),
  /** Packet205ClientCommand: 0 initial spawn done, 1 respawn. */
  ClientCommand: def(205, 'c2s', { payload: 'u8' }),
  /** Packet250CustomPayload: MC|BEdit, MC|BSign, MC|TrSel, MC|Beacon, MC|ItemName, MC|AdvCdm. */
  CustomPayload: def(250, 'both', { channel: 'name', data: 'bytes' }),
  /** Packet255KickDisconnect: the reason shown on the disconnect screen. */
  KickDisconnect: def(255, 'both', { reason: 'str' }),
} as const;

export type PacketName = keyof typeof PACKETS;
type FieldsOf<N extends PacketName> = (typeof PACKETS)[N]['fields'];
export type PacketOf<N extends PacketName> = { type: N } & { -readonly [K in keyof FieldsOf<N>]: ValueOf<FieldsOf<N>[K]> };
export type Packet = { [N in PacketName]: PacketOf<N> }[PacketName];

const BY_ID: (PacketName | undefined)[] = [];
for (const name of Object.keys(PACKETS) as PacketName[]) {
  const id = PACKETS[name].id;
  if (BY_ID[id]) throw new Error(`duplicate packet id ${id}`);
  BY_ID[id] = name;
}

/** The packet's numeric id. */
export function packetId(p: Packet): number {
  return PACKETS[p.type].id;
}

/** Whether a side may receive this packet (the server only takes c2s/both, the client s2c/both). */
export function allowedFrom(name: PacketName, sender: 'server' | 'client'): boolean {
  const dir = PACKETS[name].dir;
  return dir === 'both' || (sender === 'server' ? dir === 's2c' : dir === 'c2s');
}

// ---------------------------------------------------------------------- item stacks

export function writeItemStack(w: PacketWriter, s: ItemStack | null): void {
  if (!s) {
    w.i16(-1);
    return;
  }
  w.i16(s.itemID);
  w.u8(Math.max(0, Math.min(255, s.stackSize)));
  w.i16(s.getItemDamage());
  w.str(s.stackTagCompound ? JSON.stringify(s.stackTagCompound) : '');
}

/** Packet.readItemStack: unknown ids read as null; tags must be JSON objects and are sanitised. */
export function readItemStack(r: PacketReader): ItemStack | null {
  const id = r.i16();
  if (id < 0) return null;
  const count = r.u8();
  const damage = r.i16();
  const tag = r.str(MAX_TAG);
  if (id >= Item.itemsList.length || !Item.itemsList[id]) return null;
  const s = new ItemStack(id, count, damage);
  if (tag.length > 0) s.stackTagCompound = parseTag(tag);
  return s;
}

/** A tag must be a JSON object; it is rebuilt from the whitelist of known keys (ItemTags). */
function parseTag(text: string): TagCompound {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new ProtocolError('bad item tag');
  }
  const tag = sanitizeItemTag(v);
  if (!tag) throw new ProtocolError('bad item tag');
  return tag;
}

// ---------------------------------------------------------------------- metadata

const META_INT = 0;
const META_FLOAT = 1;
const META_BOOL = 2;
const META_STRING = 3;
const META_ITEM = 4;
const META_NULL = 5;

function writeMeta(w: PacketWriter, entries: MetaEntry[]): void {
  w.varint(entries.length);
  for (const [index, v] of entries) {
    w.u8(index);
    if (v === null) w.u8(META_NULL);
    else if (typeof v === 'boolean') {
      w.u8(META_BOOL);
      w.bool(v);
    } else if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) {
        w.u8(META_INT);
        w.i32(v);
      } else {
        w.u8(META_FLOAT);
        w.f64(v);
      }
    } else if (typeof v === 'string') {
      w.u8(META_STRING);
      w.str(v);
    } else {
      w.u8(META_ITEM);
      writeItemStack(w, v);
    }
  }
}

function readMeta(r: PacketReader): MetaEntry[] {
  const n = r.varint();
  if (n > 255) throw new ProtocolError('too many metadata entries');
  const out: MetaEntry[] = [];
  for (let i = 0; i < n; i++) {
    const index = r.u8();
    const t = r.u8();
    let v: MetaValue;
    if (t === META_INT) v = r.i32();
    else if (t === META_FLOAT) v = r.f64();
    else if (t === META_BOOL) v = r.bool();
    else if (t === META_STRING) v = r.str(MAX_STR);
    else if (t === META_ITEM) v = readItemStack(r);
    else if (t === META_NULL) v = null;
    else throw new ProtocolError(`bad metadata type ${t}`);
    out.push([index, v]);
  }
  return out;
}

// ---------------------------------------------------------------------- packets

function writeField(w: PacketWriter, t: FieldType, v: unknown): void {
  switch (t) {
    case 'u8':
      return w.u8(v as number);
    case 'i8':
      return w.i8(v as number);
    case 'u16':
      return w.u16(v as number);
    case 'i16':
      return w.i16(v as number);
    case 'i32':
      return w.i32(v as number);
    case 'f32':
      return w.f32(v as number);
    case 'f64':
      return w.f64(v as number);
    case 'bool':
      return w.bool(v as boolean);
    case 'varint':
      return w.varint(v as number);
    case 'str':
    case 'name':
      return w.str(v as string);
    case 'bytes':
      return w.bytes(v as Uint8Array);
    case 'json':
      return w.str(v === undefined ? 'null' : JSON.stringify(v));
    case 'item':
      return writeItemStack(w, v as ItemStack | null);
    case 'items': {
      const list = v as (ItemStack | null)[];
      w.varint(list.length);
      for (const s of list) writeItemStack(w, s);
      return;
    }
    case 'meta':
      return writeMeta(w, v as MetaEntry[]);
    case 'i32s': {
      const list = v as number[];
      w.varint(list.length);
      for (const n of list) w.i32(n);
      return;
    }
    case 'f32s': {
      const list = v as number[];
      w.varint(list.length);
      for (const n of list) w.f32(n);
      return;
    }
  }
}

function readField(r: PacketReader, t: FieldType): unknown {
  switch (t) {
    case 'u8':
      return r.u8();
    case 'i8':
      return r.i8();
    case 'u16':
      return r.u16();
    case 'i16':
      return r.i16();
    case 'i32':
      return r.i32();
    case 'f32':
      return r.f32();
    case 'f64':
      return r.f64();
    case 'bool':
      return r.bool();
    case 'varint':
      return r.varint();
    case 'str':
      return r.str(MAX_STR);
    case 'name':
      return r.str(MAX_NAME);
    case 'bytes':
      return r.bytes(MAX_BYTES).slice();
    case 'json': {
      const text = r.str(MAX_JSON);
      try {
        return JSON.parse(text);
      } catch {
        throw new ProtocolError('bad JSON field');
      }
    }
    case 'item':
      return readItemStack(r);
    case 'items': {
      const n = r.varint();
      if (n > MAX_ITEMS) throw new ProtocolError('too many items');
      const out: (ItemStack | null)[] = [];
      for (let i = 0; i < n; i++) out.push(readItemStack(r));
      return out;
    }
    case 'meta':
      return readMeta(r);
    case 'i32s':
    case 'f32s': {
      const n = r.varint();
      if (n > MAX_LIST) throw new ProtocolError('list too long');
      if (n * 4 > r.remaining) throw new ProtocolError('message ends early');
      const out: number[] = new Array(n);
      for (let i = 0; i < n; i++) out[i] = t === 'i32s' ? r.i32() : r.f32();
      return out;
    }
  }
}

/** Writes one packet (id byte + fields). */
export function writePacket(w: PacketWriter, p: Packet): void {
  const d = PACKETS[p.type] as PacketDef;
  w.u8(d.id);
  const rec = p as unknown as Record<string, unknown>;
  for (const [k, t] of Object.entries(d.fields)) writeField(w, t, rec[k]);
}

/** Reads one packet; unknown ids and malformed fields throw ProtocolError. */
export function readPacket(r: PacketReader): Packet {
  const id = r.u8();
  const name = BY_ID[id];
  if (!name) throw new ProtocolError(`unknown packet id ${id}`);
  const d = PACKETS[name] as PacketDef;
  const out: Record<string, unknown> = { type: name };
  for (const [k, t] of Object.entries(d.fields)) out[k] = readField(r, t);
  return out as unknown as Packet;
}

export function encodePacket(p: Packet): Uint8Array {
  const w = new PacketWriter(64);
  writePacket(w, p);
  return w.finish();
}

export function decodePacket(data: Uint8Array): Packet {
  const r = new PacketReader(data);
  const p = readPacket(r);
  if (r.remaining !== 0) throw new ProtocolError(`${r.remaining} trailing bytes after ${p.type}`);
  return p;
}

// ---------------------------------------------------------------------- frames

/** Frame header byte ('M') so stray data on the channel is recognised and dropped. */
const FRAME_MAGIC = 0x4d;

/** Several packets in one message: magic, count, then each packet with its byte length. */
export function encodeFrame(packets: readonly Packet[]): Uint8Array {
  const w = new PacketWriter(256);
  w.u8(FRAME_MAGIC);
  w.varint(packets.length);
  for (const p of packets) w.bytes(encodePacket(p));
  return w.finish();
}

/**
 * Splits a frame into packets. Throws ProtocolError when the frame is malformed, larger than
 * `maxBytes`, or holds more than `maxPackets` packets.
 */
export function decodeFrame(data: Uint8Array, maxBytes: number, maxPackets: number): Packet[] {
  if (data.length > maxBytes) throw new ProtocolError(`message of ${data.length} bytes exceeds ${maxBytes}`);
  const r = new PacketReader(data);
  if (r.u8() !== FRAME_MAGIC) throw new ProtocolError('not a game message');
  const n = r.varint();
  if (n > maxPackets) throw new ProtocolError(`${n} packets in one message`);
  const out: Packet[] = [];
  for (let i = 0; i < n; i++) out.push(decodePacket(r.bytes(maxBytes)));
  if (r.remaining !== 0) throw new ProtocolError('trailing bytes after the last packet');
  return out;
}
