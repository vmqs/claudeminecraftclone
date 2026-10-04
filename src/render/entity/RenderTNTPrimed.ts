import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { Entity } from '../../entity/Entity';
import type { EntityTNTPrimed } from '../../entity/EntityTNTPrimed';
import { GL } from '../gl/GL';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderTNTPrimed: the TNT block, swelling by up to 30% over the last 10 ticks, with a white
 * flash (additive, growing stronger as the fuse burns) every other 5 ticks.
 */
export class RenderTNTPrimed extends Render {
  constructor() {
    super();
    this.shadowSize = f(0.5);
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const tnt = e as EntityTNTPrimed;
    const block = Block.blocksList[BlockIds.tnt];
    if (!block) return;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    const left = f(f(tnt.fuse - pt) + 1);
    if (left < 10) {
      let k = f(1 - f(left / 10));
      if (k < 0) k = 0;
      if (k > 1) k = 1;
      k = f(k * k);
      k = f(k * k);
      const s = f(1 + f(k * f(0.3)));
      GL.scale(s, s, s);
    }
    const flash = f(f(1 - f(left / 100)) * f(0.8));
    this.loadTexture('/terrain.png');
    this.renderBlocks.renderBlockAsItem(block, 0, tnt.getBrightness(pt));
    if (Math.trunc(tnt.fuse / 5) % 2 === 0) {
      GL.disable(GL.TEXTURE_2D);
      GL.disable(GL.LIGHTING);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.DST_ALPHA);
      GL.color(1, 1, 1, flash);
      this.renderBlocks.renderBlockAsItem(block, 0, 1);
      GL.color(1, 1, 1, 1);
      GL.disable(GL.BLEND);
      GL.enable(GL.LIGHTING);
      GL.enable(GL.TEXTURE_2D);
    }
    GL.popMatrix();
  }
}
