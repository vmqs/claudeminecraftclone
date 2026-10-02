import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { isTileEntityProvider } from '../world/tileentity/TileEntity';
import { TileEntityPiston } from '../world/tileentity/TileEntityPiston';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';
import { StepSounds } from './StepSound';

/**
 * Pistons (33 normal, 29 sticky; render type 16): meta & 7 = facing (6-way), bit 8 = extended.
 * Extension is driven by redstone (out of scope); the push and pull of up to 12 blocks
 * through block 36 and TileEntityPiston is ported for when a world provides power.
 */
export class BlockPistonBase extends Block {
  private iconInnerTop: Icon | null = null;
  private iconBottom: Icon | null = null;
  private iconTop: Icon | null = null;

  constructor(
    id: number,
    private readonly isSticky: boolean,
  ) {
    super(id, Material.piston);
    this.setStepSound(StepSounds.soundStoneFootstep);
    this.setHardness(0.5);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  getPistonExtensionTexture(): Icon | null {
    return this.iconTop;
  }

  /** func_96479_b: the renderer narrows the base while it draws an extended piston. */
  setPistonBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.setBlockBounds(minX, minY, minZ, maxX, maxY, maxZ);
  }

  override getIcon(side: number, meta: number): Icon | null {
    const facing = BlockPistonBase.getOrientation(meta);
    if (facing > 5) return this.iconTop;
    if (side === facing) {
      const full = !(this.minX > 0) && !(this.minY > 0) && !(this.minZ > 0) && !(this.maxX < 1) && !(this.maxY < 1) && !(this.maxZ < 1);
      return !BlockPistonBase.isExtended(meta) && full ? this.iconTop : this.iconInnerTop;
    }
    return side === Facing.oppositeSide[facing] ? this.iconBottom : this.blockIcon;
  }

  /** func_94496_b: piston textures by name, for the extension and the renderer. */
  static getPistonIcon(name: string): Icon | null {
    const base = Block.blocksList[BlockIds.pistonBase] as BlockPistonBase | null;
    const sticky = Block.blocksList[BlockIds.pistonStickyBase] as BlockPistonBase | null;
    if (name === 'piston_side') return base?.blockIcon ?? null;
    if (name === 'piston_top') return base?.iconTop ?? null;
    if (name === 'piston_top_sticky') return sticky?.iconTop ?? null;
    return name === 'piston_inner_top' ? (base?.iconInnerTop ?? null) : null;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('piston_side');
    this.iconTop = reg.registerIcon(this.isSticky ? 'piston_top_sticky' : 'piston_top');
    this.iconInnerTop = reg.registerIcon('piston_inner_top');
    this.iconBottom = reg.registerIcon('piston_bottom');
  }

  override getRenderType(): number {
    return 16;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override onBlockActivated(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer): boolean {
    return false;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, BlockPistonBase.determineOrientation(w, x, y, z, e), 2);
    if (!w.isRemote) this.updatePistonState(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!w.isRemote) this.updatePistonState(w, x, y, z);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (!w.isRemote && w.getBlockTileEntity(x, y, z) === null) this.updatePistonState(w, x, y, z);
  }

  private updatePistonState(w: IWorld, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const facing = BlockPistonBase.getOrientation(meta);
    if (facing === 7) return;
    const powered = this.isIndirectlyPowered(w, x, y, z, facing);
    if (powered && !BlockPistonBase.isExtended(meta)) {
      if (BlockPistonBase.canExtend(w, x, y, z, facing)) w.addBlockEvent?.(x, y, z, this.blockID, 0, facing);
    } else if (!powered && BlockPistonBase.isExtended(meta)) {
      w.setBlockMetadataWithNotify(x, y, z, facing, 2);
      w.addBlockEvent?.(x, y, z, this.blockID, 1, facing);
    }
  }

  /** Power from any side but the front, or from around the block above (quasi-connectivity). */
  private isIndirectlyPowered(w: IWorld, x: number, y: number, z: number, facing: number): boolean {
    const out = w.getIndirectPowerOutput;
    if (!out) return false;
    const p = (px: number, py: number, pz: number, side: number) => out.call(w, px, py, pz, side);
    if (facing !== 0 && p(x, y - 1, z, 0)) return true;
    if (facing !== 1 && p(x, y + 1, z, 1)) return true;
    if (facing !== 2 && p(x, y, z - 1, 2)) return true;
    if (facing !== 3 && p(x, y, z + 1, 3)) return true;
    if (facing !== 5 && p(x + 1, y, z, 5)) return true;
    if (facing !== 4 && p(x - 1, y, z, 4)) return true;
    if (p(x, y, z, 0)) return true;
    if (p(x, y + 2, z, 1)) return true;
    if (p(x, y + 1, z - 1, 2)) return true;
    if (p(x, y + 1, z + 1, 3)) return true;
    if (p(x - 1, y + 1, z, 4)) return true;
    return p(x + 1, y + 1, z, 5);
  }

