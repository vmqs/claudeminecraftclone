/**
 * The multiplayer wire format: every packet type round-trips, frames split back into their
 * packets, malformed or oversized input is rejected with ProtocolError (never a crash or a
 * huge allocation), chunk data survives compression, and room codes / usernames validate.
 * Run: node scripts/run-node-test.mjs tests/netprotocol.test.ts
 */
import '../src/block/Blocks';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { decodeChunkData, encodeChunkData } from '../src/net/protocol/ChunkCodec';
import { ProtocolError, PacketWriter } from '../src/net/protocol/PacketBuffer';
import { PACKETS, type Packet, type PacketName, decodeFrame, decodePacket, encodeFrame, encodePacket } from '../src/net/protocol/Packets';
import { ROOM_CODE_ALPHABET, deriveRoomKeys, formatRoomCode, generateRoomCode, normalizeRoomCode } from '../src/net/RoomCode';
import { defaultUsername, isValidUsername } from '../src/net/Username';
import { check, report } from './harness';

registerBlockItems();

function sample(name: PacketName): Packet {
  const out: Record<string, unknown> = { type: name };
  let n = 1;
  for (const [k, t] of Object.entries(PACKETS[name].fields)) {
    n++;
    switch (t) {
      case 'u8':
        out[k] = (n * 37) & 255;
        break;
      case 'i8':
        out[k] = -n;
        break;
      case 'u16':
        out[k] = n * 1000;
        break;
      case 'i16':
        out[k] = -n * 300;
        break;
      case 'i32':
        out[k] = -123456 * n;
        break;
      case 'f32':
        out[k] = Math.fround(n + 0.25);
        break;
      case 'f64':
        out[k] = n * 1234.5678;
        break;
      case 'bool':
        out[k] = n % 2 === 0;
        break;
      case 'varint':
        out[k] = n * 300;
        break;
      case 'str':
        out[k] = `text ${k} §e ünïcödé`;
        break;
      case 'name':
        out[k] = `name_${n}`;
        break;
      case 'bytes':
        out[k] = new Uint8Array([1, 2, 3, n]);
        break;
      case 'json':
        out[k] = { a: n, b: [1, 'x'], c: { d: true } };
        break;
      case 'item': {
        const s = new ItemStack(276, 1, 5);
        s.stackTagCompound = { ench: [{ id: 16, lvl: 3 }] };
        out[k] = s;
        break;
      }
      case 'items':
        out[k] = [new ItemStack(1, 64, 0), null, new ItemStack(35, 3, 14)];
        break;
      case 'meta':
        out[k] = [
          [0, 3],
          [1, 2.5],
          [2, true],
          [3, 'name'],
          [4, new ItemStack(264, 2, 0)],
          [5, null],
        ];
        break;
      case 'i32s':
        out[k] = [1, -2, 2147483647, -2147483648];
        break;
      case 'f32s':
        out[k] = [0.5, -1.25, 100];
        break;
    }
  }
  return out as unknown as Packet;
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof ItemStack || b instanceof ItemStack) {
    if (!(a instanceof ItemStack) || !(b instanceof ItemStack)) return false;
    return ItemStack.areItemStacksEqual(a, b);
  }
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((v, i) => v === b[i]);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

// Every packet round-trips.
const all: Packet[] = [];
for (const name of Object.keys(PACKETS) as PacketName[]) {
  const p = sample(name);
  all.push(p);
  const back = decodePacket(encodePacket(p));
  check(`round trip ${name}`, same(p, back), JSON.stringify(back, (_k, v) => (v instanceof Uint8Array ? [...v] : v)));
}

