import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityMagmaCube } from '../../entity/EntityMagmaCube';
import { GL } from '../gl/GL';
import { ModelMagmaCube } from './ModelMagmaCube';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/** Magma cubes (RenderMagmaCube): stretched by size and squish like slimes. */
export class RenderMagmaCube extends RenderLiving {
  private modelVersion: number;

  constructor() {
    super(new ModelMagmaCube(), 0.25);
    this.modelVersion = (this.mainModel as ModelMagmaCube).getModelVersion();
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    const v = (this.mainModel as ModelMagmaCube).getModelVersion();
    if (v !== this.modelVersion) {
      this.modelVersion = v;
      this.mainModel = new ModelMagmaCube();
    }
    super.doRenderLiving(e, x, y, z, yaw, pt);
  }

  /** scaleMagmaCube */
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    const c = e as EntityMagmaCube;
    const size = c.getSlimeSize();
    const squish = f(f(c.prevSquishFactor + f(f(c.squishFactor - c.prevSquishFactor) * pt)) / f(f(size * f(0.5)) + 1));
    const k = f(1 / f(squish + 1));
    GL.scale(f(k * size), f(f(1 / k) * size), f(k * size));
  }
}
