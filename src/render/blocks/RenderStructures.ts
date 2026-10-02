import { Block } from '../../block/Block';
import type { BlockAnvil } from '../../block/BlockAnvil';
import { BlockBed } from '../../block/BlockBed';
import type { BlockBeacon } from '../../block/BlockBeacon';
import type { BlockBrewingStand } from '../../block/BlockBrewingStand';
import { BlockCauldron } from '../../block/BlockCauldron';
import { BlockDirectional } from '../../block/BlockDirectional';
import { BlockEndPortalFrame } from '../../block/BlockEndPortalFrame';
import type { BlockFence } from '../../block/BlockFence';
import { BlockFenceGate } from '../../block/BlockFenceGate';
import { BlockFluid } from '../../block/BlockFluid';
import { BlockHopper } from '../../block/BlockHopper';
import { BlockIds } from '../../block/BlockIds';
import type { BlockPane } from '../../block/BlockPane';
import { BlockPistonBase } from '../../block/BlockPistonBase';
import { BlockPistonExtension } from '../../block/BlockPistonExtension';
import { BlockComparator, BlockRedstoneRepeater } from '../../block/BlockRedstoneLogic';
import type { BlockStairs } from '../../block/BlockStairs';
import type { BlockWall } from '../../block/BlockWall';
import { Direction } from '../../core/Facing';
import { Tessellator } from '../gl/Tessellator';
import type { RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';
import { fround, iconOfBlock, overridden, quad, tintAt } from './RenderHelpers';

/*
 * Render types built from boxes (renderStandardBlock over changing render bounds) and the
 * other shaped blocks: stairs, fences, walls, gates, panes, doors, beds, pistons, redstone
 * diodes, cauldrons, flower pots, brewing stands, end portal frames, dragon eggs, beacons,
 * anvils, hoppers and quartz pillars.
 */

function setTint(rb: RenderBlocks, block: Block, x: number, y: number, z: number): void {
  const t = Tessellator.instance;
  t.setBrightness(block.getMixedBrightnessForBlock(rb.blockAccess!, x, y, z));
  const [r, g, b] = tintAt(rb, block, x, y, z);
  t.setColorOpaque_F(r, g, b);
}

function resetRotations(rb: RenderBlocks): void {
  rb.uvRotateEast = 0;
  rb.uvRotateWest = 0;
  rb.uvRotateSouth = 0;
  rb.uvRotateNorth = 0;
  rb.uvRotateTop = 0;
  rb.uvRotateBottom = 0;
}

/** Texture rotations that keep a facing block's front, back and sides upright (pistons, anvils). */
function setFacingRotations(rb: RenderBlocks, facing: number): void {
  switch (facing) {
    case 0:
      rb.uvRotateEast = 3;
      rb.uvRotateWest = 3;
      rb.uvRotateSouth = 3;
      rb.uvRotateNorth = 3;
      break;
    case 2:
      rb.uvRotateSouth = 1;
      rb.uvRotateNorth = 2;
      break;
    case 3:
      rb.uvRotateSouth = 2;
      rb.uvRotateNorth = 1;
      rb.uvRotateTop = 3;
      rb.uvRotateBottom = 3;
      break;
    case 4:
      rb.uvRotateEast = 1;
      rb.uvRotateWest = 2;
      rb.uvRotateTop = 2;
      rb.uvRotateBottom = 1;
      break;
    case 5:
      rb.uvRotateEast = 2;
      rb.uvRotateWest = 1;
      rb.uvRotateTop = 1;
      rb.uvRotateBottom = 2;
      break;
  }
}

/** Draws a list of boxes (minX, minY, minZ, maxX, maxY, maxZ) as standard blocks. */
function renderBoxes(rb: RenderBlocks, block: Block, x: number, y: number, z: number, boxes: readonly (readonly number[])[]): void {
  for (const b of boxes) {
    rb.setRenderBounds(b[0], b[1], b[2], b[3], b[4], b[5]);
    rb.renderStandardBlock(block, x, y, z);
  }
}

// ------------------------------------------------------------------ stairs (10), quartz (39)

/** Type 10: the base slab, the upper step and, for corner stairs, the extra quarter. */
export function renderBlockStairs(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const stairs = block as BlockStairs;
  const access = rb.blockAccess!;
  stairs.setBaseCollisionBounds(access, x, y, z);
  rb.setRenderBoundsFromBlock(stairs);
  rb.renderStandardBlock(stairs, x, y, z);
  const full = stairs.setUpperStepBounds(access, x, y, z);
  rb.setRenderBoundsFromBlock(stairs);
  rb.renderStandardBlock(stairs, x, y, z);
  if (full && stairs.setInnerCornerBounds(access, x, y, z)) {
    rb.setRenderBoundsFromBlock(stairs);
    rb.renderStandardBlock(stairs, x, y, z);
  }
  return true;
}

/** Type 39: quartz pillars lying along x (meta 3) or z (meta 4) turn their textures. */
export function renderBlockQuartz(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  if (meta === 3) {
    rb.uvRotateEast = 1;
    rb.uvRotateWest = 1;
    rb.uvRotateTop = 1;
    rb.uvRotateBottom = 1;
  } else if (meta === 4) {
    rb.uvRotateSouth = 1;
    rb.uvRotateNorth = 1;
  }
  const rendered = rb.renderStandardBlock(block, x, y, z);
  resetRotations(rb);
  return rendered;
}

// ------------------------------------------------------------------ fences (11), walls (32), gates (21)

/** Type 11: the post and two bars toward each connected side (a lone post gets bars along x). */
export function renderBlockFence(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const fence = block as BlockFence;
  const access = rb.blockAccess!;
  rb.setRenderBounds(0.375, 0.0, 0.375, 0.625, 1.0, 0.625);
  rb.renderStandardBlock(block, x, y, z);
  const west = fence.canConnectFenceTo(access, x - 1, y, z);
  const east = fence.canConnectFenceTo(access, x + 1, y, z);
  const north = fence.canConnectFenceTo(access, x, y, z - 1);
  const south = fence.canConnectFenceTo(access, x, y, z + 1);
  let alongX = west || east;
  const alongZ = north || south;
  if (!alongX && !alongZ) alongX = true;
  const lo = 0.4375;
  const hi = 0.5625;
  const x0 = west ? 0.0 : lo;
  const x1 = east ? 1.0 : hi;
  const z0 = north ? 0.0 : lo;
  const z1 = south ? 1.0 : hi;
  for (const [y0, y1] of [
    [0.75, 0.9375],
    [0.375, 0.5625],
  ]) {
    if (alongX) {
      rb.setRenderBounds(x0, y0, lo, x1, y1, hi);
      rb.renderStandardBlock(block, x, y, z);
    }
    if (alongZ) {
      rb.setRenderBounds(lo, y0, z0, hi, y1, z1);
      rb.renderStandardBlock(block, x, y, z);
    }
  }
  fence.setBlockBoundsBasedOnState(access, x, y, z);
  return true;
}

/** Type 32: a straight low wall between two opposite connections with air above, else a post with arms. */
export function renderBlockWall(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const wall = block as BlockWall;
  const access = rb.blockAccess!;
  const west = wall.canConnectWallTo(access, x - 1, y, z);
  const east = wall.canConnectWallTo(access, x + 1, y, z);
  const north = wall.canConnectWallTo(access, x, y, z - 1);
  const south = wall.canConnectWallTo(access, x, y, z + 1);
  const straightZ = north && south && !west && !east;
  const straightX = !north && !south && west && east;
  if ((straightZ || straightX) && access.isAirBlock(x, y + 1, z)) {
    if (straightZ) rb.setRenderBounds(0.3125, 0.0, 0.0, 0.6875, 0.8125, 1.0);
    else rb.setRenderBounds(0.0, 0.0, 0.3125, 1.0, 0.8125, 0.6875);
    rb.renderStandardBlock(block, x, y, z);
  } else {
    rb.setRenderBounds(0.25, 0.0, 0.25, 0.75, 1.0, 0.75);
    rb.renderStandardBlock(block, x, y, z);
    if (west) renderBoxes(rb, block, x, y, z, [[0.0, 0.0, 0.3125, 0.25, 0.8125, 0.6875]]);
    if (east) renderBoxes(rb, block, x, y, z, [[0.75, 0.0, 0.3125, 1.0, 0.8125, 0.6875]]);
    if (north) renderBoxes(rb, block, x, y, z, [[0.3125, 0.0, 0.0, 0.6875, 0.8125, 0.25]]);
    if (south) renderBoxes(rb, block, x, y, z, [[0.3125, 0.0, 0.75, 0.6875, 0.8125, 1.0]]);
  }
  wall.setBlockBoundsBasedOnState(access, x, y, z);
  return true;
}

/**
 * Type 21: two posts and the gate (closed: across the opening; open: two wings folded back
 * against the posts). Between two cobblestone walls the whole gate sits 3/16 lower.
 */
export function renderBlockFenceGate(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  const open = BlockFenceGate.isFenceGateOpen(meta);
  const dir = BlockDirectional.getDirection(meta);
  const wallId = BlockIds.cobblestoneWall;
  const acrossX = dir === 2 || dir === 0;
  const lowered = acrossX
    ? access.getBlockId(x - 1, y, z) === wallId && access.getBlockId(x + 1, y, z) === wallId
    : access.getBlockId(x, y, z - 1) === wallId && access.getBlockId(x, y, z + 1) === wallId;
  const drop = lowered ? 0.1875 : 0.0;
  const barLow = fround(0.375 - drop);
  const barLowTop = fround(0.5625 - drop);
  const barHigh = fround(0.75 - drop);
  const barHighTop = fround(0.9375 - drop);
  const postLow = fround(0.3125 - drop);
  const postTop = fround(1.0 - drop);
  rb.renderAllFaces = true;
  if (acrossX) {
    renderBoxes(rb, block, x, y, z, [
      [0.0, postLow, 0.4375, 0.125, postTop, 0.5625],
      [0.875, postLow, 0.4375, 1.0, postTop, 0.5625],
    ]);
  } else {
    rb.uvRotateTop = 1;
    renderBoxes(rb, block, x, y, z, [
      [0.4375, postLow, 0.0, 0.5625, postTop, 0.125],
      [0.4375, postLow, 0.875, 0.5625, postTop, 1.0],
    ]);
    rb.uvRotateTop = 0;
  }
  if (open) {
    if (acrossX) rb.uvRotateTop = 1;
    // Per facing: [x0, x1, z0, z1] of the outer upright, then of the two bars, near and far post.
    const wings: Record<number, readonly (readonly number[])[]> = {
      3: [
        [0.8125, barLow, 0.0, 0.9375, barHighTop, 0.125],
        [0.8125, barLow, 0.875, 0.9375, barHighTop, 1.0],
        [0.5625, barLow, 0.0, 0.8125, barLowTop, 0.125],
        [0.5625, barLow, 0.875, 0.8125, barLowTop, 1.0],
        [0.5625, barHigh, 0.0, 0.8125, barHighTop, 0.125],
        [0.5625, barHigh, 0.875, 0.8125, barHighTop, 1.0],
      ],
      1: [
        [0.0625, barLow, 0.0, 0.1875, barHighTop, 0.125],
        [0.0625, barLow, 0.875, 0.1875, barHighTop, 1.0],
        [0.1875, barLow, 0.0, 0.4375, barLowTop, 0.125],
        [0.1875, barLow, 0.875, 0.4375, barLowTop, 1.0],
        [0.1875, barHigh, 0.0, 0.4375, barHighTop, 0.125],
        [0.1875, barHigh, 0.875, 0.4375, barHighTop, 1.0],
      ],
      0: [
        [0.0, barLow, 0.8125, 0.125, barHighTop, 0.9375],
        [0.875, barLow, 0.8125, 1.0, barHighTop, 0.9375],
        [0.0, barLow, 0.5625, 0.125, barLowTop, 0.8125],
        [0.875, barLow, 0.5625, 1.0, barLowTop, 0.8125],
        [0.0, barHigh, 0.5625, 0.125, barHighTop, 0.8125],
        [0.875, barHigh, 0.5625, 1.0, barHighTop, 0.8125],
      ],
      2: [
        [0.0, barLow, 0.0625, 0.125, barHighTop, 0.1875],
        [0.875, barLow, 0.0625, 1.0, barHighTop, 0.1875],
        [0.0, barLow, 0.1875, 0.125, barLowTop, 0.4375],
        [0.875, barLow, 0.1875, 1.0, barLowTop, 0.4375],
        [0.0, barHigh, 0.1875, 0.125, barHighTop, 0.4375],
        [0.875, barHigh, 0.1875, 1.0, barHighTop, 0.4375],
      ],
    };
    renderBoxes(rb, block, x, y, z, wings[dir]);
  } else if (acrossX) {
    renderBoxes(rb, block, x, y, z, [
      [0.375, barLow, 0.4375, 0.5, barHighTop, 0.5625],
      [0.5, barLow, 0.4375, 0.625, barHighTop, 0.5625],
      [0.625, barLow, 0.4375, 0.875, barLowTop, 0.5625],
      [0.625, barHigh, 0.4375, 0.875, barHighTop, 0.5625],
      [0.125, barLow, 0.4375, 0.375, barLowTop, 0.5625],
      [0.125, barHigh, 0.4375, 0.375, barHighTop, 0.5625],
    ]);
  } else {
    rb.uvRotateTop = 1;
    renderBoxes(rb, block, x, y, z, [
      [0.4375, barLow, 0.375, 0.5625, barHighTop, 0.5],
      [0.4375, barLow, 0.5, 0.5625, barHighTop, 0.625],
      [0.4375, barLow, 0.625, 0.5625, barLowTop, 0.875],
      [0.4375, barHigh, 0.625, 0.5625, barHighTop, 0.875],
      [0.4375, barLow, 0.125, 0.5625, barLowTop, 0.375],
      [0.4375, barHigh, 0.125, 0.5625, barHighTop, 0.375],
    ]);
  }
  rb.renderAllFaces = false;
  rb.uvRotateTop = 0;
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  return true;
}

// ------------------------------------------------------------------ panes and iron bars (18)

/**
 * Type 18: a two-sided pane along x and/or z (full width, or the half toward a lone
 * connection plus a 2/16 edge strip), capped on top and bottom by the side texture where the
 * pane is not covered.
 */
export function renderBlockPane(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const pane = block as BlockPane;
  const access = rb.blockAccess!;
  const height = access.getHeight();
  setTint(rb, block, x, y, z);
  const override = rb.getOverrideBlockTexture();
  const face = override ?? rb.getBlockIconFromSideAndMetadata(block, 0, access.getBlockMetadata(x, y, z));
  const edge = override ?? rb.getIconSafe(pane.getSideTextureIndex());
  const fu0 = face.getMinU();
  const fuMid = face.getInterpolatedU(8.0);
  const fu1 = face.getMaxU();
  const fv0 = face.getMinV();
  const fv1 = face.getMaxV();
  const eu0 = edge.getInterpolatedU(7.0);
  const eu1 = edge.getInterpolatedU(9.0);
  const ev0 = edge.getMinV();
  const evMid = edge.getInterpolatedV(8.0);
  const ev1 = edge.getMaxV();
  const x0 = x;
  const xm = x + 0.5;
  const x1 = x + 1;
  const z0 = z;
  const zm = z + 0.5;
  const z1 = z + 1;
  const xl = x + 0.5 - 0.0625;
  const xh = x + 0.5 + 0.0625;
  const zl = z + 0.5 - 0.0625;
  const zh = z + 0.5 + 0.0625;
  const north = pane.canThisPaneConnectToThisBlockID(access.getBlockId(x, y, z - 1));
  const south = pane.canThisPaneConnectToThisBlockID(access.getBlockId(x, y, z + 1));
  const west = pane.canThisPaneConnectToThisBlockID(access.getBlockId(x - 1, y, z));
  const east = pane.canThisPaneConnectToThisBlockID(access.getBlockId(x + 1, y, z));
  const top = pane.shouldSideBeRendered(access, x, y + 1, z, 1);
  const bottom = pane.shouldSideBeRendered(access, x, y - 1, z, 0);
  const yTop = y + 1;
  const airAbove = (dx: number, dz: number): boolean => y < height - 1 && access.isAirBlock(x + dx, y + 1, z + dz);
  const airBelow = (dx: number, dz: number): boolean => y > 1 && access.isAirBlock(x + dx, y - 1, z + dz);

  // A vertical two-sided panel from a to b; the back runs from b to a with the same UVs.
  const panel = (ax: number, az: number, bx: number, bz: number, u0: number, u1: number, v0: number, v1: number): void => {
    quad([
      [ax, yTop, az, u0, v0],
      [ax, y, az, u0, v1],
      [bx, y, bz, u1, v1],
      [bx, yTop, bz, u1, v0],
      [bx, yTop, bz, u0, v0],
      [bx, y, bz, u0, v1],
      [ax, y, az, u1, v1],
      [ax, yTop, az, u1, v0],
    ]);
  };
  // A horizontal two-sided cap over the x-axis pane, x from xa to xb.
  const capX = (xa: number, xb: number, cy: number, va: number, vb: number): void => {
    quad([
      [xa, cy, zh, eu1, va],
      [xb, cy, zh, eu1, vb],
      [xb, cy, zl, eu0, vb],
      [xa, cy, zl, eu0, va],
      [xb, cy, zh, eu1, va],
      [xa, cy, zh, eu1, vb],
      [xa, cy, zl, eu0, vb],
      [xb, cy, zl, eu0, va],
    ]);
  };
  // A horizontal two-sided cap over the z-axis pane, z from za to zb, rows at xa then xb.
  const capZ = (xa: number, xb: number, za: number, zb: number, cy: number, ua: number, ub: number, va: number, vb: number): void => {
    quad([
      [xa, cy, za, ua, va],
      [xa, cy, zb, ua, vb],
      [xb, cy, zb, ub, vb],
      [xb, cy, za, ub, va],
      [xa, cy, zb, ua, va],
      [xa, cy, za, ua, vb],
      [xb, cy, za, ub, vb],
      [xb, cy, zb, ub, va],
    ]);
  };

  const any = west || east || north || south;
  const upX = yTop + 0.01;
  const downX = y - 0.01;
  if ((!west || !east) && any) {
    if (west && !east) {
      panel(x0, zm, xm, zm, fu0, fuMid, fv0, fv1);
      if (!south && !north) panel(xm, zh, xm, zl, eu0, eu1, ev0, ev1);
      if (top || airAbove(-1, 0)) capX(x0, xm, upX, evMid, ev1);
      if (bottom || airBelow(-1, 0)) capX(x0, xm, downX, evMid, ev1);
    } else if (!west && east) {
      panel(xm, zm, x1, zm, fuMid, fu1, fv0, fv1);
      if (!south && !north) panel(xm, zl, xm, zh, eu0, eu1, ev0, ev1);
      if (top || airAbove(1, 0)) capX(xm, x1, upX, ev0, evMid);
      if (bottom || airBelow(1, 0)) capX(xm, x1, downX, ev0, evMid);
    }
  } else {
    panel(x0, zm, x1, zm, fu0, fu1, fv0, fv1);
    if (top) {
      capX(x0, x1, upX, ev1, ev0);
    } else {
      if (airAbove(-1, 0)) capX(x0, xm, upX, evMid, ev1);
      if (airAbove(1, 0)) capX(xm, x1, upX, ev0, evMid);
    }
    if (bottom) {
      capX(x0, x1, downX, ev1, ev0);
    } else {
      if (airBelow(-1, 0)) capX(x0, xm, downX, evMid, ev1);
      if (airBelow(1, 0)) capX(xm, x1, downX, ev0, evMid);
    }
  }

  const upZ = yTop + 0.005;
  const downZ = y - 0.005;
  if ((!north || !south) && any) {
    if (north && !south) {
      panel(xm, z0, xm, zm, fu0, fuMid, fv0, fv1);
      if (!east && !west) panel(xl, zm, xh, zm, eu0, eu1, ev0, ev1);
      if (top || airAbove(0, -1)) capZ(xl, xh, z0, zm, upZ, eu1, eu0, ev0, evMid);
      if (bottom || airBelow(0, -1)) capZ(xl, xh, z0, zm, downZ, eu1, eu0, ev0, evMid);
    } else if (!north && south) {
      panel(xm, zm, xm, z1, fuMid, fu1, fv0, fv1);
      if (!east && !west) panel(xh, zm, xl, zm, eu0, eu1, ev0, ev1);
      if (top || airAbove(0, 1)) capZ(xl, xh, zm, z1, upZ, eu0, eu1, evMid, ev1);
      if (bottom || airBelow(0, 1)) capZ(xl, xh, zm, z1, downZ, eu0, eu1, evMid, ev1);
    }
  } else {
    panel(xm, z1, xm, z0, fu0, fu1, fv0, fv1);
    if (top) {
      capZ(xh, xl, z1, z0, upZ, eu1, eu0, ev1, ev0);
    } else {
      if (airAbove(0, -1)) capZ(xl, xh, z0, zm, upZ, eu1, eu0, ev0, evMid);
      if (airAbove(0, 1)) capZ(xl, xh, zm, z1, upZ, eu0, eu1, evMid, ev1);
    }
    if (bottom) {
      capZ(xh, xl, z1, z0, downZ, eu1, eu0, ev1, ev0);
    } else {
      if (airBelow(0, -1)) capZ(xl, xh, z0, zm, downZ, eu1, eu0, ev0, evMid);
      if (airBelow(0, 1)) capZ(xl, xh, zm, z1, downZ, eu0, eu1, evMid, ev1);
    }
  }
  return true;
}

// ------------------------------------------------------------------ doors (7), beds (14)

/** Type 7: six flat-shaded faces of the door slab (both halves must be present). */
export function renderBlockDoor(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  if (meta & 8) {
    if (access.getBlockId(x, y - 1, z) !== block.blockID) return false;
  } else if (access.getBlockId(x, y + 1, z) !== block.blockID) {
    return false;
  }
  const own = block.getMixedBrightnessForBlock(access, x, y, z);
  const light = (inside: boolean, dx: number, dy: number, dz: number): number => (inside ? own : block.getMixedBrightnessForBlock(access, x + dx, y + dy, z + dz));
  const faces: [number, boolean, number, number, number, number][] = [
    [0, rb.renderMinY > 0.0, 0, -1, 0, 0.5],
    [1, rb.renderMaxY < 1.0, 0, 1, 0, 1.0],
    [2, rb.renderMinZ > 0.0, 0, 0, -1, 0.8],
    [3, rb.renderMaxZ < 1.0, 0, 0, 1, 0.8],
    [4, rb.renderMinX > 0.0, -1, 0, 0, 0.6],
    [5, rb.renderMaxX < 1.0, 1, 0, 0, 0.6],
  ];
  for (const [side, inside, dx, dy, dz, shade] of faces) {
    t.setBrightness(light(inside, dx, dy, dz));
    t.setColorOpaque_F(shade, shade, shade);
    rb.renderFace(side, x, y, z, rb.getBlockIcon(block, access, x, y, z, side));
    rb.flipTexture = false;
  }
  return true;
}

/** Type 14: the bed's planks bottom, its top turned to face the head, and the outer sides only. */
export function renderBlockBed(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  const dir = BlockDirectional.getDirection(meta);
  const head = BlockBed.isBlockHeadOfBed(meta);
  const own = block.getMixedBrightnessForBlock(access, x, y, z);
  t.setBrightness(own);
  t.setColorOpaque_F(0.5, 0.5, 0.5);
  let icon = rb.getBlockIcon(block, access, x, y, z, 0);
  const minX = x + rb.renderMinX;
  const maxX = x + rb.renderMaxX;
  const minZ = z + rb.renderMinZ;
  const maxZ = z + rb.renderMaxZ;
  const bottomY = y + rb.renderMinY + 0.1875;
  quad([
    [minX, bottomY, maxZ, icon.getMinU(), icon.getMaxV()],
    [minX, bottomY, minZ, icon.getMinU(), icon.getMinV()],
    [maxX, bottomY, minZ, icon.getMaxU(), icon.getMinV()],
    [maxX, bottomY, maxZ, icon.getMaxU(), icon.getMaxV()],
  ]);
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y + 1, z));
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  icon = rb.getBlockIcon(block, access, x, y, z, 1);
  const u0 = icon.getMinU();
  const u1 = icon.getMaxU();
  const v0 = icon.getMinV();
  const v1 = icon.getMaxV();
  // UVs of the four top corners, rotated with the bed's direction.
  let aU = u0;
  let bU = u1;
  let aV = v0;
  let bV = v0;
  let cU = u0;
  let dU = u1;
  let cV = v1;
  let dV = v1;
  if (dir === 0) {
    bU = u0;
    aV = v1;
    cU = u1;
    dV = v0;
  } else if (dir === 2) {
    aU = u1;
    bV = v1;
    dU = u0;
    cV = v0;
  } else if (dir === 3) {
    aU = u1;
    bV = v1;
    dU = u0;
    cV = v0;
    bU = u0;
    aV = v1;
    cU = u1;
    dV = v0;
  }
  const topY = y + rb.renderMaxY;
  quad([
    [maxX, topY, maxZ, cU, cV],
    [maxX, topY, minZ, aU, aV],
    [minX, topY, minZ, bU, bV],
    [minX, topY, maxZ, dU, dV],
  ]);
  // The face toward the other half is skipped; the foot or head end mirrors its texture.
  const inner = head ? Direction.directionToFacing[Direction.rotateOpposite[dir]] : Direction.directionToFacing[dir];
  const flipped = dir === 0 ? 5 : dir === 1 ? 3 : dir === 3 ? 2 : 4;
  const sides: [number, number, number, boolean, number][] = [
    [2, 0, -1, rb.renderMinZ > 0.0, 0.8],
    [3, 0, 1, rb.renderMaxZ < 1.0, 0.8],
    // 1.5.2 tests the z bounds for the x faces too.
    [4, -1, 0, rb.renderMinZ > 0.0, 0.6],
    [5, 1, 0, rb.renderMaxZ < 1.0, 0.6],
  ];
  for (const [side, dx, dz, inside, shade] of sides) {
    if (inner === side || !(rb.renderAllFaces || block.shouldSideBeRendered(access, x + dx, y, z + dz, side))) continue;
    t.setBrightness(inside ? own : block.getMixedBrightnessForBlock(access, x + dx, y, z + dz));
    t.setColorOpaque_F(shade, shade, shade);
    rb.flipTexture = flipped === side;
    rb.renderFace(side, x, y, z, rb.getBlockIcon(block, access, x, y, z, side));
  }
  rb.flipTexture = false;
  return true;
}