// Frames.
const frame = encodeFrame(all);
const parsed = decodeFrame(frame, 1 << 20, 1000);
check('frame keeps every packet', parsed.length === all.length && parsed.every((p, i) => same(p, all[i])));
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ProtocolError;
  }
};
check('frame over the size limit', throws(() => decodeFrame(frame, 100, 1000)));
check('frame over the packet limit', throws(() => decodeFrame(frame, 1 << 20, 3)));
check('truncated frame', throws(() => decodeFrame(frame.subarray(0, frame.length - 3), 1 << 20, 1000)));
check('not a frame', throws(() => decodeFrame(new Uint8Array([1, 2, 3]), 1 << 20, 1000)));
check('empty message', throws(() => decodeFrame(new Uint8Array(0), 1 << 20, 1000)));
check('unknown packet id', throws(() => decodePacket(new Uint8Array([99, 0, 0]))));
check('trailing bytes', throws(() => decodePacket(new Uint8Array([...encodePacket({ type: 'KeepAlive', id: 5 }), 7]))));
{
  // A list claiming far more entries than the message holds is refused before allocating.
  const w = new PacketWriter();
  w.u8(PACKETS.DestroyEntity.id);
  w.varint(60000);
  check('list longer than the message', throws(() => decodePacket(w.finish())));
  const w2 = new PacketWriter();
  w2.u8(PACKETS.Chat.id);
  w2.varint(1 << 30);
  check('string longer than the limit', throws(() => decodePacket(w2.finish())));
}
{
  // Random garbage never escapes as anything but ProtocolError.
  let ok = true;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 0) / 0x7fffffff;
  for (let i = 0; i < 3000; i++) {
    const len = Math.floor(rnd() * 64);
    const b = new Uint8Array(len);
    for (let j = 0; j < len; j++) b[j] = Math.floor(rnd() * 256);
    if (i % 2 === 0 && len > 0) b[0] = 0x4d;
    try {
      decodeFrame(b, 1 << 16, 64);
    } catch (e) {
      if (!(e instanceof ProtocolError)) {
        ok = false;
        console.log('non-protocol error', e);
        break;
      }
    }
  }
  check('fuzzed frames only raise ProtocolError', ok);
}
{
  // Unknown item ids read as null; a stack's tag must be an object.
  const w = new PacketWriter();
  w.u8(PACKETS.CreativeSetSlot.id);
  w.i16(5);
  w.i16(31000);
  w.u8(1);
  w.i16(0);
  w.str('');
  const p = decodePacket(w.finish());
  check('unknown item id reads as null', p.type === 'CreativeSetSlot' && p.item === null);
  const w2 = new PacketWriter();
  w2.u8(PACKETS.CreativeSetSlot.id);
  w2.i16(5);
  w2.i16(1);
  w2.u8(1);
  w2.i16(0);
  w2.str('[1,2]');
  check('array item tag refused', throws(() => decodePacket(w2.finish())));
  // Item tags are rebuilt from the whitelist: unknown keys, null entries, wrong types and huge
  // values go; a well-formed tag comes back unchanged (same key order, so equal JSON).
  const tagged = (tag: unknown, id = 373, damage = 8193): ItemStack | null => {
    const s = new ItemStack(id, 1, damage);
    s.stackTagCompound = tag as never;
    const back = decodePacket(encodePacket({ type: 'CreativeSetSlot', slot: 36, item: s }));
    return back.type === 'CreativeSetSlot' ? back.item : null;
  };
  const potion = tagged({ CustomPotionEffects: [null, { Id: 1, Amplifier: 120, Duration: -5 }, { Id: 99 }, 'x'], junk: { a: 1 } });
  check('null potion effects dropped', JSON.stringify(potion?.stackTagCompound) === '{"CustomPotionEffects":[{"Id":1,"Amplifier":9,"Duration":0}]}', JSON.stringify(potion?.stackTagCompound));
  let effectsOk = true;
  try {
    potion?.hasEffect();
    (potion?.getItem() as unknown as { getEffects(s: ItemStack): unknown }).getEffects(potion!);
  } catch {
    effectsOk = false;
  }
  check('sanitised potion is usable', effectsOk);
  const sword = tagged({ ench: [null, { id: 16, lvl: 32767 }, { id: 200, lvl: 1 }, { id: 'x' }], display: { Name: 7, Lore: ['a', null, 'b'] } }, 276, 0);
  check('enchantment list cleaned', JSON.stringify(sword?.stackTagCompound) === '{"ench":[{"id":16,"lvl":10}],"display":{"Lore":["a","b"]}}', JSON.stringify(sword?.stackTagCompound));
  const fine = { display: { Name: 'Sting', color: 123 }, ench: [{ id: 16, lvl: 5 }], RepairCost: 3 };
  const fineBack = tagged(structuredClone(fine), 276, 0);
  check('well-formed tag unchanged', JSON.stringify(fineBack?.stackTagCompound) === JSON.stringify(fine), JSON.stringify(fineBack?.stackTagCompound));
  const rocket = { Fireworks: { Flight: 2, Explosions: [{ Type: 1, Colors: [1, 2], Trail: true }] } };
  check('firework tag kept', JSON.stringify(tagged(structuredClone(rocket), 401, 0)?.stackTagCompound) === JSON.stringify(rocket));
  check('prototype keys ignored', JSON.stringify(tagged(JSON.parse('{"__proto__":{"x":1},"title":"t"}'), 387, 0)?.stackTagCompound) === '{"title":"t"}');
}

