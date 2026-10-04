/**
 * World.findClosestStructure for the main thread: the structures live in the world-generation
 * worker, so the answer is asynchronous. ChunkProviderClient installs the provider; eyes of
 * ender call `StructureLocator.findClosestStructure('Stronghold', x, y, z)` and get the portal
 * room's centre (or null). Worker-safe (no DOM).
 */
export const StructureLocator = {
  provider: null as ((name: string, x: number, y: number, z: number) => Promise<[number, number, number] | null>) | null,

  findClosestStructure(name: string, x: number, y: number, z: number): Promise<[number, number, number] | null> {
    return this.provider ? this.provider(name, x, y, z) : Promise.resolve(null);
  },
};
