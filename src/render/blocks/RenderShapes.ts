import { Block } from '../../block/Block';
import { BlockCocoa } from '../../block/BlockCocoa';
import { BlockDirectional } from '../../block/BlockDirectional';
import type { BlockFire } from '../../block/BlockFire';
import { BlockIds } from '../../block/BlockIds';
import type { BlockRailBase } from '../../block/BlockRailBase';
import { BlockRedstoneWire } from '../../block/BlockRedstoneWire';
import type { BlockStem } from '../../block/BlockStem';
import { BlockTripWire } from '../../block/BlockTripWire';
import { Tessellator } from '../gl/Tessellator';
import type { RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';
import { boxCorners, boxFace, doublePlane, fround, iconOfBlock, overridden, quad, quadBothSides, tintAt, type RVec } from './RenderHelpers';

/*
 * Flat and thin render types: plants, ladders, vines, rails, redstone dust, fire, cocoa pods,
 * tripwire, tripwire hooks and levers. Each mirrors the vertex order and UVs of 1.5.2's
 * RenderBlocks so that lighting, culling and texture orientation come out the same.
 */

const PI_F = fround(Math.PI);
/** 0.05F widened to double, the inset of ladders and vines. */
const INSET_05 = fround(0.05);

function blockLight(rb: RenderBlocks, block: Block, x: number, y: number, z: number): void {
  Tessellator.instance.setBrightness(block.getMixedBrightnessForBlock(rb.blockAccess!, x, y, z));
}

// ------------------------------------------------------------------ crops (6), stems (19), lily pads (23)

/** Type 6: four planes in a # shape, sunk 1/16 into the farmland. */
export function renderBlockCrops(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  blockLight(rb, block, x, y, z);
  Tessellator.instance.setColorOpaque_F(1.0, 1.0, 1.0);
  renderBlockCropsImpl(rb, block, rb.blockAccess!.getBlockMetadata(x, y, z), x, fround(y - 0.0625), z);
  return true;
}

export function renderBlockCropsImpl(rb: RenderBlocks, block: Block, meta: number, x: number, y: number, z: number): void {
  const icon = overridden(rb, rb.getBlockIconFromSideAndMetadata(block, 0, meta));
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  const top = y + 1.0;
  doublePlane(x + 0.25, z, x + 0.25, z + 1.0, y, top, u0, v0, u1, v1);
  doublePlane(x + 0.75, z + 1.0, x + 0.75, z, y, top, u0, v0, u1, v1);
  doublePlane(x, z + 0.25, x + 1.0, z + 0.25, y, top, u0, v0, u1, v1);
  doublePlane(x + 1.0, z + 0.75, x, z + 0.75, y, top, u0, v0, u1, v1);
}

/** Type 19: a growing stem (crossed planes cut to its height), bent toward an adjacent fruit. */
export function renderBlockStem(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const stem = block as BlockStem;
  const access = rb.blockAccess!;
  blockLight(rb, block, x, y, z);
  const [r, g, b] = tintAt(rb, block, x, y, z);
  Tessellator.instance.setColorOpaque_F(r, g, b);
  stem.setBlockBoundsBasedOnState(access, x, y, z);
  const state = stem.getState(access, x, y, z);
  const meta = access.getBlockMetadata(x, y, z);
  const py = fround(y - 0.0625);
  if (state < 0) {
    renderBlockStemSmall(rb, block, meta, rb.renderMaxY, x, py, z);
  } else {
    renderBlockStemSmall(rb, block, meta, 0.5, x, py, z);
    renderBlockStemBig(rb, stem, state, rb.renderMaxY, x, py, z);
  }
  return true;
}

/** Crossed planes `height` tall whose texture is cut (not squashed) to that height. */
export function renderBlockStemSmall(rb: RenderBlocks, block: Block, meta: number, height: number, x: number, y: number, z: number): void {
  const icon = overridden(rb, rb.getBlockIconFromSideAndMetadata(block, 0, meta));
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getInterpolatedV(height * 16.0);
  const half = fround(0.45);
  const x0 = x + 0.5 - half;
  const x1 = x + 0.5 + half;
  const z0 = z + 0.5 - half;
  const z1 = z + 0.5 + half;
  doublePlane(x0, z0, x1, z1, y, y + height, u0, v0, u1, v1);
  doublePlane(x0, z1, x1, z0, y, y + height, u0, v0, u1, v1);
}

/** The bent stem: one plane from the centre toward the fruit (state = direction 0..3). */
export function renderBlockStemBig(rb: RenderBlocks, stem: BlockStem, state: number, height: number, x: number, y: number, z: number): void {
  const icon = overridden(rb, rb.getIconSafe(stem.getBentIcon()));
  let u0 = icon.getMinU();
  const v0 = icon.getMinV();
  let u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  if (Math.trunc((state + 1) / 2) % 2 === 1) [u0, u1] = [u1, u0];
  const top = y + height;
  if (state < 2) {
    const cz = z + 0.5;
    quadBothSides([
      [x, top, cz, u0, v0],
      [x, y, cz, u0, v1],
      [x + 1.0, y, cz, u1, v1],
      [x + 1.0, top, cz, u1, v0],
    ]);
  } else {
    const cx = x + 0.5;
    quadBothSides([
      [cx, top, z + 1.0, u0, v0],
      [cx, y, z + 1.0, u0, v1],
      [cx, y, z, u1, v1],
      [cx, top, z, u1, v0],
    ]);
  }
}

/** Low 32 bits of the original's positional long hash (enough for the bits it reads). */
export function positionHash(x: number, y: number, z: number): number {
  const h = Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y;
  return (Math.imul(Math.imul(h, h), 42317861) + Math.imul(h, 11)) | 0;
}

/** Type 23: a flat pad just above the water, turned by a positional hash; the underside is darker. */
export function renderBlockLilyPad(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 1));
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  const turn = (positionHash(x, y, z) >> 16) & 3;
  blockLight(rb, block, x, y, z);
  const cx = fround(x + 0.5);
  const cz = fround(z + 0.5);
  const a = fround((turn & 1) * 0.5 * (1 - ((Math.trunc(turn / 2) % 2) * 2)));
  const b = fround(((turn + 1) & 1) * 0.5 * (1 - ((Math.trunc((turn + 1) / 2) % 2) * 2)));
  const py = fround(y + 0.015625);
  const c0: [number, number] = [fround(cx + a - b), fround(cz + a + b)];
  const c1: [number, number] = [fround(cx + a + b), fround(cz - a + b)];
  const c2: [number, number] = [fround(cx - a + b), fround(cz - a - b)];
  const c3: [number, number] = [fround(cx - a - b), fround(cz + a - b)];
  t.setColorOpaque_I(block.getBlockColor());
  quad([
    [c0[0], py, c0[1], u0, v0],
    [c1[0], py, c1[1], u1, v0],
    [c2[0], py, c2[1], u1, v1],
    [c3[0], py, c3[1], u0, v1],
  ]);
  t.setColorOpaque_I((block.getBlockColor() & 0xfefefe) >> 1);
  quad([
    [c3[0], py, c3[1], u0, v1],
    [c2[0], py, c2[1], u1, v1],
    [c1[0], py, c1[1], u1, v0],
    [c0[0], py, c0[1], u0, v0],
  ]);
  return true;
}

