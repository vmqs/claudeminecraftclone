import type { EntityLiving } from '../../entity/EntityLiving';
import { ModelBlaze } from './ModelBlaze';
import { RenderLiving } from './RenderLiving';

/** Blazes (RenderBlaze): the plain model (rebuilt if its version changes, as in 1.5.2). */
export class RenderBlaze extends RenderLiving {
  private modelVersion: number;

  constructor() {
    super(new ModelBlaze(), 0.5);
    this.modelVersion = (this.mainModel as ModelBlaze).getModelVersion();
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    const v = (this.mainModel as ModelBlaze).getModelVersion();
    if (v !== this.modelVersion) {
      this.modelVersion = v;
      this.mainModel = new ModelBlaze();
    }
    super.doRenderLiving(e, x, y, z, yaw, pt);
  }
}
