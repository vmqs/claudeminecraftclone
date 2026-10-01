import type { Entity } from '../../entity/Entity';
import type { RenderManager } from './RenderManager';

/** Base entity renderer (Render): subclasses draw an entity at a camera-relative position. */
export abstract class Render {
  renderManager!: RenderManager;
  protected shadowSize = 0;
  protected shadowOpaque = 1;

  abstract doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void;

  protected loadTexture(path: string): void {
    this.renderManager.renderEngine?.bindTexture(path);
  }

  setRenderManager(m: RenderManager): void {
    this.renderManager = m;
  }

  /** Shadow and fire overlays (not ported yet). */
  doRenderShadowAndFire(_e: Entity, _x: number, _y: number, _z: number, _yaw: number, _pt: number): void {}
}
