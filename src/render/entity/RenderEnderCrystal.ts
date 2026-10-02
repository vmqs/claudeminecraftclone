import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityEnderCrystal } from '../../entity/EntityEnderCrystal';
import { GL } from '../gl/GL';
import { ModelEnderCrystal } from './ModelEnderCrystal';
import { Render } from './Render';

const f = Math.fround;

/** RenderEnderCrystal: the crystal model spinning and bobbing over its base. */
export class RenderEnderCrystal extends Render {
  private readonly model = new ModelEnderCrystal(0, true);

  constructor() {
    super();
    this.shadowSize = f(0.5);
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const crystal = e as EntityEnderCrystal;
    const t = f(crystal.innerRotation + pt);
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    this.loadTexture('/mob/enderdragon/crystal.png');
    let bob = f(f(MathHelper.sin(f(t * f(0.2))) / 2) + f(0.5));
    bob = f(f(bob * bob) + bob);
    this.model.render(crystal, 0, f(t * 3), f(bob * f(0.2)), 0, 0, f(0.0625));
    GL.popMatrix();
  }
}
