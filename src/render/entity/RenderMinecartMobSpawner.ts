import { BlockIds } from '../../block/BlockIds';
import type { Block } from '../../block/Block';
import { EntityList } from '../../entity/EntityList';
import type { EntityMinecart } from '../../entity/EntityMinecart';
import type { EntityMinecartMobSpawner } from '../../entity/EntityMinecartMobSpawner';
import { GL } from '../gl/GL';
import { RenderManager } from './RenderManager';
import { RenderMinecart } from './RenderMinecart';

const f = Math.fround;

/** RenderMinecartMobSpawner: the spawner block with its small spinning mob (TileEntityMobSpawnerRenderer). */
export class RenderMinecartMobSpawner extends RenderMinecart {
  protected override renderBlockInMinecart(cart: EntityMinecart, pt: number, block: Block, data: number): void {
    super.renderBlockInMinecart(cart, pt, block, data);
    if (block.blockID !== BlockIds.mobSpawner) return;
    const logic = (cart as EntityMinecartMobSpawner).mobSpawnerLogic;
    logic.displayEntity ??= EntityList.createEntityByName(logic.mobID, cart.worldObj);
    const mob = logic.displayEntity;
    if (!mob) return;
    mob.setWorld(cart.worldObj);
    const s = f(0.4375);
    GL.translate(0, f(0.4), 0);
    GL.rotate(f(f(logic.prevMobRotation + (logic.mobRotation - logic.prevMobRotation) * pt) * 10), 0, 1, 0);
    GL.rotate(-30, 1, 0, 0);
    GL.translate(0, f(-0.4), 0);
    GL.scale(s, s, s);
    mob.setLocationAndAngles(cart.posX, cart.posY, cart.posZ, 0, 0);
    RenderManager.instance.renderEntityWithPosYaw(mob, 0, 0, 0, 0, pt);
  }
}
