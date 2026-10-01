import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { WorldGenTrees } from '../world/gen/WorldGenTrees';
import type { WorldGenerator } from '../world/gen/WorldGenerator';
import type { IWorld } from '../world/IWorld';
import { BlockFlower } from './BlockFlower';

/**
 * Saplings (meta & 3 = type, bit 8 = growth stage). Spruce, birch and the 2x2 jungle
 * tree use their own generators in 1.5.2; until the world-gen code provides them,
 * `BlockSapling.treeGenerators` can be extended.
 */
export class BlockSapling extends BlockFlower {
  static readonly WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle'];
  private static readonly textures = ['sapling', 'sapling_spruce', 'sapling_birch', 'sapling_jungle'];
  /** type -> generator factory; world/gen can replace entries (WorldGenTaiga2, WorldGenForest, ...). */
  static treeGenerators: ((rand: JavaRandom) => WorldGenerator)[] = [
    // Oak: 1 in 10 is a WorldGenBigTree in 1.5.2 (the roll is kept so the RNG stays in step).
    (rand) => (rand.nextInt(10) === 0, new WorldGenTrees(true)),
    () => new WorldGenTrees(true, 5, 1, 1, false),
    () => new WorldGenTrees(true, 5, 2, 2, false),
    (rand) => new WorldGenTrees(true, 4 + rand.nextInt(7), 3, 3, false),
  ];
  private saplingIcon: (Icon | null)[] = [];

  constructor(id: number) {
    super(id);
    const f = 0.4;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, f * 2, 0.5 + f);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (w.isRemote) return;
    super.updateTick(w, x, y, z, rand);
    if (w.getBlockLightValue(x, y + 1, z) >= 9 && rand.nextInt(7) === 0) this.markOrGrowMarked(w, x, y, z, rand);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    return this.saplingIcon[meta & 3];
  }

  markOrGrowMarked(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) w.setBlockMetadataWithNotify(x, y, z, meta | 8, 4);
    else this.growTree(w, x, y, z, rand);
  }

  growTree(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    const type = w.getBlockMetadata(x, y, z) & 3;
    const gen = BlockSapling.treeGenerators[type](rand);
    w.setBlock(x, y, z, 0, 0, 4);
    if (!gen.generate(w, rand, x, y, z)) w.setBlock(x, y, z, this.blockID, type, 4);
  }

  isSameSapling(w: IWorld, x: number, y: number, z: number, type: number): boolean {
    return w.getBlockId(x, y, z) === this.blockID && (w.getBlockMetadata(x, y, z) & 3) === type;
  }

  override damageDropped(meta: number): number {
    return meta & 3;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.saplingIcon = BlockSapling.textures.map((n) => reg.registerIcon(n));
  }
}