// ------------------------------------------------------------------ ladders (8), vines (20)

/** Type 8: one quad 0.05 off the wall the ladder hangs on (metadata 2-5). */
export function renderBlockLadder(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 0));
  blockLight(rb, block, x, y, z);
  Tessellator.instance.setColorOpaque_F(1.0, 1.0, 1.0);
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const d = INSET_05;
  if (meta === 5) {
    quad([
      [x + d, y + 1, z + 1, u0, v0],
      [x + d, y, z + 1, u0, v1],
      [x + d, y, z, u1, v1],
      [x + d, y + 1, z, u1, v0],
    ]);
  }
  if (meta === 4) {
    quad([
      [x + 1 - d, y, z + 1, u1, v1],
      [x + 1 - d, y + 1, z + 1, u1, v0],
      [x + 1 - d, y + 1, z, u0, v0],
      [x + 1 - d, y, z, u0, v1],
    ]);
  }
  if (meta === 3) {
    quad([
      [x + 1, y, z + d, u1, v1],
      [x + 1, y + 1, z + d, u1, v0],
      [x, y + 1, z + d, u0, v0],
      [x, y, z + d, u0, v1],
    ]);
  }
  if (meta === 2) {
    quad([
      [x + 1, y + 1, z + 1 - d, u0, v0],
      [x + 1, y, z + 1 - d, u0, v1],
      [x, y, z + 1 - d, u1, v1],
      [x, y + 1, z + 1 - d, u1, v0],
    ]);
  }
  return true;
}

/** Type 20: a two-sided quad on each wall in the metadata bits, plus one under a solid ceiling. */
export function renderBlockVine(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 0));
  blockLight(rb, block, x, y, z);
  const [r, g, b] = tintAt(rb, block, x, y, z, false);
  Tessellator.instance.setColorOpaque_F(r, g, b);
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  const d = INSET_05;
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  if (meta & 2) {
    quadBothSides([
      [x + d, y + 1, z + 1, u0, v0],
      [x + d, y, z + 1, u0, v1],
      [x + d, y, z, u1, v1],
      [x + d, y + 1, z, u1, v0],
    ]);
  }
  if (meta & 8) {
    quadBothSides([
      [x + 1 - d, y, z + 1, u1, v1],
      [x + 1 - d, y + 1, z + 1, u1, v0],
      [x + 1 - d, y + 1, z, u0, v0],
      [x + 1 - d, y, z, u0, v1],
    ]);
  }
  if (meta & 4) {
    quadBothSides([
      [x + 1, y, z + d, u1, v1],
      [x + 1, y + 1, z + d, u1, v0],
      [x, y + 1, z + d, u0, v0],
      [x, y, z + d, u0, v1],
    ]);
  }
  if (meta & 1) {
    quadBothSides([
      [x + 1, y + 1, z + 1 - d, u0, v0],
      [x + 1, y, z + 1 - d, u0, v1],
      [x, y, z + 1 - d, u1, v1],
      [x, y + 1, z + 1 - d, u1, v0],
    ]);
  }
  if (rb.blockAccess!.isBlockNormalCube(x, y + 1, z)) {
    quad([
      [x + 1, y + 1 - d, z, u0, v0],
      [x + 1, y + 1 - d, z + 1, u0, v1],
      [x, y + 1 - d, z + 1, u1, v1],
      [x, y + 1 - d, z, u1, v0],
    ]);
  }
  return true;
}

// ------------------------------------------------------------------ rails (9)

/**
 * Type 9: a two-sided quad 1/16 above the ground. The metadata (shape 0-9; powered and
 * detector rails keep 3 bits) picks the texture rotation and which edge is raised one block.
 */
