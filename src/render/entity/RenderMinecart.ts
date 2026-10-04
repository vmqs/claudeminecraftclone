import type { Block } from '../../block/Block';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityMinecart } from '../../entity/EntityMinecart';
import { GL } from '../gl/GL';
import { ModelMinecart } from './ModelMinecart';
import { Render } from './Render';

const f = Math.fround;

/** The 64-bit hash of the entity id that jitters each cart by up to 0.002 (no z-fighting between carts). */
function cartJitter(entityId: number): [number, number, number] {
  let h = BigInt.asIntN(64, BigInt(entityId) * 493286711n);
  h = BigInt.asIntN(64, h * h * 4392167121n + h * 98761n);
  const part = (shift: bigint) => f(f(f(f(Number((h >> shift) & 7n)) + f(0.5)) / 8 - f(0.5)) * f(0.004));
  return [part(16n), part(20n), part(24n)];
}

/**
 * RenderMinecart: the cart follows the rail line (position from the rail itself, pitch from
 * the rail 0.3 ahead and behind), wobbles after hits, and shows its block (chest, furnace,
 * TNT, hopper, spawner) at 3/4 size inside.
 */
export class RenderMinecart extends Render {
  protected readonly modelMinecart = new ModelMinecart();

  constructor() {
    super();
    this.shadowSize = f(0.5);
  }

  doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    const cart = e as EntityMinecart;
    GL.pushMatrix();
    const [jx, jy, jz] = cartJitter(cart.entityId);
    GL.translate(jx, jy, jz);
    const cx = cart.lastTickPosX + (cart.posX - cart.lastTickPosX) * pt;
    const cy = cart.lastTickPosY + (cart.posY - cart.lastTickPosY) * pt;
    const cz = cart.lastTickPosZ + (cart.posZ - cart.lastTickPosZ) * pt;
    const look = f(0.3);
    const onRail = cart.getRailPosition(cx, cy, cz);
    let pitch = f(cart.prevRotationPitch + (cart.rotationPitch - cart.prevRotationPitch) * pt);
    if (onRail) {
      const ahead = cart.getRailPositionAhead(cx, cy, cz, look) ?? onRail;
      const behind = cart.getRailPositionAhead(cx, cy, cz, -look) ?? onRail;
      x += onRail.xCoord - cx;
      y += (ahead.yCoord + behind.yCoord) / 2 - cy;
      z += onRail.zCoord - cz;
      let dir = behind.addVector(-ahead.xCoord, -ahead.yCoord, -ahead.zCoord);
      if (dir.lengthVector() !== 0) {
        dir = dir.normalize();
        yaw = f((Math.atan2(dir.zCoord, dir.xCoord) * 180) / Math.PI);
        pitch = f(Math.atan(dir.yCoord) * 73);
      }
    }
    GL.translate(f(x), f(y), f(z));
    GL.rotate(f(180 - yaw), 0, 1, 0);
    GL.rotate(-pitch, 0, 0, 1);
    const roll = f(cart.getRollingAmplitude() - pt);
    let dmg = f(cart.getDamage() - pt);
    if (dmg < 0) dmg = 0;
    if (roll > 0) GL.rotate(f(f(f(f(MathHelper.sin(roll) * roll) * dmg) / 10) * cart.getRollingDirection()), 1, 0, 0);
    const offset = cart.getDisplayTileOffset();
    const block = cart.getDisplayTile();
    const data = cart.getDisplayTileData();
    if (block) {
      GL.pushMatrix();
      this.loadTexture('/terrain.png');
      const s = f(0.75);
      GL.scale(s, s, s);
      GL.translate(0, f(offset / 16), 0);
      this.renderBlockInMinecart(cart, pt, block, data);
      GL.popMatrix();
      GL.color(1, 1, 1, 1);
    }
    this.loadTexture('/item/cart.png');
    GL.scale(-1, -1, 1);
    this.modelMinecart.render(cart, 0, 0, f(-0.1), 0, 0, f(0.0625));
    GL.popMatrix();
  }

  protected renderBlockInMinecart(cart: EntityMinecart, pt: number, block: Block, data: number): void {
    const light = cart.getBrightness(pt);
    GL.pushMatrix();
    this.renderBlocks.renderBlockAsItem(block, data, light);
    GL.popMatrix();
  }
}
