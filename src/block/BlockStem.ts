import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { Block } from './Block';
import { farmlandGrowthRate } from './BlockCrops';
import { BlockFlower } from './BlockFlower';
import { BlockIds, ItemIds } from './BlockIds';

/**
 * Pumpkin and melon stems (104, 105; render type 19): meta = age 0-7, drawn taller and from
 * green to orange-brown with age; a ripe stem bends toward its fruit.
 */
export class BlockStem extends BlockFlower {
  private iconBent: Icon | null = null;

  constructor(
    id: number,
    private readonly fruitType: Block,
  ) {
    super(id);
    this.setTickRandomly(true);
    const r = 0.125;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, 0.25, 0.5 + r);
    this.setCreativeTab(null);
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.tilledField;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.updateTick(w, x, y, z, rand);
    if (w.getBlockLightValue(x, y + 1, z) < 9) return;
    const rate = farmlandGrowthRate(w, x, y, z, this.blockID);
    if (rand.nextInt(Math.trunc(Math.fround(25 / rate)) + 1) !== 0) return;
    let meta = w.getBlockMetadata(x, y, z);
    if (meta < 7) {
      w.setBlockMetadataWithNotify(x, y, z, ++meta, 2);
      return;
    }
    // Ripe: one fruit at a time, on a random side with farmland, dirt or grass under it.
    const fruit = this.fruitType.blockID;
    if (w.getBlockId(x - 1, y, z) === fruit || w.getBlockId(x + 1, y, z) === fruit) return;
    if (w.getBlockId(x, y, z - 1) === fruit || w.getBlockId(x, y, z + 1) === fruit) return;
    const dir = rand.nextInt(4);
    let fx = x;
    let fz = z;
    if (dir === 0) fx = x - 1;
    if (dir === 1) fx = x + 1;
    if (dir === 2) fz = z - 1;
    if (dir === 3) fz = z + 1;
    const below = w.getBlockId(fx, y - 1, fz);
    if (w.getBlockId(fx, y, fz) === 0 && (below === BlockIds.tilledField || below === BlockIds.dirt || below === BlockIds.grass)) {
      w.setBlock(fx, y, fz, fruit);
    }
  }

  /** Bone meal: 2-5 ages at once. */
  fertilizeStem(w: IWorld, x: number, y: number, z: number): void {
    const meta = Math.min(7, w.getBlockMetadata(x, y, z) + MathHelper.getRandomIntegerInRange(w.rand, 2, 5));
    w.setBlockMetadataWithNotify(x, y, z, meta, 2);
  }

  override getRenderColor(meta: number): number {
    return ((meta * 32) << 16) | ((255 - meta * 8) << 8) | (meta * 4);
  }

  override colorMultiplier(w: IBlockAccess, x: number, y: number, z: number): number {
    return this.getRenderColor(w.getBlockMetadata(x, y, z));
  }

  override setBlockBoundsForItemRender(): void {
    const r = 0.125;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, 0.25, 0.5 + r);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const top = Math.fround((w.getBlockMetadata(x, y, z) * 2 + 2) / 16);
    const r = 0.125;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, top, 0.5 + r);
  }

  override getRenderType(): number {
    return 19;
  }

  /** Which way a ripe stem bends: 0 -X, 1 +X, 2 -Z, 3 +Z, or -1 (straight). */
  getState(w: IBlockAccess, x: number, y: number, z: number): number {
    if (w.getBlockMetadata(x, y, z) < 7) return -1;
    const fruit = this.fruitType.blockID;
    if (w.getBlockId(x - 1, y, z) === fruit) return 0;
    if (w.getBlockId(x + 1, y, z) === fruit) return 1;
    if (w.getBlockId(x, y, z - 1) === fruit) return 2;
    return w.getBlockId(x, y, z + 1) === fruit ? 3 : -1;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, fortune);
    if (w.isRemote) return;
    const seeds = this.seedItem();
    for (let i = 0; i < 3; i++) if (w.rand.nextInt(15) <= meta && seeds > 0) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(seeds, 1, 0));
  }

  private seedItem(): number {
    if (this.fruitType.blockID === BlockIds.pumpkin) return ItemIds.pumpkinSeeds;
    return this.fruitType.blockID === BlockIds.melon ? ItemIds.melonSeeds : 0;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return -1;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return this.seedItem();
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('stem_straight');
    this.iconBent = reg.registerIcon('stem_bent');
  }

  /** func_94368_p: the bent texture of a ripe stem. */
  getBentIcon(): Icon | null {
    return this.iconBent;
  }
}
