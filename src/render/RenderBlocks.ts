import { Block } from '../block/Block';
import { BlockFluid } from '../block/BlockFluid';
import { BlockGrass } from '../block/BlockGrass';
import { BlockIds } from '../block/BlockIds';
import type { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { IBlockAccess } from '../world/IBlockAccess';
import { Tessellator } from './gl/Tessellator';
import type { Icon } from './texture/Icon';

/** GL calls renderBlockAsItem needs; installed on the main thread (absent in workers). */
export interface ItemRenderGL {
  color(r: number, g: number, b: number, a: number): void;
  rotate(angle: number, x: number, y: number, z: number): void;
  translate(x: number, y: number, z: number): void;
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
  private aoLightValueScratchXYZNNN = 0;
  private aoLightValueScratchXYNN = 0;
  private aoLightValueScratchXYZNNP = 0;
  private aoLightValueScratchYZNN = 0;
  private aoLightValueScratchYZNP = 0;
  private aoLightValueScratchXYZPNN = 0;
  private aoLightValueScratchXYPN = 0;
  private aoLightValueScratchXYZPNP = 0;
  private aoLightValueScratchXYZNPN = 0;
  private aoLightValueScratchXYNP = 0;
  private aoLightValueScratchXYZNPP = 0;
  private aoLightValueScratchYZPN = 0;
  private aoLightValueScratchXYZPPN = 0;
  private aoLightValueScratchXYPP = 0;
  private aoLightValueScratchYZPP = 0;
  private aoLightValueScratchXYZPPP = 0;
  private aoLightValueScratchXZNN = 0;
  private aoLightValueScratchXZPN = 0;
  private aoLightValueScratchXZNP = 0;
  private aoLightValueScratchXZPP = 0;
  private aoBrightnessXYZNNN = 0;
  private aoBrightnessXYNN = 0;
  private aoBrightnessXYZNNP = 0;
  private aoBrightnessYZNN = 0;
  private aoBrightnessYZNP = 0;
  private aoBrightnessXYZPNN = 0;
  private aoBrightnessXYPN = 0;
  private aoBrightnessXYZPNP = 0;
  private aoBrightnessXYZNPN = 0;
  private aoBrightnessXYNP = 0;
  private aoBrightnessXYZNPP = 0;
  private aoBrightnessYZPN = 0;
  private aoBrightnessXYZPPN = 0;
  private aoBrightnessXYPP = 0;
  private aoBrightnessYZPP = 0;
  private aoBrightnessXYZPPP = 0;
  private aoBrightnessXZNN = 0;
  private aoBrightnessXZPN = 0;
  private aoBrightnessXZNP = 0;
  private aoBrightnessXZPP = 0;
  private colorRedTopLeft = 0;
  private colorRedBottomLeft = 0;
  private colorRedBottomRight = 0;
  private colorRedTopRight = 0;
  private colorGreenTopLeft = 0;
  private colorGreenBottomLeft = 0;
  private colorGreenBottomRight = 0;
  private colorGreenTopRight = 0;
  private colorBlueTopLeft = 0;
  private colorBlueBottomLeft = 0;
  private colorBlueBottomRight = 0;
  private colorBlueTopRight = 0;
  private brightnessTopLeft = 0;
  private brightnessBottomLeft = 0;
  private brightnessBottomRight = 0;
  private brightnessTopRight = 0;

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
        const custom = RenderBlocks.renderers.get(type);
        if (custom) return custom(this, block, x, y, z);
        // TODO: port the remaining render types; draw a cube meanwhile.
        return this.renderStandardBlock(block, x, y, z);
      }
    }
  }

  renderStandardBlock(block: Block, x: number, y: number, z: number): boolean {
    const c = block.colorMultiplier(this.blockAccess!, x, y, z);
    const r = ((c >> 16) & 255) / 255;
    const g = ((c >> 8) & 255) / 255;
    const b = (c & 255) / 255;
    if (RenderBlocks.aoLevel === 0 || Block.lightValue[block.blockID] !== 0) return this.renderStandardBlockWithColorMultiplier(block, x, y, z, r, g, b);
    return this.partialRenderBounds ? this.func_102027_b(block, x, y, z, r, g, b) : this.renderStandardBlockWithAmbientOcclusion(block, x, y, z, r, g, b);
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
    return [0, 31, 39, 13, 10, 11, 27, 22, 21, 16, 26, 32, 34, 35].includes(type);
  }

  /** Draws a block for item rendering (GUI slots, held items, dropped items). */
  renderBlockAsItem(block: Block, meta: number, brightness: number): void {
    const t = Tessellator.instance;
    const gl = RenderBlocks.itemGL!;
    const isGrass = block.blockID === BlockIds.grass;
    if (block.blockID === BlockIds.dispenser || block.blockID === BlockIds.dropper || block.blockID === BlockIds.furnaceIdle) meta = 3;
    if (this.useInventoryTint) {
      const c = isGrass ? 0xffffff : block.getRenderColor(meta);
      gl.color((((c >> 16) & 255) / 255) * brightness, (((c >> 8) & 255) / 255) * brightness, ((c & 255) / 255) * brightness, 1);
    }
    const type = block.getRenderType();
    this.setRenderBoundsFromBlock(block);
    if (type === 1) {
      t.startDrawingQuads();
      t.setNormal(0, -1, 0);
      this.drawCrossedSquares(block, meta, -0.5, -0.5, -0.5, 1);
      t.draw();
    } else if (type === 13) {
      block.setBlockBoundsForItemRender();
      gl.translate(-0.5, -0.5, -0.5);
      const inset = 0.0625;
      const face = (nx: number, ny: number, nz: number, tx: number, tz: number, fn: () => void) => {
        t.startDrawingQuads();
        t.setNormal(nx, ny, nz);
        t.addTranslation(tx, 0, tz);
        fn();
        t.addTranslation(-tx, 0, -tz);
        t.draw();
      };
      face(0, -1, 0, 0, 0, () => this.renderFaceYNeg(block, 0, 0, 0, this.getBlockIconFromSide(block, 0)));
      face(0, 1, 0, 0, 0, () => this.renderFaceYPos(block, 0, 0, 0, this.getBlockIconFromSide(block, 1)));
      face(0, 0, -1, 0, inset, () => this.renderFaceZNeg(block, 0, 0, 0, this.getBlockIconFromSide(block, 2)));
      face(0, 0, 1, 0, -inset, () => this.renderFaceZPos(block, 0, 0, 0, this.getBlockIconFromSide(block, 3)));
      face(-1, 0, 0, inset, 0, () => this.renderFaceXNeg(block, 0, 0, 0, this.getBlockIconFromSide(block, 4)));
      face(1, 0, 0, -inset, 0, () => this.renderFaceXPos(block, 0, 0, 0, this.getBlockIconFromSide(block, 5)));
      gl.translate(0.5, 0.5, 0.5);
    } else if (type === 2) {
      t.startDrawingQuads();
      t.setNormal(0, -1, 0);
      this.renderTorchAtAngle(block, -0.5, -0.5, -0.5, 0, 0, 0);
      t.draw();
    } else {
      // Types 0, 31, 39, 16, 26 and (until ported) every other type: a lit cube.
      if (type === 16) meta = 1;
      block.setBlockBoundsForItemRender();
      this.setRenderBoundsFromBlock(block);
      gl.rotate(90, 0, 1, 0);
      gl.translate(-0.5, -0.5, -0.5);
      t.startDrawingQuads();
      t.setNormal(0, -1, 0);
      this.renderFaceYNeg(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 0, meta));
      t.draw();
      if (isGrass && this.useInventoryTint) {
        const c = block.getRenderColor(meta);
        gl.color((((c >> 16) & 255) / 255) * brightness, (((c >> 8) & 255) / 255) * brightness, ((c & 255) / 255) * brightness, 1);
      }
      t.startDrawingQuads();
      t.setNormal(0, 1, 0);
      this.renderFaceYPos(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 1, meta));
      t.draw();
      if (isGrass && this.useInventoryTint) gl.color(brightness, brightness, brightness, 1);
      t.startDrawingQuads();
      t.setNormal(0, 0, -1);
      this.renderFaceZNeg(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 2, meta));
      t.draw();
      t.startDrawingQuads();
      t.setNormal(0, 0, 1);
      this.renderFaceZPos(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 3, meta));
      t.draw();
      t.startDrawingQuads();
      t.setNormal(-1, 0, 0);
      this.renderFaceXNeg(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 4, meta));
      t.draw();
      t.startDrawingQuads();
      t.setNormal(1, 0, 0);
      this.renderFaceXPos(block, 0, 0, 0, this.getBlockIconFromSideAndMetadata(block, 5, meta));
      t.draw();
      gl.translate(0.5, 0.5, 0.5);
    }
  }

  // ---------------------------------------------------------------------------------
  // Mechanical ports of the original methods (variable names kept as vNN).

  renderStandardBlockWithAmbientOcclusion(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    this.enableAO = true;
    let rendered = false;
    let aoTL = 0.0;
    let aoBL = 0.0;
    let aoBR = 0.0;
    let aoTR = 0.0;
    let tintSides = true;
    let mixedSelf = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z);
    let tess = Tessellator.instance;
    tess.setBrightness(983055);
    if (this.getBlockIconTop(block).getIconName() === "grass_top") {
      tintSides = false;
    } else if (this.hasOverrideBlockTexture()) {
      tintSides = false;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y - 1, z, 0)) {
      if (this.renderMinY <= 0.0) {
        y--;
      }

      this.aoBrightnessXYNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessYZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessYZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchXYNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchYZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchYZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      let v16 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y - 1, z)];
      let v17 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y - 1, z)];
      let v18 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z + 1)];
      let v19 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z - 1)];
      if (!v19 && !v17) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXYNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXYNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z - 1);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z - 1);
      }

      if (!v18 && !v17) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXYNN;
        this.aoBrightnessXYZNNP = this.aoBrightnessXYNN;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z + 1);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z + 1);
      }

      if (!v19 && !v16) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXYPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXYPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z - 1);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z - 1);
      }

      if (!v18 && !v16) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXYPN;
        this.aoBrightnessXYZPNP = this.aoBrightnessXYPN;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z + 1);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z + 1);
      }

      if (this.renderMinY <= 0.0) {
        y++;
      }

      let v20 = mixedSelf;
      if (this.renderMinY <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x, y - 1, z)) {
        v20 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      }

      let v21 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      aoTL = (this.aoLightValueScratchXYZNNP + this.aoLightValueScratchXYNN + this.aoLightValueScratchYZNP + v21) / 4.0;
      aoTR = (this.aoLightValueScratchYZNP + v21 + this.aoLightValueScratchXYZPNP + this.aoLightValueScratchXYPN) / 4.0;
      aoBR = (v21 + this.aoLightValueScratchYZNN + this.aoLightValueScratchXYPN + this.aoLightValueScratchXYZPNN) / 4.0;
      aoBL = (this.aoLightValueScratchXYNN + this.aoLightValueScratchXYZNNN + v21 + this.aoLightValueScratchYZNN) / 4.0;
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXYZNNP, this.aoBrightnessXYNN, this.aoBrightnessYZNP, v20);
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessYZNP, this.aoBrightnessXYZPNP, this.aoBrightnessXYPN, v20);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessYZNN, this.aoBrightnessXYPN, this.aoBrightnessXYZPNN, v20);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessXYNN, this.aoBrightnessXYZNNN, this.aoBrightnessYZNN, v20);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.5;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.5;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.5;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.5;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.5;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.5;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      this.renderFaceYNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 0));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y + 1, z, 1)) {
      if (this.renderMaxY >= 1.0) {
        y++;
      }

      this.aoBrightnessXYNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessXYPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessYZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessYZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchXYPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchYZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchYZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      let v47 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y + 1, z)];
      let v52 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y + 1, z)];
      let v57 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z + 1)];
      let v62 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z - 1)];
      if (!v62 && !v52) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXYNP;
        this.aoBrightnessXYZNPN = this.aoBrightnessXYNP;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z - 1);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z - 1);
      }

      if (!v62 && !v47) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXYPP;
        this.aoBrightnessXYZPPN = this.aoBrightnessXYPP;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z - 1);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z - 1);
      }

      if (!v57 && !v52) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXYNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXYNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z + 1);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z + 1);
      }

      if (!v57 && !v47) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXYPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXYPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z + 1);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z + 1);
      }

      if (this.renderMaxY >= 1.0) {
        y--;
      }

      let v67 = mixedSelf;
      if (this.renderMaxY >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x, y + 1, z)) {
        v67 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      }

      let v72 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      aoTR = (this.aoLightValueScratchXYZNPP + this.aoLightValueScratchXYNP + this.aoLightValueScratchYZPP + v72) / 4.0;
      aoTL = (this.aoLightValueScratchYZPP + v72 + this.aoLightValueScratchXYZPPP + this.aoLightValueScratchXYPP) / 4.0;
      aoBL = (v72 + this.aoLightValueScratchYZPN + this.aoLightValueScratchXYPP + this.aoLightValueScratchXYZPPN) / 4.0;
      aoBR = (this.aoLightValueScratchXYNP + this.aoLightValueScratchXYZNPN + v72 + this.aoLightValueScratchYZPN) / 4.0;
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessXYZNPP, this.aoBrightnessXYNP, this.aoBrightnessYZPP, v67);
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessYZPP, this.aoBrightnessXYZPPP, this.aoBrightnessXYPP, v67);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessYZPN, this.aoBrightnessXYPP, this.aoBrightnessXYZPPN, v67);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessXYNP, this.aoBrightnessXYZNPN, this.aoBrightnessYZPN, v67);
      this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r;
      this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g;
      this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b;
      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      this.renderFaceYPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 1));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z - 1, 2)) {
      if (this.renderMinZ <= 0.0) {
        z--;
      }

      this.aoLightValueScratchXZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchYZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchYZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoLightValueScratchXZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessXZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessYZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessYZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      let v48 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z - 1)];
      let v53 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z - 1)];
      let v58 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z - 1)];
      let v63 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z - 1)];
      if (!v53 && !v63) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y - 1, z);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y - 1, z);
      }

      if (!v53 && !v58) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNPN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y + 1, z);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y + 1, z);
      }

      if (!v48 && !v63) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y - 1, z);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y - 1, z);
      }

      if (!v48 && !v58) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPPN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y + 1, z);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y + 1, z);
      }

      if (this.renderMinZ <= 0.0) {
        z++;
      }

      let v68 = mixedSelf;
      if (this.renderMinZ <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x, y, z - 1)) {
        v68 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      }

      let v73 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      aoTL = (this.aoLightValueScratchXZNN + this.aoLightValueScratchXYZNPN + v73 + this.aoLightValueScratchYZPN) / 4.0;
      aoBL = (v73 + this.aoLightValueScratchYZPN + this.aoLightValueScratchXZPN + this.aoLightValueScratchXYZPPN) / 4.0;
      aoBR = (this.aoLightValueScratchYZNN + v73 + this.aoLightValueScratchXYZPNN + this.aoLightValueScratchXZPN) / 4.0;
      aoTR = (this.aoLightValueScratchXYZNNN + this.aoLightValueScratchXZNN + this.aoLightValueScratchYZNN + v73) / 4.0;
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXZNN, this.aoBrightnessXYZNPN, this.aoBrightnessYZPN, v68);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessYZPN, this.aoBrightnessXZPN, this.aoBrightnessXYZPPN, v68);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessYZNN, this.aoBrightnessXYZPNN, this.aoBrightnessXZPN, v68);
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessXYZNNN, this.aoBrightnessXZNN, this.aoBrightnessYZNN, v68);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.8;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.8;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v22 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 2);
      this.renderFaceZNeg(block, x, y, z, v22);
      if (RenderBlocks.fancyGrass && v22.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceZNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z + 1, 3)) {
      if (this.renderMaxZ >= 1.0) {
        z++;
      }

      this.aoLightValueScratchXZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchXZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchYZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchYZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessXZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessYZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessYZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v49 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z + 1)];
      let v54 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z + 1)];
      let v59 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z + 1)];
      let v64 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z + 1)];
      if (!v54 && !v64) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNNP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y - 1, z);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y - 1, z);
      }

      if (!v54 && !v59) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y + 1, z);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y + 1, z);
      }

      if (!v49 && !v64) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPNP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y - 1, z);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y - 1, z);
      }

      if (!v49 && !v59) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y + 1, z);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y + 1, z);
      }

      if (this.renderMaxZ >= 1.0) {
        z--;
      }

      let v69 = mixedSelf;
      if (this.renderMaxZ >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x, y, z + 1)) {
        v69 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      }

      let v74 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      aoTL = (this.aoLightValueScratchXZNP + this.aoLightValueScratchXYZNPP + v74 + this.aoLightValueScratchYZPP) / 4.0;
      aoTR = (v74 + this.aoLightValueScratchYZPP + this.aoLightValueScratchXZPP + this.aoLightValueScratchXYZPPP) / 4.0;
      aoBR = (this.aoLightValueScratchYZNP + v74 + this.aoLightValueScratchXYZPNP + this.aoLightValueScratchXZPP) / 4.0;
      aoBL = (this.aoLightValueScratchXYZNNP + this.aoLightValueScratchXZNP + this.aoLightValueScratchYZNP + v74) / 4.0;
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXZNP, this.aoBrightnessXYZNPP, this.aoBrightnessYZPP, v69);
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessYZPP, this.aoBrightnessXZPP, this.aoBrightnessXYZPPP, v69);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessYZNP, this.aoBrightnessXYZPNP, this.aoBrightnessXZPP, v69);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessXYZNNP, this.aoBrightnessXZNP, this.aoBrightnessYZNP, v69);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.8;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.8;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v77 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 3);
      this.renderFaceZPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 3));
      if (RenderBlocks.fancyGrass && v77.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceZPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x - 1, y, z, 4)) {
      if (this.renderMinX <= 0.0) {
        x--;
      }

      this.aoLightValueScratchXYNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchXZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchXZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXYNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessXZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessXZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v50 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y + 1, z)];
      let v55 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y - 1, z)];
      let v60 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z - 1)];
      let v65 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z + 1)];
      if (!v60 && !v55) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z - 1);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z - 1);
      }

      if (!v65 && !v55) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNNP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z + 1);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z + 1);
      }

      if (!v60 && !v50) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNPN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z - 1);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z - 1);
      }

      if (!v65 && !v50) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z + 1);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z + 1);
      }

      if (this.renderMinX <= 0.0) {
        x++;
      }

      let v70 = mixedSelf;
      if (this.renderMinX <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x - 1, y, z)) {
        v70 = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      }

      let v75 = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      aoTR = (this.aoLightValueScratchXYNN + this.aoLightValueScratchXYZNNP + v75 + this.aoLightValueScratchXZNP) / 4.0;
      aoTL = (v75 + this.aoLightValueScratchXZNP + this.aoLightValueScratchXYNP + this.aoLightValueScratchXYZNPP) / 4.0;
      aoBL = (this.aoLightValueScratchXZNN + v75 + this.aoLightValueScratchXYZNPN + this.aoLightValueScratchXYNP) / 4.0;
      aoBR = (this.aoLightValueScratchXYZNNN + this.aoLightValueScratchXYNN + this.aoLightValueScratchXZNN + v75) / 4.0;
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessXYNN, this.aoBrightnessXYZNNP, this.aoBrightnessXZNP, v70);
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXZNP, this.aoBrightnessXYNP, this.aoBrightnessXYZNPP, v70);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessXZNN, this.aoBrightnessXYZNPN, this.aoBrightnessXYNP, v70);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessXYZNNN, this.aoBrightnessXYNN, this.aoBrightnessXZNN, v70);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.6;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.6;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v78 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 4);
      this.renderFaceXNeg(block, x, y, z, v78);
      if (RenderBlocks.fancyGrass && v78.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceXNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x + 1, y, z, 5)) {
      if (this.renderMaxX >= 1.0) {
        x++;
      }

      this.aoLightValueScratchXYPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchXZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchXZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXYPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessXZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessXZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v51 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y + 1, z)];
      let v56 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y - 1, z)];
      let v61 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z + 1)];
      let v66 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z - 1)];
      if (!v56 && !v66) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z - 1);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z - 1);
      }

      if (!v56 && !v61) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPNP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z + 1);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z + 1);
      }

      if (!v51 && !v66) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPPN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z - 1);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z - 1);
      }

      if (!v51 && !v61) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z + 1);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z + 1);
      }

      if (this.renderMaxX >= 1.0) {
        x--;
      }

      let v71 = mixedSelf;
      if (this.renderMaxX >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x + 1, y, z)) {
        v71 = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      }

      let v76 = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      aoTL = (this.aoLightValueScratchXYPN + this.aoLightValueScratchXYZPNP + v76 + this.aoLightValueScratchXZPP) / 4.0;
      aoBL = (this.aoLightValueScratchXYZPNN + this.aoLightValueScratchXYPN + this.aoLightValueScratchXZPN + v76) / 4.0;
      aoBR = (this.aoLightValueScratchXZPN + v76 + this.aoLightValueScratchXYZPPN + this.aoLightValueScratchXYPP) / 4.0;
      aoTR = (v76 + this.aoLightValueScratchXZPP + this.aoLightValueScratchXYPP + this.aoLightValueScratchXYZPPP) / 4.0;
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXYPN, this.aoBrightnessXYZPNP, this.aoBrightnessXZPP, v71);
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessXZPP, this.aoBrightnessXYPP, this.aoBrightnessXYZPPP, v71);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessXZPN, this.aoBrightnessXYZPPN, this.aoBrightnessXYPP, v71);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessXYZPNN, this.aoBrightnessXYPN, this.aoBrightnessXZPN, v71);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.6;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.6;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v79 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 5);
      this.renderFaceXPos(block, x, y, z, v79);
      if (RenderBlocks.fancyGrass && v79.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceXPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    this.enableAO = false;
    return rendered;
  }

  func_102027_b(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    this.enableAO = true;
    let rendered = false;
    let aoTL = 0.0;
    let aoBL = 0.0;
    let aoBR = 0.0;
    let aoTR = 0.0;
    let tintSides = true;
    let mixedSelf = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z);
    let tess = Tessellator.instance;
    tess.setBrightness(983055);
    if (this.getBlockIconTop(block).getIconName() === "grass_top") {
      tintSides = false;
    } else if (this.hasOverrideBlockTexture()) {
      tintSides = false;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y - 1, z, 0)) {
      if (this.renderMinY <= 0.0) {
        y--;
      }

      this.aoBrightnessXYNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessYZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessYZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchXYNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchYZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchYZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      let v16 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y - 1, z)];
      let v17 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y - 1, z)];
      let v18 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z + 1)];
      let v19 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z - 1)];
      if (!v19 && !v17) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXYNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXYNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z - 1);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z - 1);
      }

      if (!v18 && !v17) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXYNN;
        this.aoBrightnessXYZNNP = this.aoBrightnessXYNN;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z + 1);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z + 1);
      }

      if (!v19 && !v16) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXYPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXYPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z - 1);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z - 1);
      }

      if (!v18 && !v16) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXYPN;
        this.aoBrightnessXYZPNP = this.aoBrightnessXYPN;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z + 1);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z + 1);
      }

      if (this.renderMinY <= 0.0) {
        y++;
      }

      let v20 = mixedSelf;
      if (this.renderMinY <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x, y - 1, z)) {
        v20 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      }

      let v21 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      aoTL = (this.aoLightValueScratchXYZNNP + this.aoLightValueScratchXYNN + this.aoLightValueScratchYZNP + v21) / 4.0;
      aoTR = (this.aoLightValueScratchYZNP + v21 + this.aoLightValueScratchXYZPNP + this.aoLightValueScratchXYPN) / 4.0;
      aoBR = (v21 + this.aoLightValueScratchYZNN + this.aoLightValueScratchXYPN + this.aoLightValueScratchXYZPNN) / 4.0;
      aoBL = (this.aoLightValueScratchXYNN + this.aoLightValueScratchXYZNNN + v21 + this.aoLightValueScratchYZNN) / 4.0;
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessXYZNNP, this.aoBrightnessXYNN, this.aoBrightnessYZNP, v20);
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessYZNP, this.aoBrightnessXYZPNP, this.aoBrightnessXYPN, v20);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessYZNN, this.aoBrightnessXYPN, this.aoBrightnessXYZPNN, v20);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessXYNN, this.aoBrightnessXYZNNN, this.aoBrightnessYZNN, v20);
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.5;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.5;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.5;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.5;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.5;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.5;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      this.renderFaceYNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 0));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y + 1, z, 1)) {
      if (this.renderMaxY >= 1.0) {
        y++;
      }

      this.aoBrightnessXYNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessXYPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessYZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessYZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchXYPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchYZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchYZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      let v54 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y + 1, z)];
      let v59 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y + 1, z)];
      let v64 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z + 1)];
      let v69 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z - 1)];
      if (!v69 && !v59) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXYNP;
        this.aoBrightnessXYZNPN = this.aoBrightnessXYNP;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z - 1);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z - 1);
      }

      if (!v69 && !v54) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXYPP;
        this.aoBrightnessXYZPPN = this.aoBrightnessXYPP;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z - 1);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z - 1);
      }

      if (!v64 && !v59) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXYNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXYNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z + 1);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z + 1);
      }

      if (!v64 && !v54) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXYPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXYPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z + 1);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z + 1);
      }

      if (this.renderMaxY >= 1.0) {
        y--;
      }

      let v74 = mixedSelf;
      if (this.renderMaxY >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x, y + 1, z)) {
        v74 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      }

      let v79 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      aoTR = (this.aoLightValueScratchXYZNPP + this.aoLightValueScratchXYNP + this.aoLightValueScratchYZPP + v79) / 4.0;
      aoTL = (this.aoLightValueScratchYZPP + v79 + this.aoLightValueScratchXYZPPP + this.aoLightValueScratchXYPP) / 4.0;
      aoBL = (v79 + this.aoLightValueScratchYZPN + this.aoLightValueScratchXYPP + this.aoLightValueScratchXYZPPN) / 4.0;
      aoBR = (this.aoLightValueScratchXYNP + this.aoLightValueScratchXYZNPN + v79 + this.aoLightValueScratchYZPN) / 4.0;
      this.brightnessTopRight = this.getAoBrightness(this.aoBrightnessXYZNPP, this.aoBrightnessXYNP, this.aoBrightnessYZPP, v74);
      this.brightnessTopLeft = this.getAoBrightness(this.aoBrightnessYZPP, this.aoBrightnessXYZPPP, this.aoBrightnessXYPP, v74);
      this.brightnessBottomLeft = this.getAoBrightness(this.aoBrightnessYZPN, this.aoBrightnessXYPP, this.aoBrightnessXYZPPN, v74);
      this.brightnessBottomRight = this.getAoBrightness(this.aoBrightnessXYNP, this.aoBrightnessXYZNPN, this.aoBrightnessYZPN, v74);
      this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r;
      this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g;
      this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b;
      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      this.renderFaceYPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 1));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z - 1, 2)) {
      if (this.renderMinZ <= 0.0) {
        z--;
      }

      this.aoLightValueScratchXZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchYZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchYZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoLightValueScratchXZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessXZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessYZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessYZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      let v55 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z - 1)];
      let v60 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z - 1)];
      let v65 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z - 1)];
      let v70 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z - 1)];
      if (!v60 && !v70) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y - 1, z);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y - 1, z);
      }

      if (!v60 && !v65) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNPN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y + 1, z);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y + 1, z);
      }

      if (!v55 && !v70) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y - 1, z);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y - 1, z);
      }

      if (!v55 && !v65) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPPN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y + 1, z);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y + 1, z);
      }

      if (this.renderMinZ <= 0.0) {
        z++;
      }

      let v75 = mixedSelf;
      if (this.renderMinZ <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x, y, z - 1)) {
        v75 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      }

      let v80 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      let v22 = (this.aoLightValueScratchXZNN + this.aoLightValueScratchXYZNPN + v80 + this.aoLightValueScratchYZPN) / 4.0;
      let v23 = (v80 + this.aoLightValueScratchYZPN + this.aoLightValueScratchXZPN + this.aoLightValueScratchXYZPPN) / 4.0;
      let v24 = (this.aoLightValueScratchYZNN + v80 + this.aoLightValueScratchXYZPNN + this.aoLightValueScratchXZPN) / 4.0;
      let v25 = (this.aoLightValueScratchXYZNNN + this.aoLightValueScratchXZNN + this.aoLightValueScratchYZNN + v80) / 4.0;
      aoTL = (
        v22 * this.renderMaxY * (1.0 - this.renderMinX)
          + v23 * this.renderMinY * this.renderMinX
          + v24 * (1.0 - this.renderMaxY) * this.renderMinX
          + v25 * (1.0 - this.renderMaxY) * (1.0 - this.renderMinX)
      );
      aoBL = (
        v22 * this.renderMaxY * (1.0 - this.renderMaxX)
          + v23 * this.renderMaxY * this.renderMaxX
          + v24 * (1.0 - this.renderMaxY) * this.renderMaxX
          + v25 * (1.0 - this.renderMaxY) * (1.0 - this.renderMaxX)
      );
      aoBR = (
        v22 * this.renderMinY * (1.0 - this.renderMaxX)
          + v23 * this.renderMinY * this.renderMaxX
          + v24 * (1.0 - this.renderMinY) * this.renderMaxX
          + v25 * (1.0 - this.renderMinY) * (1.0 - this.renderMaxX)
      );
      aoTR = (
        v22 * this.renderMinY * (1.0 - this.renderMinX)
          + v23 * this.renderMinY * this.renderMinX
          + v24 * (1.0 - this.renderMinY) * this.renderMinX
          + v25 * (1.0 - this.renderMinY) * (1.0 - this.renderMinX)
      );
      let v26 = this.getAoBrightness(this.aoBrightnessXZNN, this.aoBrightnessXYZNPN, this.aoBrightnessYZPN, v75);
      let v27 = this.getAoBrightness(this.aoBrightnessYZPN, this.aoBrightnessXZPN, this.aoBrightnessXYZPPN, v75);
      let v28 = this.getAoBrightness(this.aoBrightnessYZNN, this.aoBrightnessXYZPNN, this.aoBrightnessXZPN, v75);
      let v29 = this.getAoBrightness(this.aoBrightnessXYZNNN, this.aoBrightnessXZNN, this.aoBrightnessYZNN, v75);
      this.brightnessTopLeft = this.mixAoBrightness(
        v26,
        v27,
        v28,
        v29,
        this.renderMaxY * (1.0 - this.renderMinX),
        this.renderMaxY * this.renderMinX,
        (1.0 - this.renderMaxY) * this.renderMinX,
        (1.0 - this.renderMaxY) * (1.0 - this.renderMinX)
      );
      this.brightnessBottomLeft = this.mixAoBrightness(
        v26,
        v27,
        v28,
        v29,
        this.renderMaxY * (1.0 - this.renderMaxX),
        this.renderMaxY * this.renderMaxX,
        (1.0 - this.renderMaxY) * this.renderMaxX,
        (1.0 - this.renderMaxY) * (1.0 - this.renderMaxX)
      );
      this.brightnessBottomRight = this.mixAoBrightness(
        v26,
        v27,
        v28,
        v29,
        this.renderMinY * (1.0 - this.renderMaxX),
        this.renderMinY * this.renderMaxX,
        (1.0 - this.renderMinY) * this.renderMaxX,
        (1.0 - this.renderMinY) * (1.0 - this.renderMaxX)
      );
      this.brightnessTopRight = this.mixAoBrightness(
        v26,
        v27,
        v28,
        v29,
        this.renderMinY * (1.0 - this.renderMinX),
        this.renderMinY * this.renderMinX,
        (1.0 - this.renderMinY) * this.renderMinX,
        (1.0 - this.renderMinY) * (1.0 - this.renderMinX)
      );
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.8;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.8;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v84 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 2);
      this.renderFaceZNeg(block, x, y, z, v84);
      if (RenderBlocks.fancyGrass && v84.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceZNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z + 1, 3)) {
      if (this.renderMaxZ >= 1.0) {
        z++;
      }

      this.aoLightValueScratchXZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      this.aoLightValueScratchXZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      this.aoLightValueScratchYZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchYZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      this.aoBrightnessXZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      this.aoBrightnessYZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessYZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v56 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z + 1)];
      let v61 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z + 1)];
      let v66 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y + 1, z + 1)];
      let v71 = Block.canBlockGrass[this.blockAccess!.getBlockId(x, y - 1, z + 1)];
      if (!v61 && !v71) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNNP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y - 1, z);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y - 1, z);
      }

      if (!v61 && !v66) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y + 1, z);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y + 1, z);
      }

      if (!v56 && !v71) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPNP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y - 1, z);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y - 1, z);
      }

      if (!v56 && !v66) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y + 1, z);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y + 1, z);
      }

      if (this.renderMaxZ >= 1.0) {
        z--;
      }

      let v76 = mixedSelf;
      if (this.renderMaxZ >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x, y, z + 1)) {
        v76 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      }

      let v81 = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      let v85 = (this.aoLightValueScratchXZNP + this.aoLightValueScratchXYZNPP + v81 + this.aoLightValueScratchYZPP) / 4.0;
      let v91 = (v81 + this.aoLightValueScratchYZPP + this.aoLightValueScratchXZPP + this.aoLightValueScratchXYZPPP) / 4.0;
      let v94 = (this.aoLightValueScratchYZNP + v81 + this.aoLightValueScratchXYZPNP + this.aoLightValueScratchXZPP) / 4.0;
      let v97 = (this.aoLightValueScratchXYZNNP + this.aoLightValueScratchXZNP + this.aoLightValueScratchYZNP + v81) / 4.0;
      aoTL = (
        v85 * this.renderMaxY * (1.0 - this.renderMinX)
          + v91 * this.renderMaxY * this.renderMinX
          + v94 * (1.0 - this.renderMaxY) * this.renderMinX
          + v97 * (1.0 - this.renderMaxY) * (1.0 - this.renderMinX)
      );
      aoBL = (
        v85 * this.renderMinY * (1.0 - this.renderMinX)
          + v91 * this.renderMinY * this.renderMinX
          + v94 * (1.0 - this.renderMinY) * this.renderMinX
          + v97 * (1.0 - this.renderMinY) * (1.0 - this.renderMinX)
      );
      aoBR = (
        v85 * this.renderMinY * (1.0 - this.renderMaxX)
          + v91 * this.renderMinY * this.renderMaxX
          + v94 * (1.0 - this.renderMinY) * this.renderMaxX
          + v97 * (1.0 - this.renderMinY) * (1.0 - this.renderMaxX)
      );
      aoTR = (
        v85 * this.renderMaxY * (1.0 - this.renderMaxX)
          + v91 * this.renderMaxY * this.renderMaxX
          + v94 * (1.0 - this.renderMaxY) * this.renderMaxX
          + v97 * (1.0 - this.renderMaxY) * (1.0 - this.renderMaxX)
      );
      let v100 = this.getAoBrightness(this.aoBrightnessXZNP, this.aoBrightnessXYZNPP, this.aoBrightnessYZPP, v76);
      let v103 = this.getAoBrightness(this.aoBrightnessYZPP, this.aoBrightnessXZPP, this.aoBrightnessXYZPPP, v76);
      let v106 = this.getAoBrightness(this.aoBrightnessYZNP, this.aoBrightnessXYZPNP, this.aoBrightnessXZPP, v76);
      let v109 = this.getAoBrightness(this.aoBrightnessXYZNNP, this.aoBrightnessXZNP, this.aoBrightnessYZNP, v76);
      this.brightnessTopLeft = this.mixAoBrightness(
        v100,
        v109,
        v106,
        v103,
        this.renderMaxY * (1.0 - this.renderMinX),
        (1.0 - this.renderMaxY) * (1.0 - this.renderMinX),
        (1.0 - this.renderMaxY) * this.renderMinX,
        this.renderMaxY * this.renderMinX
      );
      this.brightnessBottomLeft = this.mixAoBrightness(
        v100,
        v109,
        v106,
        v103,
        this.renderMinY * (1.0 - this.renderMinX),
        (1.0 - this.renderMinY) * (1.0 - this.renderMinX),
        (1.0 - this.renderMinY) * this.renderMinX,
        this.renderMinY * this.renderMinX
      );
      this.brightnessBottomRight = this.mixAoBrightness(
        v100,
        v109,
        v106,
        v103,
        this.renderMinY * (1.0 - this.renderMaxX),
        (1.0 - this.renderMinY) * (1.0 - this.renderMaxX),
        (1.0 - this.renderMinY) * this.renderMaxX,
        this.renderMinY * this.renderMaxX
      );
      this.brightnessTopRight = this.mixAoBrightness(
        v100,
        v109,
        v106,
        v103,
        this.renderMaxY * (1.0 - this.renderMaxX),
        (1.0 - this.renderMaxY) * (1.0 - this.renderMaxX),
        (1.0 - this.renderMaxY) * this.renderMaxX,
        this.renderMaxY * this.renderMaxX
      );
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.8;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.8;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.8;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.8;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v86 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 3);
      this.renderFaceZPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 3));
      if (RenderBlocks.fancyGrass && v86.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceZPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x - 1, y, z, 4)) {
      if (this.renderMinX <= 0.0) {
        x--;
      }

      this.aoLightValueScratchXYNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchXZNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchXZNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXYNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessXZNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessXZNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v57 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y + 1, z)];
      let v62 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y - 1, z)];
      let v67 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z - 1)];
      let v72 = Block.canBlockGrass[this.blockAccess!.getBlockId(x - 1, y, z + 1)];
      if (!v67 && !v62) {
        this.aoLightValueScratchXYZNNN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNNN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z - 1);
        this.aoBrightnessXYZNNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z - 1);
      }

      if (!v72 && !v62) {
        this.aoLightValueScratchXYZNNP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNNP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z + 1);
        this.aoBrightnessXYZNNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z + 1);
      }

      if (!v67 && !v57) {
        this.aoLightValueScratchXYZNPN = this.aoLightValueScratchXZNN;
        this.aoBrightnessXYZNPN = this.aoBrightnessXZNN;
      } else {
        this.aoLightValueScratchXYZNPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z - 1);
        this.aoBrightnessXYZNPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z - 1);
      }

      if (!v72 && !v57) {
        this.aoLightValueScratchXYZNPP = this.aoLightValueScratchXZNP;
        this.aoBrightnessXYZNPP = this.aoBrightnessXZNP;
      } else {
        this.aoLightValueScratchXYZNPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z + 1);
        this.aoBrightnessXYZNPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z + 1);
      }

      if (this.renderMinX <= 0.0) {
        x++;
      }

      let v77 = mixedSelf;
      if (this.renderMinX <= 0.0 || !this.blockAccess!.isBlockOpaqueCube(x - 1, y, z)) {
        v77 = block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z);
      }

      let v82 = block.getAmbientOcclusionLightValue(this.blockAccess!, x - 1, y, z);
      let v87 = (this.aoLightValueScratchXYNN + this.aoLightValueScratchXYZNNP + v82 + this.aoLightValueScratchXZNP) / 4.0;
      let v92 = (v82 + this.aoLightValueScratchXZNP + this.aoLightValueScratchXYNP + this.aoLightValueScratchXYZNPP) / 4.0;
      let v95 = (this.aoLightValueScratchXZNN + v82 + this.aoLightValueScratchXYZNPN + this.aoLightValueScratchXYNP) / 4.0;
      let v98 = (this.aoLightValueScratchXYZNNN + this.aoLightValueScratchXYNN + this.aoLightValueScratchXZNN + v82) / 4.0;
      aoTL = (
        v92 * this.renderMaxY * this.renderMaxZ
          + v95 * this.renderMaxY * (1.0 - this.renderMaxZ)
          + v98 * (1.0 - this.renderMaxY) * (1.0 - this.renderMaxZ)
          + v87 * (1.0 - this.renderMaxY) * this.renderMaxZ
      );
      aoBL = (
        v92 * this.renderMaxY * this.renderMinZ
          + v95 * this.renderMaxY * (1.0 - this.renderMinZ)
          + v98 * (1.0 - this.renderMaxY) * (1.0 - this.renderMinZ)
          + v87 * (1.0 - this.renderMaxY) * this.renderMinZ
      );
      aoBR = (
        v92 * this.renderMinY * this.renderMinZ
          + v95 * this.renderMinY * (1.0 - this.renderMinZ)
          + v98 * (1.0 - this.renderMinY) * (1.0 - this.renderMinZ)
          + v87 * (1.0 - this.renderMinY) * this.renderMinZ
      );
      aoTR = (
        v92 * this.renderMinY * this.renderMaxZ
          + v95 * this.renderMinY * (1.0 - this.renderMaxZ)
          + v98 * (1.0 - this.renderMinY) * (1.0 - this.renderMaxZ)
          + v87 * (1.0 - this.renderMinY) * this.renderMaxZ
      );
      let v101 = this.getAoBrightness(this.aoBrightnessXYNN, this.aoBrightnessXYZNNP, this.aoBrightnessXZNP, v77);
      let v104 = this.getAoBrightness(this.aoBrightnessXZNP, this.aoBrightnessXYNP, this.aoBrightnessXYZNPP, v77);
      let v107 = this.getAoBrightness(this.aoBrightnessXZNN, this.aoBrightnessXYZNPN, this.aoBrightnessXYNP, v77);
      let v110 = this.getAoBrightness(this.aoBrightnessXYZNNN, this.aoBrightnessXYNN, this.aoBrightnessXZNN, v77);
      this.brightnessTopLeft = this.mixAoBrightness(
        v104,
        v107,
        v110,
        v101,
        this.renderMaxY * this.renderMaxZ,
        this.renderMaxY * (1.0 - this.renderMaxZ),
        (1.0 - this.renderMaxY) * (1.0 - this.renderMaxZ),
        (1.0 - this.renderMaxY) * this.renderMaxZ
      );
      this.brightnessBottomLeft = this.mixAoBrightness(
        v104,
        v107,
        v110,
        v101,
        this.renderMaxY * this.renderMinZ,
        this.renderMaxY * (1.0 - this.renderMinZ),
        (1.0 - this.renderMaxY) * (1.0 - this.renderMinZ),
        (1.0 - this.renderMaxY) * this.renderMinZ
      );
      this.brightnessBottomRight = this.mixAoBrightness(
        v104,
        v107,
        v110,
        v101,
        this.renderMinY * this.renderMinZ,
        this.renderMinY * (1.0 - this.renderMinZ),
        (1.0 - this.renderMinY) * (1.0 - this.renderMinZ),
        (1.0 - this.renderMinY) * this.renderMinZ
      );
      this.brightnessTopRight = this.mixAoBrightness(
        v104,
        v107,
        v110,
        v101,
        this.renderMinY * this.renderMaxZ,
        this.renderMinY * (1.0 - this.renderMaxZ),
        (1.0 - this.renderMinY) * (1.0 - this.renderMaxZ),
        (1.0 - this.renderMinY) * this.renderMaxZ
      );
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.6;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.6;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v88 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 4);
      this.renderFaceXNeg(block, x, y, z, v88);
      if (RenderBlocks.fancyGrass && v88.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceXNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x + 1, y, z, 5)) {
      if (this.renderMaxX >= 1.0) {
        x++;
      }

      this.aoLightValueScratchXYPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z);
      this.aoLightValueScratchXZPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z - 1);
      this.aoLightValueScratchXZPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y, z + 1);
      this.aoLightValueScratchXYPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z);
      this.aoBrightnessXYPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z);
      this.aoBrightnessXZPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1);
      this.aoBrightnessXZPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1);
      this.aoBrightnessXYPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z);
      let v58 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y + 1, z)];
      let v63 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y - 1, z)];
      let v68 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z + 1)];
      let v73 = Block.canBlockGrass[this.blockAccess!.getBlockId(x + 1, y, z - 1)];
      if (!v63 && !v73) {
        this.aoLightValueScratchXYZPNN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPNN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPNN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z - 1);
        this.aoBrightnessXYZPNN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z - 1);
      }

      if (!v63 && !v68) {
        this.aoLightValueScratchXYZPNP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPNP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPNP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y - 1, z + 1);
        this.aoBrightnessXYZPNP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z + 1);
      }

      if (!v58 && !v73) {
        this.aoLightValueScratchXYZPPN = this.aoLightValueScratchXZPN;
        this.aoBrightnessXYZPPN = this.aoBrightnessXZPN;
      } else {
        this.aoLightValueScratchXYZPPN = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z - 1);
        this.aoBrightnessXYZPPN = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z - 1);
      }

      if (!v58 && !v68) {
        this.aoLightValueScratchXYZPPP = this.aoLightValueScratchXZPP;
        this.aoBrightnessXYZPPP = this.aoBrightnessXZPP;
      } else {
        this.aoLightValueScratchXYZPPP = block.getAmbientOcclusionLightValue(this.blockAccess!, x, y + 1, z + 1);
        this.aoBrightnessXYZPPP = block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z + 1);
      }

      if (this.renderMaxX >= 1.0) {
        x--;
      }

      let v78 = mixedSelf;
      if (this.renderMaxX >= 1.0 || !this.blockAccess!.isBlockOpaqueCube(x + 1, y, z)) {
        v78 = block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z);
      }

      let v83 = block.getAmbientOcclusionLightValue(this.blockAccess!, x + 1, y, z);
      let v89 = (this.aoLightValueScratchXYPN + this.aoLightValueScratchXYZPNP + v83 + this.aoLightValueScratchXZPP) / 4.0;
      let v93 = (this.aoLightValueScratchXYZPNN + this.aoLightValueScratchXYPN + this.aoLightValueScratchXZPN + v83) / 4.0;
      let v96 = (this.aoLightValueScratchXZPN + v83 + this.aoLightValueScratchXYZPPN + this.aoLightValueScratchXYPP) / 4.0;
      let v99 = (v83 + this.aoLightValueScratchXZPP + this.aoLightValueScratchXYPP + this.aoLightValueScratchXYZPPP) / 4.0;
      aoTL = (
        v89 * (1.0 - this.renderMinY) * this.renderMaxZ
          + v93 * (1.0 - this.renderMinY) * (1.0 - this.renderMaxZ)
          + v96 * this.renderMinY * (1.0 - this.renderMaxZ)
          + v99 * this.renderMinY * this.renderMaxZ
      );
      aoBL = (
        v89 * (1.0 - this.renderMinY) * this.renderMinZ
          + v93 * (1.0 - this.renderMinY) * (1.0 - this.renderMinZ)
          + v96 * this.renderMinY * (1.0 - this.renderMinZ)
          + v99 * this.renderMinY * this.renderMinZ
      );
      aoBR = (
        v89 * (1.0 - this.renderMaxY) * this.renderMinZ
          + v93 * (1.0 - this.renderMaxY) * (1.0 - this.renderMinZ)
          + v96 * this.renderMaxY * (1.0 - this.renderMinZ)
          + v99 * this.renderMaxY * this.renderMinZ
      );
      aoTR = (
        v89 * (1.0 - this.renderMaxY) * this.renderMaxZ
          + v93 * (1.0 - this.renderMaxY) * (1.0 - this.renderMaxZ)
          + v96 * this.renderMaxY * (1.0 - this.renderMaxZ)
          + v99 * this.renderMaxY * this.renderMaxZ
      );
      let v102 = this.getAoBrightness(this.aoBrightnessXYPN, this.aoBrightnessXYZPNP, this.aoBrightnessXZPP, v78);
      let v105 = this.getAoBrightness(this.aoBrightnessXZPP, this.aoBrightnessXYPP, this.aoBrightnessXYZPPP, v78);
      let v108 = this.getAoBrightness(this.aoBrightnessXZPN, this.aoBrightnessXYZPPN, this.aoBrightnessXYPP, v78);
      let v111 = this.getAoBrightness(this.aoBrightnessXYZPNN, this.aoBrightnessXYPN, this.aoBrightnessXZPN, v78);
      this.brightnessTopLeft = this.mixAoBrightness(
        v102,
        v111,
        v108,
        v105,
        (1.0 - this.renderMinY) * this.renderMaxZ,
        (1.0 - this.renderMinY) * (1.0 - this.renderMaxZ),
        this.renderMinY * (1.0 - this.renderMaxZ),
        this.renderMinY * this.renderMaxZ
      );
      this.brightnessBottomLeft = this.mixAoBrightness(
        v102,
        v111,
        v108,
        v105,
        (1.0 - this.renderMinY) * this.renderMinZ,
        (1.0 - this.renderMinY) * (1.0 - this.renderMinZ),
        this.renderMinY * (1.0 - this.renderMinZ),
        this.renderMinY * this.renderMinZ
      );
      this.brightnessBottomRight = this.mixAoBrightness(
        v102,
        v111,
        v108,
        v105,
        (1.0 - this.renderMaxY) * this.renderMinZ,
        (1.0 - this.renderMaxY) * (1.0 - this.renderMinZ),
        this.renderMaxY * (1.0 - this.renderMinZ),
        this.renderMaxY * this.renderMinZ
      );
      this.brightnessTopRight = this.mixAoBrightness(
        v102,
        v111,
        v108,
        v105,
        (1.0 - this.renderMaxY) * this.renderMaxZ,
        (1.0 - this.renderMaxY) * (1.0 - this.renderMaxZ),
        this.renderMaxY * (1.0 - this.renderMaxZ),
        this.renderMaxY * this.renderMaxZ
      );
      if (tintSides) {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = r * 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = g * 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = b * 0.6;
      } else {
        this.colorRedTopLeft = this.colorRedBottomLeft = this.colorRedBottomRight = this.colorRedTopRight = 0.6;
        this.colorGreenTopLeft = this.colorGreenBottomLeft = this.colorGreenBottomRight = this.colorGreenTopRight = 0.6;
        this.colorBlueTopLeft = this.colorBlueBottomLeft = this.colorBlueBottomRight = this.colorBlueTopRight = 0.6;
      }

      this.colorRedTopLeft *= aoTL;
      this.colorGreenTopLeft *= aoTL;
      this.colorBlueTopLeft *= aoTL;
      this.colorRedBottomLeft *= aoBL;
      this.colorGreenBottomLeft *= aoBL;
      this.colorBlueBottomLeft *= aoBL;
      this.colorRedBottomRight *= aoBR;
      this.colorGreenBottomRight *= aoBR;
      this.colorBlueBottomRight *= aoBR;
      this.colorRedTopRight *= aoTR;
      this.colorGreenTopRight *= aoTR;
      this.colorBlueTopRight *= aoTR;
      let v90 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 5);
      this.renderFaceXPos(block, x, y, z, v90);
      if (RenderBlocks.fancyGrass && v90.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        this.colorRedTopLeft *= r;
        this.colorRedBottomLeft *= r;
        this.colorRedBottomRight *= r;
        this.colorRedTopRight *= r;
        this.colorGreenTopLeft *= g;
        this.colorGreenBottomLeft *= g;
        this.colorGreenBottomRight *= g;
        this.colorGreenTopRight *= g;
        this.colorBlueTopLeft *= b;
        this.colorBlueBottomLeft *= b;
        this.colorBlueBottomRight *= b;
        this.colorBlueTopRight *= b;
        this.renderFaceXPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    this.enableAO = false;
    return rendered;
  }

  renderStandardBlockWithColorMultiplier(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    this.enableAO = false;
    let tess = Tessellator.instance;
    let rendered = false;
    let v10 = 0.5;
    let v11 = 1.0;
    let v12 = 0.8;
    let v13 = 0.6;
    let v14 = v11 * r;
    let v15 = v11 * g;
    let v16 = v11 * b;
    let v17 = v10;
    let v18 = v12;
    let v19 = v13;
    let v20 = v10;
    let v21 = v12;
    let v22 = v13;
    let v23 = v10;
    let v24 = v12;
    let v25 = v13;
    if (block !== Block.blocksList[BlockIds.grass]) {
      v17 = v10 * r;
      v18 = v12 * r;
      v19 = v13 * r;
      v20 = v10 * g;
      v21 = v12 * g;
      v22 = v13 * g;
      v23 = v10 * b;
      v24 = v12 * b;
      v25 = v13 * b;
    }

    let v26 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z);
    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y - 1, z, 0)) {
      tess.setBrightness(this.renderMinY > 0.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z));
      tess.setColorOpaque_F(v17, v20, v23);
      this.renderFaceYNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 0));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y + 1, z, 1)) {
      tess.setBrightness(this.renderMaxY < 1.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z));
      tess.setColorOpaque_F(v14, v15, v16);
      this.renderFaceYPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 1));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z - 1, 2)) {
      tess.setBrightness(this.renderMinZ > 0.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1));
      tess.setColorOpaque_F(v18, v21, v24);
      let v28 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 2);
      this.renderFaceZNeg(block, x, y, z, v28);
      if (RenderBlocks.fancyGrass && v28.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        tess.setColorOpaque_F(v18 * r, v21 * g, v24 * b);
        this.renderFaceZNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z + 1, 3)) {
      tess.setBrightness(this.renderMaxZ < 1.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1));
      tess.setColorOpaque_F(v18, v21, v24);
      let v29 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 3);
      this.renderFaceZPos(block, x, y, z, v29);
      if (RenderBlocks.fancyGrass && v29.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        tess.setColorOpaque_F(v18 * r, v21 * g, v24 * b);
        this.renderFaceZPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x - 1, y, z, 4)) {
      tess.setBrightness(this.renderMinX > 0.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z));
      tess.setColorOpaque_F(v19, v22, v25);
      let v30 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 4);
      this.renderFaceXNeg(block, x, y, z, v30);
      if (RenderBlocks.fancyGrass && v30.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        tess.setColorOpaque_F(v19 * r, v22 * g, v25 * b);
        this.renderFaceXNeg(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x + 1, y, z, 5)) {
      tess.setBrightness(this.renderMaxX < 1.0 ? v26 : block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z));
      tess.setColorOpaque_F(v19, v22, v25);
      let v31 = this.getBlockIcon(block, this.blockAccess!, x, y, z, 5);
      this.renderFaceXPos(block, x, y, z, v31);
      if (RenderBlocks.fancyGrass && v31.getIconName() === "grass_side" && !this.hasOverrideBlockTexture()) {
        tess.setColorOpaque_F(v19 * r, v22 * g, v25 * b);
        this.renderFaceXPos(block, x, y, z, this.getIconSafe(BlockGrass.getIconSideOverlay()));
      }

      rendered = true;
    }

    return rendered;
  }

  renderBlockCactus(block: Block, x: number, y: number, z: number): boolean {
    let v5 = block.colorMultiplier(this.blockAccess!, x, y, z);
    let v6 = (v5 >> 16 & 0xFF) / 255.0;
    let v7 = (v5 >> 8 & 0xFF) / 255.0;
    let v8 = (v5 & 0xFF) / 255.0;
    if (RenderBlocks.anaglyphEnable) {
      let v9 = (v6 * 30.0 + v7 * 59.0 + v8 * 11.0) / 100.0;
      let v10 = (v6 * 30.0 + v7 * 70.0) / 100.0;
      let v11 = (v6 * 30.0 + v8 * 70.0) / 100.0;
      v6 = v9;
      v7 = v10;
      v8 = v11;
    }

    return this.renderBlockCactusImpl(block, x, y, z, v6, v7, v8);
  }

  renderBlockCactusImpl(block: Block, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    let tess = Tessellator.instance;
    let rendered = false;
    let v10 = 0.5;
    let v11 = 1.0;
    let v12 = 0.8;
    let v13 = 0.6;
    let v14 = v10 * r;
    let v15 = v11 * r;
    let v16 = v12 * r;
    let v17 = v13 * r;
    let v18 = v10 * g;
    let v19 = v11 * g;
    let v20 = v12 * g;
    let v21 = v13 * g;
    let v22 = v10 * b;
    let v23 = v11 * b;
    let v24 = v12 * b;
    let v25 = v13 * b;
    let v26 = 0.0625;
    let v28 = block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z);
    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y - 1, z, 0)) {
      tess.setBrightness(this.renderMinY > 0.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z));
      tess.setColorOpaque_F(v14, v18, v22);
      this.renderFaceYNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 0));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y + 1, z, 1)) {
      tess.setBrightness(this.renderMaxY < 1.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y + 1, z));
      tess.setColorOpaque_F(v15, v19, v23);
      this.renderFaceYPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 1));
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z - 1, 2)) {
      tess.setBrightness(this.renderMinZ > 0.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z - 1));
      tess.setColorOpaque_F(v16, v20, v24);
      tess.addTranslation(0.0, 0.0, v26);
      this.renderFaceZNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 2));
      tess.addTranslation(0.0, 0.0, -v26);
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x, y, z + 1, 3)) {
      tess.setBrightness(this.renderMaxZ < 1.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z + 1));
      tess.setColorOpaque_F(v16, v20, v24);
      tess.addTranslation(0.0, 0.0, -v26);
      this.renderFaceZPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 3));
      tess.addTranslation(0.0, 0.0, v26);
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x - 1, y, z, 4)) {
      tess.setBrightness(this.renderMinX > 0.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x - 1, y, z));
      tess.setColorOpaque_F(v17, v21, v25);
      tess.addTranslation(v26, 0.0, 0.0);
      this.renderFaceXNeg(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 4));
      tess.addTranslation(-v26, 0.0, 0.0);
      rendered = true;
    }

    if (this.renderAllFaces || block.shouldSideBeRendered(this.blockAccess!, x + 1, y, z, 5)) {
      tess.setBrightness(this.renderMaxX < 1.0 ? v28 : block.getMixedBrightnessForBlock(this.blockAccess!, x + 1, y, z));
      tess.setColorOpaque_F(v17, v21, v25);
      tess.addTranslation(-v26, 0.0, 0.0);
      this.renderFaceXPos(block, x, y, z, this.getBlockIcon(block, this.blockAccess!, x, y, z, 5));
      tess.addTranslation(v26, 0.0, 0.0);
      rendered = true;
    }

    return rendered;
  }

  renderBlockTorch(block: Block, x: number, y: number, z: number): boolean {
    let meta = this.blockAccess!.getBlockMetadata(x, y, z);
    let tess = Tessellator.instance;
    tess.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z));
    tess.setColorOpaque_F(1.0, 1.0, 1.0);
    let v7 = 0.4;
    let v9 = 0.5 - v7;
    let v11 = 0.2;
    if (meta === 1) {
      this.renderTorchAtAngle(block, x - v9, y + v11, z, -v7, 0.0, 0);
    } else if (meta === 2) {
      this.renderTorchAtAngle(block, x + v9, y + v11, z, v7, 0.0, 0);
    } else if (meta === 3) {
      this.renderTorchAtAngle(block, x, y + v11, z - v9, 0.0, -v7, 0);
    } else if (meta === 4) {
      this.renderTorchAtAngle(block, x, y + v11, z + v9, 0.0, v7, 0);
    } else {
      this.renderTorchAtAngle(block, x, y, z, 0.0, 0.0, 0);
    }

    return true;
  }

  renderCrossedSquares(block: Block, x: number, y: number, z: number): boolean {
    let tess = Tessellator.instance;
    tess.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z));
    let v6 = 1.0;
    let v7 = block.colorMultiplier(this.blockAccess!, x, y, z);
    let v8 = (v7 >> 16 & 0xFF) / 255.0;
    let v9 = (v7 >> 8 & 0xFF) / 255.0;
    let v10 = (v7 & 0xFF) / 255.0;
    if (RenderBlocks.anaglyphEnable) {
      let v11 = (v8 * 30.0 + v9 * 59.0 + v10 * 11.0) / 100.0;
      let v12 = (v8 * 30.0 + v9 * 70.0) / 100.0;
      let v13 = (v8 * 30.0 + v10 * 70.0) / 100.0;
      v8 = v11;
      v9 = v12;
      v10 = v13;
    }

    tess.setColorOpaque_F(v6 * v8, v6 * v9, v6 * v10);
    let v19 = x;
    let v20 = y;
    let v15 = z;
    if (block === Block.blocksList[BlockIds.tallGrass]) {
      // Low 32 bits of the original long hash are all the offsets use.
      let v17 = Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y;
      v17 = (Math.imul(Math.imul(v17, v17), 42317861) + Math.imul(v17, 11)) | 0;
      v19 += (((v17 >> 16 & 15) / 15.0) - 0.5) * 0.5;
      v20 += (((v17 >> 20 & 15) / 15.0) - 1.0) * 0.2;
      v15 += (((v17 >> 24 & 15) / 15.0) - 0.5) * 0.5;
    }

    this.drawCrossedSquares(block, this.blockAccess!.getBlockMetadata(x, y, z), v19, v20, v15, 1.0);
    return true;
  }

  renderTorchAtAngle(block: Block, v2: number, v4: number, v6: number, v8: number, v10: number, v12: number): void {
    let tess = Tessellator.instance;
    let icon = this.getBlockIconFromSideAndMetadata(block, 0, v12);
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v15 = icon.getMinU();
    let v17 = icon.getMinV();
    let v19 = icon.getMaxU();
    let v21 = icon.getMaxV();
    let v23 = icon.getInterpolatedU(7.0);
    let v25 = icon.getInterpolatedV(6.0);
    let v27 = icon.getInterpolatedU(9.0);
    let v29 = icon.getInterpolatedV(8.0);
    let v31 = icon.getInterpolatedU(7.0);
    let v33 = icon.getInterpolatedV(13.0);
    let v35 = icon.getInterpolatedU(9.0);
    let v37 = icon.getInterpolatedV(15.0);
    v2 += 0.5;
    v6 += 0.5;
    let v39 = v2 - 0.5;
    let v41 = v2 + 0.5;
    let v43 = v6 - 0.5;
    let v45 = v6 + 0.5;
    let v47 = 0.0625;
    let v49 = 0.625;
    tess.addVertexWithUV(v2 + v8 * (1.0 - v49) - v47, v4 + v49, v6 + v10 * (1.0 - v49) - v47, v23, v25);
    tess.addVertexWithUV(v2 + v8 * (1.0 - v49) - v47, v4 + v49, v6 + v10 * (1.0 - v49) + v47, v23, v29);
    tess.addVertexWithUV(v2 + v8 * (1.0 - v49) + v47, v4 + v49, v6 + v10 * (1.0 - v49) + v47, v27, v29);
    tess.addVertexWithUV(v2 + v8 * (1.0 - v49) + v47, v4 + v49, v6 + v10 * (1.0 - v49) - v47, v27, v25);
    tess.addVertexWithUV(v2 + v47 + v8, v4, v6 - v47 + v10, v35, v33);
    tess.addVertexWithUV(v2 + v47 + v8, v4, v6 + v47 + v10, v35, v37);
    tess.addVertexWithUV(v2 - v47 + v8, v4, v6 + v47 + v10, v31, v37);
    tess.addVertexWithUV(v2 - v47 + v8, v4, v6 - v47 + v10, v31, v33);
    tess.addVertexWithUV(v2 - v47, v4 + 1.0, v43, v15, v17);
    tess.addVertexWithUV(v2 - v47 + v8, v4 + 0.0, v43 + v10, v15, v21);
    tess.addVertexWithUV(v2 - v47 + v8, v4 + 0.0, v45 + v10, v19, v21);
    tess.addVertexWithUV(v2 - v47, v4 + 1.0, v45, v19, v17);
    tess.addVertexWithUV(v2 + v47, v4 + 1.0, v45, v15, v17);
    tess.addVertexWithUV(v2 + v8 + v47, v4 + 0.0, v45 + v10, v15, v21);
    tess.addVertexWithUV(v2 + v8 + v47, v4 + 0.0, v43 + v10, v19, v21);
    tess.addVertexWithUV(v2 + v47, v4 + 1.0, v43, v19, v17);
    tess.addVertexWithUV(v39, v4 + 1.0, v6 + v47, v15, v17);
    tess.addVertexWithUV(v39 + v8, v4 + 0.0, v6 + v47 + v10, v15, v21);
    tess.addVertexWithUV(v41 + v8, v4 + 0.0, v6 + v47 + v10, v19, v21);
    tess.addVertexWithUV(v41, v4 + 1.0, v6 + v47, v19, v17);
    tess.addVertexWithUV(v41, v4 + 1.0, v6 - v47, v15, v17);
    tess.addVertexWithUV(v41 + v8, v4 + 0.0, v6 - v47 + v10, v15, v21);
    tess.addVertexWithUV(v39 + v8, v4 + 0.0, v6 - v47 + v10, v19, v21);
    tess.addVertexWithUV(v39, v4 + 1.0, v6 - v47, v19, v17);
  }

  drawCrossedSquares(block: Block, meta: number, v3: number, v5: number, v7: number, v9: number): void {
    let tess = Tessellator.instance;
    let icon = this.getBlockIconFromSideAndMetadata(block, 0, meta);
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v12 = icon.getMinU();
    let v14 = icon.getMinV();
    let v16 = icon.getMaxU();
    let v18 = icon.getMaxV();
    let v20 = 0.45 * v9;
    let v22 = v3 + 0.5 - v20;
    let v24 = v3 + 0.5 + v20;
    let v26 = v7 + 0.5 - v20;
    let v28 = v7 + 0.5 + v20;
    tess.addVertexWithUV(v22, v5 + v9, v26, v12, v14);
    tess.addVertexWithUV(v22, v5 + 0.0, v26, v12, v18);
    tess.addVertexWithUV(v24, v5 + 0.0, v28, v16, v18);
    tess.addVertexWithUV(v24, v5 + v9, v28, v16, v14);
    tess.addVertexWithUV(v24, v5 + v9, v28, v12, v14);
    tess.addVertexWithUV(v24, v5 + 0.0, v28, v12, v18);
    tess.addVertexWithUV(v22, v5 + 0.0, v26, v16, v18);
    tess.addVertexWithUV(v22, v5 + v9, v26, v16, v14);
    tess.addVertexWithUV(v22, v5 + v9, v28, v12, v14);
    tess.addVertexWithUV(v22, v5 + 0.0, v28, v12, v18);
    tess.addVertexWithUV(v24, v5 + 0.0, v26, v16, v18);
    tess.addVertexWithUV(v24, v5 + v9, v26, v16, v14);
    tess.addVertexWithUV(v24, v5 + v9, v26, v12, v14);
    tess.addVertexWithUV(v24, v5 + 0.0, v26, v12, v18);
    tess.addVertexWithUV(v22, v5 + 0.0, v28, v16, v18);
    tess.addVertexWithUV(v22, v5 + v9, v28, v16, v14);
  }

  renderBlockFluids(block: Block, x: number, y: number, z: number): boolean {
    let tess = Tessellator.instance;
    let v6 = block.colorMultiplier(this.blockAccess!, x, y, z);
    let v7 = (v6 >> 16 & 0xFF) / 255.0;
    let v8 = (v6 >> 8 & 0xFF) / 255.0;
    let v9 = (v6 & 0xFF) / 255.0;
    let v10 = block.shouldSideBeRendered(this.blockAccess!, x, y + 1, z, 1);
    let v11 = block.shouldSideBeRendered(this.blockAccess!, x, y - 1, z, 0);
    const v12 = [
      block.shouldSideBeRendered(this.blockAccess!, x, y, z - 1, 2),
      block.shouldSideBeRendered(this.blockAccess!, x, y, z + 1, 3),
      block.shouldSideBeRendered(this.blockAccess!, x - 1, y, z, 4),
      block.shouldSideBeRendered(this.blockAccess!, x + 1, y, z, 5),
    ];
    if (!v10 && !v11 && !v12[0] && !v12[1] && !v12[2] && !v12[3]) {
      return false;
    } else {
      let v13 = false;
      let v14 = 0.5;
      let v15 = 1.0;
      let v16 = 0.8;
      let v17 = 0.6;
      let v18 = 0.0;
      let v20 = 1.0;
      let v22 = block.blockMaterial;
      let v23 = this.blockAccess!.getBlockMetadata(x, y, z);
      let v24 = this.getFluidHeight(x, y, z, v22);
      let v26 = this.getFluidHeight(x, y, z + 1, v22);
      let v28 = this.getFluidHeight(x + 1, y, z + 1, v22);
      let v30 = this.getFluidHeight(x + 1, y, z, v22);
      let v32 = 0.001;
      if (this.renderAllFaces || v10) {
        v13 = true;
        let v34 = this.getBlockIconFromSideAndMetadata(block, 1, v23);
        let v35 = BlockFluid.getFlowDirection(this.blockAccess!, x, y, z, v22);
        if (v35 > -999.0) {
          v34 = this.getBlockIconFromSideAndMetadata(block, 2, v23);
        }

        v24 -= v32;
        v26 -= v32;
        v28 -= v32;
        v30 -= v32;
        let v36 = 0;
        let v38 = 0;
        let v40 = 0;
        let v42 = 0;
        let v44 = 0;
        let v46 = 0;
        let v48 = 0;
        let v50 = 0;
        if (v35 < -999.0) {
          v36 = v34.getInterpolatedU(0.0);
          v44 = v34.getInterpolatedV(0.0);
          v38 = v36;
          v46 = v34.getInterpolatedV(16.0);
          v40 = v34.getInterpolatedU(16.0);
          v48 = v46;
          v42 = v40;
          v50 = v44;
        } else {
          let v52 = MathHelper.sin(v35) * 0.25;
          let v53 = MathHelper.cos(v35) * 0.25;
          v36 = v34.getInterpolatedU((8.0 + (-v53 - v52) * 16.0));
          v44 = v34.getInterpolatedV((8.0 + (-v53 + v52) * 16.0));
          v38 = v34.getInterpolatedU((8.0 + (-v53 + v52) * 16.0));
          v46 = v34.getInterpolatedV((8.0 + (v53 + v52) * 16.0));
          v40 = v34.getInterpolatedU((8.0 + (v53 + v52) * 16.0));
          v48 = v34.getInterpolatedV((8.0 + (v53 - v52) * 16.0));
          v42 = v34.getInterpolatedU((8.0 + (v53 - v52) * 16.0));
          v50 = v34.getInterpolatedV((8.0 + (-v53 - v52) * 16.0));
        }

        tess.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y, z));
        let v61 = 1.0;
        tess.setColorOpaque_F(v15 * v61 * v7, v15 * v61 * v8, v15 * v61 * v9);
        tess.addVertexWithUV((x + 0), y + v24, (z + 0), v36, v44);
        tess.addVertexWithUV((x + 0), y + v26, (z + 1), v38, v46);
        tess.addVertexWithUV((x + 1), y + v28, (z + 1), v40, v48);
        tess.addVertexWithUV((x + 1), y + v30, (z + 0), v42, v50);
      }

      if (this.renderAllFaces || v11) {
        tess.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, x, y - 1, z));
        let v57 = 1.0;
        tess.setColorOpaque_F(v14 * v57, v14 * v57, v14 * v57);
        this.renderFaceYNeg(block, x, y + v32, z, this.getBlockIconFromSide(block, 0));
        v13 = true;
      }

      for (let v58 = 0; v58 < 4; v58++) {
        let v59 = x;
        let v37 = z;
        if (v58 === 0) {
          v37 = z - 1;
        }

        if (v58 === 1) {
          v37++;
        }

        if (v58 === 2) {
          v59 = x - 1;
        }

        if (v58 === 3) {
          v59++;
        }

        let v60 = this.getBlockIconFromSideAndMetadata(block, v58 + 2, v23);
        if (this.renderAllFaces || v12[v58]) {
          let v39 = 0;
          let v41 = 0;
          let v43 = 0;
          let v45 = 0;
          let v47 = 0;
          let v49 = 0;
          if (v58 === 0) {
            v39 = v24;
            v41 = v30;
            v43 = x;
            v47 = (x + 1);
            v45 = z + v32;
            v49 = z + v32;
          } else if (v58 === 1) {
            v39 = v28;
            v41 = v26;
            v43 = (x + 1);
            v47 = x;
            v45 = (z + 1) - v32;
            v49 = (z + 1) - v32;
          } else if (v58 === 2) {
            v39 = v26;
            v41 = v24;
            v43 = x + v32;
            v47 = x + v32;
            v45 = (z + 1);
            v49 = z;
          } else {
            v39 = v30;
            v41 = v28;
            v43 = (x + 1) - v32;
            v47 = (x + 1) - v32;
            v45 = z;
            v49 = (z + 1);
          }

          v13 = true;
          let v51 = v60.getInterpolatedU(0.0);
          let v62 = v60.getInterpolatedU(8.0);
          let v63 = v60.getInterpolatedV((1.0 - v39) * 16.0 * 0.5);
          let v54 = v60.getInterpolatedV((1.0 - v41) * 16.0 * 0.5);
          let v55 = v60.getInterpolatedV(8.0);
          tess.setBrightness(block.getMixedBrightnessForBlock(this.blockAccess!, v59, y, v37));
          let v56 = 1.0;
          if (v58 < 2) {
            v56 *= v16;
          } else {
            v56 *= v17;
          }

          tess.setColorOpaque_F(v15 * v56 * v7, v15 * v56 * v8, v15 * v56 * v9);
          tess.addVertexWithUV(v43, y + v39, v45, v51, v63);
          tess.addVertexWithUV(v47, y + v41, v49, v62, v54);
          tess.addVertexWithUV(v47, (y + 0), v49, v62, v55);
          tess.addVertexWithUV(v43, (y + 0), v45, v51, v55);
        }
      }

      this.renderMinY = v18;
      this.renderMaxY = v20;
      return v13;
    }
  }

  getFluidHeight(v1: number, v2: number, v3: number, v4: Material): number {
    let v5 = 0;
    let v6 = 0.0;

    for (let v7 = 0; v7 < 4; v7++) {
      let v8 = v1 - (v7 & 1);
      let v10 = v3 - (v7 >> 1 & 1);
      if (this.blockAccess!.getBlockMaterial(v8, v2 + 1, v10) === v4) {
        return 1.0;
      }

      let v11 = this.blockAccess!.getBlockMaterial(v8, v2, v10);
      if (v11 === v4) {
        let v12 = this.blockAccess!.getBlockMetadata(v8, v2, v10);
        if (v12 >= 8 || v12 === 0) {
          v6 += BlockFluid.getFluidHeightPercent(v12) * 10.0;
          v5 += 10;
        }

        v6 += BlockFluid.getFluidHeightPercent(v12);
        v5++;
      } else if (!v11.isSolid()) {
        v6++;
        v5++;
      }
    }

    return 1.0 - v6 / v5;
  }

  renderFaceYNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinX * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxX * 16.0);
    let v14 = icon.getInterpolatedV(this.renderMinZ * 16.0);
    let v16 = icon.getInterpolatedV(this.renderMaxZ * 16.0);
    if (this.renderMinX < 0.0 || this.renderMaxX > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinZ < 0.0 || this.renderMaxZ > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v18 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateBottom === 2) {
      v10 = icon.getInterpolatedU(this.renderMinZ * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMaxX * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxZ * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMinX * 16.0);
      v22 = v14;
      v24 = v16;
      v18 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateBottom === 1) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxZ * 16.0);
      v14 = icon.getInterpolatedV(this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinZ * 16.0);
      v16 = icon.getInterpolatedV(this.renderMaxX * 16.0);
      v18 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateBottom === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxX * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMinZ * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMaxZ * 16.0);
      v18 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMinX;
    let v28 = x + this.renderMaxX;
    let v30 = y + this.renderMinY;
    let v32 = z + this.renderMinZ;
    let v34 = z + this.renderMaxZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v28, v30, v32, v18, v22);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
    } else {
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.addVertexWithUV(v28, v30, v32, v18, v22);
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
    }
  }

  renderFaceYPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinX * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxX * 16.0);
    let v14 = icon.getInterpolatedV(this.renderMinZ * 16.0);
    let v16 = icon.getInterpolatedV(this.renderMaxZ * 16.0);
    if (this.renderMinX < 0.0 || this.renderMaxX > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinZ < 0.0 || this.renderMaxZ > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v18 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateTop === 1) {
      v10 = icon.getInterpolatedU(this.renderMinZ * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMaxX * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxZ * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMinX * 16.0);
      v22 = v14;
      v24 = v16;
      v18 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateTop === 2) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxZ * 16.0);
      v14 = icon.getInterpolatedV(this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinZ * 16.0);
      v16 = icon.getInterpolatedV(this.renderMaxX * 16.0);
      v18 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateTop === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxX * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMinZ * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMaxZ * 16.0);
      v18 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMinX;
    let v28 = x + this.renderMaxX;
    let v30 = y + this.renderMaxY;
    let v32 = z + this.renderMinZ;
    let v34 = z + this.renderMaxZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v28, v30, v32, v18, v22);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
    } else {
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
      tess.addVertexWithUV(v28, v30, v32, v18, v22);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
    }
  }

  renderFaceZNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinX * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxX * 16.0);
    let v14 = icon.getInterpolatedV(16.0 - this.renderMaxY * 16.0);
    let v16 = icon.getInterpolatedV(16.0 - this.renderMinY * 16.0);
    if (this.flipTexture) {
      let v18 = v10;
      v10 = v12;
      v12 = v18;
    }

    if (this.renderMinX < 0.0 || this.renderMaxX > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinY < 0.0 || this.renderMaxY > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v40 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateEast === 2) {
      v10 = icon.getInterpolatedU(this.renderMinY * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMaxX * 16.0);
      v22 = v14;
      v24 = v16;
      v40 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateEast === 1) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxY * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinX * 16.0);
      v40 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateEast === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxX * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinY * 16.0);
      v40 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMinX;
    let v28 = x + this.renderMaxX;
    let v30 = y + this.renderMinY;
    let v32 = y + this.renderMaxY;
    let v34 = z + this.renderMinZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v26, v32, v34, v40, v22);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v28, v32, v34, v10, v14);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v28, v30, v34, v20, v24);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v26, v30, v34, v12, v16);
    } else {
      tess.addVertexWithUV(v26, v32, v34, v40, v22);
      tess.addVertexWithUV(v28, v32, v34, v10, v14);
      tess.addVertexWithUV(v28, v30, v34, v20, v24);
      tess.addVertexWithUV(v26, v30, v34, v12, v16);
    }
  }

  renderFaceZPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinX * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxX * 16.0);
    let v14 = icon.getInterpolatedV(16.0 - this.renderMaxY * 16.0);
    let v16 = icon.getInterpolatedV(16.0 - this.renderMinY * 16.0);
    if (this.flipTexture) {
      let v18 = v10;
      v10 = v12;
      v12 = v18;
    }

    if (this.renderMinX < 0.0 || this.renderMaxX > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinY < 0.0 || this.renderMaxY > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v40 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateWest === 1) {
      v10 = icon.getInterpolatedU(this.renderMinY * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxY * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMaxX * 16.0);
      v22 = v14;
      v24 = v16;
      v40 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateWest === 2) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxY * 16.0);
      v14 = icon.getInterpolatedV(this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMaxX * 16.0);
      v40 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateWest === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinX * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxX * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinY * 16.0);
      v40 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMinX;
    let v28 = x + this.renderMaxX;
    let v30 = y + this.renderMinY;
    let v32 = y + this.renderMaxY;
    let v34 = z + this.renderMaxZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v26, v32, v34, v10, v14);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v28, v32, v34, v40, v22);
    } else {
      tess.addVertexWithUV(v26, v32, v34, v10, v14);
      tess.addVertexWithUV(v26, v30, v34, v20, v24);
      tess.addVertexWithUV(v28, v30, v34, v12, v16);
      tess.addVertexWithUV(v28, v32, v34, v40, v22);
    }
  }

  renderFaceXNeg(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinZ * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxZ * 16.0);
    let v14 = icon.getInterpolatedV(16.0 - this.renderMaxY * 16.0);
    let v16 = icon.getInterpolatedV(16.0 - this.renderMinY * 16.0);
    if (this.flipTexture) {
      let v18 = v10;
      v10 = v12;
      v12 = v18;
    }

    if (this.renderMinZ < 0.0 || this.renderMaxZ > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinY < 0.0 || this.renderMaxY > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v40 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateNorth === 1) {
      v10 = icon.getInterpolatedU(this.renderMinY * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMaxZ * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMinZ * 16.0);
      v22 = v14;
      v24 = v16;
      v40 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateNorth === 2) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxY * 16.0);
      v14 = icon.getInterpolatedV(this.renderMinZ * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMaxZ * 16.0);
      v40 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateNorth === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinZ * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxZ * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinY * 16.0);
      v40 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMinX;
    let v28 = y + this.renderMinY;
    let v30 = y + this.renderMaxY;
    let v32 = z + this.renderMinZ;
    let v34 = z + this.renderMaxZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v26, v30, v34, v40, v22);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v26, v28, v32, v20, v24);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v26, v28, v34, v12, v16);
    } else {
      tess.addVertexWithUV(v26, v30, v34, v40, v22);
      tess.addVertexWithUV(v26, v30, v32, v10, v14);
      tess.addVertexWithUV(v26, v28, v32, v20, v24);
      tess.addVertexWithUV(v26, v28, v34, v12, v16);
    }
  }

  renderFaceXPos(_block: Block, x: number, y: number, z: number, icon: Icon): void {
    let tess = Tessellator.instance;
    if (this.hasOverrideBlockTexture()) {
      icon = this.overrideBlockTexture!;
    }

    let v10 = icon.getInterpolatedU(this.renderMinZ * 16.0);
    let v12 = icon.getInterpolatedU(this.renderMaxZ * 16.0);
    let v14 = icon.getInterpolatedV(16.0 - this.renderMaxY * 16.0);
    let v16 = icon.getInterpolatedV(16.0 - this.renderMinY * 16.0);
    if (this.flipTexture) {
      let v18 = v10;
      v10 = v12;
      v12 = v18;
    }

    if (this.renderMinZ < 0.0 || this.renderMaxZ > 1.0) {
      v10 = icon.getMinU();
      v12 = icon.getMaxU();
    }

    if (this.renderMinY < 0.0 || this.renderMaxY > 1.0) {
      v14 = icon.getMinV();
      v16 = icon.getMaxV();
    }

    let v40 = v12;
    let v20 = v10;
    let v22 = v14;
    let v24 = v16;
    if (this.uvRotateSouth === 2) {
      v10 = icon.getInterpolatedU(this.renderMinY * 16.0);
      v14 = icon.getInterpolatedV(16.0 - this.renderMinZ * 16.0);
      v12 = icon.getInterpolatedU(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(16.0 - this.renderMaxZ * 16.0);
      v22 = v14;
      v24 = v16;
      v40 = v10;
      v20 = v12;
      v14 = v16;
      v16 = v22;
    } else if (this.uvRotateSouth === 1) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMaxY * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxZ * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMinY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinZ * 16.0);
      v40 = v12;
      v20 = v10;
      v10 = v12;
      v12 = v20;
      v22 = v16;
      v24 = v14;
    } else if (this.uvRotateSouth === 3) {
      v10 = icon.getInterpolatedU(16.0 - this.renderMinZ * 16.0);
      v12 = icon.getInterpolatedU(16.0 - this.renderMaxZ * 16.0);
      v14 = icon.getInterpolatedV(this.renderMaxY * 16.0);
      v16 = icon.getInterpolatedV(this.renderMinY * 16.0);
      v40 = v12;
      v20 = v10;
      v22 = v14;
      v24 = v16;
    }

    let v26 = x + this.renderMaxX;
    let v28 = y + this.renderMinY;
    let v30 = y + this.renderMaxY;
    let v32 = z + this.renderMinZ;
    let v34 = z + this.renderMaxZ;
    if (this.enableAO) {
      tess.setColorOpaque_F(this.colorRedTopLeft, this.colorGreenTopLeft, this.colorBlueTopLeft);
      tess.setBrightness(this.brightnessTopLeft);
      tess.addVertexWithUV(v26, v28, v34, v20, v24);
      tess.setColorOpaque_F(this.colorRedBottomLeft, this.colorGreenBottomLeft, this.colorBlueBottomLeft);
      tess.setBrightness(this.brightnessBottomLeft);
      tess.addVertexWithUV(v26, v28, v32, v12, v16);
      tess.setColorOpaque_F(this.colorRedBottomRight, this.colorGreenBottomRight, this.colorBlueBottomRight);
      tess.setBrightness(this.brightnessBottomRight);
      tess.addVertexWithUV(v26, v30, v32, v40, v22);
      tess.setColorOpaque_F(this.colorRedTopRight, this.colorGreenTopRight, this.colorBlueTopRight);
      tess.setBrightness(this.brightnessTopRight);
      tess.addVertexWithUV(v26, v30, v34, v10, v14);
    } else {
      tess.addVertexWithUV(v26, v28, v34, v20, v24);
      tess.addVertexWithUV(v26, v28, v32, v12, v16);
      tess.addVertexWithUV(v26, v30, v32, v40, v22);
      tess.addVertexWithUV(v26, v30, v34, v10, v14);
    }
  }
}
