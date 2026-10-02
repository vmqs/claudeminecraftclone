import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { EntityMinecart } from '../../entity/EntityMinecart';
import type { EntityMinecartTNT } from '../../entity/EntityMinecartTNT';
import { GL } from '../gl/GL';
import { RenderMinecart } from './RenderMinecart';

const f = Math.fround;

/** RenderTntMinecart: the TNT inside swells and flashes white like primed TNT once lit. */
export class RenderTntMinecart extends RenderMinecart {
  protected override renderBlockInMinecart(cart: EntityMinecart, pt: number, block: Block, data: number): void {
    const fuse = (cart as EntityMinecartTNT).getFuseTicks();
    if (fuse > -1 && f(f(fuse - pt) + 1) < 10) {
      let k = f(1 - f(f(f(fuse - pt) + 1) / 10));
      if (k < 0) k = 0;
      if (k > 1) k = 1;
      k = f(k * k);
      k = f(k * k);
      const s = f(1 + f(k * f(0.3)));
      GL.scale(s, s, s);
    }
    super.renderBlockInMinecart(cart, pt, block, data);
    const tnt = Block.blocksList[BlockIds.tnt];
    if (fuse > -1 && Math.trunc(fuse / 5) % 2 === 0 && tnt) {
      GL.disable(GL.TEXTURE_2D);
      GL.disable(GL.LIGHTING);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.DST_ALPHA);
      GL.color(1, 1, 1, f(f(1 - f(f(f(fuse - pt) + 1) / 100)) * f(0.8)));
      GL.pushMatrix();
      this.renderBlocks.renderBlockAsItem(tnt, 0, 1);
      GL.popMatrix();
      GL.color(1, 1, 1, 1);
      GL.disable(GL.BLEND);
      GL.enable(GL.LIGHTING);
      GL.enable(GL.TEXTURE_2D);
    }
  }
}
