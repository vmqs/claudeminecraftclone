import { Block } from '../../block/Block';
import { BlockIds, ItemIds } from '../../block/BlockIds';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { EntityItem } from '../../entity/EntityItem';
import { DIRECTION_OFFSET_X, DIRECTION_OFFSET_Z } from '../../entity/EntityHanging';
import type { EntityItemFrame } from '../../entity/EntityItemFrame';
import { GL } from '../gl/GL';
import { RenderBlocks } from '../RenderBlocks';
import type { Icon, IconRegister } from '../texture/Icon';
import { Render } from './Render';
import { RenderItem } from './RenderItem';
import { RenderManager } from './RenderManager';

const f = Math.fround;

/**
 * RenderItemFrame: the frame as five thin planks boxes (birch-plank border around the
 * "itemframe_back" leather), and the framed item drawn by RenderItem in frame mode, turned by
 * quarter steps.
 */
export class RenderItemFrame extends Render {
  private readonly frameBlocks = new RenderBlocks();
  private backIcon: Icon | null = null;

  override updateIcons(reg: IconRegister): void {
    this.backIcon = reg.registerIcon('itemframe_back');
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    const frame = e as EntityItemFrame;
    GL.pushMatrix();
    const ox = f(f(frame.posX - x) - f(0.5));
    const oy = f(f(frame.posY - y) - f(0.5));
    const oz = f(f(frame.posZ - z) - f(0.5));
    const bx = frame.xPosition + DIRECTION_OFFSET_X[frame.hangingDirection];
    const by = frame.yPosition;
    const bz = frame.zPosition + DIRECTION_OFFSET_Z[frame.hangingDirection];
    GL.translate(f(bx - ox), f(by - oy), f(bz - oz));
    this.renderFrame(frame);
    this.renderFramedItem(frame);
    GL.popMatrix();
  }

  private renderFrame(frame: EntityItemFrame): void {
    const planks = Block.blocksList[BlockIds.planks];
    if (!planks) return;
    const rb = this.frameBlocks;
    GL.pushMatrix();
    this.renderManager.renderEngine!.bindTexture('/terrain.png');
    GL.rotate(frame.rotationYaw, 0, 1, 0);
    const px = f(0.0625);
    const half = f(f(0.75) / 2);
    GL.pushMatrix();
    rb.overrideBlockBounds(0, f(f(f(0.5) - half) + px), f(f(f(0.5) - half) + px), f(px * f(0.5)), f(f(f(0.5) + half) - px), f(f(f(0.5) + half) - px));
    if (this.backIcon) rb.setOverrideBlockTexture(this.backIcon);
    rb.renderBlockAsItem(planks, 0, 1);
    rb.clearOverrideBlockTexture();
    rb.unlockBlockBounds();
    GL.popMatrix();
    rb.setOverrideBlockTexture(planks.getIcon(1, 2));
    const border = (y0: number, z0: number, x1: number, y1: number, z1: number) => {
      GL.pushMatrix();
      rb.overrideBlockBounds(0, y0, z0, x1, y1, z1);
      rb.renderBlockAsItem(planks, 0, 1);
      GL.popMatrix();
    };
    const lo = f(f(0.5) - half);
    const hi = f(f(0.5) + half);
    border(lo, lo, f(px + f(1.0e-4)), f(px + lo), hi);
    border(f(hi - px), lo, f(px + f(1.0e-4)), hi, hi);
    border(lo, lo, px, hi, f(px + lo));
    border(lo, f(hi - px), px, hi, hi);
    rb.unlockBlockBounds();
    rb.clearOverrideBlockTexture();
    GL.popMatrix();
  }

  private renderFramedItem(frame: EntityItemFrame): void {
    const stack = frame.getDisplayedItem();
    if (!stack) return;
    const item = new EntityItem(frame.worldObj, 0, 0, 0, stack.copy());
    item.getEntityItem().stackSize = 1;
    item.hoverStart = 0;
    GL.pushMatrix();
    const d = frame.hangingDirection;
    GL.translate(f(f(-0.453125) * DIRECTION_OFFSET_X[d]), f(-0.18), f(f(-0.453125) * DIRECTION_OFFSET_Z[d]));
    GL.rotate(f(180 + frame.rotationYaw), 0, 1, 0);
    GL.rotate(-90 * frame.getRotation(), 0, 0, 1);
    switch (frame.getRotation()) {
      case 1:
        GL.translate(f(-0.16), f(-0.16), 0);
        break;
      case 2:
        GL.translate(0, f(-0.32), 0);
        break;
      case 3:
        GL.translate(f(0.16), f(-0.16), 0);
        break;
    }
    // A framed compass points at the spawn as seen from the frame's facing, without wobble.
    const compass = stack.itemID === ItemIds.compass ? this.renderManager.renderEngine?.textureMapItems : undefined;
    const icon = compass?.getIcon('compass');
    const saved = icon ? icon.shownFrame : -1;
    if (compass && icon && icon.frames.length > 1) compass.showFrame(icon, compassFrame(frame, icon.frames.length));
    RenderItem.renderInFrame = true;
    RenderManager.instance.renderEntityWithPosYaw(item, 0, 0, 0, 0, 0);
    RenderItem.renderInFrame = false;
    if (compass && icon && saved >= 0) compass.showFrame(icon, saved);
    GL.popMatrix();
  }
}

/**
 * TextureCompass.updateCompass for a compass in a frame (snapping straight to the angle): the
 * needle frame pointing at the world spawn from the frame's position, the frame's facing
 * standing in for the player's yaw.
 */
function compassFrame(frame: EntityItemFrame, frames: number): number {
  const spawn = frame.worldObj.getSpawnPoint();
  const dx = spawn.x - frame.posX;
  const dz = spawn.z - frame.posZ;
  const yaw = MathHelper.wrapAngleTo180_float(180 + frame.hangingDirection * 90) % 360;
  let angle = -(((yaw - 90) * Math.PI) / 180 - Math.atan2(dz, dx));
  // Outside surface worlds (the Nether, the End) the needle points anywhere.
  if (!frame.worldObj.provider.isSurfaceWorld()) angle = Math.random() * Math.PI * 2;
  let i = Math.trunc((angle / (Math.PI * 2) + 1) * frames) % frames;
  while (i < 0) i = (i + frames) % frames;
  return i;
}
