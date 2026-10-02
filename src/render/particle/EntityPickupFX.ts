import type { Entity } from '../../entity/Entity';
import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import type { Tessellator } from '../gl/Tessellator';
import { OpenGlHelper } from '../OpenGlHelper';
import { RenderManager } from '../entity/RenderManager';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** The picked-up item flying into the player over 3 ticks (drawn with its entity renderer). */
export class EntityPickupFX extends EntityFX {
  private age = 0;
  private readonly maxAge = 3;

  constructor(
    w: World,
    private readonly entityToPickUp: Entity,
    private readonly entityPickingUp: Entity,
    private readonly yOffs: number,
  ) {
    super(w, entityToPickUp.posX, entityToPickUp.posY, entityToPickUp.posZ, entityToPickUp.motionX, entityToPickUp.motionY, entityToPickUp.motionZ);
  }

  override renderParticle(_t: Tessellator, pt: number): void {
    let k = f(f(this.age + pt) / this.maxAge);
    k = f(k * k);
    const from = this.entityToPickUp;
    const to = this.entityPickingUp;
    const tx = to.lastTickPosX + (to.posX - to.lastTickPosX) * pt;
    const ty = to.lastTickPosY + (to.posY - to.lastTickPosY) * pt + this.yOffs;
    const tz = to.lastTickPosZ + (to.posZ - to.lastTickPosZ) * pt;
    let x = from.posX + (tx - from.posX) * k;
    let y = from.posY + (ty - from.posY) * k;
    let z = from.posZ + (tz - from.posZ) * k;
    const b = this.getBrightnessForRender(pt);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, b % 65536, Math.trunc(b / 65536));
    GL.color(1, 1, 1, 1);
    x -= EntityFX.interpPosX;
    y -= EntityFX.interpPosY;
    z -= EntityFX.interpPosZ;
    RenderManager.instance.renderEntityWithPosYaw(from, f(x), f(y), f(z), from.rotationYaw, pt);
  }

  override onUpdate(): void {
    if (++this.age === this.maxAge) this.setDead();
  }

  override getFXLayer(): number {
    return 3;
  }
}
