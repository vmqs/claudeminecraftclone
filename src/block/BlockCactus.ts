import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { DamageSource } from '../entity/DamageSource';
import type { Entity } from '../entity/Entity';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

export class BlockCactus extends Block {
  private cactusTopIcon: Icon | null = null;
  private cactusBottomIcon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.cactus);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isAirBlock(x, y + 1, z)) return;
    let h = 1;
    while (w.getBlockId(x, y - h, z) === this.blockID) h++;
    if (h < 3) {
      const meta = w.getBlockMetadata(x, y, z);
      if (meta === 15) {
        w.setBlock(x, y + 1, z, this.blockID);
        w.setBlockMetadataWithNotify(x, y, z, 0, 4);
        this.onNeighborBlockChange(w, x, y + 1, z, this.blockID);
      } else {
        w.setBlockMetadataWithNotify(x, y, z, meta + 1, 4);
      }
    }
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const f = 0.0625;
    return AxisAlignedBB.getBoundingBox(x + f, y, z + f, x + 1 - f, y + 1 - f, z + 1 - f);
  }

  override getSelectedBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    const f = 0.0625;
    return AxisAlignedBB.getBoundingBox(x + f, y, z + f, x + 1 - f, y + 1, z + 1 - f);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    if (side === 1) return this.cactusTopIcon;
    return side === 0 ? this.cactusBottomIcon : this.blockIcon;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 13;
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return !super.canPlaceBlockAt(w, x, y, z) ? false : this.canBlockStay(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!this.canBlockStay(w, x, y, z)) w.destroyBlock(x, y, z, true);
  }

  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    if (w.getBlockMaterial(x - 1, y, z).isSolid()) return false;
    if (w.getBlockMaterial(x + 1, y, z).isSolid()) return false;
    if (w.getBlockMaterial(x, y, z - 1).isSolid()) return false;
    if (w.getBlockMaterial(x, y, z + 1).isSolid()) return false;
    const below = w.getBlockId(x, y - 1, z);
    return below === BlockIds.cactus || below === BlockIds.sand;
  }

  override onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, e: Entity): void {
    e.attackEntityFrom(DamageSource.cactus, 1);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('cactus_side');
    this.cactusTopIcon = reg.registerIcon('cactus_top');
    this.cactusBottomIcon = reg.registerIcon('cactus_bottom');
  }
}
