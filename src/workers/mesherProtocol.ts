import type { IconTable } from '../render/texture/Icon';
import type { SectionSnapshot } from '../world/ChunkCache';

export interface MesherSettings {
  aoLevel: number;
  fancyGraphics: boolean;
  /** gameSettings.anaglyph: RenderBlocks mixes block colours for red/cyan glasses. */
  anaglyph?: boolean;
}

export type MesherRequest =
  | { type: 'init'; icons: IconTable; grass: Int32Array; foliage: Int32Array; settings: MesherSettings }
  | { type: 'icons'; icons: IconTable }
  | { type: 'colormaps'; grass: Int32Array; foliage: Int32Array }
  | { type: 'settings'; settings: MesherSettings }
  | { type: 'mesh'; id: number; snap: SectionSnapshot };

export interface MeshResult {
  type: 'mesh';
  id: number;
  /** Compact 16-byte vertices per render pass (null when the pass is empty). */
  passes: [ArrayBuffer | null, ArrayBuffer | null];
  vertexCounts: [number, number];
  /** Snapshot arrays handed back for reuse. */
  snap: SectionSnapshot;
  ms: number;
}

export type MesherResponse = MeshResult | { type: 'ready' };