// ------------------------------------------------------------------ pistons (16, 17)

/** Type 16: the piston base, shortened by the head's 4/16 when extended. */
export function renderPistonBase(rb: RenderBlocks, block: Block, x: number, y: number, z: number, forceExtended = false): boolean {
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const extended = forceExtended || (meta & 8) !== 0;
  const facing = BlockPistonBase.getOrientation(meta);
  setFacingRotations(rb, facing);
  if (extended) {
    const piston = block as BlockPistonBase;
    const bounds: Record<number, readonly number[]> = {
      0: [0.0, 0.25, 0.0, 1.0, 1.0, 1.0],
      1: [0.0, 0.0, 0.0, 1.0, 0.75, 1.0],
      2: [0.0, 0.0, 0.25, 1.0, 1.0, 1.0],
      3: [0.0, 0.0, 0.0, 1.0, 1.0, 0.75],
      4: [0.25, 0.0, 0.0, 1.0, 1.0, 1.0],
      5: [0.0, 0.0, 0.0, 0.75, 1.0, 1.0],
    };
    const b = bounds[facing];
    if (b) rb.setRenderBounds(b[0], b[1], b[2], b[3], b[4], b[5]);
    piston.setPistonBounds(rb.renderMinX, rb.renderMinY, rb.renderMinZ, rb.renderMaxX, rb.renderMaxY, rb.renderMaxZ);
    rb.renderStandardBlock(block, x, y, z);
    resetRotations(rb);
    rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
    piston.setPistonBounds(rb.renderMinX, rb.renderMinY, rb.renderMinZ, rb.renderMaxX, rb.renderMaxY, rb.renderMaxZ);
  } else {
    rb.renderStandardBlock(block, x, y, z);
    resetRotations(rb);
  }
  return true;
}

