/**
 * World saving: the NBT codec (types, modified UTF-8, limits), region files, and (further down)
 * chunks, level.dat, players, every entity and tile entity through their 1.5.2 NBT.
 * Run: node scripts/run-node-test.mjs tests/persistence.test.ts
 */
import { NBT, NBTError, NBTType, cloneNBT, nbtTypeOf, readCompressedNBT, readNBT, writeCompressedNBT, writeNBT, zlibDeflate } from '../src/world/storage/NBT';
import { decodeRegion, encodeRegion, parseRegionFileName, regionFileName } from '../src/world/storage/RegionFile';
import type { TagCompound } from '../src/item/ItemStack';
import { check, report } from './harness';

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

report();
