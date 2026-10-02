import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockDirectional } from './BlockDirectional';
import { BlockIds, ItemIds } from './BlockIds';
import { BlockLog } from './BlockLog';
import { Material } from './Material';

/** Cocoa pod (127, render type 28): meta & 3 = the side of the jungle log it hangs on, meta >> 2 = age 0-2. */
export class BlockCocoa extends BlockDirectional {
  static readonly cocoaIcons = ['cocoa_0', 'cocoa_1', 'cocoa_2'];
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.plants);
    this.setTickRandomly(true);
  }

  override getIcon(_side: number, _meta: number): Icon | null {
    return this.iconArray[2];
  }

  /** func_94468_i_: the texture for an age. */
  getCocoaIcon(age: number): Icon | null {
    if (age < 0 || age >= this.iconArray.length) age = this.iconArray.length - 1;
    return this.iconArray[age];
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!this.canBlockStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
    // TODO(block-dynamics): growth: otherwise 1 in 5 ticks adds an age (up to 2).
  }

  /** Hangs on the side of a jungle log. */
  override canBlockStay(w: IWorld, x: number, y: number, z: number): boolean {
    const d = BlockDirectional.getDirection(w.getBlockMetadata(x, y, z));
    x += Direction.offsetX[d];
    z += Direction.offsetZ[d];
    return w.getBlockId(x, y, z) === BlockIds.wood && BlockLog.limitToValidMetadata(w.getBlockMetadata(x, y, z)) === 3;
  }

  override getRenderType(): number {
    return 28;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const d = BlockDirectional.getDirection(meta);
    const age = BlockCocoa.getAge(meta);
    const width = 4 + age * 2;
    const height = 5 + age * 2;
    const half = width / 2;
    const f = Math.fround;
    switch (d) {
      case 0:
        this.setBlockBounds(f((8 - half) / 16), f((12 - height) / 16), f((15 - width) / 16), f((8 + half) / 16), 0.75, 0.9375);
        break;
      case 1:
        this.setBlockBounds(0.0625, f((12 - height) / 16), f((8 - half) / 16), f((1 + width) / 16), 0.75, f((8 + half) / 16));
        break;
      case 2:
        this.setBlockBounds(f((8 - half) / 16), f((12 - height) / 16), 0.0625, f((8 + half) / 16), 0.75, f((1 + width) / 16));
        break;
      case 3:
        this.setBlockBounds(f((15 - width) / 16), f((12 - height) / 16), f((8 - half) / 16), 0.9375, 0.75, f((8 + half) / 16));
        break;
    }
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, Block.yawToDirection(e) % 4, 2);
  }

  /** Placed with cocoa beans on the side of a log: it hangs facing back toward the log. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, _hy: number, _hz: number, _meta: number): number {
    if (side === 1 || side === 0) side = 2;
    const dir = (Direction.facingToDirection as readonly number[])[side];
    return (Direction.rotateOpposite as readonly number[])[dir];
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!this.canBlockStay(w, x, y, z)) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  /** func_72219_c */
  static getAge(meta: number): number {
    return (meta & 12) >> 2;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, _chance: number, _fortune: number): void {
    const n = BlockCocoa.getAge(meta) >= 2 ? 3 : 1;
    for (let i = 0; i < n; i++) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(ItemIds.dyePowder, 1, 3));
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.dyePowder;
  }

  override getDamageValue(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 3;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = BlockCocoa.cocoaIcons.map((n) => reg.registerIcon(n));
  }
}