export function renderPistonBaseAllFaces(rb: RenderBlocks, block: Block, x: number, y: number, z: number): void {
  rb.renderAllFaces = true;
  renderPistonBase(rb, block, x, y, z, true);
  rb.renderAllFaces = false;
}

type RodAxis = 'y' | 'z' | 'x';

/** One side of the piston rod: a quad textured with the first 4/16 rows of piston_side. */
function renderPistonRod(rb: RenderBlocks, axis: RodAxis, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, shade: number, length16: number): void {
  const t = Tessellator.instance;
  const icon = overridden(rb, rb.getIconSafe(BlockPistonBase.getPistonIcon('piston_side')));
  const u0 = icon.getMinU();
  const v0 = icon.getMinV();
  const u1 = icon.getInterpolatedU(length16);
  const v1 = icon.getInterpolatedV(4.0);
  t.setColorOpaque_F(shade, shade, shade);
  if (axis === 'y') {
    quad([
      [x0, y1, z0, u1, v0],
      [x0, y0, z0, u0, v0],
      [x1, y0, z1, u0, v1],
      [x1, y1, z1, u1, v1],
    ]);
  } else if (axis === 'z') {
    quad([
      [x0, y0, z1, u1, v0],
      [x0, y0, z0, u0, v0],
      [x1, y1, z0, u0, v1],
      [x1, y1, z1, u1, v1],
    ]);
  } else {
    quad([
      [x1, y0, z0, u1, v0],
      [x0, y0, z0, u0, v0],
      [x0, y1, z1, u0, v1],
      [x1, y1, z1, u1, v1],
    ]);
  }
}

