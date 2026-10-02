import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { MapGenBase, type MapGenContext } from '../MapGenBase';
import { StructureBoundingBox } from './StructureBoundingBox';
import type { StructureStart } from './StructureStart';

interface Entry {
  start: StructureStart;
  hash: number;
  seq: number;
}

/**
 * The structureMap of MapGenStructure (a java.util.HashMap keyed by the chunk position). Its
 * iteration order decides which structure is built first where two overlap, so values() returns
 * the order of the Java 8+ HashMap the reference client ran on: by bucket index, then insertion.
 */
export class StructureMap {
  private readonly entries = new Map<number, Entry>();
  private seq = 0;
  private ordered: StructureStart[] | null = null;

  static key(cx: number, cz: number): number {
    return (cx + 0x200000) * 0x400000 + (cz + 0x200000);
  }

  has(k: number): boolean {
    return this.entries.has(k);
  }

  get(k: number): StructureStart | undefined {
    return this.entries.get(k)?.start;
  }

  put(cx: number, cz: number, start: StructureStart): void {
    const k = StructureMap.key(cx, cz);
    if (this.entries.has(k)) this.entries.get(k)!.start = start;
    else this.entries.set(k, { start, hash: (cx ^ cz) | 0, seq: this.seq++ });
    this.ordered = null;
  }

  get size(): number {
    return this.entries.size;
  }

  values(): StructureStart[] {
    if (this.ordered) return this.ordered;
    let cap = 16;
    while (this.entries.size > cap * 0.75) cap *= 2;
    const idx = (h: number) => (h ^ (h >>> 16)) & (cap - 1);
    const list = [...this.entries.values()].sort((a, b) => idx(a.hash) - idx(b.hash) || a.seq - b.seq);
    return (this.ordered = list.map((e) => e.start));
  }
}

/**
 * MapGenStructure: structure starts are decided per chunk while terrain is generated (within 8
 * chunks of every generated chunk) and their pieces are built during population, clipped to
 * the populated area, so a structure comes out the same whichever chunk is generated first.
 */
export abstract class MapGenStructure extends MapGenBase {
  readonly structureMap = new StructureMap();
  /** Chunks known not to start a structure (canSpawnStructureAtCoords is a pure function). */
  private readonly rejected = new Set<number>();

  override generate(ctx: MapGenContext, cx: number, cz: number, _blocks: Uint8Array | null): void {
    this.prepare(ctx);
    const r = this.range;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        const k = StructureMap.key(x, z);
        if (this.structureMap.has(k) || this.rejected.has(k)) continue;
        this.seedFor(x, z);
        this.recursiveGenerate(x, z, cx, cz, null);
      }
    }
  }

  protected recursiveGenerate(x: number, z: number, _cx: number, _cz: number, _blocks: Uint8Array | null): void {
    const k = StructureMap.key(x, z);
    if (this.structureMap.has(k)) return;
    this.rand.nextInt();
    if (this.canSpawnStructureAtCoords(x, z)) this.structureMap.put(x, z, this.getStructureStart(x, z));
    else this.rejected.add(k);
  }

  /** generateStructuresInChunk: builds every structure reaching the populated area of (cx, cz). */
  generateStructuresInChunk(w: IWorld, rand: JavaRandom, cx: number, cz: number): boolean {
    const x = (cx << 4) + 8;
    const z = (cz << 4) + 8;
    let any = false;
    for (const s of this.structureMap.values()) {
      if (s.isSizeableStructure() && s.getBoundingBox().intersectsWith2D(x, z, x + 15, z + 15)) {
        s.generateStructure(w, rand, StructureBoundingBox.of2D(x, z, x + 15, z + 15));
        any = true;
      }
    }
    return any;
  }

  hasStructureAt(x: number, y: number, z: number): boolean {
    for (const s of this.structureMap.values()) {
      if (!s.isSizeableStructure() || !s.getBoundingBox().intersectsWith2D(x, z, x, z)) continue;
      for (const c of s.components) if (c.getBoundingBox().isVecInside(x, y, z)) return true;
    }
    return false;
  }

  /** getNearestInstance (with the original's dx + dx*dy*dy + dz*dz "distance"). */
  getNearestInstance(ctx: MapGenContext, x: number, y: number, z: number): [number, number, number] | null {
    this.prepare(ctx);
    this.seedFor(x >> 4, z >> 4);
    this.recursiveGenerate(x >> 4, z >> 4, 0, 0, null);
    let best = Number.MAX_VALUE;
    let pos: [number, number, number] | null = null;
    for (const s of this.structureMap.values()) {
      if (!s.isSizeableStructure() || s.components.length === 0) continue;
      const c = s.components[0].getCenter();
      const dx = c[0] - x;
      const dy = c[1] - y;
      const dz = c[2] - z;
      const d = dx + dx * dy * dy + dz * dz;
      if (d < best) {
        best = d;
        pos = c;
      }
    }
    if (pos) return pos;
    const list = this.getCoordList();
    if (!list) return null;
    let found: [number, number, number] | null = null;
    for (const c of list) {
      const dx = c[0] - x;
      const dy = c[1] - y;
      const dz = c[2] - z;
      const d = dx + dx * dy * dy + dz * dz;
      if (d < best) {
        best = d;
        found = c;
      }
    }
    return found;
  }

  protected getCoordList(): [number, number, number][] | null {
    return null;
  }

  protected abstract canSpawnStructureAtCoords(cx: number, cz: number): boolean;
  protected abstract getStructureStart(cx: number, cz: number): StructureStart;
}
