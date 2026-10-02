import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { Render } from './Render';

/** RenderEntity: the fallback for entities without a renderer, a plain white bounding box. */
export class RenderEntity extends Render {
  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    GL.pushMatrix();
    Render.renderOffsetAABB(e.boundingBox, x - e.lastTickPosX, y - e.lastTickPosY, z - e.lastTickPosZ);
    GL.popMatrix();
  }
}