/** Head plate bounds per facing. */
const PISTON_HEAD: Record<number, readonly number[]> = {
  0: [0.0, 0.0, 0.0, 1.0, 0.25, 1.0],
  1: [0.0, 0.75, 0.0, 1.0, 1.0, 1.0],
  2: [0.0, 0.0, 0.0, 1.0, 1.0, 0.25],
  3: [0.0, 0.0, 0.75, 1.0, 1.0, 1.0],
  4: [0.0, 0.0, 0.0, 0.25, 1.0, 1.0],
  5: [0.75, 0.0, 0.0, 1.0, 1.0, 1.0],
};

/**
 * The four rod sides per facing: the two cross-axis coordinate pairs (block fractions) and
 * the shade factor; the rod runs along the facing axis from the head.
 */
const PISTON_RODS: Record<RodAxis, readonly (readonly [number, number, number, number, number])[]> = {
  y: [
    [0.375, 0.625, 0.625, 0.625, 0.8],
    [0.625, 0.375, 0.375, 0.375, 0.8],
    [0.375, 0.375, 0.375, 0.625, 0.6],
    [0.625, 0.625, 0.625, 0.375, 0.6],
  ],
  z: [
    [0.375, 0.375, 0.625, 0.375, 0.6],
    [0.625, 0.625, 0.375, 0.625, 0.6],
    [0.375, 0.625, 0.375, 0.375, 0.5],
    [0.625, 0.375, 0.625, 0.625, 1.0],
  ],
  x: [
    [0.375, 0.375, 0.625, 0.375, 0.5],
    [0.625, 0.625, 0.375, 0.625, 1.0],
    [0.375, 0.625, 0.375, 0.375, 0.6],
    [0.625, 0.375, 0.625, 0.625, 0.6],
  ],
};

