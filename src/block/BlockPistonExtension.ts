import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockPistonBase } from './BlockPistonBase';
import { Material } from './Material';
import { StepSounds } from './StepSound';

/** The piston head (34, render type 17): meta & 7 = facing, bit 8 = sticky. Breaking it breaks the piston. */
export class BlockPistonExtension extends Block {
  private headTexture: Icon | null = null;

  constructor(id: number) {
    super(id, Material.piston);
    this.setStepSound(StepSounds.soundStoneFootstep);
    this.setHardness(0.5);
  }

  /** The renderer overrides the face texture while drawing a moving head. */
  setHeadTexture(icon: Icon | null): void {
    this.headTexture = icon;
  }

  clearHeadTexture(): void {
    this.headTexture = null;
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    super.breakBlock(w, x, y, z, id, meta);
    const back = Facing.oppositeSide[BlockPistonExtension.getDirectionMeta(meta)];
    x += Facing.offsetsXForSide[back];
    y += Facing.offsetsYForSide[back];
    z += Facing.offsetsZForSide[back];
    const baseId = w.getBlockId(x, y, z);
    if (baseId === BlockIds.pistonBase || baseId === BlockIds.pistonStickyBase) {
      const baseMeta = w.getBlockMetadata(x, y, z);
      if (BlockPistonBase.isExtended(baseMeta)) {
        Block.blocksList[baseId]!.dropBlockAsItem(w, x, y, z, baseMeta, 0);
        w.setBlockToAir(x, y, z);
      }
    }
  }

  override getIcon(side: number, meta: number): Icon | null {
    const facing = BlockPistonExtension.getDirectionMeta(meta);
    if (side === facing) {
      if (this.headTexture) return this.headTexture;
      return (meta & 8) !== 0 ? BlockPistonBase.getPistonIcon('piston_top_sticky') : BlockPistonBase.getPistonIcon('piston_top');
    }
    return facing < 6 && side === Facing.oppositeSide[facing] ? BlockPistonBase.getPistonIcon('piston_top') : BlockPistonBase.getPistonIcon('piston_side');
  }

  override registerIcons(_reg: IconRegister): void {}

  override getRenderType(): number {
    return 17;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override canPlaceBlockAt(_w: IWorld, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  override canPlaceBlockOnSide(_w: IWorld, _x: number, _y: number, _z: number, _side: number): boolean {
    return false;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  /** The head plate and the arm. */
  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    const add = (a: number, b: number, c: number, d: number, e2: number, f: number) => {
      this.setBlockBounds(a, b, c, d, e2, f);
      super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
    };
    switch (BlockPistonExtension.getDirectionMeta(w.getBlockMetadata(x, y, z))) {
      case 0:
        add(0, 0, 0, 1, 0.25, 1);
        add(0.375, 0.25, 0.375, 0.625, 1, 0.625);
        break;
      case 1:
        add(0, 0.75, 0, 1, 1, 1);
        add(0.375, 0, 0.375, 0.625, 0.75, 0.625);
        break;
      case 2:
        add(0, 0, 0, 1, 1, 0.25);
        add(0.25, 0.375, 0.25, 0.75, 0.625, 1);
        break;
      case 3:
        add(0, 0, 0.75, 1, 1, 1);
        add(0.25, 0.375, 0, 0.75, 0.625, 0.75);
        break;
      case 4:
        add(0, 0, 0, 0.25, 1, 1);
        add(0.375, 0.25, 0.25, 0.625, 0.75, 1);
        break;
      case 5:
        add(0.75, 0, 0, 1, 1, 1);
        add(0, 0.375, 0.25, 0.75, 0.625, 0.75);
        break;
    }
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    switch (BlockPistonExtension.getDirectionMeta(w.getBlockMetadata(x, y, z))) {
      case 0:
        this.setBlockBounds(0, 0, 0, 1, 0.25, 1);
        break;
      case 1:
        this.setBlockBounds(0, 0.75, 0, 1, 1, 1);
        break;
      case 2:
        this.setBlockBounds(0, 0, 0, 1, 1, 0.25);
        break;
      case 3:
        this.setBlockBounds(0, 0, 0.75, 1, 1, 1);
        break;
      case 4:
        this.setBlockBounds(0, 0, 0, 0.25, 1, 1);
        break;
      case 5:
        this.setBlockBounds(0.75, 0, 0, 1, 1, 1);
        break;
    }
  }

  /** Disappears without its piston behind it; otherwise passes the update to the piston. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    const facing = BlockPistonExtension.getDirectionMeta(w.getBlockMetadata(x, y, z));
    const bx = x - Facing.offsetsXForSide[facing];
    const by = y - Facing.offsetsYForSide[facing];
    const bz = z - Facing.offsetsZForSide[facing];
    const baseId = w.getBlockId(bx, by, bz);
    if (baseId !== BlockIds.pistonBase && baseId !== BlockIds.pistonStickyBase) w.setBlockToAir(x, y, z);
    else Block.blocksList[baseId]!.onNeighborBlockChange(w, bx, by, bz, id);
  }

  static getDirectionMeta(meta: number): number {
    return meta & 7;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }
}
