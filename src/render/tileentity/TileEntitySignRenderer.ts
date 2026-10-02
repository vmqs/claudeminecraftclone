import { BlockIds } from '../../block/BlockIds';
import type { TileEntity } from '../../world/tileentity/TileEntity';
import type { TileEntitySign } from '../../world/tileentity/TileEntitySign';
import { GL } from '../gl/GL';
import { ModelSign } from './TileEntityModels';
import { TileEntitySpecialRenderer } from './TileEntitySpecialRenderer';

const f = Math.fround;

/**
 * TileEntitySignRenderer: the sign model at 2/3 size (on its post, turned by the metadata in
 * 16ths, or flat against the wall), then the four lines in black, the edited one in "> <".
 */
export class TileEntitySignRenderer extends TileEntitySpecialRenderer {
  private readonly modelSign = new ModelSign();

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, _pt: number): void {
    const sign = te as TileEntitySign;
    const block = sign.getBlockType();
    const scale = f(0.6666667);
    GL.pushMatrix();
    GL.translate(f(f(x) + 0.5), f(f(y) + f(0.75 * scale)), f(f(z) + 0.5));
    if (block?.blockID === BlockIds.signPost) {
      GL.rotate(-f((sign.getBlockMetadata() * 360) / 16), 0, 1, 0);
      this.modelSign.signStick.showModel = true;
    } else {
      const meta = sign.getBlockMetadata();
      const yaw = meta === 2 ? 180 : meta === 4 ? 90 : meta === 5 ? -90 : 0;
      GL.rotate(-yaw, 0, 1, 0);
      GL.translate(0, f(-0.3125), f(-0.4375));
      this.modelSign.signStick.showModel = false;
    }
    this.bindTextureByName('/item/sign.png');
    GL.pushMatrix();
    GL.scale(scale, -scale, -scale);
    this.modelSign.renderSign();
    GL.popMatrix();
    const font = this.getFontRenderer();
    const textScale = f(f(0.016666668) * scale);
    GL.translate(0, f(0.5 * scale), f(f(0.07) * scale));
    GL.scale(textScale, -textScale, textScale);
    GL.normal(0, 0, f(-1 * textScale));
    GL.depthMask(false);
    if (font) {
      const lines = sign.signText;
      for (let i = 0; i < lines.length; i++) {
        const line = i === sign.lineBeingEdited ? `> ${lines[i]} <` : lines[i];
        font.drawString(line, Math.trunc(-font.getStringWidth(line) / 2), i * 10 - lines.length * 5, 0);
      }
    }
    GL.depthMask(true);
    GL.color(1, 1, 1, 1);
    GL.popMatrix();
  }
}