export function renderBlockMinecartTrack(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const rail = block as BlockRailBase;
  let meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const icon = overridden(rb, rb.getBlockIconFromSideAndMetadata(block, 0, meta));
  if (rail.isPowered()) meta &= 7;
  blockLight(rb, block, x, y, z);
  Tessellator.instance.setColorOpaque_F(1.0, 1.0, 1.0);
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getMaxU();
  const v1 = icon.getMaxV();
  // Corners a..d (x, z) and their heights.
  let ax = x + 1;
  let bx = x + 1;
  let cx = x;
  let dx = x;
  let az = z;
  let bz = z + 1;
  let cz = z + 1;
  let dz = z;
  const h = 0.0625;
  let ay = y + h;
  let by = y + h;
  let cy = y + h;
  let dy = y + h;
  if (meta === 1 || meta === 2 || meta === 3 || meta === 7) {
    ax = dx = x + 1;
    bx = cx = x;
    az = bz = z + 1;
    cz = dz = z;
  } else if (meta === 8) {
    ax = bx = x;
    cx = dx = x + 1;
    az = dz = z + 1;
    bz = cz = z;
  } else if (meta === 9) {
    ax = dx = x;
    bx = cx = x + 1;
    az = bz = z;
    cz = dz = z + 1;
  }
  if (meta === 2 || meta === 4) {
    ay++;
    dy++;
  } else if (meta === 3 || meta === 5) {
    by++;
    cy++;
  }
  quadBothSides([
    [ax, ay, az, u1, v0],
    [bx, by, bz, u1, v1],
    [cx, cy, cz, u0, v1],
    [dx, dy, dz, u0, v0],
  ]);
  return true;
}

// ------------------------------------------------------------------ redstone dust (5)

/** Whether dust at (x, y, z) runs toward the neighbour in `dir` (0 -x, 1 +x, 2 -z, 3 +z), steps included. */
function wireConnects(access: NonNullable<RenderBlocks['blockAccess']>, x: number, y: number, z: number, dx: number, dz: number, side: number): boolean {
  return (
    BlockRedstoneWire.isPowerProviderOrWire(access, x + dx, y, z + dz, side) ||
    (!access.isBlockNormalCube(x + dx, y, z + dz) && BlockRedstoneWire.isPowerProviderOrWire(access, x + dx, y - 1, z + dz, -1))
  );
}

/**
 * Type 5: the dust lies 1/64 above the floor as a cross (cut back on unconnected sides) or a
 * straight line, coloured by power level, with an untinted overlay pass; dust climbing a
 * block gets a vertical strip on that block's face.
 */
export function renderBlockRedstoneWire(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  const cross = rb.getIconSafe(BlockRedstoneWire.getRedstoneWireIcon('redstoneDust_cross'));
  const line = rb.getIconSafe(BlockRedstoneWire.getRedstoneWireIcon('redstoneDust_line'));
  const crossOverlay = rb.getIconSafe(BlockRedstoneWire.getRedstoneWireIcon('redstoneDust_cross_overlay'));
  const lineOverlay = rb.getIconSafe(BlockRedstoneWire.getRedstoneWireIcon('redstoneDust_line_overlay'));
  blockLight(rb, block, x, y, z);
  const power = fround(meta / 15.0);
  const r = meta === 0 ? fround(0.3) : fround(fround(power * 0.6) + 0.4);
  const g = Math.max(0, fround(fround(fround(power * power) * 0.7) - 0.5));
  const b = Math.max(0, fround(fround(fround(power * power) * 0.6) - 0.7));
  t.setColorOpaque_F(r, g, b);
  let west = wireConnects(access, x, y, z, -1, 0, 1);
  let east = wireConnects(access, x, y, z, 1, 0, 3);
  let north = wireConnects(access, x, y, z, 0, -1, 2);
  let south = wireConnects(access, x, y, z, 0, 1, 0);
  const openAbove = !access.isBlockNormalCube(x, y + 1, z);
  if (openAbove) {
    if (access.isBlockNormalCube(x - 1, y, z) && BlockRedstoneWire.isPowerProviderOrWire(access, x - 1, y + 1, z, -1)) west = true;
    if (access.isBlockNormalCube(x + 1, y, z) && BlockRedstoneWire.isPowerProviderOrWire(access, x + 1, y + 1, z, -1)) east = true;
    if (access.isBlockNormalCube(x, y, z - 1) && BlockRedstoneWire.isPowerProviderOrWire(access, x, y + 1, z - 1, -1)) north = true;
    if (access.isBlockNormalCube(x, y, z + 1) && BlockRedstoneWire.isPowerProviderOrWire(access, x, y + 1, z + 1, -1)) south = true;
  }
  let x0 = x;
  let x1 = x + 1;
  let z0 = z;
  let z1 = z + 1;
  const py = y + 0.015625;
  let shape = 0;
  if ((west || east) && !north && !south) shape = 1;
  if ((north || south) && !east && !west) shape = 2;
  if (shape === 0) {
    let tu0 = 0;
    let tv0 = 0;
    let tu1 = 16;
    let tv1 = 16;
    if (!west) {
      x0 += 0.3125;
      tu0 += 5;
    }
    if (!east) {
      x1 -= 0.3125;
      tu1 -= 5;
    }
    if (!north) {
      z0 += 0.3125;
      tv0 += 5;
    }
    if (!south) {
      z1 -= 0.3125;
      tv1 -= 5;
    }
    for (const icon of [cross, crossOverlay]) {
      quad([
        [x1, py, z1, icon.getInterpolatedU(tu1), icon.getInterpolatedV(tv1)],
        [x1, py, z0, icon.getInterpolatedU(tu1), icon.getInterpolatedV(tv0)],
        [x0, py, z0, icon.getInterpolatedU(tu0), icon.getInterpolatedV(tv0)],
        [x0, py, z1, icon.getInterpolatedU(tu0), icon.getInterpolatedV(tv1)],
      ]);
      t.setColorOpaque_F(1.0, 1.0, 1.0);
    }
  } else {
    for (const icon of [line, lineOverlay]) {
      const u0 = icon.getMinU();
      const u1 = icon.getMaxU();
      const v0 = icon.getMinV();
      const v1 = icon.getMaxV();
      if (shape === 1) {
        quad([
          [x1, py, z1, u1, v1],
          [x1, py, z0, u1, v0],
          [x0, py, z0, u0, v0],
          [x0, py, z1, u0, v1],
        ]);
      } else {
        quad([
          [x1, py, z1, u1, v1],
          [x1, py, z0, u0, v1],
          [x0, py, z0, u0, v0],
          [x0, py, z1, u1, v0],
        ]);
      }
      t.setColorOpaque_F(1.0, 1.0, 1.0);
    }
  }
  if (!openAbove) return true;
  const top = fround(y + 1 + fround(0.021875));
  const wireId = Block.blocksList[BlockIds.redstoneWire]!.blockID;
  const climbs = (dx: number, dz: number): boolean => access.isBlockNormalCube(x + dx, y, z + dz) && access.getBlockId(x + dx, y + 1, z + dz) === wireId;
  const strip = (verts: (icon: Icon) => [number, number, number, number, number][]): void => {
    t.setColorOpaque_F(r, g, b);
    quad(verts(line));
    t.setColorOpaque_F(1.0, 1.0, 1.0);
    quad(verts(lineOverlay));
  };
  if (climbs(-1, 0)) {
    const px = x + 0.015625;
    strip((i) => [
      [px, top, z + 1, i.getMaxU(), i.getMinV()],
      [px, y, z + 1, i.getMinU(), i.getMinV()],
      [px, y, z, i.getMinU(), i.getMaxV()],
      [px, top, z, i.getMaxU(), i.getMaxV()],
    ]);
  }
  if (climbs(1, 0)) {
    const px = x + 1 - 0.015625;
    strip((i) => [
      [px, y, z + 1, i.getMinU(), i.getMaxV()],
      [px, top, z + 1, i.getMaxU(), i.getMaxV()],
      [px, top, z, i.getMaxU(), i.getMinV()],
      [px, y, z, i.getMinU(), i.getMinV()],
    ]);
  }
  if (climbs(0, -1)) {
    const pz = z + 0.015625;
    strip((i) => [
      [x + 1, y, pz, i.getMinU(), i.getMaxV()],
      [x + 1, top, pz, i.getMaxU(), i.getMaxV()],
      [x, top, pz, i.getMaxU(), i.getMinV()],
      [x, y, pz, i.getMinU(), i.getMinV()],
    ]);
  }
  if (climbs(0, 1)) {
    const pz = z + 1 - 0.015625;
    strip((i) => [
      [x + 1, top, pz, i.getMaxU(), i.getMinV()],
      [x + 1, y, pz, i.getMinU(), i.getMinV()],
      [x, y, pz, i.getMinU(), i.getMaxV()],
      [x, top, pz, i.getMaxU(), i.getMaxV()],
    ]);
  }
  return true;
}

