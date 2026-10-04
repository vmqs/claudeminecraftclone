import type { EntityLiving } from '../../entity/EntityLiving';
import { GL } from '../gl/GL';
import type { ModelBase } from './ModelBase';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/** The giant (RenderGiantZombie): the zombie model scaled 6x, without armour or held items. */
export class RenderGiantZombie extends RenderLiving {
  constructor(
    model: ModelBase,
    shadow: number,
    private readonly scale: number,
  ) {
    super(model, f(shadow * scale));
  }

  protected override preRenderCallback(_e: EntityLiving, _pt: number): void {
    GL.scale(this.scale, this.scale, this.scale);
  }
}