/**
 * Type 17: the head plate and the rod behind it. In the world the rod is a whole block long
 * (it runs on into the base); the moving-piston renderer draws it half as long.
 */
export function renderPistonExtension(rb: RenderBlocks, block: Block, x: number, y: number, z: number, fullRod = true): boolean {
  const access = rb.blockAccess!;
  const facing = BlockPistonExtension.getDirectionMeta(access.getBlockMetadata(x, y, z));
  const light = block.getBlockBrightness(access, x, y, z);
  const length = fround(fullRod ? 1.0 : 0.5);
  const length16 = fullRod ? 16.0 : 8.0;
  const head = PISTON_HEAD[facing];
  if (head) {
    setFacingRotations(rb, facing);
    rb.setRenderBounds(head[0], head[1], head[2], head[3], head[4], head[5]);
    rb.renderStandardBlock(block, x, y, z);
    const axis: RodAxis = facing < 2 ? 'y' : facing < 4 ? 'z' : 'x';
    // Along the axis the rod starts behind the head: at 0.25 for the negative facings, else ends at 0.75.
    const along0 = facing % 2 === 0 ? 0.25 : fround(0.75 - length);
    const along1 = facing % 2 === 0 ? fround(0.25 + length) : 0.75;
    for (const [a0, a1, b0, b1, shade] of PISTON_RODS[axis]) {
      const s = fround(light * shade);
      if (axis === 'y') {
        renderPistonRod(rb, axis, fround(x + a0), fround(x + a1), fround(y + along0), fround(y + along1), fround(z + b0), fround(z + b1), s, length16);
      } else if (axis === 'z') {
        renderPistonRod(rb, axis, fround(x + a0), fround(x + a1), fround(y + b0), fround(y + b1), fround(z + along0), fround(z + along1), s, length16);
      } else {
        renderPistonRod(rb, axis, fround(x + along0), fround(x + along1), fround(y + a0), fround(y + a1), fround(z + b0), fround(z + b1), s, length16);
      }
    }
  }
  resetRotations(rb);
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  return true;
}

export function renderPistonExtensionAllFaces(rb: RenderBlocks, block: Block, x: number, y: number, z: number, fullRod: boolean): void {
  rb.renderAllFaces = true;
  renderPistonExtension(rb, block, x, y, z, fullRod);
  rb.renderAllFaces = false;
}

// ------------------------------------------------------------------ repeaters (15), comparators (37), diodes (36)

