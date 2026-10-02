import { Block } from '../../block/Block';
import { ItemIds } from '../../block/BlockIds';
import type { EntityLiving } from '../../entity/EntityLiving';
import { EnumAction, Item } from '../../item/Item';
import { ItemStack } from '../../item/ItemStack';
import { GL } from '../gl/GL';
import { RenderBlocks } from '../RenderBlocks';
import { ModelBiped } from './ModelBiped';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;
const SCALE = f(0.0625);

/** /armor/<prefix>_<1|2>.png by ItemArmor.renderIndex. */
export const ARMOR_FILENAME_PREFIX = ['cloth', 'chain', 'iron', 'diamond', 'gold'];

/**
 * Binds the armour texture for render pass `pass` (0 helmet ... 3 boots) and shows only the
 * parts that slot covers (RenderBiped/RenderPlayer.setArmorModel). Returns the pass flags.
 */
export function setArmorModel(r: RenderLiving & { bindTexture(path: string): void }, stack: ItemStack | null, pass: number, chest: ModelBiped, legs: ModelBiped, main: ModelBiped): number {
  if (!stack) return -1;
  const info = stack.getItem().getArmorInfo();
  if (!info) return -1;
  r.bindTexture(`/armor/${ARMOR_FILENAME_PREFIX[info.renderIndex]}_${pass === 2 ? 2 : 1}.png`);
  const m = pass === 2 ? legs : chest;
  m.bipedHead.showModel = pass === 0;
  m.bipedHeadwear.showModel = pass === 0;
  m.bipedBody.showModel = pass === 1 || pass === 2;
  m.bipedRightArm.showModel = pass === 1;
  m.bipedLeftArm.showModel = pass === 1;
  m.bipedRightLeg.showModel = pass === 2 || pass === 3;
  m.bipedLeftLeg.showModel = pass === 2 || pass === 3;
  r.setRenderPassModel(m);
  m.onGround = main.onGround;
  m.isRiding = main.isRiding;
  m.isChild = main.isChild;
  if (info.isCloth) {
    const c = stack.getItem().getArmorColor(stack);
    GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
    return stack.isItemEnchanted() ? 31 : 16;
  }
  GL.color(1, 1, 1);
  return stack.isItemEnchanted() ? 15 : 1;
}

/** The leather overlay layer (func_82439_b). */
export function setArmorOverlay(r: { bindTexture(path: string): void }, stack: ItemStack | null, pass: number): void {
  const info = stack?.getItem().getArmorInfo();
  if (!info) return;
  r.bindTexture(`/armor/${ARMOR_FILENAME_PREFIX[info.renderIndex]}_${pass === 2 ? 2 : 1}_b.png`);
  GL.color(1, 1, 1);
}

/** A pumpkin/block helmet (3D, scaled) or a skull on the head part. */
export function renderHeadItem(r: RenderLiving, e: EntityLiving, head: ItemStack | null, model: ModelBiped): void {
  if (!head) return;
  GL.pushMatrix();
  model.bipedHead.postRender(SCALE);
  if (head.itemID < 256) {
    if (RenderBlocks.renderItemIn3d(Block.blocksList[head.itemID]!.getRenderType())) {
      const s = f(0.625);
      GL.translate(0, f(-0.25), 0);
      GL.rotate(90, 0, 1, 0);
      GL.scale(s, -s, -s);
    }
    r.renderManager.itemRenderer?.renderItem(e, head, 0);
  } else if (head.itemID === ItemIds.skull) {
    // TileEntitySkullRenderer draws skulls; until it exists, nothing is drawn.
    RenderBiped.skullRenderer?.(head, model);
  }
  GL.popMatrix();
}