  /** Block event 0 extends, 1 retracts (pulling the block in front for a sticky piston). */
  override onBlockEventReceived(w: IWorld, x: number, y: number, z: number, event: number, facing: number): boolean {
    if (!w.isRemote) {
      const powered = this.isIndirectlyPowered(w, x, y, z, facing);
      if (powered && event === 1) {
        w.setBlockMetadataWithNotify(x, y, z, facing | 8, 2);
        return false;
      }
      if (!powered && event === 0) return false;
    }
    if (event === 0) {
      if (!this.tryExtend(w, x, y, z, facing)) return false;
      w.setBlockMetadataWithNotify(x, y, z, facing | 8, 2);
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'tile.piston.out', 0.5, Math.fround(w.rand.nextFloat() * 0.25 + Math.fround(0.6)));
    } else if (event === 1) {
      const fx = Facing.offsetsXForSide[facing];
      const fy = Facing.offsetsYForSide[facing];
      const fz = Facing.offsetsZForSide[facing];
      const front = w.getBlockTileEntity(x + fx, y + fy, z + fz);
      if (front instanceof TileEntityPiston) front.clearPistonTileEntity();
      w.setBlock(x, y, z, BlockIds.pistonMoving, facing, 3);
      w.setBlockTileEntity(x, y, z, new TileEntityPiston(this.blockID, facing, facing, false, true));
      if (this.isSticky) {
        const px = x + fx * 2;
        const py = y + fy * 2;
        const pz = z + fz * 2;
        let id = w.getBlockId(px, py, pz);
        let meta = w.getBlockMetadata(px, py, pz);
        let pulledMoving = false;
        if (id === BlockIds.pistonMoving) {
          const te = w.getBlockTileEntity(px, py, pz);
          if (te instanceof TileEntityPiston && te.getPistonOrientation() === facing && te.isExtending()) {
            te.clearPistonTileEntity();
            id = te.getStoredBlockID();
            meta = te.getBlockMetadata();
            pulledMoving = true;
          }
        }
        const b = Block.blocksList[id];
        if (pulledMoving || id <= 0 || !BlockPistonBase.canPushBlock(id, w, px, py, pz, false) || (b!.getMobilityFlag() !== 0 && id !== BlockIds.pistonBase && id !== BlockIds.pistonStickyBase)) {
          if (!pulledMoving) w.setBlockToAir(x + fx, y + fy, z + fz);
        } else {
          // The original moves its x/y/z here, so the sound comes from the pulled block.
          x += fx;
          y += fy;
          z += fz;
          w.setBlock(x, y, z, BlockIds.pistonMoving, meta, 3);
          w.setBlockTileEntity(x, y, z, new TileEntityPiston(id, meta, facing, false, false));
          w.setBlockToAir(px, py, pz);
        }
      } else {
        w.setBlockToAir(x + fx, y + fy, z + fz);
      }
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'tile.piston.in', 0.5, Math.fround(Math.fround(w.rand.nextFloat() * Math.fround(0.15)) + Math.fround(0.6)));
    }
    return true;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    if (!BlockPistonBase.isExtended(meta)) {
      this.setBlockBounds(0, 0, 0, 1, 1, 1);
      return;
    }
    switch (BlockPistonBase.getOrientation(meta)) {
      case 0:
        this.setBlockBounds(0, 0.25, 0, 1, 1, 1);
        break;
      case 1:
        this.setBlockBounds(0, 0, 0, 1, 0.75, 1);
        break;
      case 2:
        this.setBlockBounds(0, 0, 0.25, 1, 1, 1);
        break;
      case 3:
        this.setBlockBounds(0, 0, 0, 1, 1, 0.75);
        break;
      case 4:
        this.setBlockBounds(0.25, 0, 0, 1, 1, 1);
        break;
      case 5:
        this.setBlockBounds(0, 0, 0, 0.75, 1, 1);
        break;
    }
  }

  override setBlockBoundsForItemRender(): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  static getOrientation(meta: number): number {
    return meta & 7;
  }

  static isExtended(meta: number): boolean {
    return (meta & 8) !== 0;
  }

  /**
   * The 6-way facing toward the placer: up or down when the placer is within 2 blocks
   * horizontally and above or below (eye height 1.82 above the feet), else the horizontal facing.
   */
  static determineOrientation(_w: IWorld, x: number, y: number, z: number, e: EntityLiving): number {
    const f = Math.fround;
    if (MathHelper.abs(f(f(e.posX) - x)) < 2 && MathHelper.abs(f(f(e.posZ) - z)) < 2) {
      const eye = e.posY + 1.82 - e.yOffset;
      if (eye - y > 2) return 1;
      if (y - eye > 0) return 0;
    }
    return [2, 5, 3, 4][Block.yawToDirection(e)];
  }

  /** Obsidian, unbreakable, immovable and tile-entity blocks stay; "breakable" blocks only when `destroy`. */
  static canPushBlock(id: number, w: IWorld, x: number, y: number, z: number, destroy: boolean): boolean {
    if (id === BlockIds.obsidian) return false;
    const b = Block.blocksList[id]!;
    if (id !== BlockIds.pistonBase && id !== BlockIds.pistonStickyBase) {
      if (b.getBlockHardness(w, x, y, z) === -1) return false;
      if (b.getMobilityFlag() === 2) return false;
      if (b.getMobilityFlag() === 1) return destroy;
    } else if (BlockPistonBase.isExtended(w.getBlockMetadata(x, y, z))) {
      return false;
    }
    return !isTileEntityProvider(b);
  }

  private static canExtend(w: IWorld, x: number, y: number, z: number, facing: number): boolean {
    let cx = x + Facing.offsetsXForSide[facing];
    let cy = y + Facing.offsetsYForSide[facing];
    let cz = z + Facing.offsetsZForSide[facing];
    for (let i = 0; i < 13; i++) {
      if (cy <= 0 || cy >= 255) return false;
      const id = w.getBlockId(cx, cy, cz);
      if (id === 0) break;
      if (!BlockPistonBase.canPushBlock(id, w, cx, cy, cz, true)) return false;
      if (Block.blocksList[id]!.getMobilityFlag() === 1) break;
      if (i === 12) return false;
      cx += Facing.offsetsXForSide[facing];
      cy += Facing.offsetsYForSide[facing];
      cz += Facing.offsetsZForSide[facing];
    }
    return true;
  }

  private tryExtend(w: IWorld, x: number, y: number, z: number, facing: number): boolean {
    const dx = Facing.offsetsXForSide[facing];
    const dy = Facing.offsetsYForSide[facing];
    const dz = Facing.offsetsZForSide[facing];
    let cx = x + dx;
    let cy = y + dy;
    let cz = z + dz;
    for (let i = 0; i < 13; ) {
      if (cy <= 0 || cy >= 255) return false;
      const id = w.getBlockId(cx, cy, cz);
      if (id === 0) break;
      if (!BlockPistonBase.canPushBlock(id, w, cx, cy, cz, true)) return false;
      if (Block.blocksList[id]!.getMobilityFlag() !== 1) {
        if (i === 12) return false;
        cx += dx;
        cy += dy;
        cz += dz;
        i++;
      } else {
        Block.blocksList[id]!.dropBlockAsItem(w, cx, cy, cz, w.getBlockMetadata(cx, cy, cz), 0);
        w.setBlockToAir(cx, cy, cz);
        break;
      }
    }
    const endX = cx;
    const endY = cy;
    const endZ = cz;
    const moved: number[] = [];
    while (cx !== x || cy !== y || cz !== z) {
      const bx = cx - dx;
      const by = cy - dy;
      const bz = cz - dz;
      const id = w.getBlockId(bx, by, bz);
      const meta = w.getBlockMetadata(bx, by, bz);
      if (id === this.blockID && bx === x && by === y && bz === z) {
        const headMeta = facing | (this.isSticky ? 8 : 0);
        w.setBlock(cx, cy, cz, BlockIds.pistonMoving, headMeta, 4);
        w.setBlockTileEntity(cx, cy, cz, new TileEntityPiston(BlockIds.pistonExtension, headMeta, facing, true, false));
      } else {
        w.setBlock(cx, cy, cz, BlockIds.pistonMoving, meta, 4);
        w.setBlockTileEntity(cx, cy, cz, new TileEntityPiston(id, meta, facing, true, false));
      }
      moved.push(id);
      cx = bx;
      cy = by;
      cz = bz;
    }
    cx = endX;
    cy = endY;
    cz = endZ;
    let n = 0;
    while (cx !== x || cy !== y || cz !== z) {
      cx -= dx;
      cy -= dy;
      cz -= dz;
      w.notifyBlocksOfNeighborChange(cx, cy, cz, moved[n++]);
    }
    return true;
  }
}
