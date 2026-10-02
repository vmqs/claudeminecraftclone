import { ItemIds } from '../../block/BlockIds';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { EnumAction } from '../../item/Item';
import { ItemStack } from '../../item/ItemStack';
import { GL } from '../gl/GL';
import { ModelBiped } from './ModelBiped';
import { renderHeadItem, renderHeldItem, setArmorModel, setArmorOverlay } from './RenderBiped';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;
const SCALE = f(0.0625);
const DEG = f(Math.PI / 180);

/**
 * Players (RenderPlayer): /mob/char.png on ModelBiped scaled 0.9375, armour layers, helmet
 * item, the cape, the held item (blocking and bow poses) and the first-person arm. The local
 * player is drawn only in the third-person views (RenderGlobal skips it in first person).
 */
export class RenderPlayer extends RenderLiving {
  private readonly modelBipedMain: ModelBiped;
  private readonly modelArmorChestplate = new ModelBiped(1);
  private readonly modelArmor = new ModelBiped(0.5);
  /** Cape texture of the local player, or null for none (there are no skin servers). */
  static capeTexture: string | null = null;

  constructor() {
    super(new ModelBiped(0), 0.5);
    this.modelBipedMain = this.mainModel as ModelBiped;
  }

  bindTexture(path: string): void {
    this.loadTexture(path);
  }

  override doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    this.renderPlayer(e as EntityPlayer, x, y, z, yaw, pt);
  }

  renderPlayer(p: EntityPlayer, x: number, y: number, z: number, yaw: number, pt: number): void {
    GL.color(1, 1, 1);
    const models = [this.modelArmorChestplate, this.modelArmor, this.modelBipedMain];
    const held = p.inventory.getCurrentItem();
    for (const m of models) m.heldItemRight = held ? 1 : 0;
    if (held && p.getItemInUseCount() > 0) {
      const action = held.getItemUseAction();
      if (action === EnumAction.block) for (const m of models) m.heldItemRight = 3;
      else if (action === EnumAction.bow) for (const m of models) m.aimedBow = true;
    }
    for (const m of models) m.isSneak = p.isSneaking();
    let yy = y - p.yOffset;
    if (p.isSneaking() && p !== this.renderManager.livingPlayer) yy -= 0.125;
    this.doRenderLiving(p, x, yy, z, yaw, pt);
    for (const m of models) {
      m.aimedBow = false;
      m.isSneak = false;
      m.heldItemRight = 0;
    }
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    return setArmorModel(this, (e as EntityPlayer).inventory.armorItemInSlot(3 - pass), pass, this.modelArmorChestplate, this.modelArmor, this.modelBipedMain);
  }

  protected override renderOverlayPass(e: EntityLiving, pass: number, _pt: number): void {
    setArmorOverlay(this, (e as EntityPlayer).inventory.armorItemInSlot(3 - pass), pass);
  }

  /** renderSpecials: helmet item, cape and held item. */
  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    const p = e as EntityPlayer;
    GL.color(1, 1, 1);
    super.renderEquippedItems(p, pt);
    this.renderArrowsStuckInEntity(p, pt);
    renderHeadItem(this, p, p.inventory.armorItemInSlot(3), this.modelBipedMain);
    if (RenderPlayer.capeTexture && !p.isInvisible()) {
      this.loadTexture(RenderPlayer.capeTexture);
      this.renderCape(p, pt);
    }
    let held = p.inventory.getCurrentItem();
    if (held) {
      // While the line is out, a fishing rod is drawn as a plain stick.
      if (p.fishEntity) held = new ItemStack(ItemIds.stick, 1, 0);
      renderHeldItem(this, p, held, this.modelBipedMain, p.getItemInUseCount() > 0 ? held.getItemUseAction() : null);
    }
  }

  /** renderPlayerSleep: a sleeping body is moved towards the foot of the bed. */
  protected override renderLivingAt(e: EntityLiving, x: number, y: number, z: number): void {
    const p = e as EntityPlayer;
    if (p.isEntityAlive() && p.isPlayerSleeping()) super.renderLivingAt(p, x + p.sleepOffsetX, y + p.sleepOffsetY, z + p.sleepOffsetZ);
    else super.renderLivingAt(p, x, y, z);
  }

  /** rotatePlayer: a sleeping body lies on its back along the bed. */
  protected override rotateCorpse(e: EntityLiving, age: number, bodyYaw: number, pt: number): void {
    const p = e as EntityPlayer;
    if (p.isEntityAlive() && p.isPlayerSleeping()) {
      GL.rotate(p.getBedOrientationInDegrees(), 0, 1, 0);
      GL.rotate(this.getDeathMaxRotation(p), 0, 0, 1);
      GL.rotate(270, 0, 1, 0);
    } else {
      super.rotateCorpse(p, age, bodyYaw, pt);
    }
  }

  /** The cape swings behind with the chasing point, the walk bob and sneaking. */
  private renderCape(p: EntityPlayer, pt: number): void {
    GL.pushMatrix();
    GL.translate(0, 0, f(0.125));
    const dx = p.prevChasingPosX + (p.chasingPosX - p.prevChasingPosX) * pt - (p.prevPosX + (p.posX - p.prevPosX) * pt);
    const dy = p.prevChasingPosY + (p.chasingPosY - p.prevChasingPosY) * pt - (p.prevPosY + (p.posY - p.prevPosY) * pt);
    const dz = p.prevChasingPosZ + (p.chasingPosZ - p.prevChasingPosZ) * pt - (p.prevPosZ + (p.posZ - p.prevPosZ) * pt);
    const body = f(p.prevRenderYawOffset + (p.renderYawOffset - p.prevRenderYawOffset) * pt);
    const s = MathHelper.sin(f(body * DEG));
    const c = -MathHelper.cos(f(body * DEG));
    let lift = f(f(dy) * 10);
    if (lift < -6) lift = -6;
    if (lift > 32) lift = 32;
    let swing = f(f(dx * s + dz * c) * 100);
    const sideways = f(f(dx * c - dz * s) * 100);
    if (swing < 0) swing = 0;
    const bob = f(p.prevCameraYaw + (p.cameraYaw - p.prevCameraYaw) * pt);
    lift = f(lift + f(f(MathHelper.sin(f(f(p.prevDistanceWalkedModified + (p.distanceWalkedModified - p.prevDistanceWalkedModified) * pt) * 6)) * 32) * bob));
    if (p.isSneaking()) lift = f(lift + 25);
    GL.rotate(f(f(6 + f(swing / 2)) + lift), 1, 0, 0);
    GL.rotate(f(sideways / 2), 0, 0, 1);
    GL.rotate(f(-sideways / 2), 0, 1, 0);
    GL.rotate(180, 0, 1, 0);
    this.modelBipedMain.renderCloak(SCALE);
    GL.popMatrix();
  }

  /** renderPlayerScale */
  protected override preRenderCallback(_e: EntityLiving, _pt: number): void {
    const s = f(0.9375);
    GL.scale(s, s, s);
  }

  /** The right arm alone, for the first-person view. */
  renderFirstPersonArm(p: EntityPlayer): void {
    GL.color(1, 1, 1);
    this.modelBipedMain.onGround = 0;
    this.modelBipedMain.setRotationAngles(0, 0, 0, 0, 0, SCALE, p);
    this.modelBipedMain.bipedRightArm.render(SCALE);
  }
}
