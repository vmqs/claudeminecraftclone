import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { BlockFlower } from './BlockFlower';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Lily pad (111, render type 23): 1/64 thick on still water, always tinted 0x208030; boats pass through. */
export class BlockLilyPad extends BlockFlower {
  constructor(id: number) {
    super(id);
    const r = 0.5;
    const h = 0.015625;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, h, 0.5 + r);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getRenderType(): number {
    return 23;
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    if (e === null || EntityList.getEntityString(e) !== 'Boat') super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    return AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, y + this.maxY, z + this.maxZ);
  }

  override getBlockColor(): number {
    return 0x208030;
  }

  override getRenderColor(_meta: number): number {
    return 0x208030;
  }

  override colorMultiplier(_w: IBlockAccess, _x: number, _y: number, _z: number): number {
    return 0x208030;
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.waterStill;
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    if (y < 0 || y >= 256) return false;
    return w.getBlockMaterial(x, y - 1, z) === Material.water && w.getBlockMetadata(x, y - 1, z) === 0;
  }
}