/** The diode slab's sides and its top texture turned to the facing (meta & 3). */
function renderDiodeBase(rb: RenderBlocks, block: Block, x: number, y: number, z: number, facing: number): void {
  rb.renderStandardBlock(block, x, y, z);
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const icon = rb.getBlockIconFromSideAndMetadata(block, 1, access.getBlockMetadata(x, y, z));
  const u0 = icon.getMinU();
  const u1 = icon.getMaxU();
  const v0 = icon.getMinV();
  const v1 = icon.getMaxV();
  const py = y + 0.125;
  // Corner x/z per facing: a, b, c, d receive (u1,v0) (u1,v1) (u0,v1) (u0,v0).
  let ax = x + 1;
  let bx = x + 1;
  let cx = x;
  let dx = x;
  let az = z;
  let bz = z + 1;
  let cz = z + 1;
  let dz = z;
  if (facing === 2) {
    ax = bx = x;
    cx = dx = x + 1;
    az = dz = z + 1;
    bz = cz = z;
  } else if (facing === 3) {
    ax = dx = x;
    bx = cx = x + 1;
    az = bz = z;
    cz = dz = z + 1;
  } else if (facing === 1) {
    ax = dx = x + 1;
    bx = cx = x;
    az = bz = z + 1;
    cz = dz = z;
  }
  quad([
    [dx, py, dz, u0, v0],
    [cx, py, cz, u0, v1],
    [bx, py, bz, u1, v1],
    [ax, py, az, u1, v0],
  ]);
}

/** Type 36: a plain diode (no torches). */
export function renderBlockRedstoneLogic(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  renderDiodeBase(rb, block, x, y, z, rb.blockAccess!.getBlockMetadata(x, y, z) & 3);
  return true;
}

/** Type 15: the repeater with its sliding delay torch (or the bedrock lock bar) and fixed torch. */
export function renderBlockRepeater(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  const meta = access.getBlockMetadata(x, y, z);
  const facing = meta & 3;
  const delay = (meta & 12) >> 2;
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const sink = -0.1875;
  const locked = (block as BlockRedstoneRepeater).isLocked(access, x, y, z, meta);
  const slide = BlockRedstoneRepeater.repeaterTorchOffset[delay];
  let delayX = 0.0;
  let delayZ = 0.0;
  let fixedX = 0.0;
  let fixedZ = 0.0;
  switch (facing) {
    case 0:
      fixedZ = -0.3125;
      delayZ = slide;
      break;
    case 1:
      fixedX = 0.3125;
      delayX = -slide;
      break;
    case 2:
      fixedZ = 0.3125;
      delayZ = -slide;
      break;
    case 3:
      fixedX = -0.3125;
      delayX = slide;
      break;
  }
  if (!locked) {
    rb.renderTorchAtAngle(block, x + delayX, y + sink, z + delayZ, 0.0, 0.0, 0);
  } else {
    const bar = iconOfBlock(rb, BlockIds.bedrock);
    rb.setOverrideBlockTexture(bar);
    let bx0 = 2.0;
    let bx1 = 14.0;
    let bz0 = 7.0;
    let bz1 = 9.0;
    if (facing === 1 || facing === 3) {
      bx0 = 7.0;
      bx1 = 9.0;
      bz0 = 2.0;
      bz1 = 14.0;
    }
    const ox = fround(delayX);
    const oz = fround(delayZ);
    rb.setRenderBounds(fround(bx0 / 16.0 + ox), 0.125, fround(bz0 / 16.0 + oz), fround(bx1 / 16.0 + ox), 0.25, fround(bz1 / 16.0 + oz));
    const u0 = bar.getInterpolatedU(bx0);
    const v0 = bar.getInterpolatedV(bz0);
    const u1 = bar.getInterpolatedU(bx1);
    const v1 = bar.getInterpolatedV(bz1);
    const py = fround(y + 0.25);
    quad([
      [fround(x + bx0 / 16.0) + delayX, py, fround(z + bz0 / 16.0) + delayZ, u0, v0],
      [fround(x + bx0 / 16.0) + delayX, py, fround(z + bz1 / 16.0) + delayZ, u0, v1],
      [fround(x + bx1 / 16.0) + delayX, py, fround(z + bz1 / 16.0) + delayZ, u1, v1],
      [fround(x + bx1 / 16.0) + delayX, py, fround(z + bz0 / 16.0) + delayZ, u1, v0],
    ]);
    rb.renderStandardBlock(block, x, y, z);
    rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 0.125, 1.0);
    rb.clearOverrideBlockTexture();
  }
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  rb.renderTorchAtAngle(block, x + fixedX, y + sink, z + fixedZ, 0.0, 0.0, 0);
  renderBlockRedstoneLogic(rb, block, x, y, z);
  return true;
}

/** Type 37: two back torches and the front torch (lit in subtract mode, lower when off). */
export function renderBlockComparator(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
  t.setColorOpaque_F(1.0, 1.0, 1.0);
  const meta = access.getBlockMetadata(x, y, z);
  const facing = meta & 3;
  let frontX = 0.0;
  let frontY = -0.1875;
  let frontZ = 0.0;
  let sideX = 0.0;
  let sideZ = 0.0;
  let front: Icon;
  if ((block as BlockComparator).isSubtractMode(meta)) {
    front = rb.getBlockIconFromSide(Block.blocksList[BlockIds.torchRedstoneActive]!, 0);
  } else {
    frontY -= 0.1875;
    front = rb.getBlockIconFromSide(Block.blocksList[BlockIds.torchRedstoneIdle]!, 0);
  }
  switch (facing) {
    case 0:
      frontZ = -0.3125;
      sideZ = 1.0;
      break;
    case 1:
      frontX = 0.3125;
      sideX = -1.0;
      break;
    case 2:
      frontZ = 0.3125;
      sideZ = -1.0;
      break;
    case 3:
      frontX = -0.3125;
      sideX = 1.0;
      break;
  }
  const backY = fround(y - 0.1875);
  rb.renderTorchAtAngle(block, x + 0.25 * sideX + 0.1875 * sideZ, backY, z + 0.25 * sideZ + 0.1875 * sideX, 0.0, 0.0, meta);
  rb.renderTorchAtAngle(block, x + 0.25 * sideX + -0.1875 * sideZ, backY, z + 0.25 * sideZ + -0.1875 * sideX, 0.0, 0.0, meta);
  rb.setOverrideBlockTexture(front);
  rb.renderTorchAtAngle(block, x + frontX, y + frontY, z + frontZ, 0.0, 0.0, meta);
  rb.clearOverrideBlockTexture();
  renderDiodeBase(rb, block, x, y, z, facing);
  return true;
}

// ------------------------------------------------------------------ cauldrons (24), flower pots (33), brewing stands (25)

