import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Factory for EntityFallingSand, installed by the entity code (null = fall instantly). */
export type FallingBlockFactory = (w: IWorld, x: number, y: number, z: number, id: number, meta: number) => Entity;

export class BlockSand extends Block {
  /** Set during world generation so sand drops straight down instead of spawning entities. */
  static fallInstantly = false;
  static createFallingEntity: FallingBlockFactory | null = null;

  constructor(id: number, material: Material = Material.sand) {
    super(id, material);
    if (material === Material.sand) this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isRemote) this.tryToFall(w, x, y, z);
  }

  private tryToFall(w: IWorld, x: number, y: number, z: number): void {
    if (!BlockSand.canFallBelow(w, x, y - 1, z) || y < 0) return;
    const r = 32;
    if (BlockSand.fallInstantly || !BlockSand.createFallingEntity || !w.checkChunksExist(x - r, y - r, z - r, x + r, y + r, z + r)) {
      w.setBlockToAir(x, y, z);
      while (BlockSand.canFallBelow(w, x, y - 1, z) && y > 0) y--;
      if (y > 0) w.setBlock(x, y, z, this.blockID);
    } else if (!w.isRemote) {
      const e = BlockSand.createFallingEntity(w, x + 0.5, y + 0.5, z + 0.5, this.blockID, w.getBlockMetadata(x, y, z));
      this.onStartFalling(e);
      w.spawnEntityInWorld(e);
    }
  }

  protected onStartFalling(_e: Entity): void {}

  override tickRate(_w: IWorld): number {
    return 2;
  }

  static canFallBelow(w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === 0 || id === BlockIds.fire) return true;
    const m = Block.blocksList[id]!.blockMaterial;
    return m === Material.water || m === Material.lava;
  }

  onFinishFalling(_w: IWorld, _x: number, _y: number, _z: number, _meta: number): void {}
}
