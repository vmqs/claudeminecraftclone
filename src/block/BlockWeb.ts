import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

/** Cobweb (30): crossed squares, no collision, slows entities inside; drops string. */
export class BlockWeb extends Block {
  constructor(id: number) {
    super(id, Material.web);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, e: Entity): void {
    e.setInWeb();
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override getRenderType(): number {
    return 1;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.silk;
  }

  protected override canSilkHarvest(): boolean {
    return true;
  }
}