// ------------------------------------------------------------------ fire (3)

/**
 * Type 3: on a solid or burning floor, two crossed pairs of slanted planes (layers fire_0 and
 * fire_1); otherwise a two-sided plane leaning off each flammable neighbour (layer and mirror
 * chosen by position parity) and two planes hanging under a flammable ceiling.
 */
export function renderBlockFire(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const fire = block as BlockFire;
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const layer0 = rb.getIconSafe(fire.func_94438_c(0));
  const layer1 = rb.getIconSafe(fire.func_94438_c(1));
  const base = overridden(rb, layer0);
  const fireBlock = Block.blocksList[BlockIds.fire] as BlockFire;
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  blockLight(rb, block, x, y, z);
  let u0 = base.getMinU();
  let v0 = base.getMinV();
  let u1 = base.getMaxU();
  let v1 = base.getMaxV();
  let height = fround(1.4);
  if (!access.doesBlockHaveSolidTopSurface(x, y - 1, z) && !fireBlock.canBlockCatchFire(access, x, y - 1, z)) {
    const lean = fround(0.2);
    const lift = fround(0.0625);
    if (((x + y + z) & 1) === 1) {
      u0 = layer1.getMinU();
      v0 = layer1.getMinV();
      u1 = layer1.getMaxU();
      v1 = layer1.getMaxV();
    }
    if ((Math.trunc(x / 2) + Math.trunc(y / 2) + Math.trunc(z / 2)) & 1) [u0, u1] = [u1, u0];
    const top = fround(fround(y + height) + lift);
    const bottom = fround(y + lift);
    if (fireBlock.canBlockCatchFire(access, x - 1, y, z)) {
      const tx = fround(x + lean);
      quadBothSides([
        [tx, top, z + 1, u1, v0],
        [x, bottom, z + 1, u1, v1],
        [x, bottom, z, u0, v1],
        [tx, top, z, u0, v0],
      ]);
    }
    if (fireBlock.canBlockCatchFire(access, x + 1, y, z)) {
      const tx = fround(x + 1 - lean);
      quadBothSides([
        [tx, top, z, u0, v0],
        [x + 1, bottom, z, u0, v1],
        [x + 1, bottom, z + 1, u1, v1],
        [tx, top, z + 1, u1, v0],
      ]);
    }
    if (fireBlock.canBlockCatchFire(access, x, y, z - 1)) {
      const tz = fround(z + lean);
      quadBothSides([
        [x, top, tz, u1, v0],
        [x, bottom, z, u1, v1],
        [x + 1, bottom, z, u0, v1],
        [x + 1, top, tz, u0, v0],
      ]);
    }
    if (fireBlock.canBlockCatchFire(access, x, y, z + 1)) {
      const tz = fround(z + 1 - lean);
      quadBothSides([
        [x + 1, top, tz, u0, v0],
        [x + 1, bottom, z + 1, u0, v1],
        [x, bottom, z + 1, u1, v1],
        [x, top, tz, u1, v0],
      ]);
    }
    if (fireBlock.canBlockCatchFire(access, x, y + 1, z)) {
      // The ceiling planes always use the real layers, even under a breaking-texture override.
      const cy = y + 1;
      height = fround(-0.2);
      const low = fround(cy + height);
      const a = layer0;
      const b = layer1;
      if (((x + cy + z) & 1) === 0) {
        quad([
          [x, low, z, a.getMaxU(), a.getMinV()],
          [x + 1, cy, z, a.getMaxU(), a.getMaxV()],
          [x + 1, cy, z + 1, a.getMinU(), a.getMaxV()],
          [x, low, z + 1, a.getMinU(), a.getMinV()],
        ]);
        quad([
          [x + 1, low, z + 1, b.getMaxU(), b.getMinV()],
          [x, cy, z + 1, b.getMaxU(), b.getMaxV()],
          [x, cy, z, b.getMinU(), b.getMaxV()],
          [x + 1, low, z, b.getMinU(), b.getMinV()],
        ]);
      } else {
        quad([
          [x, low, z + 1, a.getMaxU(), a.getMinV()],
          [x, cy, z, a.getMaxU(), a.getMaxV()],
          [x + 1, cy, z, a.getMinU(), a.getMaxV()],
          [x + 1, low, z + 1, a.getMinU(), a.getMinV()],
        ]);
        quad([
          [x + 1, low, z, b.getMaxU(), b.getMinV()],
          [x + 1, cy, z + 1, b.getMaxU(), b.getMaxV()],
          [x, cy, z + 1, b.getMinU(), b.getMaxV()],
          [x, low, z, b.getMinU(), b.getMinV()],
        ]);
      }
    }
    return true;
  }
  const top = fround(y + height);
  // Inner pair: planes leaning in from 0.3 / 0.2 off the centre.
  let near = x + 0.5 + 0.2;
  let far = x + 0.5 - 0.2;
  let nearZ = z + 0.5 + 0.2;
  let farZ = z + 0.5 - 0.2;
  let tipA = x + 0.5 - 0.3;
  let tipB = x + 0.5 + 0.3;
  let tipAZ = z + 0.5 - 0.3;
  let tipBZ = z + 0.5 + 0.3;
  quad([
    [tipA, top, z + 1, u1, v0],
    [near, y, z + 1, u1, v1],
    [near, y, z, u0, v1],
    [tipA, top, z, u0, v0],
  ]);
  quad([
    [tipB, top, z, u1, v0],
    [far, y, z, u1, v1],
    [far, y, z + 1, u0, v1],
    [tipB, top, z + 1, u0, v0],
  ]);
  u0 = layer1.getMinU();
  v0 = layer1.getMinV();
  u1 = layer1.getMaxU();
  v1 = layer1.getMaxV();
  quad([
    [x + 1, top, tipBZ, u1, v0],
    [x + 1, y, farZ, u1, v1],
    [x, y, farZ, u0, v1],
    [x, top, tipBZ, u0, v0],
  ]);
  quad([
    [x, top, tipAZ, u1, v0],
    [x, y, nearZ, u1, v1],
    [x + 1, y, nearZ, u0, v1],
    [x + 1, top, tipAZ, u0, v0],
  ]);
  // Outer pair: from the block edges leaning to 0.4 off the centre.
  near = x + 0.5 - 0.5;
  far = x + 0.5 + 0.5;
  nearZ = z + 0.5 - 0.5;
  farZ = z + 0.5 + 0.5;
  tipA = x + 0.5 - 0.4;
  tipB = x + 0.5 + 0.4;
  tipAZ = z + 0.5 - 0.4;
  tipBZ = z + 0.5 + 0.4;
  quad([
    [tipA, top, z, u0, v0],
    [near, y, z, u0, v1],
    [near, y, z + 1, u1, v1],
    [tipA, top, z + 1, u1, v0],
  ]);
  quad([
    [tipB, top, z + 1, u0, v0],
    [far, y, z + 1, u0, v1],
    [far, y, z, u1, v1],
    [tipB, top, z, u1, v0],
  ]);
  u0 = layer0.getMinU();
  v0 = layer0.getMinV();
  u1 = layer0.getMaxU();
  v1 = layer0.getMaxV();
  quad([
    [x, top, tipBZ, u0, v0],
    [x, y, farZ, u0, v1],
    [x + 1, y, farZ, u1, v1],
    [x + 1, top, tipBZ, u1, v0],
  ]);
  quad([
    [x + 1, top, tipAZ, u0, v0],
    [x + 1, y, nearZ, u0, v1],
    [x, y, nearZ, u1, v1],
    [x, top, tipAZ, u1, v0],
  ]);
  return true;
}

