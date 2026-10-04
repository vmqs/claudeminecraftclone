import { Vec3 } from './Vec3';
import type { Entity } from '../entity/Entity';

export enum EnumMovingObjectType {
  TILE = 0,
  ENTITY = 1,
}

export class MovingObjectPosition {
  typeOfHit: EnumMovingObjectType;
  blockX = 0;
  blockY = 0;
  blockZ = 0;
  /** Facing index of the face that was hit (0 down .. 5 east), -1 for entities. */
  sideHit = -1;
  hitVec: Vec3;
  entityHit: Entity | null = null;

  private constructor(type: EnumMovingObjectType, hitVec: Vec3) {
    this.typeOfHit = type;
    this.hitVec = hitVec;
  }

  static forBlock(x: number, y: number, z: number, side: number, hit: Vec3): MovingObjectPosition {
    const m = new MovingObjectPosition(EnumMovingObjectType.TILE, new Vec3(hit.xCoord, hit.yCoord, hit.zCoord));
    m.blockX = x;
    m.blockY = y;
    m.blockZ = z;
    m.sideHit = side;
    return m;
  }

  static forEntity(entity: Entity): MovingObjectPosition {
    const m = new MovingObjectPosition(EnumMovingObjectType.ENTITY, new Vec3(entity.posX, entity.posY, entity.posZ));
    m.entityHit = entity;
    return m;
  }
}
