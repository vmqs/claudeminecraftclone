import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { Explosion } from '../world/Explosion';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';

/** For each facing (+4 upside down): the two of the 8 sub-cubes a straight stair leaves empty. */
const EMPTY_OCTANTS = [
  [2, 6],
  [3, 7],
  [2, 3],
  [6, 7],
  [0, 4],
  [1, 5],
  [0, 1],
  [4, 5],
];

/**
 * Stairs (BlockStairs, render type 10): meta & 3 = ascending direction (0 east, 1 west,
 * 2 south, 3 north), bit 4 = upside down. Since 1.5 they form inner and outer corners with
 * neighbouring stairs; collision is the slab plus one or two quarter blocks, and ray tracing
 * hits the individual octants. Everything else defers to the model block.
 */
export class BlockStairs extends Block {
  private readonly modelBlock: Block;
  private readonly modelBlockMetadata: number;
  /** While ray tracing: bounds come from the octant below (field_72156_cr / field_72160_cs). */
  private tracingOctant = false;
  private octant = 0;

  constructor(id: number, model: Block, modelMeta: number) {
    super(id, model.blockMaterial);
    this.modelBlock = model;
    this.modelBlockMetadata = modelMeta;
    this.setHardness(model.getRawHardness());
    this.setResistance(model.getRawResistance() / 3);
    this.setStepSound(model.stepSound);
    this.setLightOpacity(255);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {
    if (this.tracingOctant) {
      const o = this.octant;
      this.setBlockBounds(0.5 * (o % 2), 0.5 * (((o / 2) | 0) % 2), 0.5 * (((o / 4) | 0) % 2), 0.5 + 0.5 * (o % 2), 0.5 + 0.5 * (((o / 2) | 0) % 2), 0.5 + 0.5 * (((o / 4) | 0) % 2));
    } else {
      this.setBlockBounds(0, 0, 0, 1, 1, 1);
    }
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 10;
  }

  /** func_82541_d: the bottom (or, upside down, top) slab. */
  setBaseCollisionBounds(w: IBlockAccess, x: number, y: number, z: number): void {
    if ((w.getBlockMetadata(x, y, z) & 4) !== 0) this.setBlockBounds(0, 0.5, 0, 1, 1, 1);
    else this.setBlockBounds(0, 0, 0, 1, 0.5, 1);
  }

  static isBlockStairsID(id: number): boolean {
    return id > 0 && Block.blocksList[id] instanceof BlockStairs;
  }

  /** func_82540_f: a stair with exactly this metadata at (x, y, z). */
  private isSameStair(w: IBlockAccess, x: number, y: number, z: number, meta: number): boolean {
    return BlockStairs.isBlockStairsID(w.getBlockId(x, y, z)) && w.getBlockMetadata(x, y, z) === meta;
  }

  /**
   * func_82542_g: bounds of the upper step, cut to a quarter for an outer corner. Returns
   * false for an outer corner (no inner-corner piece follows).
   */
  setUpperStepBounds(w: IBlockAccess, x: number, y: number, z: number): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    const dir = meta & 3;
    let minY = 0.5;
    let maxY = 1;
    if ((meta & 4) !== 0) {
      minY = 0;
      maxY = 0.5;
    }
    let minX = 0;
    let maxX = 1;
    let minZ = 0;
    let maxZ = 0.5;
    let straight = true;
    if (dir === 0) {
      minX = 0.5;
      maxZ = 1;
      const id = w.getBlockId(x + 1, y, z);
      const m = w.getBlockMetadata(x + 1, y, z);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 3 && !this.isSameStair(w, x, y, z + 1, meta)) {
          maxZ = 0.5;
          straight = false;
        } else if (d === 2 && !this.isSameStair(w, x, y, z - 1, meta)) {
          minZ = 0.5;
          straight = false;
        }
      }
    } else if (dir === 1) {
      maxX = 0.5;
      maxZ = 1;
      const id = w.getBlockId(x - 1, y, z);
      const m = w.getBlockMetadata(x - 1, y, z);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 3 && !this.isSameStair(w, x, y, z + 1, meta)) {
          maxZ = 0.5;
          straight = false;
        } else if (d === 2 && !this.isSameStair(w, x, y, z - 1, meta)) {
          minZ = 0.5;
          straight = false;
        }
      }
    } else if (dir === 2) {
      minZ = 0.5;
      maxZ = 1;
      const id = w.getBlockId(x, y, z + 1);
      const m = w.getBlockMetadata(x, y, z + 1);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 1 && !this.isSameStair(w, x + 1, y, z, meta)) {
          maxX = 0.5;
          straight = false;
        } else if (d === 0 && !this.isSameStair(w, x - 1, y, z, meta)) {
          minX = 0.5;
          straight = false;
        }
      }
    } else if (dir === 3) {
      const id = w.getBlockId(x, y, z - 1);
      const m = w.getBlockMetadata(x, y, z - 1);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 1 && !this.isSameStair(w, x + 1, y, z, meta)) {
          maxX = 0.5;
          straight = false;
        } else if (d === 0 && !this.isSameStair(w, x - 1, y, z, meta)) {
          minX = 0.5;
          straight = false;
        }
      }
    }
    this.setBlockBounds(minX, minY, minZ, maxX, maxY, maxZ);
    return straight;
  }

  /** func_82544_h: the extra quarter of an inner corner; false (bounds untouched) when there is none. */
  setInnerCornerBounds(w: IBlockAccess, x: number, y: number, z: number): boolean {
    const meta = w.getBlockMetadata(x, y, z);
    const dir = meta & 3;
    let minY = 0.5;
    let maxY = 1;
    if ((meta & 4) !== 0) {
      minY = 0;
      maxY = 0.5;
    }
    let minX = 0;
    let maxX = 0.5;
    let minZ = 0.5;
    let maxZ = 1;
    let corner = false;
    if (dir === 0) {
      const id = w.getBlockId(x - 1, y, z);
      const m = w.getBlockMetadata(x - 1, y, z);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 3 && !this.isSameStair(w, x, y, z - 1, meta)) {
          minZ = 0;
          maxZ = 0.5;
          corner = true;
        } else if (d === 2 && !this.isSameStair(w, x, y, z + 1, meta)) {
          minZ = 0.5;
          maxZ = 1;
          corner = true;
        }
      }
    } else if (dir === 1) {
      const id = w.getBlockId(x + 1, y, z);
      const m = w.getBlockMetadata(x + 1, y, z);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        minX = 0.5;
        maxX = 1;
        const d = m & 3;
        if (d === 3 && !this.isSameStair(w, x, y, z - 1, meta)) {
          minZ = 0;
          maxZ = 0.5;
          corner = true;
        } else if (d === 2 && !this.isSameStair(w, x, y, z + 1, meta)) {
          minZ = 0.5;
          maxZ = 1;
          corner = true;
        }
      }
    } else if (dir === 2) {
      const id = w.getBlockId(x, y, z - 1);
      const m = w.getBlockMetadata(x, y, z - 1);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        minZ = 0;
        maxZ = 0.5;
        const d = m & 3;
        if (d === 1 && !this.isSameStair(w, x - 1, y, z, meta)) {
          corner = true;
        } else if (d === 0 && !this.isSameStair(w, x + 1, y, z, meta)) {
          minX = 0.5;
          maxX = 1;
          corner = true;
        }
      }
    } else if (dir === 3) {
      const id = w.getBlockId(x, y, z + 1);
      const m = w.getBlockMetadata(x, y, z + 1);
      if (BlockStairs.isBlockStairsID(id) && (meta & 4) === (m & 4)) {
        const d = m & 3;
        if (d === 1 && !this.isSameStair(w, x - 1, y, z, meta)) {
          corner = true;
        } else if (d === 0 && !this.isSameStair(w, x + 1, y, z, meta)) {
          minX = 0.5;
          maxX = 1;
          corner = true;
        }
      }
    }
    if (corner) this.setBlockBounds(minX, minY, minZ, maxX, maxY, maxZ);
    return corner;
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    this.setBaseCollisionBounds(w, x, y, z);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    const straight = this.setUpperStepBounds(w, x, y, z);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    if (straight && this.setInnerCornerBounds(w, x, y, z)) super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    this.modelBlock.randomDisplayTick(w, x, y, z, rand);
  }

  override onBlockClicked(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): void {
    this.modelBlock.onBlockClicked(w, x, y, z, p);
  }

  override onBlockDestroyedByPlayer(w: IWorld, x: number, y: number, z: number, meta: number): void {
    this.modelBlock.onBlockDestroyedByPlayer(w, x, y, z, meta);
  }

  override getMixedBrightnessForBlock(w: IBlockAccess, x: number, y: number, z: number): number {
    return this.modelBlock.getMixedBrightnessForBlock(w, x, y, z);
  }

  override getBlockBrightness(w: IBlockAccess, x: number, y: number, z: number): number {
    return this.modelBlock.getBlockBrightness(w, x, y, z);
  }

  override getExplosionResistance(e: Entity | null): number {
    return this.modelBlock.getExplosionResistance(e);
  }

  override getRenderBlockPass(): number {
    return this.modelBlock.getRenderBlockPass();
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return this.modelBlock.getIcon(side, this.modelBlockMetadata);
  }

  override tickRate(w: IWorld): number {
    return this.modelBlock.tickRate(w);
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    return this.modelBlock.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override velocityToAddToEntity(w: IWorld, x: number, y: number, z: number, e: Entity, v: Vec3): void {
    this.modelBlock.velocityToAddToEntity(w, x, y, z, e, v);
  }

  override isCollidable(): boolean {
    return this.modelBlock.isCollidable();
  }

  override canCollideCheck(meta: number, liquids: boolean): boolean {
    return this.modelBlock.canCollideCheck(meta, liquids);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return this.modelBlock.canPlaceBlockAt(w, x, y, z);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    this.onNeighborBlockChange(w, x, y, z, 0);
    this.modelBlock.onBlockAdded(w, x, y, z);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    this.modelBlock.breakBlock(w, x, y, z, id, meta);
  }

  override onEntityWalking(w: IWorld, x: number, y: number, z: number, e: Entity): void {
    this.modelBlock.onEntityWalking(w, x, y, z, e);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    this.modelBlock.updateTick(w, x, y, z, rand);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    return this.modelBlock.onBlockActivated(w, x, y, z, p, 0, 0, 0, 0);
  }

  override onBlockDestroyedByExplosion(w: IWorld, x: number, y: number, z: number, explosion?: Explosion): void {
    this.modelBlock.onBlockDestroyedByExplosion(w, x, y, z, explosion);
  }

  /** The stair ascends away from the placer. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    const dir = Block.yawToDirection(e);
    const upside = w.getBlockMetadata(x, y, z) & 4;
    const facing = [2, 1, 3, 0][dir];
    w.setBlockMetadataWithNotify(x, y, z, facing | upside, 2);
  }

  /** Upside down when placed against a ceiling or the upper half of a side. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, hy: number, _hz: number, meta: number): number {
    return side !== 0 && (side === 1 || !(hy > 0.5)) ? meta : meta | 4;
  }

  /** Traces the 8 octants, minus the two a straight stair leaves empty; keeps the hit nearest the eye. */
  override collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    const hits: (MovingObjectPosition | null)[] = new Array(8).fill(null);
    const meta = w.getBlockMetadata(x, y, z);
    const empty = EMPTY_OCTANTS[(meta & 3) + ((meta & 4) === 4 ? 4 : 0)];
    this.tracingOctant = true;
    for (let i = 0; i < 8; i++) {
      this.octant = i;
      hits[i] = super.collisionRayTrace(w, x, y, z, start, end);
    }
    this.tracingOctant = false;
    for (const i of empty) hits[i] = null;
    let best: MovingObjectPosition | null = null;
    let bestDist = 0;
    for (const h of hits) {
      if (!h) continue;
      const d = h.hitVec!.squareDistanceTo(end);
      if (d > bestDist) {
        best = h;
        bestDist = d;
      }
    }
    return best;
  }

  override registerIcons(_reg: IconRegister): void {}

  /** Upside-down stairs have a solid top (World.isBlockTopFacingSurfaceSolid). */
  override hasSolidTopSurface(meta: number): boolean {
    return (meta & 4) === 4;
  }
}