// ------------------------------------------------------------------ cocoa (28)

/** Type 28: a pod box growing with age (sides, top and bottom from the age icon) and its stalk. */
export function renderBlockCocoa(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  blockLight(rb, block, x, y, z);
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const dir = BlockDirectional.getDirection(meta);
  const age = BlockCocoa.getAge(meta);
  const icon = rb.getIconSafe((block as BlockCocoa).getCocoaIcon(age));
  const width = 4 + age * 2;
  const height = 5 + age * 2;
  let su0 = icon.getInterpolatedU(15.0 - width);
  let su1 = icon.getInterpolatedU(15.0);
  let sv0 = icon.getInterpolatedV(4.0);
  let sv1 = icon.getInterpolatedV(4.0 + height);
  let ox = 0;
  let oz = 0;
  switch (dir) {
    case 0:
      ox = 8.0 - width / 2;
      oz = 15.0 - width;
      break;
    case 1:
      ox = 1.0;
      oz = 8.0 - width / 2;
      break;
    case 2:
      ox = 8.0 - width / 2;
      oz = 1.0;
      break;
    case 3:
      ox = 15.0 - width;
      oz = 8.0 - width / 2;
      break;
  }
  let x0 = x + ox / 16.0;
  let x1 = x + (ox + width) / 16.0;
  let y0 = y + (12.0 - height) / 16.0;
  let y1 = y + 0.75;
  let z0 = z + oz / 16.0;
  let z1 = z + (oz + width) / 16.0;
  quad([
    [x0, y0, z0, su0, sv1],
    [x0, y0, z1, su1, sv1],
    [x0, y1, z1, su1, sv0],
    [x0, y1, z0, su0, sv0],
  ]);
  quad([
    [x1, y0, z1, su0, sv1],
    [x1, y0, z0, su1, sv1],
    [x1, y1, z0, su1, sv0],
    [x1, y1, z1, su0, sv0],
  ]);
  quad([
    [x1, y0, z0, su0, sv1],
    [x0, y0, z0, su1, sv1],
    [x0, y1, z0, su1, sv0],
    [x1, y1, z0, su0, sv0],
  ]);
  quad([
    [x0, y0, z1, su0, sv1],
    [x1, y0, z1, su1, sv1],
    [x1, y1, z1, su1, sv0],
    [x0, y1, z1, su0, sv0],
  ]);
  const cap = age >= 2 ? width - 1 : width;
  su0 = icon.getMinU();
  su1 = icon.getInterpolatedU(cap);
  sv0 = icon.getMinV();
  sv1 = icon.getInterpolatedV(cap);
  quad([
    [x0, y1, z1, su0, sv1],
    [x1, y1, z1, su1, sv1],
    [x1, y1, z0, su1, sv0],
    [x0, y1, z0, su0, sv0],
  ]);
  quad([
    [x0, y0, z0, su0, sv0],
    [x1, y0, z0, su1, sv0],
    [x1, y0, z1, su1, sv1],
    [x0, y0, z1, su0, sv1],
  ]);
  // The stalk: a two-sided 4x4 sprite from the top right of the icon.
  su0 = icon.getInterpolatedU(12.0);
  su1 = icon.getMaxU();
  sv0 = icon.getMinV();
  sv1 = icon.getInterpolatedV(4.0);
  ox = 8.0;
  oz = 0.0;
  switch (dir) {
    case 0:
      ox = 8.0;
      oz = 12.0;
      [su0, su1] = [su1, su0];
      break;
    case 1:
      ox = 0.0;
      oz = 8.0;
      break;
    case 2:
      ox = 8.0;
      oz = 0.0;
      break;
    case 3:
      ox = 12.0;
      oz = 8.0;
      [su0, su1] = [su1, su0];
      break;
  }
  x0 = x + ox / 16.0;
  x1 = x + (ox + 4.0) / 16.0;
  y0 = y + 0.75;
  y1 = y + 1.0;
  z0 = z + oz / 16.0;
  z1 = z + (oz + 4.0) / 16.0;
  // Each stalk quad is followed by its back face (the same corners, pairwise swapped).
  if (dir === 2 || dir === 0) {
    quad([
      [x0, y0, z0, su1, sv1],
      [x0, y0, z1, su0, sv1],
      [x0, y1, z1, su0, sv0],
      [x0, y1, z0, su1, sv0],
    ]);
    quad([
      [x0, y0, z1, su0, sv1],
      [x0, y0, z0, su1, sv1],
      [x0, y1, z0, su1, sv0],
      [x0, y1, z1, su0, sv0],
    ]);
  } else if (dir === 1 || dir === 3) {
    quad([
      [x1, y0, z0, su0, sv1],
      [x0, y0, z0, su1, sv1],
      [x0, y1, z0, su1, sv0],
      [x1, y1, z0, su0, sv0],
    ]);
    quad([
      [x0, y0, z0, su1, sv1],
      [x1, y0, z0, su0, sv1],
      [x1, y1, z0, su0, sv0],
      [x0, y1, z0, su1, sv0],
    ]);
  }
  return true;
}

