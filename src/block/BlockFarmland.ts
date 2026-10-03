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

  /** Moisture 7 with water within 4 blocks (or rain falling on it), else dries out by one, then turns to dirt unless planted. */
  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (this.isWaterNearby(w, x, y, z) || w.canLightningStrikeAt(x, y + 1, z)) {
      w.setBlockMetadataWithNotify(x, y, z, 7, 2);
      return;
    }
    const meta = w.getBlockMetadata(x, y, z);
    if (meta > 0) w.setBlockMetadataWithNotify(x, y, z, meta - 1, 2);
    else if (!this.isCropsNearby(w, x, y, z)) w.setBlock(x, y, z, BlockIds.dirt);
  }

  /** A crop, stem, carrot or potato planted on this block. */
  private isCropsNearby(w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y + 1, z);
    return id === BlockIds.crops || id === BlockIds.melonStem || id === BlockIds.pumpkinStem || id === BlockIds.potato || id === BlockIds.carrot;
  }

  /** Water in the 9x9 area at this level or the one above. */
  private isWaterNearby(w: IWorld, x: number, y: number, z: number): boolean {
    for (let ix = x - 4; ix <= x + 4; ix++) {
      for (let iy = y; iy <= y + 1; iy++) {
        for (let iz = z - 4; iz <= z + 4; iz++) if (w.getBlockMaterial(ix, iy, iz) === Material.water) return true;
      }
    }
    return false;
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
