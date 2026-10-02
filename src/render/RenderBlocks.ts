import { Block } from '../block/Block';
import { BlockFluid } from '../block/BlockFluid';
import { BlockGrass } from '../block/BlockGrass';
import { BlockIds } from '../block/BlockIds';
import type { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { IBlockAccess } from '../world/IBlockAccess';
import { renderBlockAsItem as renderBlockAsItemImpl, renderItemIn3d as renderItemIn3dImpl } from './blocks/RenderBlockItem';
import { RENDER_TYPES } from './blocks/RenderTypes';
import { renderBlockAnvilMetadata, renderPistonBaseAllFaces, renderPistonExtensionAllFaces } from './blocks/RenderStructures';
import { Tessellator } from './gl/Tessellator';
import type { Icon } from './texture/Icon';

// Render-bound indices (see RenderBlocks.getRenderBound).
const MIN_X = 0;
const MIN_Y = 1;
const MIN_Z = 2;
const MAX_X = 3;
const MAX_Y = 4;
const MAX_Z = 5;
/** Flag on a bound in a UV layout: sample the icon at 16 - bound * 16 instead of bound * 16. */
const INV = 8;

/** Unit vectors of the x, y and z axes. */
const AXES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * Where a face samples its icon: U at bounds ua/ub, V at va/vb. The four vertices use
 * (ua, va), (ub, vb) and the two mixed pairs; `transposed` swaps which vertex gets which.
 */
interface UvLayout {
  readonly ua: number;
  readonly ub: number;
  readonly va: number;
  readonly vb: number;
  readonly transposed: boolean;
}

function uvLayout(ua: number, ub: number, va: number, vb: number, transposed = false): UvLayout {
  return { ua, ub, va, vb, transposed };
}

type UvRotationField = 'uvRotateBottom' | 'uvRotateTop' | 'uvRotateEast' | 'uvRotateWest' | 'uvRotateNorth' | 'uvRotateSouth';

/** Smooth-lighting sample slots: K corner, A and B edges, C the block in front of the face. */
const SAMPLE: Record<string, number> = { K: 0, A: 1, B: 2, C: 3 };

/**
 * One block face. Vertices are listed in the original emit order, which also names the four
 * lighting slots (top-left, bottom-left, bottom-right, top-right).
 */
interface FaceDef {
  readonly side: number;
  /** Outward normal. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** The render bound that reaches the neighbouring block (at 0 for negative faces, 1 for positive). */
  readonly edgeBound: number;
  /** Plain shading of the face (0.5 bottom, 1 top, 0.8 north/south, 0.6 west/east). */
  readonly shade: number;
  /**
   * Smooth-lighting tangent axes. A corner that no neighbour lets light through to copies the
   * edge sample on axis A instead of reading the diagonal block.
   */
  readonly axisA: number;
  readonly axisB: number;
  /** Per vertex: the bound used on x, y and z, then the UV pair (0-3). */
  readonly verts: readonly (readonly [number, number, number, number])[];
  /**
   * Per corner id ((A sign > 0 ? 2 : 0) + (B sign > 0 ? 1 : 0)): the order in which the four
   * light samples are summed (the sums are not associative in floating point).
   */
  readonly lightSum: readonly string[];
  /** Partial-bounds blending: order of the slot corners in the light sum. */
  readonly blendOrder: readonly number[];
  /** A vanilla slip in the north face blend: this slot's term reads minY for the y weight. */
  readonly blendQuirk?: { readonly slot: number; readonly term: number; readonly boundB: number };
  readonly rotationField: UvRotationField;
  /** flipTexture mirrors U on the side faces. */
  readonly flippable: boolean;
  /** Axes whose bounds outside 0..1 make the face use the whole icon in U and V. */
  readonly clampAxisU: number;
  readonly clampAxisV: number;
  readonly uv: UvLayout;
  /** Layouts for uvRotate values 1, 2 and 3. */
  readonly uvRotated: readonly [UvLayout, UvLayout, UvLayout];
}

const TOP_BOTTOM_LIGHT = ['AKCB', 'KABC', 'CBAK', 'BCKA'];
const NORTH_SOUTH_LIGHT = ['KABC', 'AKCB', 'BCKA', 'CBAK'];
const WEST_EAST_LIGHT = ['KBAC', 'ACKB', 'BKCA', 'CABK'];
const SIDE_UV = uvLayout(MIN_X, MAX_X, MAX_Y | INV, MIN_Y | INV);
const SIDE_UV_Z = uvLayout(MIN_Z, MAX_Z, MAX_Y | INV, MIN_Y | INV);

const FACES: readonly FaceDef[] = [
  {
    side: 0,
    nx: 0,
    ny: -1,
    nz: 0,
    edgeBound: MIN_Y,
    shade: 0.5,
    axisA: 0,
    axisB: 2,
    verts: [
      [MIN_X, MIN_Y, MAX_Z, 3],
      [MIN_X, MIN_Y, MIN_Z, 0],
      [MAX_X, MIN_Y, MIN_Z, 2],
      [MAX_X, MIN_Y, MAX_Z, 1],
    ],
    lightSum: TOP_BOTTOM_LIGHT,
    blendOrder: [0, 1, 2, 3],
    rotationField: 'uvRotateBottom',
    flippable: false,
    clampAxisU: 0,
    clampAxisV: 2,
    uv: uvLayout(MIN_X, MAX_X, MIN_Z, MAX_Z),
    uvRotated: [
      uvLayout(MIN_Z | INV, MAX_Z | INV, MIN_X, MAX_X, true),
      uvLayout(MIN_Z, MAX_Z, MIN_X | INV, MAX_X | INV, true),
      uvLayout(MIN_X | INV, MAX_X | INV, MIN_Z | INV, MAX_Z | INV),
    ],
  },
  {
    side: 1,
    nx: 0,
    ny: 1,
    nz: 0,
    edgeBound: MAX_Y,
    shade: 1,
    axisA: 0,
    axisB: 2,
    verts: [
      [MAX_X, MAX_Y, MAX_Z, 1],
      [MAX_X, MAX_Y, MIN_Z, 2],
      [MIN_X, MAX_Y, MIN_Z, 0],
      [MIN_X, MAX_Y, MAX_Z, 3],
    ],
    lightSum: TOP_BOTTOM_LIGHT,
    blendOrder: [0, 1, 2, 3],
    rotationField: 'uvRotateTop',
    flippable: false,
    clampAxisU: 0,
    clampAxisV: 2,
    uv: uvLayout(MIN_X, MAX_X, MIN_Z, MAX_Z),
    uvRotated: [
      uvLayout(MIN_Z, MAX_Z, MIN_X | INV, MAX_X | INV, true),
      uvLayout(MIN_Z | INV, MAX_Z | INV, MIN_X, MAX_X, true),
      uvLayout(MIN_X | INV, MAX_X | INV, MIN_Z | INV, MAX_Z | INV),
    ],
  },
  {
    side: 2,
    nx: 0,
    ny: 0,
    nz: -1,
    edgeBound: MIN_Z,
    shade: 0.8,
    axisA: 0,
    axisB: 1,
    verts: [
      [MIN_X, MAX_Y, MIN_Z, 2],
      [MAX_X, MAX_Y, MIN_Z, 0],
      [MAX_X, MIN_Y, MIN_Z, 3],
      [MIN_X, MIN_Y, MIN_Z, 1],
    ],
    lightSum: NORTH_SOUTH_LIGHT,
    blendOrder: [0, 1, 2, 3],
    blendQuirk: { slot: 0, term: 1, boundB: MIN_Y },
    rotationField: 'uvRotateEast',
    flippable: true,
    clampAxisU: 0,
    clampAxisV: 1,
    uv: SIDE_UV,
    uvRotated: [
      uvLayout(MIN_Y | INV, MAX_Y | INV, MAX_X, MIN_X, true),
      uvLayout(MIN_Y, MAX_Y, MAX_X | INV, MIN_X | INV, true),
      uvLayout(MIN_X | INV, MAX_X | INV, MAX_Y, MIN_Y),
    ],
  },
  {
    side: 3,
    nx: 0,
    ny: 0,
    nz: 1,
    edgeBound: MAX_Z,
    shade: 0.8,
    axisA: 0,
    axisB: 1,
    verts: [
      [MIN_X, MAX_Y, MAX_Z, 0],
      [MIN_X, MIN_Y, MAX_Z, 3],
      [MAX_X, MIN_Y, MAX_Z, 1],
      [MAX_X, MAX_Y, MAX_Z, 2],
    ],
    lightSum: NORTH_SOUTH_LIGHT,
    blendOrder: [0, 3, 2, 1],
    rotationField: 'uvRotateWest',
    flippable: true,
    clampAxisU: 0,
    clampAxisV: 1,
    uv: SIDE_UV,
    uvRotated: [
      uvLayout(MIN_Y, MAX_Y, MIN_X | INV, MAX_X | INV, true),
      uvLayout(MIN_Y | INV, MAX_Y | INV, MIN_X, MAX_X, true),
      uvLayout(MIN_X | INV, MAX_X | INV, MAX_Y, MIN_Y),
    ],
  },
  {
    side: 4,
    nx: -1,
    ny: 0,
    nz: 0,
    edgeBound: MIN_X,
    shade: 0.6,
    axisA: 2,
    axisB: 1,
    verts: [
      [MIN_X, MAX_Y, MAX_Z, 2],
      [MIN_X, MAX_Y, MIN_Z, 0],
      [MIN_X, MIN_Y, MIN_Z, 3],
      [MIN_X, MIN_Y, MAX_Z, 1],
    ],
    lightSum: WEST_EAST_LIGHT,
    blendOrder: [0, 1, 2, 3],
    rotationField: 'uvRotateNorth',
    flippable: true,
    clampAxisU: 2,
    clampAxisV: 1,
    uv: SIDE_UV_Z,
    uvRotated: [
      uvLayout(MIN_Y, MAX_Y, MIN_Z | INV, MAX_Z | INV, true),
      uvLayout(MIN_Y | INV, MAX_Y | INV, MIN_Z, MAX_Z, true),
      uvLayout(MIN_Z | INV, MAX_Z | INV, MAX_Y, MIN_Y),
    ],
  },
  {
    side: 5,
    nx: 1,
    ny: 0,
    nz: 0,
    edgeBound: MAX_X,
    shade: 0.6,
    axisA: 2,
    axisB: 1,
    verts: [
      [MAX_X, MIN_Y, MAX_Z, 3],
      [MAX_X, MIN_Y, MIN_Z, 1],
      [MAX_X, MAX_Y, MIN_Z, 2],
      [MAX_X, MAX_Y, MAX_Z, 0],
    ],
    lightSum: WEST_EAST_LIGHT,
    blendOrder: [0, 1, 2, 3],
    rotationField: 'uvRotateSouth',
    flippable: true,
    clampAxisU: 2,
    clampAxisV: 1,
    uv: SIDE_UV_Z,
    uvRotated: [
      uvLayout(MIN_Y | INV, MAX_Y | INV, MAX_Z, MIN_Z, true),
      uvLayout(MIN_Y, MAX_Y, MAX_Z | INV, MIN_Z | INV, true),
      uvLayout(MIN_Z | INV, MAX_Z | INV, MAX_Y, MIN_Y),
    ],
  },
];

/** Precomputed per face: the corner id of each vertex slot and the light-sum orders as indices. */
const SLOT_CORNERS = FACES.map((f) => f.verts.map((v) => (v[f.axisA] >= MAX_X ? 2 : 0) + (v[f.axisB] >= MAX_X ? 1 : 0)));
const LIGHT_ORDER = FACES.map((f) => f.lightSum.map((s) => [...s].map((c) => SAMPLE[c])));

/** Height and inset of a cactus's side faces. */
const CACTUS_INSET = 0.0625;

/** EntityRenderer.anaglyphEnable colour mix. */
function anaglyph(r: number, g: number, b: number): [number, number, number] {
  return [(r * 30.0 + g * 59.0 + b * 11.0) / 100.0, (r * 30.0 + g * 70.0) / 100.0, (r * 30.0 + b * 70.0) / 100.0];
}

/** Unpacks a 0xRRGGBB colour to 0..1 channels. */
function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0];
}