/** The held item in the right hand: blocks, bows, full-3D tools and flat items differently. */
export function renderHeldItem(r: RenderLiving, e: EntityLiving, held: ItemStack, model: ModelBiped, inUse: EnumAction | null): void {
  GL.pushMatrix();
  if (model.isChild) {
    const s = f(0.5);
    GL.translate(0, f(0.625), 0);
    GL.rotate(-20, -1, 0, 0);
    GL.scale(s, s, s);
  }
  model.bipedRightArm.postRender(SCALE);
  GL.translate(-SCALE, f(0.4375), SCALE);
  // A player with a cast fishing line holds a plain stick (the line hangs from the hook).
  if ((e as { fishEntity?: unknown }).fishEntity) held = new ItemStack(ItemIds.stick);
  const item = Item.itemsList[held.itemID]!;
  if (held.itemID < 256 && RenderBlocks.renderItemIn3d(Block.blocksList[held.itemID]!.getRenderType())) {
    let s = f(0.5);
    GL.translate(0, f(0.1875), f(-0.3125));
    s = f(s * f(0.75));
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
    if (inUse === EnumAction.block) {
      GL.translate(f(0.05), 0, f(-0.1));
      GL.rotate(-50, 0, 1, 0);
      GL.rotate(-10, 1, 0, 0);
      GL.rotate(-60, 0, 0, 1);
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
  const passes = item.requiresMultipleRenderPasses() ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const c = item.getColorFromItemStack(held, pass);
    GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
    r.renderManager.itemRenderer?.renderItem(e, held, pass);
  }
  GL.popMatrix();
}

/** Humanoid mobs (RenderBiped): zombies, skeletons, pig zombies; armour, helmet and held item. */
export class RenderBiped extends RenderLiving {
  /** Draws a skull item worn on the head (installed by the skull tile-entity renderer). */
  static skullRenderer: ((stack: ItemStack, model: ModelBiped) => void) | null = null;
  protected readonly modelBipedMain: ModelBiped;
  protected readonly scaleAmount: number;
  protected modelArmorChestplate!: ModelBiped;
  protected modelArmor!: ModelBiped;

  constructor(model: ModelBiped, shadowSize: number, scale = 1) {
    super(model, shadowSize);
    this.modelBipedMain = model;
    this.scaleAmount = scale;
    this.createArmorModels();
  }

  /** func_82421_b: the armour layer models (zombie villagers use taller ones). */
  protected createArmorModels(): void {
    this.modelArmorChestplate = new ModelBiped(1);
    this.modelArmor = new ModelBiped(0.5);
  }

  bindTexture(path: string): void {
    this.loadTexture(path);
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    return setArmorModel(this, e.getCurrentArmor(3 - pass), pass, this.modelArmorChestplate, this.modelArmor, this.modelBipedMain);
  }

  protected override renderOverlayPass(e: EntityLiving, pass: number, _pt: number): void {
    setArmorOverlay(this, e.getCurrentArmor(3 - pass), pass);
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    GL.color(1, 1, 1);
    this.setHeldItemPose(e, e.getHeldItem());
    let yy = y - e.yOffset;
    if (e.isSneaking() && !e.isPlayerEntity) yy -= 0.125;
    super.doRenderLiving(e, x, yy, z, yaw, pt);
    for (const m of [this.modelArmorChestplate, this.modelArmor, this.modelBipedMain]) {
      m.aimedBow = false;
      m.isSneak = false;
      m.heldItemRight = 0;
    }
  }

  /** func_82420_a */
  protected setHeldItemPose(e: EntityLiving, held: ItemStack | null): void {
    for (const m of [this.modelArmorChestplate, this.modelArmor, this.modelBipedMain]) {
      m.heldItemRight = held ? 1 : 0;
      m.isSneak = e.isSneaking();
    }
  }

  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    GL.color(1, 1, 1);
    super.renderEquippedItems(e, pt);
    renderHeadItem(this, e, e.getCurrentArmor(3), this.modelBipedMain);
    const held = e.getHeldItem();
    if (held) renderHeldItem(this, e, held, this.modelBipedMain, null);
  }
}
