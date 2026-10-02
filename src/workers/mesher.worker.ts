/// <reference lib="webworker" />
import { Block } from '../block/Block';
import { Blocks } from '../block/Blocks';
import type { BlockLeaves } from '../block/BlockLeaves';
import { RenderBlocks } from '../render/RenderBlocks';
import { SectionMesher } from '../render/SectionMesher';
import { Icon, IconTableRegister, type IconTable } from '../render/texture/Icon';
import { ColorizerFoliage, ColorizerGrass } from '../world/biome/Colorizer';
import type { MesherRequest, MesherSettings, MeshResult } from './mesherProtocol';

declare const self: DedicatedWorkerGlobalScope;

const register = new IconTableRegister();
const missing = new Icon('missingno');
const mesher = new SectionMesher();
let iconsRegistered = false;
// Items.ts runs Block.initializeBlock on the main thread; fire needs it here for its flammability table.
for (const b of Block.blocksList) b?.initializeBlock();

function applyIcons(table: IconTable): void {
  if (!iconsRegistered) {
    for (const b of Block.blocksList) if (b) b.registerIcons(register);
    iconsRegistered = true;
  }
  register.apply(table);
  const m = table.missing;
  missing.setPlacement(table.sheetWidth, table.sheetHeight, m[0], m[1], m[2], m[3]);
  RenderBlocks.missingIcon = missing;
}

function applySettings(s: MesherSettings): void {
  RenderBlocks.aoLevel = s.aoLevel;
  RenderBlocks.fancyGrass = s.fancyGraphics;
  (Blocks.leaves as BlockLeaves).setGraphicsLevel(s.fancyGraphics);
}

self.onmessage = (e: MessageEvent<MesherRequest>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      ColorizerGrass.setGrassBiomeColorizer(m.grass);
      ColorizerFoliage.setFoliageBiomeColorizer(m.foliage);
      applyIcons(m.icons);
      applySettings(m.settings);
      self.postMessage({ type: 'ready' });
      break;
    case 'icons':
      applyIcons(m.icons);
      break;
    case 'colormaps':
      ColorizerGrass.setGrassBiomeColorizer(m.grass);
      ColorizerFoliage.setFoliageBiomeColorizer(m.foliage);
      break;
    case 'settings':
      applySettings(m.settings);
      break;
    case 'mesh': {
      const t0 = performance.now();
      const { passes, counts } = mesher.mesh(m.snap);
      const res: MeshResult = { type: 'mesh', id: m.id, passes, vertexCounts: counts, snap: m.snap, ms: performance.now() - t0 };
      const transfer: Transferable[] = [m.snap.ids.buffer, m.snap.meta.buffer, m.snap.sky.buffer, m.snap.blk.buffer, m.snap.biomes.buffer];
      for (const p of passes) if (p) transfer.push(p);
      self.postMessage(res, transfer);
      break;
    }
  }
};