/** GL calls renderBlockAsItem needs; installed on the main thread (absent in workers). */
export interface ItemRenderGL {
  color(r: number, g: number, b: number, a: number): void;
  rotate(angle: number, x: number, y: number, z: number): void;
  translate(x: number, y: number, z: number): void;
  /** glEnable(GL_RESCALE_NORMAL) after a chest item (optional). */
  enableRescaleNormal?(): void;
}

/**
 * Port of RenderBlocks: turns blocks into quads on the Tessellator. Worker-safe; the
 * mesher runs it over a ChunkCache. Render types without a port fall back to a cube.
 */
export class RenderBlocks {
  static fancyGrass = true;
  static anaglyphEnable = false;
  /** gameSettings.ambientOcclusion: 0 off, 1 minimum, 2 maximum. */
  static aoLevel = 2;
  /** Icon used when a block has none (TextureMap.getMissingIcon). */
  static missingIcon: Icon | null = null;
  static itemGL: ItemRenderGL | null = null;

  blockAccess: IBlockAccess | null;
  private overrideBlockTexture: Icon | null = null;
  flipTexture = false;
  renderAllFaces = false;
  useInventoryTint = true;
  renderMinX = 0;
  renderMaxX = 0;
  renderMinY = 0;
  renderMaxY = 0;
  renderMinZ = 0;
  renderMaxZ = 0;
  private lockBlockBounds = false;
  private partialRenderBounds = false;
  uvRotateEast = 0;
  uvRotateWest = 0;
  uvRotateSouth = 0;
  uvRotateNorth = 0;
  uvRotateTop = 0;
  uvRotateBottom = 0;
  private enableAO = false;
  /** Per-vertex colours (r, g, b for TL, BL, BR, TR) and brightness of the face being drawn with AO. */
  private readonly vertexColor = new Float64Array(12);
  private readonly vertexBrightness = new Int32Array(4);
  /** AO scratch: corner light and brightness by corner id, plus edge samples. */
  private readonly cornerLight = new Float64Array(4);
  private readonly cornerBrightness = new Int32Array(4);
  private readonly edgeLight = new Float64Array(4);
  private readonly edgeBrightness = new Int32Array(4);

