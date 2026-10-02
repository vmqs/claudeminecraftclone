import { BlockChest } from '../../block/BlockChest';
import type { IWorld } from '../../world/IWorld';
import type { TileEntity } from '../../world/tileentity/TileEntity';
import type { TileEntityChest } from '../../world/tileentity/TileEntityChest';
import type { TileEntityEnderChest } from '../../world/tileentity/TileEntityEnderChest';
import { GL } from '../gl/GL';
import { ModelChest, ModelLargeChest } from './TileEntityModels';
import { TileEntitySpecialRenderer } from './TileEntitySpecialRenderer';

const f = Math.fround;

/** Y rotation of a chest model for its facing metadata (2 north, 3 south, 4 west, 5 east). */
function chestYaw(meta: number): number {
  if (meta === 2) return 180;
  if (meta === 4) return 90;
  if (meta === 5) return -90;
  return 0;
}

/** Eases the lid: 0 shut, 1 fully open, quick at first like 1.5.2 (1 - (1 - a)^3). */
function lidRotation(angle: number): number {
  let a = f(1 - angle);
  a = f(1 - f(f(a * a) * a));
  return -f(f(a * f(Math.PI)) / 2);
}

/** Moves to the block corner and flips into model space (y down, z toward the back). */
function enterChestSpace(x: number, y: number, z: number): void {
  GL.enable(GL.RESCALE_NORMAL);
  GL.color(1, 1, 1, 1);
  GL.translate(f(x), f(f(y) + 1), f(f(z) + 1));
  GL.scale(1, -1, -1);
  GL.translate(0.5, 0.5, 0.5);
}

/**
 * TileEntityChestRenderer: single and double chests (the double drawn by its west / north
 * half), normal, trapped or, from 24 to 26 December, Christmas textures, with the lid opening.
 */
export class TileEntityChestRenderer extends TileEntitySpecialRenderer {
  private readonly chestModel = new ModelChest();
  private readonly largeChestModel = new ModelLargeChest();
  private readonly isChristmas: boolean;

  constructor(now = new Date()) {
    super();
    this.isChristmas = now.getMonth() + 1 === 12 && now.getDate() >= 24 && now.getDate() <= 26;
  }

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    const chest = te as TileEntityChest;
    let meta = 0;
    if (chest.hasWorldObj()) {
      const block = chest.getBlockType();
      meta = chest.getBlockMetadata();
      if (block instanceof BlockChest && meta === 0) {
        block.unifyAdjacentChests(chest.getWorldObj() as IWorld, chest.xCoord, chest.yCoord, chest.zCoord);
        meta = chest.getBlockMetadata();
      }
      chest.checkForAdjacentChests();
    }
    if (chest.adjacentChestZNeg !== null || chest.adjacentChestXNeg !== null) return;
    const single = chest.adjacentChestXPos === null && chest.adjacentChestZPosition === null;
    const model = single ? this.chestModel : this.largeChestModel;
    const trapped = chest.getChestType() === 1;
    if (single) this.bindTextureByName(trapped ? '/item/chests/trap_small.png' : this.isChristmas ? '/item/xmaschest.png' : '/item/chest.png');
    else this.bindTextureByName(trapped ? '/item/chests/trap_large.png' : this.isChristmas ? '/item/largexmaschest.png' : '/item/largechest.png');
    GL.pushMatrix();
    enterChestSpace(x, y, z);
    if (meta === 2 && chest.adjacentChestXPos !== null) GL.translate(1, 0, 0);
    if (meta === 5 && chest.adjacentChestZPosition !== null) GL.translate(0, 0, -1);
    GL.rotate(chestYaw(meta), 0, 1, 0);
    GL.translate(-0.5, -0.5, -0.5);
    // 1.5.2 also takes the larger lid angle of the west / north half here, but only the
    // west / north half gets this far, so those links are always empty.
    const lid = f(chest.prevLidAngle + f((chest.lidAngle - chest.prevLidAngle) * pt));
    model.chestLid.rotateAngleX = lidRotation(lid);
    model.renderAll();
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
    GL.color(1, 1, 1, 1);
  }
}

/** TileEntityEnderChestRenderer: the single chest model with the ender texture. */
export class TileEntityEnderChestRenderer extends TileEntitySpecialRenderer {
  private readonly model = new ModelChest();

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    const chest = te as TileEntityEnderChest;
    const meta = chest.hasWorldObj() ? chest.getBlockMetadata() : 0;
    this.bindTextureByName('/item/enderchest.png');
    GL.pushMatrix();
    enterChestSpace(x, y, z);
    GL.rotate(chestYaw(meta), 0, 1, 0);
    GL.translate(-0.5, -0.5, -0.5);
    this.model.chestLid.rotateAngleX = lidRotation(f(chest.prevLidAngle + f((chest.lidAngle - chest.prevLidAngle) * pt)));
    this.model.renderAll();
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
    GL.color(1, 1, 1, 1);
  }
}
