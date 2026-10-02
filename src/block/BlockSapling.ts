import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { WorldGenTrees } from '../world/gen/WorldGenTrees';
import type { WorldGenerator } from '../world/gen/WorldGenerator';
import type { IWorld } from '../world/IWorld';
import { WorldGenRegistry } from '../world/WorldGenRegistry';
import { BlockFlower } from './BlockFlower';

/**
 * Saplings (meta & 3 = type, bit 8 = growth stage). With light 9 or more above, 1 in 7 random
 * ticks advances them: the first marks the stage bit, the next grows the tree with the 1.5.2
 * generator for the type (oak: WorldGenTrees, 1 in 10 WorldGenBigTree; spruce: WorldGenTaiga2;
 * birch: WorldGenForest; jungle: WorldGenHugeTrees from a 2x2 of saplings, else a tall
 * WorldGenTrees). Generators come from WorldGenRegistry; a missing one falls back to a small
 * tree of the right wood.
 */
export class BlockSapling extends BlockFlower {
  static readonly WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle'];
  private static readonly textures = ['sapling', 'sapling_spruce', 'sapling_birch', 'sapling_jungle'];
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
    let gen: WorldGenerator | null = null;
    let ox = 0;
    let oz = 0;
    let huge = false;
    if (type === 1) {
      gen = WorldGenRegistry.create('WorldGenTaiga2', true) ?? new WorldGenTrees(true, 5, 1, 1, false);
    } else if (type === 2) {
      gen = WorldGenRegistry.create('WorldGenForest', true) ?? new WorldGenTrees(true, 5, 2, 2, false);
    } else if (type === 3) {
      // A 2x2 of jungle saplings with this one in any corner grows a huge jungle tree.
      search: for (ox = 0; ox >= -1; ox--) {
        for (oz = 0; oz >= -1; oz--) {
          if (
            this.isSameSapling(w, x + ox, y, z + oz, 3) &&
            this.isSameSapling(w, x + ox + 1, y, z + oz, 3) &&
            this.isSameSapling(w, x + ox, y, z + oz + 1, 3) &&
            this.isSameSapling(w, x + ox + 1, y, z + oz + 1, 3)
          ) {
            const height = 10 + rand.nextInt(20);
            gen = WorldGenRegistry.create('WorldGenHugeTrees', true, height, 3, 3) ?? new WorldGenTrees(true, 4 + (height % 7), 3, 3, false);
            huge = true;
            break search;
          }
        }
      }
      if (!gen) {
        ox = 0;
        oz = 0;
        gen = new WorldGenTrees(true, 4 + rand.nextInt(7), 3, 3, false);
      }
    } else {
      gen = new WorldGenTrees(true);
      if (rand.nextInt(10) === 0) gen = WorldGenRegistry.create('WorldGenBigTree', true) ?? gen;
    }
    if (huge) {
      w.setBlock(x + ox, y, z + oz, 0, 0, 4);
      w.setBlock(x + ox + 1, y, z + oz, 0, 0, 4);
      w.setBlock(x + ox, y, z + oz + 1, 0, 0, 4);
      w.setBlock(x + ox + 1, y, z + oz + 1, 0, 0, 4);
    } else {
      w.setBlock(x, y, z, 0, 0, 4);
    }
    if (gen.generate(w, rand, x + ox, y, z + oz)) return;
    if (huge) {
      w.setBlock(x + ox, y, z + oz, this.blockID, type, 4);
      w.setBlock(x + ox + 1, y, z + oz, this.blockID, type, 4);
      w.setBlock(x + ox, y, z + oz + 1, this.blockID, type, 4);
      w.setBlock(x + ox + 1, y, z + oz + 1, this.blockID, type, 4);
    } else {
      w.setBlock(x, y, z, this.blockID, type, 4);
    }
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
