import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/** Soul sand (88): a collision box 1/8 lower than the block, and it slows whatever walks in it. */
export class BlockSoulSand extends Block {
  constructor(id: number) {
    super(id, Material.sand);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const inset = Math.fround(0.125);
    return AxisAlignedBB.getBoundingBox(x, y, z, x + 1, Math.fround(y + 1 - inset), z + 1);
  }

  override onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, e: Entity): void {
    e.motionX *= 0.4;
    e.motionZ *= 0.4;
  }
}