  constructor(access: IBlockAccess | null = null) {
    this.blockAccess = access;
  }

  setOverrideBlockTexture(icon: Icon | null): void {
    this.overrideBlockTexture = icon;
  }
  clearOverrideBlockTexture(): void {
    this.overrideBlockTexture = null;
  }
  hasOverrideBlockTexture(): boolean {
    return this.overrideBlockTexture !== null;
  }
  getOverrideBlockTexture(): Icon | null {
    return this.overrideBlockTexture;
  }
  /** EntityRenderer.anaglyphEnable as seen by this renderer (the mesher gets it with its settings). */
  isAnaglyph(): boolean {
    return RenderBlocks.anaglyphEnable;
  }

  private updatePartialBounds(): void {
    this.partialRenderBounds =
      RenderBlocks.aoLevel >= 2 &&
      (this.renderMinX > 0 || this.renderMaxX < 1 || this.renderMinY > 0 || this.renderMaxY < 1 || this.renderMinZ > 0 || this.renderMaxZ < 1);
  }

  setRenderBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    if (this.lockBlockBounds) return;
    this.renderMinX = minX;
    this.renderMaxX = maxX;
    this.renderMinY = minY;
    this.renderMaxY = maxY;
    this.renderMinZ = minZ;
    this.renderMaxZ = maxZ;
    this.updatePartialBounds();
  }

  setRenderBoundsFromBlock(block: Block): void {
    if (this.lockBlockBounds) return;
    this.renderMinX = block.getBlockBoundsMinX();
    this.renderMaxX = block.getBlockBoundsMaxX();
    this.renderMinY = block.getBlockBoundsMinY();
    this.renderMaxY = block.getBlockBoundsMaxY();
    this.renderMinZ = block.getBlockBoundsMinZ();
    this.renderMaxZ = block.getBlockBoundsMaxZ();
    this.updatePartialBounds();
  }

  overrideBlockBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.renderMinX = minX;
    this.renderMaxX = maxX;
    this.renderMinY = minY;
    this.renderMaxY = maxY;
    this.renderMinZ = minZ;
    this.renderMaxZ = maxZ;
    this.lockBlockBounds = true;
    this.updatePartialBounds();
  }

  unlockBlockBounds(): void {
    this.lockBlockBounds = false;
  }

  renderBlockUsingTexture(block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.setOverrideBlockTexture(icon);
    this.renderBlockByRenderType(block, x, y, z);
    this.clearOverrideBlockTexture();
  }

  renderBlockAllFaces(block: Block, x: number, y: number, z: number): void {
    this.renderAllFaces = true;
    this.renderBlockByRenderType(block, x, y, z);
    this.renderAllFaces = false;
  }

  /** Extra render types registered by later ports: type -> renderer. */
  static readonly renderers = new Map<number, (rb: RenderBlocks, block: Block, x: number, y: number, z: number) => boolean>();

  renderBlockByRenderType(block: Block, x: number, y: number, z: number): boolean {
    const type = block.getRenderType();
    if (type === -1) return false;
    block.setBlockBoundsBasedOnState(this.blockAccess!, x, y, z);
    this.setRenderBoundsFromBlock(block);
    switch (type) {
      case 0:
        return this.renderStandardBlock(block, x, y, z);
      case 4:
        return this.renderBlockFluids(block, x, y, z);
      case 31:
        return this.renderBlockLog(block, x, y, z);
      case 1:
        return this.renderCrossedSquares(block, x, y, z);
      case 2:
        return this.renderBlockTorch(block, x, y, z);
      case 13:
        return this.renderBlockCactus(block, x, y, z);
      default: {
        const render = RENDER_TYPES.get(type) ?? RenderBlocks.renderers.get(type);
        return render ? render(this, block, x, y, z) : false;
      }
    }
  }

  renderStandardBlock(block: Block, x: number, y: number, z: number): boolean {
    let [r, g, b] = rgb(block.colorMultiplier(this.blockAccess!, x, y, z));
    if (RenderBlocks.anaglyphEnable) [r, g, b] = anaglyph(r, g, b);
    if (RenderBlocks.aoLevel === 0 || Block.lightValue[block.blockID] !== 0) return this.renderStandardBlockWithColorMultiplier(block, x, y, z, r, g, b);
    return this.partialRenderBounds
      ? this.renderStandardBlockWithAmbientOcclusionPartial(block, x, y, z, r, g, b)
      : this.renderStandardBlockWithAmbientOcclusion(block, x, y, z, r, g, b);
  }

  renderBlockLog(block: Block, x: number, y: number, z: number): boolean {
    const axis = this.blockAccess!.getBlockMetadata(x, y, z) & 12;
    if (axis === 4) {
      this.uvRotateEast = 1;
      this.uvRotateWest = 1;
      this.uvRotateTop = 1;
      this.uvRotateBottom = 1;
    } else if (axis === 8) {
      this.uvRotateSouth = 1;
      this.uvRotateNorth = 1;
    }
    const rendered = this.renderStandardBlock(block, x, y, z);
    this.uvRotateSouth = 0;
    this.uvRotateEast = 0;
    this.uvRotateWest = 0;
    this.uvRotateNorth = 0;
    this.uvRotateTop = 0;
    this.uvRotateBottom = 0;
    return rendered;
  }

  /** Average of four packed brightnesses, zeros replaced by the centre value. */
  private getAoBrightness(a: number, b: number, c: number, centre: number): number {
    if (a === 0) a = centre;
    if (b === 0) b = centre;
    if (c === 0) c = centre;
    return ((a + b + c + centre) >> 2) & 0xff00ff;
  }

  private mixAoBrightness(a: number, b: number, c: number, d: number, wa: number, wb: number, wc: number, wd: number): number {
    const sky = Math.trunc(((a >> 16) & 255) * wa + ((b >> 16) & 255) * wb + ((c >> 16) & 255) * wc + ((d >> 16) & 255) * wd) & 255;
    const blk = Math.trunc((a & 255) * wa + (b & 255) * wb + (c & 255) * wc + (d & 255) * wd) & 255;
    return (sky << 16) | blk;
  }

  getBlockIcon(block: Block, access: IBlockAccess, x: number, y: number, z: number, side: number): Icon {
    return this.getIconSafe(block.getBlockTexture(access, x, y, z, side));
  }
  getBlockIconFromSideAndMetadata(block: Block, side: number, meta: number): Icon {
    return this.getIconSafe(block.getIcon(side, meta));
  }
  getBlockIconFromSide(block: Block, side: number): Icon {
    return this.getIconSafe(block.getBlockTextureFromSide(side));
  }
  /** getBlockIcon(Block): the top texture. */
  getBlockIconTop(block: Block): Icon {
    return this.getIconSafe(block.getBlockTextureFromSide(1));
  }
  getIconSafe(icon: Icon | null): Icon {
    return icon ?? RenderBlocks.missingIcon!;
  }

  static renderItemIn3d(type: number): boolean {
    return renderItemIn3dImpl(type);
  }

  /** Draws a block for item rendering (GUI slots, held items, dropped items); main thread only. */
  renderBlockAsItem(block: Block, meta: number, brightness: number): void {
    renderBlockAsItemImpl(this, RenderBlocks.itemGL!, block, meta, brightness);
  }

  /** The moving piston's base, always drawn extended with every face (TileEntityRendererPiston). */
  renderPistonBaseAllFaces(block: Block, x: number, y: number, z: number): void {
    renderPistonBaseAllFaces(this, block, x, y, z);
  }

  /** The moving piston's head; `fullRod` false draws the half-length rod. */
  renderPistonExtensionAllFaces(block: Block, x: number, y: number, z: number, fullRod: boolean): void {
    renderPistonExtensionAllFaces(this, block, x, y, z, fullRod);
  }

  /** A falling anvil keeps the metadata it fell with. */
  renderBlockAnvilMetadata(block: Block, x: number, y: number, z: number, meta: number): boolean {
    return renderBlockAnvilMetadata(this, block, x, y, z, meta);
  }

  // Standard blocks: flat shading, smooth lighting, and the per-face quad builder.

  /** The render bound by index (MIN_X..MAX_Z). */
  private getRenderBound(i: number): number {
    switch (i) {
      case MIN_X:
        return this.renderMinX;
      case MIN_Y:
        return this.renderMinY;
      case MIN_Z:
        return this.renderMinZ;
      case MAX_X:
        return this.renderMaxX;
      case MAX_Y:
        return this.renderMaxY;
      default:
        return this.renderMaxZ;
    }
  }

  /** Whether the face lies on the block boundary, so its light comes from the neighbour. */
  private faceTouchesNeighbour(f: FaceDef): boolean {
    const b = this.getRenderBound(f.edgeBound);
    return f.edgeBound >= MAX_X ? b >= 1.0 : b <= 0.0;
  }

  private shouldRenderFace(block: Block, x: number, y: number, z: number, f: FaceDef): boolean {
    return this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x + f.nx, y + f.ny, z + f.nz, f.side);
  }

  /** Fancy grass draws the tinted side overlay over "grass_side". */
  private hasGrassSideOverlay(icon: Icon): boolean {
    return RenderBlocks.fancyGrass && icon.getIconName() === 'grass_side' && !this.hasOverrideBlockTexture();
  }

  /** Flat shading: one colour and brightness per face; grass keeps its sides untinted. */
  renderStandardBlockWithColorMultiplier(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    this.enableAO = false;
    const t = Tessellator.instance;
    const access = this.blockAccess!;
    const tintSides = block !== Block.blocksList[BlockIds.grass];
    const own = block.getMixedBrightnessForBlock(access, x, y, z);
    let rendered = false;
    for (const f of FACES) {
      if (!this.shouldRenderFace(block, x, y, z, f)) continue;
      t.setBrightness(this.faceTouchesNeighbour(f) ? block.getMixedBrightnessForBlock(access, x + f.nx, y + f.ny, z + f.nz) : own);
      const tinted = f.side === 1 || tintSides;
      const cr = tinted ? f.shade * r : f.shade;
      const cg = tinted ? f.shade * g : f.shade;
      const cb = tinted ? f.shade * b : f.shade;
      t.setColorOpaque_F(cr, cg, cb);
      const icon = this.getBlockIcon(block, access, x, y, z, f.side);
      this.renderFace(f.side, x, y, z, icon);
      if (f.side >= 2 && this.hasGrassSideOverlay(icon)) {
        t.setColorOpaque_F(cr * r, cg * g, cb * b);
        this.renderFace(f.side, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }
      rendered = true;
    }
    return rendered;
  }

  /** Smooth lighting for a full-size block: each vertex takes its nearest corner's light. */
  renderStandardBlockWithAmbientOcclusion(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    return this.renderSmoothLit(block, x, y, z, r, g, b, false);
  }

  /**
   * Smooth lighting for a block with partial bounds (slabs, stairs, cakes): the side faces
   * blend the four corner values bilinearly at each vertex position.
   */
  renderStandardBlockWithAmbientOcclusionPartial(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    return this.renderSmoothLit(block, x, y, z, r, g, b, true);
  }

  private renderSmoothLit(block: Block, x: number, y: number, z: number, r: number, g: number, b: number, partial: boolean): boolean {
    this.enableAO = true;
    const access = this.blockAccess!;
    const own = block.getMixedBrightnessForBlock(access, x, y, z);
    Tessellator.instance.setBrightness(0xf000f);
    const tintSides = this.getBlockIconTop(block).getIconName() !== 'grass_top' && !this.hasOverrideBlockTexture();
    const color = this.vertexColor;
    let rendered = false;
    for (const f of FACES) {
      if (!this.shouldRenderFace(block, x, y, z, f)) continue;
      this.computeFaceLight(block, x, y, z, f, own, partial && f.side >= 2);
      const tinted = f.side === 1 || tintSides;
      const base = [tinted ? r * f.shade : f.shade, tinted ? g * f.shade : f.shade, tinted ? b * f.shade : f.shade];
      for (let i = 0; i < 12; i++) color[i] = base[i % 3] * color[i];
      const icon = this.getBlockIcon(block, access, x, y, z, f.side);
      this.renderFace(f.side, x, y, z, icon);
      if (f.side >= 2 && this.hasGrassSideOverlay(icon)) {
        for (let i = 0; i < 12; i += 3) {
          color[i] *= r;
          color[i + 1] *= g;
          color[i + 2] *= b;
        }
        this.renderFace(f.side, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }
      rendered = true;
    }
    this.enableAO = false;
    return rendered;
  }

  /**
   * Fills vertexBrightness and, in vertexColor, each vertex's light factor (the caller scales
   * it by the face colour). Samples come from the layer the face looks into: four edge
   * neighbours, four corners (a corner only counts when light can get round one of its
   * edges), and the block straight in front.
   */
  private computeFaceLight(block: Block, x: number, y: number, z: number, f: FaceDef, own: number, blend: boolean): void {
    const access = this.blockAccess!;
    const [ax, ay, az] = AXES[f.axisA];
    const [bx, by, bz] = AXES[f.axisB];
    const touching = this.faceTouchesNeighbour(f);
    const px = touching ? x + f.nx : x;
    const py = touching ? y + f.ny : y;
    const pz = touching ? z + f.nz : z;
    const edgeLight = this.edgeLight;
    const edgeBright = this.edgeBrightness;
    for (let i = 0; i < 2; i++) {
      const s = i * 2 - 1;
      edgeLight[i] = block.getAmbientOcclusionLightValue(access, px + s * ax, py + s * ay, pz + s * az);
      edgeBright[i] = block.getMixedBrightnessForBlock(access, px + s * ax, py + s * ay, pz + s * az);
      edgeLight[2 + i] = block.getAmbientOcclusionLightValue(access, px + s * bx, py + s * by, pz + s * bz);
      edgeBright[2 + i] = block.getMixedBrightnessForBlock(access, px + s * bx, py + s * by, pz + s * bz);
    }
    const cx = x + f.nx;
    const cy = y + f.ny;
    const cz = z + f.nz;
    const centreBright = touching || !access.isBlockOpaqueCube(cx, cy, cz) ? block.getMixedBrightnessForBlock(access, cx, cy, cz) : own;
    const centreLight = block.getAmbientOcclusionLightValue(access, cx, cy, cz);
    const light = this.cornerLight;
    const bright = this.cornerBrightness;
    const samples = [0, 0, 0, centreLight];
    for (let corner = 0; corner < 4; corner++) {
      const ia = corner >> 1;
      const ib = corner & 1;
      const sa = ia * 2 - 1;
      const sb = ib * 2 - 1;
      const open =
        Block.canBlockGrass[access.getBlockId(px + f.nx + sa * ax, py + f.ny + sa * ay, pz + f.nz + sa * az)] ||
        Block.canBlockGrass[access.getBlockId(px + f.nx + sb * bx, py + f.ny + sb * by, pz + f.nz + sb * bz)];
      let kLight = edgeLight[ia];
      let kBright = edgeBright[ia];
      if (open) {
        const kx = px + sa * ax + sb * bx;
        const ky = py + sa * ay + sb * by;
        const kz = pz + sa * az + sb * bz;
        kLight = block.getAmbientOcclusionLightValue(access, kx, ky, kz);
        kBright = block.getMixedBrightnessForBlock(access, kx, ky, kz);
      }
      samples[0] = kLight;
      samples[1] = edgeLight[ia];
      samples[2] = edgeLight[2 + ib];
      const o = LIGHT_ORDER[f.side][corner];
      light[corner] = (samples[o[0]] + samples[o[1]] + samples[o[2]] + samples[o[3]]) / 4.0;
      bright[corner] = this.getAoBrightness(kBright, edgeBright[ia], edgeBright[2 + ib], centreBright);
    }
    const slots = SLOT_CORNERS[f.side];
    for (let i = 0; i < 4; i++) {
      let ao: number;
      if (!blend) {
        ao = light[slots[i]];
        this.vertexBrightness[i] = bright[slots[i]];
      } else {
        const v = f.verts[i];
        const ta = this.getRenderBound(v[f.axisA]);
        const tb = this.getRenderBound(v[f.axisB]);
        const weight = (corner: number, along: number): number => {
          const wa = corner >> 1 ? ta : 1.0 - ta;
          const wb = corner & 1 ? along : 1.0 - along;
          return wb * wa;
        };
        ao = 0;
        for (let k = 0; k < 4; k++) {
          const corner = slots[f.blendOrder[k]];
          const quirk = f.blendQuirk && f.blendQuirk.slot === i && f.blendQuirk.term === k;
          const along = quirk ? this.getRenderBound(f.blendQuirk!.boundB) : tb;
          const wb = corner & 1 ? along : 1.0 - along;
          const wa = corner >> 1 ? ta : 1.0 - ta;
          const term = light[corner] * wb * wa;
          ao = k === 0 ? term : ao + term;
        }
        this.vertexBrightness[i] = this.mixAoBrightness(
          bright[slots[0]],
          bright[slots[1]],
          bright[slots[2]],
          bright[slots[3]],
          weight(slots[0], tb),
          weight(slots[1], tb),
          weight(slots[2], tb),
          weight(slots[3], tb),
        );
      }
      this.vertexColor[i * 3] = this.vertexColor[i * 3 + 1] = this.vertexColor[i * 3 + 2] = ao;
    }
  }

  /** Icon coordinate at a UV-layout bound (bound * 16, or 16 - bound * 16 with INV). */
  private iconCoord(icon: Icon, spec: number, isU: boolean): number {
    const b = this.getRenderBound(spec & 7);
    const at = spec & INV ? 16.0 - b * 16.0 : b * 16.0;
    return isU ? icon.getInterpolatedU(at) : icon.getInterpolatedV(at);
  }

  /**
   * Emits one face of the current render bounds as a quad. The icon covers the face's share
   * of the block (bounds outside 0..1 use the whole icon), optionally rotated by the face's
   * uvRotate value or mirrored by flipTexture. With smooth lighting each vertex gets its own
   * colour and brightness.
   */
  renderFace(side: number, x: number, y: number, z: number, icon: Icon): void {
    const f = FACES[side];
    const t = Tessellator.instance;
    if (this.overrideBlockTexture) icon = this.overrideBlockTexture;
    const rotation = this[f.rotationField];
    let ua: number;
    let ub: number;
    let va: number;
    let vb: number;
    let transposed: boolean;
    if (rotation >= 1 && rotation <= 3) {
      const l = f.uvRotated[rotation - 1];
      ua = this.iconCoord(icon, l.ua, true);
      ub = this.iconCoord(icon, l.ub, true);
      va = this.iconCoord(icon, l.va, false);
      vb = this.iconCoord(icon, l.vb, false);
      transposed = l.transposed;
    } else {
      ua = this.iconCoord(icon, f.uv.ua, true);
      ub = this.iconCoord(icon, f.uv.ub, true);
      va = this.iconCoord(icon, f.uv.va, false);
      vb = this.iconCoord(icon, f.uv.vb, false);
      transposed = false;
      if (f.flippable && this.flipTexture) [ua, ub] = [ub, ua];
      if (this.getRenderBound(f.clampAxisU) < 0.0 || this.getRenderBound(f.clampAxisU + 3) > 1.0) {
        ua = icon.getMinU();
        ub = icon.getMaxU();
      }
      if (this.getRenderBound(f.clampAxisV) < 0.0 || this.getRenderBound(f.clampAxisV + 3) > 1.0) {
        va = icon.getMinV();
        vb = icon.getMaxV();
      }
    }
    for (let i = 0; i < 4; i++) {
      const [bx, by, bz, pair] = f.verts[i];
      let u: number;
      let v: number;
      if (pair === 0) [u, v] = [ua, va];
      else if (pair === 1) [u, v] = [ub, vb];
      else if ((pair === 2) !== transposed) [u, v] = [ub, va];
      else [u, v] = [ua, vb];
      if (this.enableAO) {
        t.setColorOpaque_F(this.vertexColor[i * 3], this.vertexColor[i * 3 + 1], this.vertexColor[i * 3 + 2]);
        t.setBrightness(this.vertexBrightness[i]);
      }
      t.addVertexWithUV(x + this.getRenderBound(bx), y + this.getRenderBound(by), z + this.getRenderBound(bz), u, v);
    }
  }

  renderFaceYNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(0, x, y, z, icon);
  }

  renderFaceYPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(1, x, y, z, icon);
  }

  renderFaceZNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(2, x, y, z, icon);
  }

  renderFaceZPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(3, x, y, z, icon);
  }

  renderFaceXNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(4, x, y, z, icon);
  }

  renderFaceXPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    this.renderFace(5, x, y, z, icon);
  }

  // ---------------------------------------------------------------------------------
  // Other render types.

  /** Type 13: flat-shaded cube whose sides sit 1/16 inside the block. */
  renderBlockCactus(block: Block, x: number, y: number, z: number): boolean {
    let [r, g, b] = rgb(block.colorMultiplier(this.blockAccess!, x, y, z));
    if (RenderBlocks.anaglyphEnable) [r, g, b] = anaglyph(r, g, b);
    return this.renderBlockCactusImpl(block, x, y, z, r, g, b);
  }

  renderBlockCactusImpl(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    const t = Tessellator.instance;
    const access = this.blockAccess!;
    const own = block.getMixedBrightnessForBlock(access, x, y, z);
    const inset = (n: number): number => (n === 0 ? 0.0 : -n * CACTUS_INSET);
    let rendered = false;
    for (const f of FACES) {
      if (!this.shouldRenderFace(block, x, y, z, f)) continue;
      t.setBrightness(this.faceTouchesNeighbour(f) ? block.getMixedBrightnessForBlock(access, x + f.nx, y + f.ny, z + f.nz) : own);
      t.setColorOpaque_F(f.shade * r, f.shade * g, f.shade * b);
      const sideFace = f.side >= 2;
      if (sideFace) t.addTranslation(inset(f.nx), 0.0, inset(f.nz));
      this.renderFace(f.side, x, y, z, this.getBlockIcon(block, access, x, y, z, f.side));
      if (sideFace) t.addTranslation(inset(-f.nx), 0.0, inset(-f.nz));
      rendered = true;
    }
    return rendered;
  }

  /** Type 2: a torch standing up (metadata 5) or leaning off the wall it hangs on (1-4). */
  renderBlockTorch(block: Block, x: number, y: number, z: number): boolean {
    const meta = this.blockAccess!.getBlockMetadata(x, y, z);
    const t = Tessellator.instance;
    t.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z));
    t.setColorOpaque_F(1.0, 1.0, 1.0);
    const lean = 0.4;
    const offset = 0.5 - lean;
    const raise = 0.2;
    if (meta === 1) this.renderTorchAtAngle(block, x - offset, y + raise, z, -lean, 0.0, 0);
    else if (meta === 2) this.renderTorchAtAngle(block, x + offset, y + raise, z, lean, 0.0, 0);
    else if (meta === 3) this.renderTorchAtAngle(block, x, y + raise, z - offset, 0.0, -lean, 0);
    else if (meta === 4) this.renderTorchAtAngle(block, x, y + raise, z + offset, 0.0, lean, 0);
    else this.renderTorchAtAngle(block, x, y, z, 0.0, 0.0, 0);
    return true;
  }

  /** Type 1: two crossed planes (flowers, saplings, tall grass with its jitter). */
  renderCrossedSquares(block: Block, x: number, y: number, z: number): boolean {
    const t = Tessellator.instance;
    t.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z));
    let [r, g, b] = rgb(block.colorMultiplier(this.blockAccess!, x, y, z));
    if (RenderBlocks.anaglyphEnable) [r, g, b] = anaglyph(r, g, b);
    const brightness = 1.0;
    t.setColorOpaque_F(brightness * r, brightness * g, brightness * b);
    let px = x;
    let py = y;
    let pz = z;
    if (block === Block.blocksList[BlockIds.tallGrass]) {
      // The original hashed into a long; the offsets only use bits 16-27 of its low half.
      let h = Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y;
      h = (Math.imul(Math.imul(h, h), 42317861) + Math.imul(h, 11)) | 0;
      px += (((h >> 16) & 15) / 15.0 - 0.5) * 0.5;
      py += (((h >> 20) & 15) / 15.0 - 1.0) * 0.2;
      pz += (((h >> 24) & 15) / 15.0 - 0.5) * 0.5;
    }
    this.drawCrossedSquares(block, this.blockAccess!.getBlockMetadata(x, y, z), px, py, pz, 1.0);
    return true;
  }

  /**
   * A torch: four sides plus the small top cap, slanted by (dx, dz) at the bottom. The cap
   * reads texels 7-9 x 6-8 of the icon, the bottom 7-9 x 13-15.
   */
  renderTorchAtAngle(block: Block, x: number, y: number, z: number, dx: number, dz: number, meta: number): void {
    const t = Tessellator.instance;
    const icon = this.overrideBlockTexture ?? this.getBlockIconFromSideAndMetadata(block, 0, meta);
    const u0 = icon.getMinU();
    const v0 = icon.getMinV();
    const u1 = icon.getMaxU();
    const v1 = icon.getMaxV();
    const capU0 = icon.getInterpolatedU(7.0);
    const capV0 = icon.getInterpolatedV(6.0);
    const capU1 = icon.getInterpolatedU(9.0);
    const capV1 = icon.getInterpolatedV(8.0);
    const baseU0 = icon.getInterpolatedU(7.0);
    const baseV0 = icon.getInterpolatedV(13.0);
    const baseU1 = icon.getInterpolatedU(9.0);
    const baseV1 = icon.getInterpolatedV(15.0);
    x += 0.5;
    z += 0.5;
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const z0 = z - 0.5;
    const z1 = z + 0.5;
    const half = 0.0625;
    const capHeight = 0.625;
    const capX = x + dx * (1.0 - capHeight);
    const capZ = z + dz * (1.0 - capHeight);
    const capY = y + capHeight;
    t.addVertexWithUV(capX - half, capY, capZ - half, capU0, capV0);
    t.addVertexWithUV(capX - half, capY, capZ + half, capU0, capV1);
    t.addVertexWithUV(capX + half, capY, capZ + half, capU1, capV1);
    t.addVertexWithUV(capX + half, capY, capZ - half, capU1, capV0);
    t.addVertexWithUV(x + half + dx, y, z - half + dz, baseU1, baseV0);
    t.addVertexWithUV(x + half + dx, y, z + half + dz, baseU1, baseV1);
    t.addVertexWithUV(x - half + dx, y, z + half + dz, baseU0, baseV1);
    t.addVertexWithUV(x - half + dx, y, z - half + dz, baseU0, baseV0);
    const top = y + 1.0;
    t.addVertexWithUV(x - half, top, z0, u0, v0);
    t.addVertexWithUV(x - half + dx, y, z0 + dz, u0, v1);
    t.addVertexWithUV(x - half + dx, y, z1 + dz, u1, v1);
    t.addVertexWithUV(x - half, top, z1, u1, v0);
    t.addVertexWithUV(x + half, top, z1, u0, v0);
    t.addVertexWithUV(x + dx + half, y, z1 + dz, u0, v1);
    t.addVertexWithUV(x + dx + half, y, z0 + dz, u1, v1);
    t.addVertexWithUV(x + half, top, z0, u1, v0);
    t.addVertexWithUV(x0, top, z + half, u0, v0);
    t.addVertexWithUV(x0 + dx, y, z + half + dz, u0, v1);
    t.addVertexWithUV(x1 + dx, y, z + half + dz, u1, v1);
    t.addVertexWithUV(x1, top, z + half, u1, v0);
    t.addVertexWithUV(x1, top, z - half, u0, v0);
    t.addVertexWithUV(x1 + dx, y, z - half + dz, u0, v1);
    t.addVertexWithUV(x0 + dx, y, z - half + dz, u1, v1);
    t.addVertexWithUV(x0, top, z - half, u1, v0);
  }

  /** Two diagonal planes, each drawn from both sides, `height` tall. */
  drawCrossedSquares(block: Block, meta: number, x: number, y: number, z: number, height: number): void {
    const t = Tessellator.instance;
    const icon = this.overrideBlockTexture ?? this.getBlockIconFromSideAndMetadata(block, 0, meta);
    const u0 = icon.getMinU();
    const v0 = icon.getMinV();
    const u1 = icon.getMaxU();
    const v1 = icon.getMaxV();
    const half = 0.45 * height;
    const x0 = x + 0.5 - half;
    const x1 = x + 0.5 + half;
    const z0 = z + 0.5 - half;
    const z1 = z + 0.5 + half;
    const planes = [
      [x0, z0, x1, z1],
      [x1, z1, x0, z0],
      [x0, z1, x1, z0],
      [x1, z0, x0, z1],
    ];
    for (const [ax, az, bx, bz] of planes) {
      t.addVertexWithUV(ax, y + height, az, u0, v0);
      t.addVertexWithUV(ax, y + 0.0, az, u0, v1);
      t.addVertexWithUV(bx, y + 0.0, bz, u1, v1);
      t.addVertexWithUV(bx, y + height, bz, u1, v0);
    }
  }

  /**
   * Type 4: water and lava. The top follows the four corner heights and scrolls its texture
   * along the flow direction; the sides run from each edge's corner heights down to the block
   * bottom; everything is pulled 0.001 inwards against z-fighting.
   */
  renderBlockFluids(block: Block, x: number, y: number, z: number): boolean {
    const t = Tessellator.instance;
    const access = this.blockAccess!;
    const [r, g, b] = rgb(block.colorMultiplier(access, x, y, z));
    const renderTop = block.shouldSideBeRendered(access, x, y + 1, z, 1);
    const renderBottom = block.shouldSideBeRendered(access, x, y - 1, z, 0);
    const renderSide = [2, 3, 4, 5].map((side) => {
      const f = FACES[side];
      return block.shouldSideBeRendered(access, x + f.nx, y, z + f.nz, side);
    });
    if (!renderTop && !renderBottom && !renderSide.some((s) => s)) return false;
    let rendered = false;
    const material = block.blockMaterial;
    const meta = access.getBlockMetadata(x, y, z);
    // Corner heights: (x, z), (x, z + 1), (x + 1, z + 1), (x + 1, z).
    const h = [
      this.getFluidHeight(x, y, z, material),
      this.getFluidHeight(x, y, z + 1, material),
      this.getFluidHeight(x + 1, y, z + 1, material),
      this.getFluidHeight(x + 1, y, z, material),
    ];
    // 0.001F widened to double, as in the original.
    const gap = Math.fround(0.001);
    if (this.renderAllFaces || renderTop) {
      rendered = true;
      const flow = Math.fround(BlockFluid.getFlowDirection(access, x, y, z, material));
      const icon = this.getBlockIconFromSideAndMetadata(block, flow > -999.0 ? 2 : 1, meta);
      for (let i = 0; i < 4; i++) h[i] -= gap;
      const us: number[] = [];
      const vs: number[] = [];
      if (flow < -999.0) {
        const still = [0.0, 0.0, 16.0, 16.0];
        for (let i = 0; i < 4; i++) {
          us.push(icon.getInterpolatedU(still[i]));
          vs.push(icon.getInterpolatedV(still[(i + 1) & 3]));
        }
      } else {
        // The texture turns so that it scrolls with the flow: corner i samples 8 + 16 * w[i].
        const fr = Math.fround;
        const s = fr(MathHelper.sin(flow) * 0.25);
        const c = fr(MathHelper.cos(flow) * 0.25);
        const w = [fr(-c - s), fr(-c + s), fr(c + s), fr(c - s)].map((v) => fr(8.0 + fr(v * 16.0)));
        for (let i = 0; i < 4; i++) {
          us.push(icon.getInterpolatedU(w[i]));
          vs.push(icon.getInterpolatedV(w[(i + 1) & 3]));
        }
      }
      t.setBrightness(block.getMixedBrightnessForBlock(access, x, y, z));
      t.setColorOpaque_F(r, g, b);
      const cornerX = [0, 0, 1, 1];
      const cornerZ = [0, 1, 1, 0];
      for (let i = 0; i < 4; i++) t.addVertexWithUV(x + cornerX[i], y + h[i], z + cornerZ[i], us[i], vs[i]);
    }
    if (this.renderAllFaces || renderBottom) {
      t.setBrightness(block.getMixedBrightnessForBlock(access, x, y - 1, z));
      t.setColorOpaque_F(0.5, 0.5, 0.5);
      this.renderFaceYNeg(block, x, y + gap, z, this.getBlockIconFromSide(block, 0));
      rendered = true;
    }
    // Per side: the two corner heights left to right (seen from outside) and the edge's ends.
    const sides: readonly (readonly [number, number, number, number, number, number])[] = [
      [h[0], h[3], x, z + gap, x + 1, z + gap],
      [h[2], h[1], x + 1, z + 1 - gap, x, z + 1 - gap],
      [h[1], h[0], x + gap, z + 1, x + gap, z],
      [h[3], h[2], x + 1 - gap, z, x + 1 - gap, z + 1],
    ];
    for (let i = 0; i < 4; i++) {
      const f = FACES[i + 2];
      const icon = this.getBlockIconFromSideAndMetadata(block, f.side, meta);
      if (!this.renderAllFaces && !renderSide[i]) continue;
      rendered = true;
      const [h1, h2, x1, z1, x2, z2] = sides[i];
      const u1 = icon.getInterpolatedU(0.0);
      const u2 = icon.getInterpolatedU(8.0);
      const v1 = icon.getInterpolatedV((1.0 - h1) * 16.0 * 0.5);
      const v2 = icon.getInterpolatedV((1.0 - h2) * 16.0 * 0.5);
      const vBottom = icon.getInterpolatedV(8.0);
      t.setBrightness(block.getMixedBrightnessForBlock(access, x + f.nx, y, z + f.nz));
      const shade = 1.0 * f.shade;
      t.setColorOpaque_F(shade * r, shade * g, shade * b);
      t.addVertexWithUV(x1, y + h1, z1, u1, v1);
      t.addVertexWithUV(x2, y + h2, z2, u2, v2);
      t.addVertexWithUV(x2, y, z2, u2, vBottom);
      t.addVertexWithUV(x1, y, z1, u1, vBottom);
    }
    this.renderMinY = 0.0;
    this.renderMaxY = 1.0;
    return rendered;
  }

  /**
   * Fluid surface height at the corner shared by the four columns west/north of (x, z):
   * 1 when fluid is above any of them, else 1 minus the weighted average fill (sources and
   * falling fluid count ten times).
   */
  getFluidHeight(x: number, y: number, z: number, material: Material): number {
    let weight = 0;
    let total = 0.0;
    for (let i = 0; i < 4; i++) {
      const cx = x - (i & 1);
      const cz = z - ((i >> 1) & 1);
      if (this.blockAccess!.getBlockMaterial(cx, y + 1, cz) === material) return 1.0;
      const m = this.blockAccess!.getBlockMaterial(cx, y, cz);
      if (m === material) {
        const level = this.blockAccess!.getBlockMetadata(cx, y, cz);
        if (level >= 8 || level === 0) {
          total = Math.fround(total + Math.fround(BlockFluid.getFluidHeightPercent(level) * 10.0));
          weight += 10;
        }
        total = Math.fround(total + BlockFluid.getFluidHeightPercent(level));
        weight++;
      } else if (!m.isSolid()) {
        total = Math.fround(total + 1);
        weight++;
      }
    }
    return Math.fround(1.0 - Math.fround(total / weight));
  }
}