// ------------------------------------------------------------------ tripwire (30), hooks (29), levers (12)

/** Type 30: a thin two-sided string in quarter segments toward connected hooks and wires. */
export function renderBlockTripWire(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 0));
  const meta = access.getBlockMetadata(x, y, z);
  const attached = (meta & 4) === 4;
  const hanging = (meta & 2) === 2;
  blockLight(rb, block, x, y, z);
  const light = fround(block.getBlockBrightness(access, x, y, z) * 0.75);
  t.setColorOpaque_F(light, light, light);
  const u0 = icon.getMinU();
  const v0 = icon.getInterpolatedV(attached ? 2.0 : 0.0);
  const u1 = icon.getMaxU();
  const v1 = icon.getInterpolatedV(attached ? 4.0 : 2.0);
  const py = y + fround(hanging ? 3.5 : 1.5) / 16.0;
  const west = BlockTripWire.isConnectedTo(access, x, y, z, meta, 1);
  const east = BlockTripWire.isConnectedTo(access, x, y, z, meta, 3);
  let north = BlockTripWire.isConnectedTo(access, x, y, z, meta, 2);
  let south = BlockTripWire.isConnectedTo(access, x, y, z, meta, 0);
  const width = fround(0.03125);
  const lo = fround(0.5 - width / 2.0);
  const hi = fround(lo + width);
  const xl = fround(x + lo);
  const xh = fround(x + hi);
  const zl = fround(z + lo);
  const zh = fround(z + hi);
  if (!north && !east && !south && !west) {
    north = true;
    south = true;
  }
  const alongZ = (za: number, zb: number): void =>
    quadBothSides([
      [xl, py, z + zb, u0, v0],
      [xh, py, z + zb, u0, v1],
      [xh, py, z + za, u1, v1],
      [xl, py, z + za, u1, v0],
    ]);
  const alongX = (xa: number, xb: number): void =>
    quadBothSides([
      [x + xa, py, zh, u0, v1],
      [x + xb, py, zh, u1, v1],
      [x + xb, py, zl, u1, v0],
      [x + xa, py, zl, u0, v0],
    ]);
  if (north) alongZ(0, 0.25);
  if (north || (south && !east && !west)) alongZ(0.25, 0.5);
  if (south || (north && !east && !west)) alongZ(0.5, 0.75);
  if (south) alongZ(0.75, 1);
  if (west) alongX(0, 0.25);
  if (west || (east && !north && !south)) alongX(0.25, 0.5);
  if (east || (west && !north && !south)) alongX(0.5, 0.75);
  if (east) alongX(0.75, 1);
  return true;
}

