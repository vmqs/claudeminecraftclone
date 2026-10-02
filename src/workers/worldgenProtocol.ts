import type { TagCompound } from '../item/ItemStack';
import type { EntitySpawnDescriptor } from '../world/gen/WorldGenSpawning';

/** Messages between the main thread and worldgen.worker.ts (see ARCHITECTURE.md §5.2). */
export type WorldGenRequest =
  | { type: 'init'; seed: string; worldType: string; mapFeatures: boolean }
  | { type: 'request'; cx: number; cz: number }
  | { type: 'cancel'; cx: number; cz: number }
  | { type: 'player'; cx: number; cz: number; radius: number }
  /** WorldServer.createSpawnPosition: answered with a 'spawn' message. */
  | { type: 'findSpawn' };

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
  /** Tile entities placed by generation (TileEntity.writeToNBT: spawner mob, chest contents). */
  tileEntities: TagCompound[];
  /** Animals placed by world generation (EntityList names). */
  entities: EntitySpawnDescriptor[];
}

export type WorldGenResponse = { type: 'ready' } | { type: 'spawn'; x: number; y: number; z: number } | ChunkPayload;