/** Type 24: the outer cube, inner walls and floor, and the water surface at its level (meta 1-3). */
export function renderBlockCauldron(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  rb.renderStandardBlock(block, x, y, z);
  setTint(rb, block, x, y, z);
  const side = rb.getIconSafe(block.getBlockTextureFromSide(2));
  const wall = fround(0.125);
  rb.renderFace(5, fround(fround(x - 1.0) + wall), y, z, side);
  rb.renderFace(4, fround(fround(x + 1.0) - wall), y, z, side);
  rb.renderFace(3, x, y, fround(fround(z - 1.0) + wall), side);
  rb.renderFace(2, x, y, fround(fround(z + 1.0) - wall), side);
  const inner = rb.getIconSafe(BlockCauldron.getCauldronIcon('cauldron_inner'));
  rb.renderFace(1, x, fround(fround(y - 1.0) + 0.25), z, inner);
  rb.renderFace(0, x, fround(fround(y + 1.0) - 0.75), z, inner);
  let level = rb.blockAccess!.getBlockMetadata(x, y, z);
  if (level > 0) {
    const water = rb.getIconSafe(BlockFluid.getFluidIcon('water'));
    if (level > 3) level = 3;
    rb.renderFace(1, x, fround(fround(y - 1.0) + fround((6.0 + level * 3.0) / 16.0)), z, water);
  }
  return true;
}

/** Type 33: the pot, its dirt, and the plant in it (metadata 1-11), raised 4/16. */
export function renderBlockFlowerpot(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  const access = rb.blockAccess!;
  rb.renderStandardBlock(block, x, y, z);
  t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
  const potIcon = rb.getBlockIconFromSide(block, 0);
  const [r, g, b] = tintAt(rb, block, x, y, z);
  t.setColorOpaque_F(r, g, b);
  const wall = fround(0.1865);
  rb.renderFace(5, fround(fround(x - 0.5) + wall), y, z, potIcon);
  rb.renderFace(4, fround(fround(x + 0.5) - wall), y, z, potIcon);
  rb.renderFace(3, x, y, fround(fround(z - 0.5) + wall), potIcon);
  rb.renderFace(2, x, y, fround(fround(z + 0.5) - wall), potIcon);
  rb.renderFace(1, x, fround(fround(fround(y - 0.5) + wall) + 0.1875), z, iconOfBlock(rb, BlockIds.dirt));
  const meta = access.getBlockMetadata(x, y, z);
  if (meta === 0) return true;
  const plantId: Record<number, number> = { 1: BlockIds.plantRed, 2: BlockIds.plantYellow, 7: BlockIds.mushroomRed, 8: BlockIds.mushroomBrown };
  const lift = fround(4.0 / 16.0);
  t.addTranslation(0.0, lift, 0.0);
  const plant = plantId[meta] !== undefined ? Block.blocksList[plantId[meta]] : null;
  if (plant) {
    rb.renderBlockByRenderType(plant, x, y, z);
  } else if (meta === 9) {
    const cactus = Block.blocksList[BlockIds.cactus]!;
    rb.renderAllFaces = true;
    const half = 0.125;
    for (const [y0, y1] of [
      [0.0, 0.25],
      [0.25, 0.5],
      [0.5, 0.75],
    ]) {
      rb.setRenderBounds(0.5 - half, y0, 0.5 - half, 0.5 + half, y1, 0.5 + half);
      rb.renderStandardBlock(cactus, x, y, z);
    }
    rb.renderAllFaces = false;
    rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  } else if (meta >= 3 && meta <= 6) {
    const saplingMeta = [0, 1, 2, 3][meta - 3];
    rb.drawCrossedSquares(Block.blocksList[BlockIds.sapling]!, saplingMeta, x, y, z, fround(0.75));
  } else if (meta === 11) {
    const grass = Block.blocksList[BlockIds.tallGrass]!;
    const [gr, gg, gb] = tintAt(rb, grass, x, y, z, false);
    t.setColorOpaque_F(gr, gg, gb);
    rb.drawCrossedSquares(grass, 2, x, y, z, fround(0.75));
  } else if (meta === 10) {
    rb.drawCrossedSquares(Block.blocksList[BlockIds.deadBush]!, 2, x, y, z, fround(0.75));
  }
  t.addTranslation(0.0, -lift, 0.0);
  return true;
}

/** Type 25: the rod, the three base plates, and three two-sided arms (bottle slots in the meta bits). */
export function renderBlockBrewingStand(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const t = Tessellator.instance;
  rb.setRenderBounds(0.4375, 0.0, 0.4375, 0.5625, 0.875, 0.5625);
  rb.renderStandardBlock(block, x, y, z);
  rb.setOverrideBlockTexture(rb.getIconSafe((block as BlockBrewingStand).getBrewingStandIcon()));
  renderBoxes(rb, block, x, y, z, [
    [0.5625, 0.0, 0.3125, 0.9375, 0.125, 0.6875],
    [0.125, 0.0, 0.0625, 0.5, 0.125, 0.4375],
    [0.125, 0.0, 0.5625, 0.5, 0.125, 0.9375],
  ]);
  rb.clearOverrideBlockTexture();
  setTint(rb, block, x, y, z);
  const icon = overridden(rb, rb.getBlockIconFromSideAndMetadata(block, 0, 0));
  const v0 = icon.getMinV();
  const v1 = icon.getMaxV();
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  for (let arm = 0; arm < 3; arm++) {
    const angle = (arm * Math.PI * 2.0) / 3.0 + Math.PI / 2;
    const uc = icon.getInterpolatedU(8.0);
    const ue = meta & (1 << arm) ? icon.getMinU() : icon.getMaxU();
    const cx = x + 0.5;
    const cz = z + 0.5;
    const ex = x + 0.5 + (Math.sin(angle) * 8.0) / 16.0;
    const ez = z + 0.5 + (Math.cos(angle) * 8.0) / 16.0;
    quad([
      [cx, y + 1, cz, uc, v0],
      [cx, y, cz, uc, v1],
      [ex, y, ez, ue, v1],
      [ex, y + 1, ez, ue, v0],
      [ex, y + 1, ez, ue, v0],
      [ex, y, ez, ue, v1],
      [cx, y, cz, uc, v1],
      [cx, y + 1, cz, uc, v0],
    ]);
  }
  block.setBlockBoundsForItemRender();
  return true;
}

// ------------------------------------------------------------------ end portal frames (26), dragon eggs (27), beacons (34)

/** Type 26: the 13/16 frame with its top turned to the facing, plus the eye when inserted. */
export function renderBlockEndPortalFrame(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const dir = meta & 3;
  if (dir === 0) rb.uvRotateTop = 3;
  else if (dir === 3) rb.uvRotateTop = 1;
  else if (dir === 1) rb.uvRotateTop = 2;
  if (!BlockEndPortalFrame.isEnderEyeInserted(meta)) {
    rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 0.8125, 1.0);
    rb.renderStandardBlock(block, x, y, z);
    rb.uvRotateTop = 0;
    return true;
  }
  rb.renderAllFaces = true;
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 0.8125, 1.0);
  rb.renderStandardBlock(block, x, y, z);
  rb.setOverrideBlockTexture(rb.getIconSafe((block as BlockEndPortalFrame).func_94398_p()));
  rb.setRenderBounds(0.25, 0.8125, 0.25, 0.75, 1.0, 0.75);
  rb.renderStandardBlock(block, x, y, z);
  rb.renderAllFaces = false;
  rb.clearOverrideBlockTexture();
  rb.uvRotateTop = 0;
  return true;
}

