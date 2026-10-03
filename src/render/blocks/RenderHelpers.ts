import { Block } from '../../block/Block';
import { MathHelper } from '../../core/MathHelper';
import { Tessellator } from '../gl/Tessellator';
import type { RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';

/** A render-type function: draws the block at (x, y, z) and says whether anything was emitted. */
export type RenderTypeFn = (rb: RenderBlocks, block: Block, x: number, y: number, z: number) => boolean;

export const fround = Math.fround;

/** EntityRenderer.anaglyphEnable colour mix (red/cyan glasses). */
export function anaglyph(r: number, g: number, b: number): [number, number, number] {
  return [(r * 30.0 + g * 59.0 + b * 11.0) / 100.0, (r * 30.0 + g * 70.0) / 100.0, (r * 30.0 + b * 70.0) / 100.0];
}

/** Unpacks 0xRRGGBB to 0..1 channels. */
export function unpackRgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0];
}

/** The block's colour multiplier at a position, through the anaglyph mix when it is on. */
export function tintAt(rb: RenderBlocks, block: Block, x: number, y: number, z: number, withAnaglyph = true): [number, number, number] {
  const c = unpackRgb(block.colorMultiplier(rb.blockAccess!, x, y, z));
  return withAnaglyph && rb.isAnaglyph() ? anaglyph(c[0], c[1], c[2]) : c;
}

/** Sets the tessellator colour to the block's tint (and its brightness to the block's own light). */
export function useBlockLightAndTint(rb: RenderBlocks, block: Block, x: number, y: number, z: number, withAnaglyph = true): void {
  const t = Tessellator.instance;
  t.setBrightness(block.getMixedBrightnessForBlock(rb.blockAccess!, x, y, z));
  const [r, g, b] = tintAt(rb, block, x, y, z, withAnaglyph);
  t.setColorOpaque_F(r, g, b);
}

/** Top texture of another block (RenderBlocks.getBlockIcon(Block)). */
export function iconOfBlock(rb: RenderBlocks, id: number): Icon {
  return rb.getBlockIconTop(Block.blocksList[id]!);
}

/** The override texture when one is set, else `icon`. */
export function overridden(rb: RenderBlocks, icon: Icon): Icon {
  return rb.getOverrideBlockTexture() ?? icon;
}

export type Vertex = readonly [number, number, number, number, number];

/** Emits a quad (x, y, z, u, v per vertex). */
export function quad(v: readonly Vertex[]): void {
  const t = Tessellator.instance;
  for (const p of v) t.addVertexWithUV(p[0], p[1], p[2], p[3], p[4]);
}

/** Emits a quad, then the same vertices in reverse order (visible from both sides, texture fixed in space). */
export function quadBothSides(v: readonly Vertex[]): void {
  quad(v);
  const t = Tessellator.instance;
  for (let i = 3; i >= 0; i--) t.addVertexWithUV(v[i][0], v[i][1], v[i][2], v[i][3], v[i][4]);
}

/**
 * A vertical rectangle from (ax, az) to (bx, bz), y0..y1, seen from both sides with the icon
 * the right way round on each (the back runs from b to a with the same UVs).
 */
export function doublePlane(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u0: number, v0: number, u1: number, v1: number): void {
  const t = Tessellator.instance;
  t.addVertexWithUV(ax, y1, az, u0, v0);
  t.addVertexWithUV(ax, y0, az, u0, v1);
  t.addVertexWithUV(bx, y0, bz, u1, v1);
  t.addVertexWithUV(bx, y1, bz, u1, v0);
  t.addVertexWithUV(bx, y1, bz, u0, v0);
  t.addVertexWithUV(bx, y0, bz, u0, v1);
  t.addVertexWithUV(ax, y0, az, u1, v1);
  t.addVertexWithUV(ax, y1, az, u1, v0);
}

/** Small mutable vector rotated with the original's table sine (Vec3.rotateAround*). */
export class RVec {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}

  rotateX(a: number): this {
    const c = MathHelper.cos(a);
    const s = MathHelper.sin(a);
    const y = this.y * c + this.z * s;
    const z = this.z * c - this.y * s;
    this.y = y;
    this.z = z;
    return this;
  }

  rotateY(a: number): this {
    const c = MathHelper.cos(a);
    const s = MathHelper.sin(a);
    const x = this.x * c + this.z * s;
    const z = this.z * c - this.x * s;
    this.x = x;
    this.z = z;
    return this;
  }

  rotateZ(a: number): this {
    const c = MathHelper.cos(a);
    const s = MathHelper.sin(a);
    const x = this.x * c + this.y * s;
    const y = this.y * c - this.x * s;
    this.x = x;
    this.y = y;
    return this;
  }
}

/** The 8 corners of a box centred on x/z: bottom ring (0-3) at y = 0, top ring (4-7) at y = h. */
export function boxCorners(hx: number, hz: number, h: number): RVec[] {
  return [
    new RVec(-hx, 0, -hz),
    new RVec(hx, 0, -hz),
    new RVec(hx, 0, hz),
    new RVec(-hx, 0, hz),
    new RVec(-hx, h, -hz),
    new RVec(hx, h, -hz),
    new RVec(hx, h, hz),
    new RVec(-hx, h, hz),
  ];
}

/** Corner order of the six faces of a boxCorners() box: bottom, top, then the four sides. */
export const BOX_FACES: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 2, 3],
  [7, 6, 5, 4],
  [1, 0, 4, 5],
  [2, 1, 5, 6],
  [3, 2, 6, 7],
  [0, 3, 7, 4],
];

/** Emits one face of a transformed box with (u0, v1) (u1, v1) (u1, v0) (u0, v0) on its corners. */
export function boxFace(c: readonly RVec[], face: number, u0: number, v0: number, u1: number, v1: number): void {
  const t = Tessellator.instance;
  const [a, b, d, e] = BOX_FACES[face];
  t.addVertexWithUV(c[a].x, c[a].y, c[a].z, u0, v1);
  t.addVertexWithUV(c[b].x, c[b].y, c[b].z, u1, v1);
  t.addVertexWithUV(c[d].x, c[d].y, c[d].z, u1, v0);
  t.addVertexWithUV(c[e].x, c[e].y, c[e].z, u0, v0);
}
