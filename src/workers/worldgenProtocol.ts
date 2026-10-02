import type { TagCompound } from '../item/ItemStack';
import type { EntitySpawnDescriptor } from '../world/gen/WorldGenSpawning';

/** Messages between the main thread and worldgen.worker.ts (see ARCHITECTURE.md §5.2). */
export type WorldGenRequest =
  | {
      type: 'init';
      seed: string;
      /** 'default', 'flat' or 'largeBiomes'. */
      worldType: string;
      /** "Generate Structures". */
      mapFeatures: boolean;
      /** Superflat preset string (FlatGeneratorInfo); absent for the default preset. */
      generatorOptions?: string | null;
      /** "Bonus Chest". */
      bonusChest?: boolean;
      /** Chunk radius of the spawn area generated in the original order (default 12). */
      initialRadius?: number;
    }
  | { type: 'request'; cx: number; cz: number }
  | { type: 'cancel'; cx: number; cz: number }
  | { type: 'player'; cx: number; cz: number; radius: number }
  /** WorldServer.createSpawnPosition: answered with a 'spawn' message. */
  | { type: 'findSpawn' }
  /** World.findClosestStructure ("Stronghold" for eyes of ender): answered with 'structure'. */
  | { type: 'findStructure'; id: number; name: string; x: number; y: number; z: number };

export interface SectionPayload {
  y: number;
  blocks: Uint8Array;
  meta: Uint8Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
}

export interface ChunkPayload {
  type: 'chunk';
  cx: number;
  cz: number;
  sections: SectionPayload[];
  heightMap: Int32Array;
  biomes: Uint8Array;
  /** Scheduled ticks created while generating: [x, y, z, blockId, delay]. */
  pendingTicks: number[][];
  /**
   * Tile entities placed by generation as 1.5.2 NBT: {id: 'Chest' | 'Trap', x, y, z, Items:
   * [{Slot, id, Count, Damage, tag?}]}, {id: 'MobSpawner', EntityId, Delay, ...}, and tags of
   * tile entities the blocks created themselves (TileEntity.writeToNBT).
   */
  tileEntities: TagCompound[];
  /** Entities placed by world generation (EntityList names): animals, villagers, minecarts. */
  entities: EntitySpawnDescriptor[];
}

export type WorldGenResponse =
  | { type: 'ready' }
  | { type: 'spawn'; x: number; y: number; z: number }
  | { type: 'structure'; id: number; pos: [number, number, number] | null }
  | ChunkPayload;
