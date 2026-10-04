// Node checks for RenderBlocks: every 1.5.2 render type draws without throwing, with finite
// coordinates inside its block (plus the known overhangs), and the expected vertex counts for
// a few shapes whose geometry is fixed. Run: node scripts/run-node-test.mjs tests/renderblocks.test.ts
import '../src/block/Blocks';
import { Block } from '../src/block/Block';
import { BlockIds } from '../src/block/BlockIds';
import { Tessellator } from '../src/render/gl/Tessellator';
import { RenderBlocks, type ItemRenderGL } from '../src/render/RenderBlocks';
import { Icon, IconTableRegister, type IconTable } from '../src/render/texture/Icon';
import { allocSnapshot, ChunkCache, SNAPSHOT_SIZE } from '../src/world/ChunkCache';
import { check, report } from './harness';

for (const b of Block.blocksList) b?.initializeBlock();
const register = new IconTableRegister();
const names: string[] = [];
const orig = register.registerIcon.bind(register);
register.registerIcon = (name: string) => {
  if (!names.includes(name)) names.push(name);
  return orig(name);
};
for (const b of Block.blocksList) if (b) b.registerIcons(register);
const table: IconTable = { sheetWidth: 1024, sheetHeight: 1024, icons: {}, missing: [0, 0, 16, 16] };
names.forEach((n, i) => (table.icons[n] = [((i % 63) + 1) * 16, Math.floor(i / 63) * 16, 16, 16]));
register.apply(table);
const missing = new Icon('missingno');
missing.setPlacement(1024, 1024, 0, 0, 16, 16);
RenderBlocks.missingIcon = missing;

const S = SNAPSHOT_SIZE;
type Placed = [number, number, number, number, number?];

/** A snapshot whose origin cell is world (0, 62, 0); everything is lit by full sky light. */
function world(blocks: Placed[]): ChunkCache {
  const snap = allocSnapshot();
  snap.x0 = 0;
  snap.y0 = 62;
  snap.z0 = 0;
  snap.sky.fill(15);
  snap.biomes.fill(1);
  for (const [x, y, z, id, meta] of blocks) {
    const i = ((y - 62) * S + z) * S + x;
    snap.ids[i] = id;
    snap.meta[i] = meta ?? 0;
    snap.sky[i] = 15;
  }
  return new ChunkCache(snap);
}

/** Renders the block at (x, y, z) and returns its vertices (x, y, z, u, v). */
function render(w: ChunkCache, x: number, y: number, z: number, ao = 0): number[][] {
  RenderBlocks.aoLevel = ao;
  const t = Tessellator.instance;
  t.startDrawingQuads();
  const rb = new RenderBlocks(w);
  rb.renderBlockByRenderType(Block.blocksList[w.getBlockId(x, y, z)]!, x, y, z);
  const n = t.vertexCount;
  const f = t.getRawFloat32();
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push([f[i * 8], f[i * 8 + 1], f[i * 8 + 2], f[i * 8 + 3], f[i * 8 + 4]]);
  t.isDrawing = false;
  t.reset();
  return out;
}

const X = 8;
const Y = 70;
const Z = 8;
const stone = BlockIds.stone;
const floor: Placed[] = [];
for (let x = 2; x < 15; x++) for (let z = 2; z < 15; z++) floor.push([x, Y - 1, z, stone]);

/** Every block id with a render type other than -1 and 22 draws something and stays in range. */
for (const block of Block.blocksList) {
  if (!block) continue;
  const type = block.getRenderType();
  if (type === -1 || type === 22) continue;
  for (const meta of [0, 1, 2, 3, 5, 8, 9, 13]) {
    for (const ao of [0, 2]) {
      let verts: number[][] = [];
      const id = block.blockID;
      const extra: Placed[] = [];
      // Doors need both halves.
      if (type === 7) extra.push([X, Y + 1, Z, id, 8]);
      try {
        verts = render(world([...floor, ...extra, [X, Y, Z, id, meta]]), X, Y, Z, ao);
      } catch (e) {
        check(`render ${block.getUnlocalizedName()} type ${type} meta ${meta}`, false, String((e as Error).stack));
        continue;
      }
      const finite = verts.every((v) => v.every((c) => Number.isFinite(c)));
      // Fire leans 0.2 over and rises 1.4; piston rods reach into the base; everything else stays near the block.
      const inRange = verts.every((v) => v[0] > X - 1.01 && v[0] < X + 2.01 && v[1] > Y - 1.01 && v[1] < Y + 2.01 && v[2] > Z - 1.01 && v[2] < Z + 2.01);
      check(`finite ${block.getUnlocalizedName()} ${meta}`, finite);
      check(`range ${block.getUnlocalizedName()} type ${type} ${meta}`, inRange, JSON.stringify(verts.find((v) => !(v[0] > X - 1.01 && v[0] < X + 2.01 && v[1] > Y - 1.01 && v[1] < Y + 2.01))));
      check(`quads ${block.getUnlocalizedName()} ${meta}`, verts.length % 4 === 0, String(verts.length));
    }
  }
}

function count(blocks: Placed[], at: [number, number, number] = [X, Y, Z], ao = 0): number {
  return render(world([...floor, ...blocks]), at[0], at[1], at[2], ao).length;
}

