import type { FontRenderer } from '../../gui/FontRenderer';
import type { World } from '../../world/World';
import type { TileEntity } from '../../world/tileentity/TileEntity';
import type { TileEntityRenderer } from './TileEntityRenderer';

/** Draws one kind of tile entity with a model (chest lids, signs, spawner mobs, skulls...). */
export abstract class TileEntitySpecialRenderer {
  protected tileEntityRenderer!: TileEntityRenderer;

  /** (x, y, z) is the block corner relative to the camera. */
  abstract renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void;

  protected bindTextureByName(path: string): void {
    this.tileEntityRenderer.renderEngine?.bindTexture(path);
  }

  setTileEntityRenderer(r: TileEntityRenderer): void {
    this.tileEntityRenderer = r;
  }

  onWorldChange(_w: World | null): void {}

  getFontRenderer(): FontRenderer | null {
    return this.tileEntityRenderer.getFontRenderer();
  }
}
