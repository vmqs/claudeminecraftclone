import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { BlockFlower } from './BlockFlower';
import { BlockIds, ItemIds } from './BlockIds';
import { StepSounds } from './StepSound';

/** Wheat (59, render type 6): 8 growth stages on farmland; drops seeds, and wheat plus seeds when ripe. */
export class BlockCrops extends BlockFlower {
  protected iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id);
    this.setTickRandomly(true);
    const r = 0.5;
    this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, 0.25, 0.5 + r);
    this.setCreativeTab(null);
    this.setHardness(0);
    this.setStepSound(StepSounds.soundGrassFootstep);
    this.disableStats();
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.tilledField;
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.updateTick(w, x, y, z, rand);
    if (w.getBlockLightValue(x, y + 1, z) < 9) return;
    let meta = w.getBlockMetadata(x, y, z);
    if (meta >= 7) return;
    const rate = this.getGrowthRate(w, x, y, z);
    if (rand.nextInt(Math.trunc(Math.fround(25 / rate)) + 1) === 0) w.setBlockMetadataWithNotify(x, y, z, ++meta, 2);
  }

  /** Bone meal: 2-5 stages at once (at most ripe). */
  fertilize(w: IWorld, x: number, y: number, z: number): void {
    const meta = Math.min(7, w.getBlockMetadata(x, y, z) + MathHelper.getRandomIntegerInRange(w.rand, 2, 5));
    w.setBlockMetadataWithNotify(x, y, z, meta, 2);
  }

  /** Growth speed from the farmland around (wet counts triple) and crowding by the same crop. */
  getGrowthRate(w: IWorld, x: number, y: number, z: number): number {
    return farmlandGrowthRate(w, x, y, z, this.blockID);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    if (meta < 0 || meta > 7) meta = 7;
    return this.iconArray[meta];
  }

  override getRenderType(): number {
    return 6;
  }

  protected getSeedItem(): number {
    return ItemIds.seeds;
  }

  protected getCropItem(): number {
    return ItemIds.wheat;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, 0);
    if (w.isRemote || meta < 7) return;
    const n = 3 + fortune;
    for (let i = 0; i < n; i++) if (w.rand.nextInt(15) <= meta) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(this.getSeedItem(), 1, 0));
  }

  override idDropped(meta: number, _rand: JavaRandom, _fortune: number): number {
    return meta === 7 ? this.getCropItem() : this.getSeedItem();
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return this.getSeedItem();
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [];
    for (let i = 0; i < 8; i++) this.iconArray.push(reg.registerIcon('crops_' + i));
  }
}

/**
 * The growth speed of a plant on farmland (BlockCrops.getGrowthRate / BlockStem.getGrowthModifier):
 * 1 plus the farmland under the 3x3 area (dry 1, wet 3, a quarter for the eight neighbours),
 * halved when the same plant grows diagonally or in both a row and a column next to it.
 */
export function farmlandGrowthRate(w: IWorld, x: number, y: number, z: number, plantId: number): number {
  const f = Math.fround;
  let rate = 1;
  const n = w.getBlockId(x, y, z - 1);
  const s = w.getBlockId(x, y, z + 1);
  const west = w.getBlockId(x - 1, y, z);
  const east = w.getBlockId(x + 1, y, z);
  const nw = w.getBlockId(x - 1, y, z - 1);
  const ne = w.getBlockId(x + 1, y, z - 1);
  const se = w.getBlockId(x + 1, y, z + 1);
  const sw = w.getBlockId(x - 1, y, z + 1);
  const rowX = west === plantId || east === plantId;
  const rowZ = n === plantId || s === plantId;
  const diagonal = nw === plantId || ne === plantId || se === plantId || sw === plantId;
  for (let ix = x - 1; ix <= x + 1; ix++) {
    for (let iz = z - 1; iz <= z + 1; iz++) {
      let v = 0;
      if (w.getBlockId(ix, y - 1, iz) === BlockIds.tilledField) v = w.getBlockMetadata(ix, y - 1, iz) > 0 ? 3 : 1;
      if (ix !== x || iz !== z) v = f(v / 4);
      rate = f(rate + v);
    }
  }
  if (diagonal || (rowX && rowZ)) rate = f(rate / 2);
  return rate;
}