// The handshake and the kick message must read the same in every build (Packets.ts), so a
// version mismatch shows its reason instead of "Protocol error". These bytes never change.
{
  const hs = [...encodePacket({ type: 'Handshake', protocolVersion: 1, gameVersion: '1.5.2', username: 'Bob' })];
  check('handshake layout frozen', JSON.stringify(hs) === '[2,0,1,5,49,46,53,46,50,3,66,111,98]', JSON.stringify(hs));
  const kick = [...encodePacket({ type: 'KickDisconnect', reason: 'Bye' })];
  check('kick layout frozen', JSON.stringify(kick) === '[255,3,66,121,101]', JSON.stringify(kick));
  const future = decodePacket(new Uint8Array([2, 0, 9, 5, 49, 46, 53, 46, 50, 3, 66, 111, 98]));
  check('a newer protocol still reads as a handshake', future.type === 'Handshake' && future.protocolVersion === 9);
}

// Chunk data.
{
  const blocks = new Uint8Array(4096);
  const meta = new Uint8Array(4096);
  const sky = new Uint8Array(4096);
  const light = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    blocks[i] = (i * 7) & 255;
    meta[i] = i & 15;
    sky[i] = (i >> 4) & 15;
    light[i] = (i >> 8) & 15;
  }
  const biomes = new Uint8Array(256).map((_v, i) => i % 23);
  const enc = encodeChunkData({ sections: [{ index: 3, blocks, meta, skyLight: sky, blockLight: light }], biomes });
  const dec = decodeChunkData(enc);
  const s = dec.sections[0];
  check('chunk section index', dec.sections.length === 1 && s.index === 3);
  check('chunk blocks', same(s.blocks, blocks));
  check('chunk nibbles', same(s.meta, meta) && same(s.skyLight, sky) && same(s.blockLight, light));
  check('chunk biomes', same(dec.biomes, biomes));
  const empty = decodeChunkData(encodeChunkData({ sections: [], biomes }));
  check('empty chunk', empty.sections.length === 0 && same(empty.biomes, biomes));
  check('garbage chunk data', throws(() => decodeChunkData(new Uint8Array([1, 2, 3, 4]))));
  check('truncated chunk data', throws(() => decodeChunkData(enc.subarray(0, enc.length >> 1))));
}

// Room codes and usernames.
{
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) codes.add(generateRoomCode());
  check('room codes are random', codes.size > 190);
  check('room codes use the alphabet', [...codes].every((c) => c.length === 8 && [...c].every((ch) => ROOM_CODE_ALPHABET.includes(ch))));
  check('room code normalised', normalizeRoomCode(' abcd-2345 ') === 'ABCD2345' && normalizeRoomCode('ab cd 23 45') === 'ABCD2345');
  check('room code shown with a dash', formatRoomCode('ABCD2345') === 'ABCD-2345');
  check('look-alikes refused', normalizeRoomCode('ABCD1023') === null && normalizeRoomCode('OOOOOOOO') === null);
  check('wrong length refused', normalizeRoomCode('ABC2345') === null && normalizeRoomCode('ABC234567') === null);
  const k1 = await deriveRoomKeys('ABCD2345');
  const k2 = await deriveRoomKeys('ABCD2345');
  const k3 = await deriveRoomKeys('ABCD2346');
  check('room keys are stable', k1.roomId === k2.roomId && k1.password === k2.password);
  check('room keys differ per code', k1.roomId !== k3.roomId && k1.password !== k3.password);
  check('room keys hide the code', /^[0-9a-f]{32}$/.test(k1.roomId) && /^[0-9a-f]{32}$/.test(k1.password) && k1.roomId !== k1.password && !k1.roomId.includes('ABCD'));
  check('usernames', isValidUsername('Notch') && isValidUsername('a_b') && isValidUsername('x'.repeat(16)));
  check('bad usernames', !isValidUsername('ab') && !isValidUsername('x'.repeat(17)) && !isValidUsername('bad name') && !isValidUsername('é_ok'));
  check('default username', /^Player\d{3}$/.test(defaultUsername()) && isValidUsername(defaultUsername()));
}

report();
