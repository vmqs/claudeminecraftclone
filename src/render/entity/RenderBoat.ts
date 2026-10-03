import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityBoat } from '../../entity/EntityBoat';
import { GL } from '../gl/GL';
import { ModelBoat } from './ModelBoat';
import { Render } from './Render';

const f = Math.fround;

/** RenderBoat: the boat model facing its yaw, rocking sideways for a while after a hit. */
export class RenderBoat extends Render {
  protected readonly modelBoat = new ModelBoat();

  constructor() {
    super();
    this.shadowSize = f(0.5);
  }

  doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    const boat = e as EntityBoat;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.rotate(f(180 - yaw), 0, 1, 0);
    const hit = f(boat.getTimeSinceHit() - pt);
    let dmg = f(boat.getDamageTaken() - pt);
    if (dmg < 0) dmg = 0;
    if (hit > 0) GL.rotate(f(f(f(f(MathHelper.sin(hit) * hit) * dmg) / 10) * boat.getForwardDirection()), 1, 0, 0);
    this.loadTexture('/item/boat.png');
    GL.scale(-1, -1, 1);
    this.modelBoat.render(boat, 0, 0, f(-0.1), 0, 0, f(0.0625));
    GL.popMatrix();
  }
}