check('rail 8', count([[X, Y, Z, BlockIds.rail, 0]]) === 8);
check('ladder 4', count([[X, Y, Z, BlockIds.ladder, 2]]) === 4);
check('lily pad 8', count([[X, Y, Z, BlockIds.waterlily, 0]]) === 8);
check('crops 32', count([[X, Y, Z, BlockIds.crops, 7]]) === 32);
check('lone dust cross 8', count([[X, Y, Z, BlockIds.redstoneWire, 0]]) === 8);
check('lone tripwire 32', count([[X, Y, Z, BlockIds.tripWire, 0]]) === 32);
check('floor lever 44 (base bottom culled by the floor)', count([[X, Y, Z, BlockIds.lever, 5]]) === 44, String(count([[X, Y, Z, BlockIds.lever, 5]])));
check('lone pane 32 (no bottom caps on a floor)', count([[X, Y, Z, BlockIds.thinGlass, 0]]) === 32, String(count([[X, Y, Z, BlockIds.thinGlass, 0]])));
check(
  'pane west-east 16',
  count([
    [X - 1, Y, Z, stone],
    [X + 1, Y, Z, stone],
    [X, Y, Z, BlockIds.thinGlass, 0],
  ]) === 16,
);
check('lone fence: BlockFence draws every face of the post and two x bars', count([[X, Y, Z, BlockIds.fence, 0]]) === 72, String(count([[X, Y, Z, BlockIds.fence, 0]])));
const dust = count([
  [X + 1, Y, Z, stone],
  [X + 1, Y + 1, Z, BlockIds.redstoneWire],
  [X, Y, Z, BlockIds.redstoneWire, 0],
]);
check('dust climbing a block draws the line and the strip', dust === 16, String(dust));
check('fire on the floor 32', count([[X, Y, Z, BlockIds.fire, 0]]) === 32);
check('fire beside planks 8', count([[X, Y - 1, Z, 0], [X - 1, Y, Z, BlockIds.planks], [X, Y, Z, BlockIds.fire, 0]]) === 8, String(count([[X, Y - 1, Z, 0], [X - 1, Y, Z, BlockIds.planks], [X, Y, Z, BlockIds.fire, 0]])));
check('chest draws nothing', count([[X, Y, Z, BlockIds.chest, 2]]) === 0);
check('door missing its top half draws nothing', count([[X, Y, Z, BlockIds.doorWood, 0]]) === 0);

// Fluids: corner heights follow getFluidHeight's weighting (sources count ten times, open
// non-solid neighbours count as empty), less the 0.001 gap.
{
  const fr = Math.fround;
  const lone = render(world([...floor, [X, Y, Z, BlockIds.waterStill, 0]]), X, Y, Z);
  const loneTop = fr(1 - fr(fr(fr(fr(fr(1 / 9) * 10) + fr(1 / 9)) + 3) / 14)) - fr(0.001);
  const tops = lone.slice(0, 4).map((v) => v[1] - Y);
  check('lone water source: top corners', tops.every((h) => Math.abs(h - loneTop) < 1e-5), JSON.stringify(tops) + ' vs ' + loneTop);
  check('lone water source: top, four sides (bottom on stone culled)', lone.length === 20, String(lone.length));
  const covered = render(world([...floor, [X, Y, Z, BlockIds.waterStill, 0], [X, Y + 1, Z, BlockIds.waterStill, 0]]), X, Y, Z);
  check('water under water: no top, sides full height (the gap only lowers a drawn top)', covered.length === 16 && covered.some((v) => v[1] === Y + 1), JSON.stringify(covered.map((v) => v[1] - Y)));
  // A flowing block (level 3) beside its source: the corners toward the source are higher.
  const flow = render(world([...floor, [X - 1, Y, Z, BlockIds.waterStill, 0], [X, Y, Z, BlockIds.waterStill, 3]]), X, Y, Z);
  const fy = flow.slice(0, 4).map((v) => v[1] - Y);
  check('flowing water slopes away from its source', fy[0] > fy[3] && fy[1] > fy[2], JSON.stringify(fy));
}

// renderBlockAsItem against a recording GL: every block renders without throwing.
const calls: string[] = [];
const gl: ItemRenderGL = {
  color: () => calls.push('color'),
  rotate: () => calls.push('rotate'),
  translate: () => calls.push('translate'),
};
RenderBlocks.itemGL = gl;
const drawn: number[] = [];
const t = Tessellator.instance;
const origDraw = t.draw.bind(t);
t.draw = () => {
  drawn.push(t.vertexCount);
  return origDraw();
};
for (const block of Block.blocksList) {
  if (!block) continue;
  drawn.length = 0;
  try {
    new RenderBlocks().renderBlockAsItem(block, 0, 1);
  } catch (e) {
    check(`item ${block.getUnlocalizedName()}`, false, String((e as Error).stack));
    continue;
  }
  const type = block.getRenderType();
  if (RenderBlocks.renderItemIn3d(type) && type !== 22) check(`item ${block.getUnlocalizedName()} draws`, drawn.some((n) => n > 0));
}
report();
