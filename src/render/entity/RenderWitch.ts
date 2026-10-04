import { Block } from '../../block/Block';
import { ItemIds } from '../../block/BlockIds';
import type { EntityLiving } from '../../entity/EntityLiving';
import { Item } from '../../item/Item';
import { GL } from '../gl/GL';
import { RenderBlocks } from '../RenderBlocks';
import { ModelWitch } from './ModelWitch';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;
const SCALE = f(0.0625);

/**
 * Witches (RenderWitch): drawn at 0.9375 scale; the held potion hangs from the nose (which
 * tips up while she holds it), placed like a biped's held item but rotated -15/40 degrees.
 */
export class RenderWitch extends RenderLiving {
  private witchModel: ModelWitch;
  private modelVersion: number;

  constructor() {
    super(new ModelWitch(0), 0.5);
    this.witchModel = this.mainModel as ModelWitch;
    this.modelVersion = this.witchModel.getModelVersion();
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    const held = e.getHeldItem();
    if (this.witchModel.getModelVersion() !== this.modelVersion) {
      this.mainModel = this.witchModel = new ModelWitch(0);
      this.modelVersion = this.witchModel.getModelVersion();
    }
    this.witchModel.holdingItem = held !== null;
    super.doRenderLiving(e, x, y, z, yaw, pt);
  }

  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    GL.color(1, 1, 1);
    super.renderEquippedItems(e, pt);
    const held = e.getHeldItem();
    if (!held) return;
    GL.pushMatrix();
    if (this.mainModel.isChild) {
      const s = f(0.5);
      GL.translate(0, f(0.625), 0);
      GL.rotate(-20, -1, 0, 0);
      GL.scale(s, s, s);
    }
    this.witchModel.villagerNose.postRender(SCALE);
    GL.translate(-SCALE, f(0.53125), f(0.21875));
    const item = Item.itemsList[held.itemID]!;
    if (held.itemID < 256 && RenderBlocks.renderItemIn3d(Block.blocksList[held.itemID]!.getRenderType())) {
      const s = f(f(0.5) * f(0.75));
      GL.translate(0, f(0.1875), f(-0.3125));
      GL.rotate(20, 1, 0, 0);
      GL.rotate(45, 0, 1, 0);
      GL.scale(s, -s, s);
    } else if (held.itemID === ItemIds.bow) {
      const s = f(0.625);
      GL.translate(0, f(0.125), f(0.3125));
      GL.rotate(-20, 0, 1, 0);
      GL.scale(s, -s, s);
      GL.rotate(-100, 1, 0, 0);
      GL.rotate(45, 0, 1, 0);
    } else if (item.isFull3D()) {
      const s = f(0.625);
      if (item.shouldRotateAroundWhenRendering()) {
        GL.rotate(180, 0, 0, 1);
        GL.translate(0, f(-0.125), 0);
      }
      GL.translate(0, f(0.1875), 0);
      GL.scale(s, -s, s);
      GL.rotate(-100, 1, 0, 0);
      GL.rotate(45, 0, 1, 0);
    } else {
      const s = f(0.375);
      GL.translate(f(0.25), f(0.1875), f(-0.1875));
      GL.scale(s, s, s);
      GL.rotate(60, 0, 0, 1);
      GL.rotate(-90, 1, 0, 0);
      GL.rotate(20, 0, 0, 1);
    }
    GL.rotate(-15, 1, 0, 0);
    GL.rotate(40, 0, 0, 1);
    this.renderManager.itemRenderer?.renderItem(e, held, 0);
    if (item.requiresMultipleRenderPasses()) this.renderManager.itemRenderer?.renderItem(e, held, 1);
    GL.popMatrix();
  }

  protected override preRenderCallback(_e: EntityLiving, _pt: number): void {
    const s = f(0.9375);
    GL.scale(s, s, s);
  }
}
