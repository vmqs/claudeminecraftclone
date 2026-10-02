import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Farmland (60): 15/16 high, meta = moisture (0 dry, >0 wet texture); a full-block collision box. */
export class BlockFarmland extends Block {
  private iconWet: Icon | null = null;
  private iconDry: Icon | null = null;

  constructor(id: number) {
    super(id, Material.ground);
    this.setTickRandomly(true);
    this.setBlockBounds(0, 0, 0, 1, 0.9375, 1);
    this.setLightOpacity(255);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    return AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 1) return meta > 0 ? this.iconWet : this.iconDry;
    return Block.blocksList[BlockIds.dirt]!.getBlockTextureFromSide(side);
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): moisture: 7 with water within 4 blocks (or rain), else dry out by one, then turn to dirt without crops.
  }

  /** Trampled by a fall (players, or any mob while mobGriefing is on). */
  override onFallenUpon(w: IWorld, x: number, y: number, z: number, e: Entity, dist: number): void {
    if (w.isRemote || !(w.rand.nextFloat() < dist - 0.5)) return;
    if (!e.isPlayerEntity && !Block.getGameRule(w, 'mobGriefing')) return;
    w.setBlock(x, y, z, BlockIds.dirt);
  }

  /** A solid block on top turns it back into dirt. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    super.onNeighborBlockChange(w, x, y, z, id);
    if (w.getBlockMaterial(x, y + 1, z).isSolid()) w.setBlock(x, y, z, BlockIds.dirt);
  }

  override idDropped(_meta: number, rand: JavaRandom, fortune: number): number {
    return Block.blocksList[BlockIds.dirt]!.idDropped(0, rand, fortune);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return BlockIds.dirt;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconWet = reg.registerIcon('farmland_wet');
    this.iconDry = reg.registerIcon('farmland_dry');
  }
}
