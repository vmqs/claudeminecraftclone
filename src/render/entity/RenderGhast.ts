import type { EntityGhast } from '../../entity/EntityGhast';
import type { EntityLiving } from '../../entity/EntityLiving';
import { GL } from '../gl/GL';
import { ModelGhast } from './ModelGhast';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/** Ghasts (RenderGhast): 4.5x scale, puffing up (wider, flatter) as the attack counter charges. */
export class RenderGhast extends RenderLiving {
  constructor() {
    super(new ModelGhast(), 0.5);
  }

  /** preRenderGhast */
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    const g = e as EntityGhast;
    let k = f(f(g.prevAttackCounter + f((g.attackCounter - g.prevAttackCounter) * pt)) / 20);
    if (k < 0) k = 0;
    k = f(1 / f(f(f(f(f(f(k * k) * k) * k) * k) * 2) + 1));
    const y = f(f(8 + k) / 2);
    const xz = f(f(8 + f(1 / k)) / 2);
    GL.scale(xz, y, xz);
    GL.color(1, 1, 1, 1);
  }
}