/** Positions a hook part: tilt by state, turn to face away from the wall (meta & 3), then move into the block. */
function placeHookPart(c: RVec[], x: number, y: number, z: number, dir: number): void {
  for (const v of c) {
    if (dir === 0) v.rotateY(PI_F);
    else if (dir === 1) v.rotateY(fround(Math.PI / 2));
    else if (dir === 3) v.rotateY(fround(-Math.PI / 2));
    else v.rotateY(0);
    v.x += x + 0.5;
    v.y += fround(y + 0.3125);
    v.z += z + 0.5;
  }
}

/** Type 29: a plank block on the wall, a tilted stick and a ring, plus the string stub when attached. */
export function renderBlockTripWireSource(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  const dir = meta & 3;
  const attached = (meta & 4) === 4;
  const tripped = (meta & 8) === 8;
  const floating = !access.doesBlockHaveSolidTopSurface(x, y - 1, z);
  const hadOverride = rb.hasOverrideBlockTexture();
  if (!hadOverride) rb.setOverrideBlockTexture(iconOfBlock(rb, BlockIds.planks));
  const hy = fround(0.25);
  const hx = fround(0.125);
  const depth = fround(0.125);
  const y0 = fround(fround(0.3) - hy);
  const y1 = fround(fround(0.3) + hy);
  if (dir === 2) rb.setRenderBounds(fround(0.5 - hx), y0, fround(1.0 - depth), fround(0.5 + hx), y1, 1.0);
  else if (dir === 0) rb.setRenderBounds(fround(0.5 - hx), y0, 0.0, fround(0.5 + hx), y1, depth);
  else if (dir === 1) rb.setRenderBounds(fround(1.0 - depth), y0, fround(0.5 - hx), 1.0, y1, fround(0.5 + hx));
  else if (dir === 3) rb.setRenderBounds(0.0, y0, fround(0.5 - hx), depth, y1, fround(0.5 + hx));
  rb.renderStandardBlock(block, x, y, z);
  if (!hadOverride) rb.clearOverrideBlockTexture();
  blockLight(rb, block, x, y, z);
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 0));
  // The stick.
  const stick = boxCorners(fround(0.046875), fround(0.046875), fround(0.3125));
  for (const v of stick) {
    v.z += 0.0625;
    if (tripped) {
      v.rotateX(fround(Math.PI / 6));
      v.y -= 0.4375;
    } else if (attached) {
      v.rotateX(fround(0.08726647));
      v.y -= 0.4375;
    } else {
      v.rotateX(fround(fround(fround(-Math.PI) * 2.0) / 9.0));
      v.y -= 0.375;
    }
    v.rotateX(fround(Math.PI / 2));
  }
  placeHookPart(stick, x, y, z, dir);
  for (let face = 0; face < 6; face++) {
    const sideFace = face >= 2;
    boxFace(stick, face, icon.getInterpolatedU(7), icon.getInterpolatedV(9), icon.getInterpolatedU(9), icon.getInterpolatedV(sideFace ? 16 : 11));
  }
  // The ring.
  const ring = boxCorners(fround(0.09375), fround(0.09375), fround(0.03125));
  for (const v of ring) {
    v.z += 0.21875;
    if (tripped) {
      v.y -= 0.09375;
      v.z -= 0.1625;
      v.rotateX(0.0);
    } else if (attached) {
      v.y += 0.015625;
      v.z -= 0.171875;
      v.rotateX(fround(0.17453294));
    } else {
      v.rotateX(fround(0.87266463));
    }
  }
  placeHookPart(ring, x, y, z, dir);
  for (let face = 0; face < 6; face++) {
    boxFace(ring, face, icon.getInterpolatedU(5), icon.getInterpolatedV(3), icon.getInterpolatedU(11), icon.getInterpolatedV(face >= 2 ? 5 : 9));
  }
  if (attached) {
    // The string stub from the ring to the block edge; 1.5.2 textures it with the hook's own icon.
    const ringY = ring[0].y;
    const width = fround(0.03125);
    const lo = fround(0.5 - width / 2.0);
    const hi = fround(lo + width);
    const su0 = icon.getMinU();
    const sv0 = icon.getInterpolatedV(attached ? 2.0 : 0.0);
    const su1 = icon.getMaxU();
    const sv1 = icon.getInterpolatedV(attached ? 4.0 : 2.0);
    const wy = y + fround(floating ? 3.5 : 1.5) / 16.0;
    const light = fround(block.getBlockBrightness(access, x, y, z) * 0.75);
    t.setColorOpaque_F(light, light, light);
    const xl = fround(x + lo);
    const xh = fround(x + hi);
    const zl = fround(z + lo);
    const zh = fround(z + hi);
    if (dir === 2) {
      quad([
        [xl, wy, z + 0.25, su0, sv0],
        [xh, wy, z + 0.25, su0, sv1],
        [xh, wy, z, su1, sv1],
        [xl, wy, z, su1, sv0],
      ]);
      quad([
        [xl, ringY, z + 0.5, su0, sv0],
        [xh, ringY, z + 0.5, su0, sv1],
        [xh, wy, z + 0.25, su1, sv1],
        [xl, wy, z + 0.25, su1, sv0],
      ]);
    } else if (dir === 0) {
      quad([
        [xl, wy, z + 0.75, su0, sv0],
        [xh, wy, z + 0.75, su0, sv1],
        [xh, ringY, z + 0.5, su1, sv1],
        [xl, ringY, z + 0.5, su1, sv0],
      ]);
      quad([
        [xl, wy, z + 1, su0, sv0],
        [xh, wy, z + 1, su0, sv1],
        [xh, wy, z + 0.75, su1, sv1],
        [xl, wy, z + 0.75, su1, sv0],
      ]);
    } else if (dir === 1) {
      quad([
        [x, wy, zh, su0, sv1],
        [x + 0.25, wy, zh, su1, sv1],
        [x + 0.25, wy, zl, su1, sv0],
        [x, wy, zl, su0, sv0],
      ]);
      quad([
        [x + 0.25, wy, zh, su0, sv1],
        [x + 0.5, ringY, zh, su1, sv1],
        [x + 0.5, ringY, zl, su1, sv0],
        [x + 0.25, wy, zl, su0, sv0],
      ]);
    } else {
      quad([
        [x + 0.5, ringY, zh, su0, sv1],
        [x + 0.75, wy, zh, su1, sv1],
        [x + 0.75, wy, zl, su1, sv0],
        [x + 0.5, ringY, zl, su0, sv0],
      ]);
      quad([
        [x + 0.75, wy, zh, su0, sv1],
        [x + 1, wy, zh, su1, sv1],
        [x + 1, wy, zl, su1, sv0],
        [x + 0.75, wy, zl, su0, sv0],
      ]);
    }
  }
  return true;
}

