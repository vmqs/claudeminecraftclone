import { Block } from '../block/Block';
import { ChunkCache, SNAPSHOT_PAD, SNAPSHOT_SIZE, type SectionSnapshot } from '../world/ChunkCache';
import { Tessellator } from './gl/Tessellator';
import { RenderBlocks } from './RenderBlocks';

const S = SNAPSHOT_SIZE;

/**
 * WorldRenderer.updateRenderer for one 16^3 section: RenderBlocks over a ChunkCache for
 * pass 0 (opaque, cut-out) and pass 1 (translucent), packed into the compact terrain
 * format: int16 xyz (1/1024 block, section-relative), uint8 block/sky light coordinates,
 * unorm16 uv, rgba8. Runs in the mesher workers.
 */
export class SectionMesher {
  /** Per block id (snapshots hold ids 0-255): Block.isOpaqueCube() (leaves change it with the graphics setting). */
  private readonly opaque = new Uint8Array(256);
  /**
   * Per block id: a full cube drawn by render type 0 (1) or 31 (2, logs) whose faces are culled
   * only by opaque neighbours (Block.shouldSideBeRendered and setBlockBoundsBasedOnState not
   * overridden). Such a block with six opaque-cube neighbours draws nothing.
   */
  private readonly enclosable = new Uint8Array(256);

  private updateTables(): void {
    const opaque = this.opaque;
    const enclosable = this.enclosable;
    const base = Block.prototype;
    for (let id = 0; id < 256; id++) {
      const b = Block.blocksList[id];
      opaque[id] = b && b.isOpaqueCube() ? 1 : 0;
      const type = b ? b.getRenderType() : -1;
      enclosable[id] =
        b &&
        (type === 0 || type === 31) &&
        b.shouldSideBeRendered === base.shouldSideBeRendered &&
        b.setBlockBoundsBasedOnState === base.setBlockBoundsBasedOnState &&
        b.minX === 0 &&
        b.minY === 0 &&
        b.minZ === 0 &&
        b.maxX === 1 &&
        b.maxY === 1 &&
        b.maxZ === 1
          ? type === 31
            ? 2
            : 1
          : 0;
    }
  }

  mesh(snap: SectionSnapshot): { passes: [ArrayBuffer | null, ArrayBuffer | null]; counts: [number, number] } {
    const passes: [ArrayBuffer | null, ArrayBuffer | null] = [null, null];
    const counts: [number, number] = [0, 0];
    if (snap.empty) return { passes, counts };
    this.updateTables();
    const opaque = this.opaque;
    const enclosable = this.enclosable;
    const ids = snap.ids;
    const cache = new ChunkCache(snap);
    const rb = new RenderBlocks(cache);
    const ox = snap.x0 + SNAPSHOT_PAD;
    const oy = snap.y0 + SNAPSHOT_PAD;
    const oz = snap.z0 + SNAPSHOT_PAD;
    // RenderBlocks draws through Tessellator.instance (the worker's own copy).
    const t = Tessellator.instance;
    {
      for (let pass = 0; pass < 2; pass++) {
        let needsNext = false;
        t.startDrawingQuads();
        t.setTranslation(-ox, -oy, -oz);
        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              const i = ((y + SNAPSHOT_PAD) * S + z + SNAPSHOT_PAD) * S + x + SNAPSHOT_PAD;
              const id = ids[i];
              if (id === 0) continue;
              const block = Block.blocksList[id];
              if (!block) continue;
              const bp = block.getRenderBlockPass();
              if (bp !== pass) {
                if (bp > pass) needsNext = true;
                continue;
              }
              if (enclosable[id] && opaque[ids[i - 1]] && opaque[ids[i + 1]] && opaque[ids[i - S]] && opaque[ids[i + S]] && opaque[ids[i - S * S]] && opaque[ids[i + S * S]]) {
                // Every face is culled: nothing to draw, only the renderer's state to keep.
                rb.skipEnclosedCube(block, enclosable[id] === 2);
                continue;
              }
              rb.renderBlockByRenderType(block, ox + x, oy + y, oz + z);
            }
          }
        }
        if (t.vertexCount > 0) {
          counts[pass] = t.vertexCount;
          passes[pass] = this.pack(t);
        }
        t.isDrawing = false;
        t.reset();
        t.setTranslation(0, 0, 0);
        if (!needsNext) break;
      }
    }
    return { passes, counts };
  }

  private pack(t: Tessellator): ArrayBuffer {
    const n = t.vertexCount;
    const src = t.getRawFloat32();
    const srcU = t.getRawUint32();
    const out = new ArrayBuffer(n * 16);
    const i16 = new Int16Array(out);
    const u8 = new Uint8Array(out);
    const u16 = new Uint16Array(out);
    const u32 = new Uint32Array(out);
    for (let v = 0; v < n; v++) {
      const s = v * 8;
      const o16 = v * 8;
      i16[o16] = Math.round(src[s] * 1024);
      i16[o16 + 1] = Math.round(src[s + 1] * 1024);
      i16[o16 + 2] = Math.round(src[s + 2] * 1024);
      const light = srcU[s + 7];
      u8[v * 16 + 6] = light & 0xff;
      u8[v * 16 + 7] = (light >>> 16) & 0xff;
      u16[o16 + 4] = Math.round(Math.min(1, Math.max(0, src[s + 3])) * 65535);
      u16[o16 + 5] = Math.round(Math.min(1, Math.max(0, src[s + 4])) * 65535);
      u32[v * 4 + 3] = srcU[s + 5];
    }
    return out;
  }
}