/** The dragon egg's eight stacked layers from the top: [half width, height] in 1/16. */
export const DRAGON_EGG_LAYERS: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 2],
  [6, 3],
  [7, 5],
  [6, 2],
  [3, 1],
];

/** Calls `fn` with the render bounds of each dragon egg layer set. */
export function forEachDragonEggLayer(rb: RenderBlocks, fn: () => void): void {
  let depth = 0;
  for (const [w, h] of DRAGON_EGG_LAYERS) {
    const half = fround(w / 16.0);
    const top = fround(1.0 - fround(depth / 16.0));
    const bottom = fround(1.0 - fround((depth + h) / 16.0));
    depth += h;
    rb.setRenderBounds(fround(0.5 - half), bottom, fround(0.5 - half), fround(0.5 + half), top, fround(0.5 + half));
    fn();
  }
}

/** Type 27: a stack of square layers. */
export function renderBlockDragonEgg(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  forEachDragonEggLayer(rb, () => rb.renderStandardBlock(block, x, y, z));
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  return true;
}

/** Type 34: obsidian base, glass shell, and the beacon core. */
export function renderBlockBeacon(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  const baseTop = fround(0.1875);
  rb.setOverrideBlockTexture(iconOfBlock(rb, BlockIds.obsidian));
  rb.setRenderBounds(0.125, fround(0.00625), 0.125, 0.875, baseTop, 0.875);
  rb.renderStandardBlock(block, x, y, z);
  rb.setOverrideBlockTexture(iconOfBlock(rb, BlockIds.glass));
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  rb.renderStandardBlock(block, x, y, z);
  rb.setOverrideBlockTexture(rb.getIconSafe((block as BlockBeacon).getBeaconIcon()));
  rb.setRenderBounds(0.1875, baseTop, 0.1875, 0.8125, 0.875, 0.8125);
  rb.renderStandardBlock(block, x, y, z);
  rb.clearOverrideBlockTexture();
  return true;
}

// ------------------------------------------------------------------ anvils (35), hoppers (38)

/** The anvil's four stacked boxes: [width, height, depth] (width and depth swap for facings 1/3). */
const ANVIL_PARTS: readonly (readonly [number, number, number])[] = [
  [0.75, 0.25, 0.75],
  [0.5, 0.0625, 0.625],
  [0.25, 0.3125, 0.5],
  [0.625, 0.375, 1.0],
];

/**
 * Draws the anvil's boxes with its texture rotations (meta & 3 facing, meta >> 2 damage on
 * the top). With `item` set it draws each face with a normal around the origin instead.
 */
export function renderBlockAnvilOrient(rb: RenderBlocks, anvil: BlockAnvil, x: number, y: number, z: number, meta: number, item: boolean, drawItemBox?: (rb: RenderBlocks, block: Block, meta: number) => void): boolean {
  const facing = item ? 0 : meta & 3;
  let turned = false;
  switch (facing) {
    case 0:
      rb.uvRotateSouth = 2;
      rb.uvRotateNorth = 1;
      rb.uvRotateTop = 3;
      rb.uvRotateBottom = 3;
      break;
    case 1:
      rb.uvRotateEast = 1;
      rb.uvRotateWest = 2;
      rb.uvRotateTop = 2;
      rb.uvRotateBottom = 1;
      turned = true;
      break;
    case 2:
      rb.uvRotateSouth = 1;
      rb.uvRotateNorth = 2;
      break;
    case 3:
      rb.uvRotateEast = 2;
      rb.uvRotateWest = 1;
      rb.uvRotateTop = 1;
      rb.uvRotateBottom = 2;
      turned = true;
      break;
  }
  let bottom = 0.0;
  ANVIL_PARTS.forEach(([w0, h, d0], part) => {
    let w = fround(w0);
    let d = fround(d0);
    if (turned) [w, d] = [d, w];
    w = fround(w / 2.0);
    d = fround(d / 2.0);
    anvil.renderSide = part;
    rb.setRenderBounds(fround(0.5 - w), bottom, fround(0.5 - d), fround(0.5 + w), fround(bottom + h), fround(0.5 + d));
    if (item) drawItemBox!(rb, anvil, meta);
    else rb.renderStandardBlock(anvil, x, y, z);
    bottom = fround(bottom + h);
  });
  rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
  resetRotations(rb);
  return true;
}

/** Type 35. */
export function renderBlockAnvil(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  return renderBlockAnvilMetadata(rb, block, x, y, z, rb.blockAccess!.getBlockMetadata(x, y, z));
}

export function renderBlockAnvilMetadata(rb: RenderBlocks, block: Block, x: number, y: number, z: number, meta: number): boolean {
  setTint(rb, block, x, y, z);
  return renderBlockAnvilOrient(rb, block as BlockAnvil, x, y, z, meta, false);
}

/** Type 38: the rim, the inner walls and floor, the funnel and the spout toward the output side. */
export function renderBlockHopper(rb: RenderBlocks, block: Block, x: number, y: number, z: number): boolean {
  setTint(rb, block, x, y, z);
  const meta = rb.blockAccess!.getBlockMetadata(x, y, z);
  const output = BlockHopper.getDirectionFromMetadata(meta);
  const rim = 0.625;
  rb.setRenderBounds(0.0, rim, 0.0, 1.0, 1.0, 1.0);
  rb.renderStandardBlock(block, x, y, z);
  setTint(rb, block, x, y, z);
  const outside = rb.getIconSafe(BlockHopper.getHopperIcon('hopper'));
  const inside = rb.getIconSafe(BlockHopper.getHopperIcon('hopper_inside'));
  const wall = fround(0.125);
  rb.renderFace(5, fround(fround(x - 1.0) + wall), y, z, outside);
  rb.renderFace(4, fround(fround(x + 1.0) - wall), y, z, outside);
  rb.renderFace(3, x, y, fround(fround(z - 1.0) + wall), outside);
  rb.renderFace(2, x, y, fround(fround(z + 1.0) - wall), outside);
  rb.renderFace(1, x, fround(y - 1.0) + rim, z, inside);
  rb.setOverrideBlockTexture(outside);
  rb.setRenderBounds(0.25, 0.25, 0.25, 0.75, rim - 0.002, 0.75);
  rb.renderStandardBlock(block, x, y, z);
  const spouts: Record<number, readonly number[]> = {
    0: [0.375, 0.0, 0.375, 0.625, 0.25, 0.625],
    2: [0.375, 0.25, 0.0, 0.625, 0.5, 0.25],
    3: [0.375, 0.25, 0.75, 0.625, 0.5, 1.0],
    4: [0.0, 0.25, 0.375, 0.25, 0.5, 0.625],
    5: [0.75, 0.25, 0.375, 1.0, 0.5, 0.625],
  };
  const spout = spouts[output];
  if (spout) renderBoxes(rb, block, x, y, z, [spout]);
  rb.clearOverrideBlockTexture();
  return true;
}
