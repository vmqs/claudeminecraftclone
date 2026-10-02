import type { WorldGenerator } from './gen/WorldGenerator';

/** A WorldGenerator class, constructed with its 1.5.2 argument list. */
export type WorldGenClass = new (...args: any[]) => WorldGenerator;

/**
 * World-generation features that block behaviour builds at run time (saplings growing trees,
 * bone meal on mushrooms), looked up by their 1.5.2 class names: WorldGenTrees, WorldGenBigTree,
 * WorldGenForest, WorldGenTaiga2, WorldGenHugeTrees, WorldGenBigMushroom. Blocks stay free of
 * imports into world/gen; `BlockDynamicsInstall` fills the table from whatever generator
 * modules the build contains.
 */
export const WorldGenRegistry = {
  classes: new Map<string, WorldGenClass>(),

  register(name: string, cls: WorldGenClass): void {
    this.classes.set(name, cls);
  },

  has(name: string): boolean {
    return this.classes.has(name);
  },

  /** `new <name>(...args)`, or null when the class is not part of this build. */
  create(name: string, ...args: unknown[]): WorldGenerator | null {
    const cls = this.classes.get(name);
    return cls ? new cls(...args) : null;
  },
};
