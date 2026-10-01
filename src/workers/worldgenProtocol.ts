/** Messages between the main thread and worldgen.worker.ts (see ARCHITECTURE.md §5.2). */
export type WorldGenRequest =
  | { type: 'init'; seed: string; worldType: string; mapFeatures: boolean }
  | { type: 'request'; cx: number; cz: number }
  | { type: 'cancel'; cx: number; cz: number }
  | { type: 'player'; cx: number; cz: number; radius: number };

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
  /** Tile-entity descriptors (spawner mob, chest contents); none yet. */
  tileEntities: unknown[];
}

export type WorldGenResponse = { type: 'ready' } | ChunkPayload;
