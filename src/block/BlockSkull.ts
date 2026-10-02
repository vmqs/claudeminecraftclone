import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import { EntityList } from '../entity/EntityList';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntitySkull } from '../world/tileentity/TileEntitySkull';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/**
 * Mob heads (144, drawn by the skull renderer): meta & 7 = 1 on the floor or 2-5 on a wall,
 * bit 8 = broken in creative (no drop). The head type and rotation live in TileEntitySkull.
 * Three wither skeleton skulls on a T of soul sand build a wither.
 */
export class BlockSkull extends BlockContainer {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setBlockBounds(0.25, 0, 0.25, 0.75, 0.5, 0.75);
  }

  override getRenderType(): number {
    return -1;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    switch (w.getBlockMetadata(x, y, z) & 7) {
      case 2:
        this.setBlockBounds(0.25, 0.25, 0.5, 0.75, 0.75, 1);
        break;
      case 3:
        this.setBlockBounds(0.25, 0.25, 0, 0.75, 0.75, 0.5);
        break;
      case 4:
        this.setBlockBounds(0.5, 0.25, 0.25, 1, 0.75, 0.75);
        break;
      case 5:
        this.setBlockBounds(0, 0.25, 0.25, 0.5, 0.75, 0.75);
        break;
      default:
        this.setBlockBounds(0.25, 0, 0.25, 0.75, 0.5, 0.75);
    }
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, Block.yawToDirection(e, 2.5), 2);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntitySkull();
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.skull;
  }

  override getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    return te instanceof TileEntitySkull ? te.getSkullType() : super.getDamageValue(w, x, y, z);
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  /** Drops happen in breakBlock (with the owner's name for player heads). */
  override dropBlockAsItemWithChance(_w: IWorld, _x: number, _y: number, _z: number, _meta: number, _chance: number, _fortune: number): void {}

  /** In creative the head is marked (bit 8) so breaking it drops nothing. */
  override onBlockHarvested(w: IWorld, x: number, y: number, z: number, meta: number, p: EntityPlayer): void {
    if (p.capabilities.isCreativeMode) {
      meta |= 8;
      w.setBlockMetadataWithNotify(x, y, z, meta, 4);
    }
    super.onBlockHarvested(w, x, y, z, meta, p);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    if (w.isRemote) return;
    if ((meta & 8) === 0) {
      const stack = new ItemStack(ItemIds.skull, 1, this.getDamageValue(w, x, y, z));
      const te = w.getBlockTileEntity(x, y, z);
      if (te instanceof TileEntitySkull && te.getSkullType() === 3 && te.getExtraType().length > 0) stack.setTagCompound({ SkullOwner: te.getExtraType() });
      this.dropBlockAsItem_do(w, x, y, z, stack);
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.skull;
  }

  /** ItemSkull calls this after placing a wither skeleton skull. */
  makeWither(w: IWorld, x: number, y: number, z: number, te: TileEntitySkull): void {
    const difficulty = (w as unknown as { difficultySetting?: number }).difficultySetting ?? 2;
    if (te.getSkullType() !== 1 || y < 2 || difficulty <= 0 || w.isRemote) return;
    const sand = BlockIds.slowSand;
    for (let d = -2; d <= 0; d++) {
      if (
        w.getBlockId(x, y - 1, z + d) === sand &&
        w.getBlockId(x, y - 1, z + d + 1) === sand &&
        w.getBlockId(x, y - 2, z + d + 1) === sand &&
        w.getBlockId(x, y - 1, z + d + 2) === sand &&
        this.isWitherSkull(w, x, y, z + d) &&
        this.isWitherSkull(w, x, y, z + d + 1) &&
        this.isWitherSkull(w, x, y, z + d + 2)
      ) {
        this.buildWither(w, [[x, y, z + d], [x, y, z + d + 1], [x, y, z + d + 2]], [[x, y - 1, z + d], [x, y - 1, z + d + 1], [x, y - 1, z + d + 2], [x, y - 2, z + d + 1]], x + 0.5, y - 1.45, z + d + 1.5, 90, x, z + d + 1);
        return;
      }
    }
    for (let d = -2; d <= 0; d++) {
      if (
        w.getBlockId(x + d, y - 1, z) === sand &&
        w.getBlockId(x + d + 1, y - 1, z) === sand &&
        w.getBlockId(x + d + 1, y - 2, z) === sand &&
        w.getBlockId(x + d + 2, y - 1, z) === sand &&
        this.isWitherSkull(w, x + d, y, z) &&
        this.isWitherSkull(w, x + d + 1, y, z) &&
        this.isWitherSkull(w, x + d + 2, y, z)
      ) {
        this.buildWither(w, [[x + d, y, z], [x + d + 1, y, z], [x + d + 2, y, z]], [[x + d, y - 1, z], [x + d + 1, y - 1, z], [x + d + 2, y - 1, z], [x + d + 1, y - 2, z]], x + d + 1.5, y - 1.45, z + 0.5, 0, x + d + 1, z);
        return;
      }
    }
  }

  private buildWither(w: IWorld, skulls: number[][], body: number[][], ex: number, ey: number, ez: number, yaw: number, px: number, pz: number): void {
    for (const [sx, sy, sz] of skulls) w.setBlockMetadataWithNotify(sx, sy, sz, 8, 2);
    for (const [sx, sy, sz] of [...skulls, ...body]) w.setBlock(sx, sy, sz, 0, 0, 2);
    const wither = EntityList.createEntityByName('WitherBoss', w as unknown as World);
    if (wither) {
      wither.setLocationAndAngles(ex, ey, ez, yaw, 0);
      if (yaw !== 0) (wither as unknown as { renderYawOffset: number }).renderYawOffset = yaw;
      const init = wither as unknown as { func_82206_m?: () => void; initWitherSpawn?: () => void };
      if (init.initWitherSpawn) init.initWitherSpawn();
      else init.func_82206_m?.();
      w.spawnEntityInWorld(wither);
    }
    const [, y] = skulls[0];
    for (let i = 0; i < 120; i++) w.spawnParticle('snowballpoof', px + w.rand.nextDouble(), y - 2 + w.rand.nextDouble() * 3.9, pz + w.rand.nextDouble(), 0, 0, 0);
    for (const [sx, sy, sz] of [...skulls, ...body]) w.notifyBlocksOfNeighborChange(sx, sy, sz, 0);
  }

  /** func_82528_d */
  private isWitherSkull(w: IWorld, x: number, y: number, z: number): boolean {
    if (w.getBlockId(x, y, z) !== this.blockID) return false;
    const te = w.getBlockTileEntity(x, y, z);
    return te instanceof TileEntitySkull && te.getSkullType() === 1;
  }

  override registerIcons(_reg: IconRegister): void {}

  override getIcon(side: number, _meta: number): Icon | null {
    return Block.blocksList[BlockIds.slowSand]!.getBlockTextureFromSide(side);
  }

  override getItemIconName(): string | null {
    return 'skull_skeleton';
  }
}
