import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';

/** Integer.parseInt: NaN for anything that is not a plain 32-bit integer. */
function parseJavaInt(s: string): number {
  if (!/^[-+]?\d+$/.test(s)) return Number.NaN;
  const n = Number.parseInt(s, 10);
  return n > 0x7fffffff || n < -0x80000000 ? Number.NaN : n;
}

/** One run of identical blocks in a superflat preset (FlatLayerInfo). */
export interface FlatLayerInfo {
  count: number;
  blockId: number;
  meta: number;
  minY: number;
}

/**
 * A superflat preset (FlatGeneratorInfo): "version;layers;biome;features", e.g. the default
 * "2;7,2x3,2;1;village" = bedrock, two dirt, grass on plains with villages.
 */
export class FlatGeneratorInfo {
  readonly flatLayers: FlatLayerInfo[] = [];
  /** Feature name -> options (village, biome_1, mineshaft, stronghold, decoration, lake, lava_lake, dungeon). */
  readonly worldFeatures = new Map<string, Map<string, string>>();
  biome = 1;

  /** func_82645_d: stacks the layers from y = 0. */
  updateLayers(): void {
    let y = 0;
    for (const l of this.flatLayers) {
      l.minY = y;
      y += l.count;
    }
  }

  static getDefaultFlatGenerator(): FlatGeneratorInfo {
    const g = new FlatGeneratorInfo();
    g.biome = 1;
    g.flatLayers.push({ count: 1, blockId: BlockIds.bedrock, meta: 0, minY: 0 });
    g.flatLayers.push({ count: 2, blockId: BlockIds.dirt, meta: 0, minY: 0 });
    g.flatLayers.push({ count: 1, blockId: BlockIds.grass, meta: 0, minY: 0 });
    g.updateLayers();
    g.worldFeatures.set('village', new Map());
    return g;
  }

  /** "NxID:META" with N and META optional; unknown blocks become air. */
  private static parseLayer(s: string, minY: number): FlatLayerInfo | null {
    const x = s.indexOf('x');
    let count = 1;
    if (x >= 0) {
      count = parseJavaInt(s.substring(0, x));
      if (Number.isNaN(count)) return null;
      if (minY + count >= 256) count = 256 - minY;
      if (count < 0) count = 0;
    }
    const block = s.substring(x + 1);
    const colon = block.indexOf(':');
    let id = parseJavaInt(colon < 0 ? block : block.substring(0, colon));
    let meta = colon < 0 ? 0 : parseJavaInt(block.substring(colon + 1));
    if (Number.isNaN(id) || Number.isNaN(meta)) return null;
    if (!Block.blocksList[id]) {
      id = 0;
      meta = 0;
    }
    if (meta < 0 || meta > 15) meta = 0;
    return { count, blockId: id, meta, minY };
  }

  static createFlatGeneratorFromString(text: string | null): FlatGeneratorInfo {
    if (text === null) return FlatGeneratorInfo.getDefaultFlatGenerator();
    const parts = text.split(';');
    const v = parts.length === 1 ? 0 : parseJavaInt(parts[0]);
    const version = Number.isNaN(v) ? 0 : v;
    if (version < 0 || version > 2) return FlatGeneratorInfo.getDefaultFlatGenerator();
    let i = parts.length === 1 ? 0 : 1;
    const layersText = parts[i++];
    if (!layersText) return FlatGeneratorInfo.getDefaultFlatGenerator();
    const g = new FlatGeneratorInfo();
    let y = 0;
    for (const s of layersText.split(',')) {
      const l = FlatGeneratorInfo.parseLayer(s, y);
      if (!l) return FlatGeneratorInfo.getDefaultFlatGenerator();
      g.flatLayers.push(l);
      y += l.count;
    }
    if (g.flatLayers.length === 0) return FlatGeneratorInfo.getDefaultFlatGenerator();
    g.updateLayers();
    if (version > 0 && parts.length > i) {
      const b = parseJavaInt(parts[i++]);
      g.biome = Number.isNaN(b) ? 1 : b;
    }
    if (version > 0 && parts.length > i) {
      for (const feature of parts[i++].toLowerCase().split(',')) {
        const open = feature.indexOf('(');
        const name = open < 0 ? feature : feature.substring(0, open);
        const args = open < 0 ? null : feature.substring(open + 1);
        if (name.length === 0) continue;
        const opts = new Map<string, string>();
        g.worldFeatures.set(name, opts);
        if (args && args.endsWith(')') && args.length > 1) {
          for (const o of args.substring(0, args.length - 1).split(' ')) {
            const eq = o.indexOf('=');
            if (eq >= 0) opts.set(o.substring(0, eq), o.substring(eq + 1));
          }
        }
      }
    } else {
      g.worldFeatures.set('village', new Map());
    }
    return g;
  }
}
