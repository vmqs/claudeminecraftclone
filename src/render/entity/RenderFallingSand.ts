import { Block } from '../../block/Block';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityFallingSand } from '../../entity/EntityFallingSand';
import type { BiomeGenBase } from '../../world/biome/BiomeGenBase';
import type { IBlockAccess } from '../../world/IBlockAccess';
import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderFallingSand: the block as a flat-shaded cube (faces 0.5 / 1 / 0.8 / 0.6) lit by the
 * world at its position, hidden while the world already shows the same block there. Special
 * shapes (anvils, dragon eggs) go through their render type in world space.
 */
export class RenderFallingSand extends Render {
  constructor() {
    super();
    this.shadowSize = f(0.5);
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    const sand = e as EntityFallingSand;
    const w = sand.getWorld();
    const block = Block.blocksList[sand.blockID];
    const bx = MathHelper.floor_double(sand.posX);
    const by = MathHelper.floor_double(sand.posY);
    const bz = MathHelper.floor_double(sand.posZ);
    if (!block || w.getBlockId(bx, by, bz) === sand.blockID) return;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    this.loadTexture('/terrain.png');
    GL.disable(GL.LIGHTING);
    const rb = this.renderBlocks;
    const type = block.getRenderType();
    if (type === 35 || type === 27) {
      // Anvil and dragon egg: their own shape, drawn at the block position shifted to the origin.
      // The falling block's own metadata (anvil facing and damage), not the air it passes.
      rb.blockAccess = new FallingBlockAccess(w, bx, by, bz, sand.blockID, sand.metadata);
      const t = Tessellator.instance;
      t.startDrawingQuads();
      t.setTranslation(f(f(-bx) - f(0.5)), f(f(-by) - f(0.5)), f(f(-bz) - f(0.5)));
      rb.renderBlockByRenderType(block, bx, by, bz);
      t.setTranslation(0, 0, 0);
      t.draw();
      rb.blockAccess = w;
    } else {
      rb.setRenderBoundsFromBlock(block);
      this.renderBlockSandFalling(w, block, bx, by, bz, sand.metadata);
    }
    GL.enable(GL.LIGHTING);
    GL.popMatrix();
  }

  /** RenderBlocks.renderBlockSandFalling: six faces around the origin with the classic face shades. */
  private renderBlockSandFalling(w: World, block: Block, x: number, y: number, z: number, meta: number): void {
    const rb = this.renderBlocks;
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.setBrightness(block.getMixedBrightnessForBlock(w, x, y, z));
    const o = -0.5;
    t.setColorOpaque_F(f(0.5), f(0.5), f(0.5));
    rb.renderFaceYNeg(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 0, meta));
    t.setColorOpaque_F(1, 1, 1);
    rb.renderFaceYPos(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 1, meta));
    t.setColorOpaque_F(f(0.8), f(0.8), f(0.8));
    rb.renderFaceZNeg(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 2, meta));
    t.setColorOpaque_F(f(0.8), f(0.8), f(0.8));
    rb.renderFaceZPos(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 3, meta));
    t.setColorOpaque_F(f(0.6), f(0.6), f(0.6));
    rb.renderFaceXNeg(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 4, meta));
    t.setColorOpaque_F(f(0.6), f(0.6), f(0.6));
    rb.renderFaceXPos(block, o, o, o, rb.getBlockIconFromSideAndMetadata(block, 5, meta));
    t.draw();
  }
}

/**
 * The world as seen by a falling block's renderer: its own cell holds the falling block and
 * metadata (RenderBlocks.renderBlockAnvilMetadata in 1.5.2 takes the metadata directly).
 */
class FallingBlockAccess implements IBlockAccess {
  constructor(
    private readonly w: IBlockAccess,
    private readonly x: number,
    private readonly y: number,
    private readonly z: number,
    private readonly id: number,
    private readonly meta: number,
  ) {}

  private at(x: number, y: number, z: number): boolean {
    return x === this.x && y === this.y && z === this.z;
  }
  getBlockId(x: number, y: number, z: number): number {
    return this.at(x, y, z) ? this.id : this.w.getBlockId(x, y, z);
  }
  getBlockMetadata(x: number, y: number, z: number): number {
    return this.at(x, y, z) ? this.meta : this.w.getBlockMetadata(x, y, z);
  }
  getLightBrightnessForSkyBlocks(x: number, y: number, z: number, min: number): number {
    return this.w.getLightBrightnessForSkyBlocks(x, y, z, min);
  }
  getBrightness(x: number, y: number, z: number, min: number): number {
    return this.w.getBrightness(x, y, z, min);
  }
  getLightBrightness(x: number, y: number, z: number): number {
    return this.w.getLightBrightness(x, y, z);
  }
  getBlockMaterial(x: number, y: number, z: number) {
    return this.w.getBlockMaterial(x, y, z);
  }
  isBlockOpaqueCube(x: number, y: number, z: number): boolean {
    return this.w.isBlockOpaqueCube(x, y, z);
  }
  isBlockNormalCube(x: number, y: number, z: number): boolean {
    return this.w.isBlockNormalCube(x, y, z);
  }
  isAirBlock(x: number, y: number, z: number): boolean {
    return this.at(x, y, z) ? false : this.w.isAirBlock(x, y, z);
  }
  getBiomeGenForCoords(x: number, z: number): BiomeGenBase {
    return this.w.getBiomeGenForCoords(x, z);
  }
  getHeight(): number {
    return this.w.getHeight();
  }
  extendedLevelsInChunkCache(): boolean {
    return this.w.extendedLevelsInChunkCache();
  }
  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean {
    return this.w.doesBlockHaveSolidTopSurface(x, y, z);
  }
  isBlockProvidingPowerTo(x: number, y: number, z: number, side: number): number {
    return this.w.isBlockProvidingPowerTo(x, y, z, side);
  }
}