/**
 * Type 12: a cobblestone base on the face the lever is attached to (meta & 7: 1-4 walls, 5/6
 * floor, 0/7 ceiling) and a handle tilted 40 degrees one way or the other by the on bit.
 */
export function renderBlockLever(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const pos = meta & 7;
  const on = (meta & 8) > 0;
  const hadOverride = rb.hasOverrideBlockTexture();
  if (!hadOverride) rb.setOverrideBlockTexture(iconOfBlock(rb, BlockIds.cobblestone));
  const l = fround(0.25);
  const w = fround(0.1875);
  const h = fround(0.1875);
  const lo = (a: number): number => fround(0.5 - a);
  const hi = (a: number): number => fround(0.5 + a);
  if (pos === 5) rb.setRenderBounds(lo(w), 0.0, lo(l), hi(w), h, hi(l));
  else if (pos === 6) rb.setRenderBounds(lo(l), 0.0, lo(w), hi(l), h, hi(w));
  else if (pos === 4) rb.setRenderBounds(lo(w), lo(l), fround(1.0 - h), hi(w), hi(l), 1.0);
  else if (pos === 3) rb.setRenderBounds(lo(w), lo(l), 0.0, hi(w), hi(l), h);
  else if (pos === 2) rb.setRenderBounds(fround(1.0 - h), lo(l), lo(w), 1.0, hi(l), hi(w));
  else if (pos === 1) rb.setRenderBounds(0.0, lo(l), lo(w), h, hi(l), hi(w));
  else if (pos === 0) rb.setRenderBounds(lo(l), fround(1.0 - h), lo(w), hi(l), 1.0, hi(w));
  else if (pos === 7) rb.setRenderBounds(lo(w), fround(1.0 - h), lo(l), hi(w), 1.0, hi(l));
  rb.renderStandardBlock(block, x, y, z);
  if (!hadOverride) rb.clearOverrideBlockTexture();
  blockLight(rb, block, x, y, z);
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const icon = overridden(rb, rb.getBlockIconFromSide(block, 0));
  const handle = boxCorners(fround(0.0625), fround(0.0625), fround(0.625));
  const tilt = fround(fround(PI_F * 2.0) / 9.0);
  for (const v of handle) {
    if (on) {
      v.z -= 0.0625;
      v.rotateX(tilt);
    } else {
      v.z += 0.0625;
      v.rotateX(-tilt);
    }
    if (pos === 0 || pos === 7) v.rotateZ(PI_F);
    if (pos === 6 || pos === 0) v.rotateY(fround(Math.PI / 2));
    if (pos > 0 && pos < 5) {
      v.y -= 0.375;
      v.rotateX(fround(Math.PI / 2));
      if (pos === 4) v.rotateY(0.0);
      if (pos === 3) v.rotateY(PI_F);
      if (pos === 2) v.rotateY(fround(Math.PI / 2));
      if (pos === 1) v.rotateY(fround(-Math.PI / 2));
      v.x += x + 0.5;
      v.y += fround(y + 0.5);
      v.z += z + 0.5;
    } else if (pos !== 0 && pos !== 7) {
      v.x += x + 0.5;
      v.y += fround(y + 0.125);
      v.z += z + 0.5;
    } else {
      v.x += x + 0.5;
      v.y += fround(y + 0.875);
      v.z += z + 0.5;
    }
  }
  let u0 = icon.getMinU();
  let v0 = icon.getMinV();
  let u1 = icon.getMaxU();
  let v1 = icon.getMaxV();
  for (let face = 0; face < 6; face++) {
    if (face === 0) {
      u0 = icon.getInterpolatedU(7.0);
      v0 = icon.getInterpolatedV(6.0);
      u1 = icon.getInterpolatedU(9.0);
      v1 = icon.getInterpolatedV(8.0);
    } else if (face === 2) {
      u0 = icon.getInterpolatedU(7.0);
      v0 = icon.getInterpolatedV(6.0);
      u1 = icon.getInterpolatedU(9.0);
      v1 = icon.getMaxV();
    }
    boxFace(handle, face, u0, v0, u1, v1);
  }
  return true;
}
