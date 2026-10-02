import { Block } from '../../block/Block';
import type { BlockAnvil } from '../../block/BlockAnvil';
import type { BlockBeacon } from '../../block/BlockBeacon';
import { BlockHopper } from '../../block/BlockHopper';
import { BlockIds } from '../../block/BlockIds';
import { Tessellator } from '../gl/Tessellator';
import type { ItemRenderGL, RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';
import { fround, iconOfBlock, unpackRgb } from './RenderHelpers';
import { renderBlockCropsImpl, renderBlockStemSmall } from './RenderShapes';
import { forEachDragonEggLayer, renderBlockAnvilOrient } from './RenderStructures';

/*
 * RenderBlocks.renderBlockAsItem: blocks in GUI slots, in the hand, as dropped items, on
 * minecarts and in item frames. Runs on the main thread with the GL calls installed in
 * RenderBlocks.itemGL. Each face is its own draw with its normal so that item lighting works.
 */

/** Outward normals of the six faces. */
const NORMALS: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

/** Draws one face of the current render bounds at the origin as its own batch. */
function drawItemFace(rb: RenderBlocks, side: number, icon: Icon): void {
  const t = Tessellator.instance;
  t.startDrawingQuads();
  t.setNormal(NORMALS[side][0], NORMALS[side][1], NORMALS[side][2]);
  rb.renderFace(side, 0, 0, 0, icon);
  t.draw();
}

/** Draws the six faces of the current render bounds, icons from getIcon(side, meta). */
export function drawItemBoxMeta(rb: RenderBlocks, block: Block, meta: number): void {
  for (let side = 0; side < 6; side++) drawItemFace(rb, side, rb.getBlockIconFromSideAndMetadata(block, side, meta));
}

/** Draws the six faces of the current render bounds, icons from getBlockTextureFromSide(side). */
function drawItemBoxSide(rb: RenderBlocks, block: Block): void {
  for (let side = 0; side < 6; side++) drawItemFace(rb, side, rb.getBlockIconFromSide(block, side));
}

/** Draws boxes (render bounds) around the origin, translating around each like the original. */
function drawItemBoxes(rb: RenderBlocks, gl: ItemRenderGL, boxes: readonly (readonly number[])[], draw: () => void): void {
  for (const b of boxes) {
    rb.setRenderBounds(b[0], b[1], b[2], b[3], b[4], b[5]);
    gl.translate(-0.5, -0.5, -0.5);
    draw();
    gl.translate(0.5, 0.5, 0.5);
  }
}

/** Hook for chest-shaped blocks (render type 22): draws the chest model at the origin. */
export const ChestItemHook: { render: ((block: Block, meta: number, brightness: number) => void) | null } = { render: null };

/** Hopper parts with face normals around the origin (renderBlockHopperMetadata for items). */
function drawHopperItem(rb: RenderBlocks, block: Block, meta: number): void {
  const rim = 0.625;
  rb.setRenderBounds(0.0, rim, 0.0, 1.0, 1.0, 1.0);
  drawItemBoxMeta(rb, block, meta);
  const outside = rb.getIconSafe(BlockHopper.getHopperIcon('hopper'));
  const inside = rb.getIconSafe(BlockHopper.getHopperIcon('hopper_inside'));
  const wall = fround(0.125);
  const t = Tessellator.instance;
  const face = (side: number, x: number, y: number, z: number, icon: Icon): void => {
    t.startDrawingQuads();
    t.setNormal(NORMALS[side][0], NORMALS[side][1], NORMALS[side][2]);
    rb.renderFace(side, x, y, z, icon);
    t.draw();
  };
  face(5, fround(-1.0 + wall), 0, 0, outside);
  face(4, fround(1.0 - wall), 0, 0, outside);
  face(3, 0, 0, fround(-1.0 + wall), outside);
  face(2, 0, 0, fround(1.0 - wall), outside);
  face(1, 0, -1.0 + rim, 0, inside);
  rb.setOverrideBlockTexture(outside);
  rb.setRenderBounds(0.25, 0.25, 0.25, 0.75, rim - 0.002, 0.75);
  for (const side of [5, 4, 3, 2, 1, 0]) face(side, 0, 0, 0, outside);
  rb.clearOverrideBlockTexture();
}

/** Render types drawn as 3D blocks in inventories and hands (RenderBlocks.renderItemIn3d). */
const ITEM_3D_TYPES = new Set([0, 31, 39, 13, 10, 11, 27, 22, 21, 16, 26, 32, 34, 35]);

export function renderItemIn3d(type: number): boolean {
  return ITEM_3D_TYPES.has(type);
}

export function renderBlockAsItem(rb: RenderBlocks, gl: ItemRenderGL, block: Block, meta: number, brightness: number): void {
  const t = Tessellator.instance;
  const isGrass = block.blockID === BlockIds.grass;
  if (block.blockID === BlockIds.dispenser || block.blockID === BlockIds.dropper || block.blockID === BlockIds.furnaceIdle) meta = 3;
  const tint = (c: number): void => {
    const [r, g, b] = unpackRgb(c);
    gl.color(r * brightness, g * brightness, b * brightness, 1.0);
  };
  if (rb.useInventoryTint) tint(isGrass ? 0xffffff : block.getRenderColor(meta));
  const type = block.getRenderType();
  rb.setRenderBoundsFromBlock(block);
  if (type === 0 || type === 31 || type === 39 || type === 16 || type === 26) {
    if (type === 16) meta = 1;
    block.setBlockBoundsForItemRender();
    rb.setRenderBoundsFromBlock(block);
    gl.rotate(90.0, 0.0, 1.0, 0.0);
    gl.translate(-0.5, -0.5, -0.5);
    for (let side = 0; side < 6; side++) {
      // Grass: only the top takes the colour.
      if (side === 1 && isGrass && rb.useInventoryTint) tint(block.getRenderColor(meta));
      drawItemFace(rb, side, rb.getBlockIconFromSideAndMetadata(block, side, meta));
      if (side === 1 && isGrass && rb.useInventoryTint) gl.color(brightness, brightness, brightness, 1.0);
    }
    gl.translate(0.5, 0.5, 0.5);
    return;
  }
  switch (type) {
    case 1:
      t.startDrawingQuads();
      t.setNormal(0.0, -1.0, 0.0);
      rb.drawCrossedSquares(block, meta, -0.5, -0.5, -0.5, 1.0);
      t.draw();
      break;
    case 19:
      t.startDrawingQuads();
      t.setNormal(0.0, -1.0, 0.0);
      block.setBlockBoundsForItemRender();
      renderBlockStemSmall(rb, block, meta, rb.renderMaxY, -0.5, -0.5, -0.5);
      t.draw();
      break;
    case 23:
      // 1.5.2 draws nothing here (lily pads use their item icon).
      t.startDrawingQuads();
      t.setNormal(0.0, -1.0, 0.0);
      block.setBlockBoundsForItemRender();
      t.draw();
      break;
    case 13: {
      block.setBlockBoundsForItemRender();
      gl.translate(-0.5, -0.5, -0.5);
      const inset = fround(0.0625);
      const shift: readonly (readonly [number, number])[] = [
        [0, 0],
        [0, 0],
        [0, inset],
        [0, -inset],
        [inset, 0],
        [-inset, 0],
      ];
      for (let side = 0; side < 6; side++) {
        t.startDrawingQuads();
        t.setNormal(NORMALS[side][0], NORMALS[side][1], NORMALS[side][2]);
        t.addTranslation(shift[side][0], 0.0, shift[side][1]);
        rb.renderFace(side, 0, 0, 0, rb.getBlockIconFromSide(block, side));
        t.addTranslation(-shift[side][0], 0.0, -shift[side][1]);
        t.draw();
      }
      gl.translate(0.5, 0.5, 0.5);
      break;
    }
    case 22:
      gl.rotate(90.0, 0.0, 1.0, 0.0);
      gl.translate(-0.5, -0.5, -0.5);
      ChestItemHook.render?.(block, meta, brightness);
      gl.enableRescaleNormal?.();
      break;
    case 6:
      t.startDrawingQuads();
      t.setNormal(0.0, -1.0, 0.0);
      renderBlockCropsImpl(rb, block, meta, -0.5, -0.5, -0.5);
      t.draw();
      break;
    case 2:
      t.startDrawingQuads();
      t.setNormal(0.0, -1.0, 0.0);
      rb.renderTorchAtAngle(block, -0.5, -0.5, -0.5, 0.0, 0.0, 0);
      t.draw();
      break;
    case 10:
      drawItemBoxes(
        rb,
        gl,
        [
          [0.0, 0.0, 0.0, 1.0, 1.0, 0.5],
          [0.0, 0.0, 0.5, 1.0, 0.5, 1.0],
        ],
        () => drawItemBoxSide(rb, block),
      );
      break;
    case 27:
      gl.translate(-0.5, -0.5, -0.5);
      t.startDrawingQuads();
      forEachDragonEggLayer(rb, () => {
        for (let side = 0; side < 6; side++) {
          t.setNormal(NORMALS[side][0], NORMALS[side][1], NORMALS[side][2]);
          rb.renderFace(side, 0, 0, 0, rb.getBlockIconFromSide(block, side));
        }
      });
      t.draw();
      gl.translate(0.5, 0.5, 0.5);
      rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
      break;
    case 11: {
      const post = 0.125;
      const bar = 0.0625;
      drawItemBoxes(
        rb,
        gl,
        [
          [fround(0.5 - post), 0.0, 0.0, fround(0.5 + post), 1.0, fround(post * 2.0)],
          [fround(0.5 - post), 0.0, fround(1.0 - post * 2.0), fround(0.5 + post), 1.0, 1.0],
          [fround(0.5 - bar), fround(1.0 - bar * 3.0), fround(-bar * 2.0), fround(0.5 + bar), fround(1.0 - bar), fround(1.0 + bar * 2.0)],
          [fround(0.5 - bar), fround(0.5 - bar * 3.0), fround(-bar * 2.0), fround(0.5 + bar), fround(0.5 - bar), fround(1.0 + bar * 2.0)],
        ],
        () => drawItemBoxSide(rb, block),
      );
      rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
      break;
    }
    case 21: {
      const w = 0.0625;
      drawItemBoxes(
        rb,
        gl,
        [
          [fround(0.5 - w), fround(0.3), 0.0, fround(0.5 + w), 1.0, fround(w * 2.0)],
          [fround(0.5 - w), fround(0.3), fround(1.0 - w * 2.0), fround(0.5 + w), 1.0, 1.0],
          [fround(0.5 - w), 0.5, 0.0, fround(0.5 + w), fround(1.0 - w), 1.0],
        ],
        () => drawItemBoxSide(rb, block),
      );
      break;
    }
    case 32:
      drawItemBoxes(
        rb,
        gl,
        [
          [0.0, 0.0, 0.3125, 1.0, 0.8125, 0.6875],
          [0.25, 0.0, 0.25, 0.75, 1.0, 0.75],
        ],
        () => drawItemBoxMeta(rb, block, meta),
      );
      rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
      break;
    case 35:
      gl.translate(-0.5, -0.5, -0.5);
      renderBlockAnvilOrient(rb, block as BlockAnvil, 0, 0, 0, meta, true, drawItemBoxMeta);
      gl.translate(0.5, 0.5, 0.5);
      break;
    case 34: {
      const layers: readonly [readonly number[], Icon][] = [
        [[0.125, 0.0, 0.125, 0.875, 0.1875, 0.875], iconOfBlock(rb, BlockIds.obsidian)],
        [[0.1875, 0.1875, 0.1875, 0.8125, 0.875, 0.8125], rb.getIconSafe((Block.blocksList[BlockIds.beacon] as BlockBeacon).getBeaconIcon())],
        [[0.0, 0.0, 0.0, 1.0, 1.0, 1.0], iconOfBlock(rb, BlockIds.glass)],
      ];
      for (const [box, icon] of layers) {
        rb.setOverrideBlockTexture(icon);
        drawItemBoxes(rb, gl, [box], () => drawItemBoxMeta(rb, block, meta));
      }
      rb.setRenderBounds(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
      rb.clearOverrideBlockTexture();
      break;
    }
    case 38:
      gl.translate(-0.5, -0.5, -0.5);
      drawHopperItem(rb, block, 0);
      gl.translate(0.5, 0.5, 0.5);
      break;
    default:
      break;
  }
}
