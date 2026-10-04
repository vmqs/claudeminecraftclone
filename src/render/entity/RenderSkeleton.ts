import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntitySkeleton } from '../../entity/EntitySkeleton';
import type { ItemStack } from '../../item/ItemStack';
import { GL } from '../gl/GL';
import type { ModelBiped } from './ModelBiped';
import { ModelSkeleton } from './ModelSkeleton';
import { RenderBiped, renderHeadItem, renderHeldItem } from './RenderBiped';
import type { RenderLiving } from './RenderLiving';

const f = Math.fround;

/**
 * The held item of a biped mob in its right hand with the renderer's full-3D tool offset
 * (func_82422_c); the shared RenderBiped code draws it.
 */
export function renderMobHeldItem(r: RenderLiving, e: EntityLiving, held: ItemStack, model: ModelBiped, full3DOffset: readonly [number, number, number]): void {
  renderHeldItem(r, e, held, model, null, full3DOffset);
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
