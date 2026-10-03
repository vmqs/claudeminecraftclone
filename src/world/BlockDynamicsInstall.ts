import { WorldGenRegistry, type WorldGenClass } from './WorldGenRegistry';

/**
 * Main-thread wiring for dynamic block behaviour (imported once by Minecraft.ts).
 *
 * Fills WorldGenRegistry with the tree and huge-mushroom generators that saplings and bone
 * meal use. The generators are found by file name so the 1.5.2 classes light up as soon as the
 * world-generation port provides them (src/world/gen/feature/WorldGen*.ts); until then the
 * sapling falls back to the small-tree generator.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  [
    './gen/WorldGenTrees.ts',
    './gen/feature/WorldGenTrees.ts',
    './gen/feature/WorldGenBigTree.ts',
    './gen/feature/WorldGenForest.ts',
    './gen/feature/WorldGenTaiga2.ts',
    './gen/feature/WorldGenHugeTrees.ts',
    './gen/feature/WorldGenBigMushroom.ts',
  ],
  { eager: true },
);

for (const mod of Object.values(modules)) {
  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('WorldGen') && typeof value === 'function') WorldGenRegistry.register(name, value as WorldGenClass);
  }
}
