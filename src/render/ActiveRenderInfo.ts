import { Block } from '../block/Block';
import { BlockFluid } from '../block/BlockFluid';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { World } from '../world/World';
import { GL } from './gl/GL';
import { mat4Invert, type Mat4 } from './gl/MatrixStack';

const f = Math.fround;

/** Camera-facing billboard axes and the near-plane centre, captured after the camera transform. */
export const ActiveRenderInfo = {
  objectX: 0,
  objectY: 0,
  objectZ: 0,
  rotationX: 0,
  rotationXZ: 0,
  rotationZ: 0,
  rotationYZ: 0,
  rotationXY: 0,

  updateRenderInfo(player: EntityPlayer, inverted: boolean): void {
    const p = GL.projection.top;
    const m = GL.modelview.top;
    const pm = new Float64Array(16) as Mat4;
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += p[k * 4 + r] * m[c * 4 + k];
        pm[c * 4 + r] = s;
      }
    const inv = mat4Invert(new Float64Array(16) as Mat4, pm);
    if (inv) {
      // gluUnProject of the viewport centre at window depth 0 (NDC z = -1).
      const x = inv[8] * -1 + inv[12];
      const y = inv[9] * -1 + inv[13];
      const z = inv[10] * -1 + inv[14];
      const w = inv[11] * -1 + inv[15];
      this.objectX = f(x / w);
      this.objectY = f(y / w);
      this.objectZ = f(z / w);
    }
    const sign = inverted ? -1 : 1;
    const pitch = player.rotationPitch;
    const yaw = player.rotationYaw;
    const pi = f(Math.PI);
    this.rotationX = f(MathHelper.cos(f(f(yaw * pi) / 180)) * sign);
    this.rotationZ = f(MathHelper.sin(f(f(yaw * pi) / 180)) * sign);
    this.rotationYZ = f(f(-this.rotationZ * MathHelper.sin(f(f(pitch * pi) / 180))) * sign);
    this.rotationXY = f(f(this.rotationX * MathHelper.sin(f(f(pitch * pi) / 180))) * sign);
    this.rotationXZ = MathHelper.cos(f(f(pitch * pi) / 180));
  },

  projectViewFromEntity(e: EntityLiving, pt: number): Vec3 {
    const x = e.prevPosX + (e.posX - e.prevPosX) * pt;
    const y = e.prevPosY + (e.posY - e.prevPosY) * pt + e.getEyeHeight();
    const z = e.prevPosZ + (e.posZ - e.prevPosZ) * pt;
    return new Vec3(x + this.objectX, y + this.objectY, z + this.objectZ);
  },

  /** The block the camera is inside (water/lava fog and overlays). */
  getBlockIdAtEntityViewpoint(w: World, e: EntityLiving, pt: number): number {
    const v = this.projectViewFromEntity(e, pt);
    const x = MathHelper.floor_double(v.xCoord);
    const y = MathHelper.floor_double(v.yCoord);
    const z = MathHelper.floor_double(v.zCoord);
    let id = w.getBlockId(x, y, z);
    const b = Block.blocksList[id];
    if (id !== 0 && b && b.blockMaterial.isLiquid()) {
      const h = f(BlockFluid.getFluidHeightPercent(w.getBlockMetadata(x, y, z)) - f(0.11111111));
      const top = f(y + 1 - h);
      if (v.yCoord >= top) id = w.getBlockId(x, y + 1, z);
    }
    return id;
  },
};
