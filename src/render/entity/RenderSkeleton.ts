import { Block } from '../../block/Block';
import { ItemIds } from '../../block/BlockIds';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntitySkeleton } from '../../entity/EntitySkeleton';
import { Item } from '../../item/Item';
import type { ItemStack } from '../../item/ItemStack';
import { GL } from '../gl/GL';
import { RenderBlocks } from '../RenderBlocks';
import type { ModelBiped } from './ModelBiped';
import { ModelSkeleton } from './ModelSkeleton';
import { RenderBiped, renderHeadItem } from './RenderBiped';
import type { RenderLiving } from './RenderLiving';

const f = Math.fround;
const SCALE = f(0.0625);

/**
 * The held item of a biped mob in its right hand (RenderBiped.renderEquippedItems, second
 * half), with the full-3D tool offset of the renderer (func_82422_c).
 */
export function renderMobHeldItem(r: RenderLiving, e: EntityLiving, held: ItemStack, model: ModelBiped, full3DOffset: readonly [number, number, number]): void {
  GL.pushMatrix();
  if (model.isChild) {
    const s = f(0.5);
    GL.translate(0, f(0.625), 0);
    GL.rotate(-20, -1, 0, 0);
    GL.scale(s, s, s);
  }
  model.bipedRightArm.postRender(SCALE);
  GL.translate(-SCALE, f(0.4375), SCALE);
  const item = Item.itemsList[held.itemID]!;
  if (held.itemID < 256 && RenderBlocks.renderItemIn3d(Block.blocksList[held.itemID]!.getRenderType())) {
    const s = f(f(0.5) * f(0.75));
    GL.translate(0, f(0.1875), f(-0.3125));
    GL.rotate(20, 1, 0, 0);
    GL.rotate(45, 0, 1, 0);
    GL.scale(-s, -s, s);
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
    GL.translate(full3DOffset[0], full3DOffset[1], full3DOffset[2]);
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
  r.renderManager.itemRenderer?.renderItem(e, held, 0);
  if (item.requiresMultipleRenderPasses()) r.renderManager.itemRenderer?.renderItem(e, held, 1);
  GL.popMatrix();
}

/** Skeletons (RenderSkeleton): wither skeletons 1.2x, tools held a little further out. */
export class RenderSkeleton extends RenderBiped {
  private static readonly TOOL_OFFSET = [f(0.09375), f(0.1875), 0] as const;

  constructor() {
    super(new ModelSkeleton(), 0.5);
  }

  protected override preRenderCallback(e: EntityLiving, _pt: number): void {
    if ((e as EntitySkeleton).getSkeletonType() === 1) GL.scale(f(1.2), f(1.2), f(1.2));
  }

  protected override renderEquippedItems(e: EntityLiving, _pt: number): void {
    GL.color(1, 1, 1);
    renderHeadItem(this, e, e.getCurrentArmor(3), this.modelBipedMain);
    const held = e.getHeldItem();
    if (held) renderMobHeldItem(this, e, held, this.modelBipedMain, RenderSkeleton.TOOL_OFFSET);
  }
}
