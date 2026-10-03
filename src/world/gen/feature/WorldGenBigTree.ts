import { BlockIds } from '../../../block/BlockIds';
import { JavaRandom } from '../../../core/JavaRandom';
import { MathHelper } from '../../../core/MathHelper';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

const f = Math.fround;
const OTHER_COORD_PAIRS = [2, 0, 0, 1, 2, 1];

/**
 * Big oaks (WorldGenBigTree): a trunk with branches ending in leaf clusters. Like 1.5.2,
 * `heightLimit` is kept between trees once set, so each biome's shared instance keeps growing
 * trees of the same height for the rest of the session.
 */
export class WorldGenBigTree extends WorldGenerator {
  private readonly rand = new JavaRandom(0n);
  private world!: IWorld;
  private readonly basePos = [0, 0, 0];
  heightLimit = 0;
  private height = 0;
  private readonly heightAttenuation = 0.618;
  private readonly branchSlope = 0.381;
  private scaleWidth = 1;
  private leafDensity = 1;
  private readonly trunkSize: number = 1;
  private heightLimitLimit = 12;
  private leafDistanceLimit = 4;
  private leafNodes: number[][] = [];

  private generateLeafNodeList(): void {
    this.height = Math.trunc(this.heightLimit * this.heightAttenuation);
    if (this.height >= this.heightLimit) this.height = this.heightLimit - 1;
    let perLayer = Math.trunc(1.382 + Math.pow((this.leafDensity * this.heightLimit) / 13, 2));
    if (perLayer < 1) perLayer = 1;
    const nodes: number[][] = [];
    let y = this.basePos[1] + this.heightLimit - this.leafDistanceLimit;
    const trunkTop = this.basePos[1] + this.height;
    let rel = y - this.basePos[1];
    nodes.push([this.basePos[0], y, this.basePos[2], trunkTop]);
    y--;
    while (rel >= 0) {
      const size = this.layerSize(rel);
      if (size >= 0) {
        for (let i = 0; i < perLayer; i++) {
          const dist = this.scaleWidth * size * (this.rand.nextFloat() + 0.328);
          const angle = this.rand.nextFloat() * 2 * 3.14159;
          const nx = MathHelper.floor_double(dist * Math.sin(angle) + this.basePos[0] + 0.5);
          const nz = MathHelper.floor_double(dist * Math.cos(angle) + this.basePos[2] + 0.5);
          const node = [nx, y, nz];
          if (this.checkBlockLine(node, [nx, y + this.leafDistanceLimit, nz]) !== -1) continue;
          const base = [this.basePos[0], this.basePos[1], this.basePos[2]];
          const d = Math.sqrt(Math.pow(Math.abs(this.basePos[0] - node[0]), 2) + Math.pow(Math.abs(this.basePos[2] - node[2]), 2));
          const drop = d * this.branchSlope;
          base[1] = node[1] - drop > trunkTop ? trunkTop : Math.trunc(node[1] - drop);
          if (this.checkBlockLine(base, node) === -1) nodes.push([nx, y, nz, base[1]]);
        }
      }
      y--;
      rel--;
    }
    this.leafNodes = nodes;
  }

  private genTreeLayer(x: number, y: number, z: number, size: number, axis: number, blockId: number): void {
    const r = Math.trunc(size + 0.618);
    const a1 = OTHER_COORD_PAIRS[axis];
    const a2 = OTHER_COORD_PAIRS[axis + 3];
    const center = [x, y, z];
    const pos = [0, 0, 0];
    pos[axis] = center[axis];
    const max = f(size * size);
    for (let i = -r; i <= r; i++) {
      pos[a1] = center[a1] + i;
      for (let j = -r; j <= r; j++) {
        const d = Math.pow(Math.abs(i) + 0.5, 2) + Math.pow(Math.abs(j) + 0.5, 2);
        if (d > max) continue;
        pos[a2] = center[a2] + j;
        const id = this.world.getBlockId(pos[0], pos[1], pos[2]);
        if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(this.world, pos[0], pos[1], pos[2], blockId, 0);
      }
    }
  }

  private layerSize(rel: number): number {
    if (rel < f(this.heightLimit) * 0.3) return f(-1.618);
    const half = f(this.heightLimit / 2);
    const d = f(half - rel);
    let r: number;
    if (d === 0) r = half;
    else if (Math.abs(d) >= half) r = 0;
    else r = f(Math.sqrt(Math.pow(Math.abs(half), 2) - Math.pow(Math.abs(d), 2)));
    return f(r * 0.5);
  }

  private leafSize(i: number): number {
    if (i < 0 || i >= this.leafDistanceLimit) return -1;
    return i !== 0 && i !== this.leafDistanceLimit - 1 ? 3 : 2;
  }

  private generateLeafNode(x: number, y: number, z: number): void {
    for (let yy = y; yy < y + this.leafDistanceLimit; yy++) this.genTreeLayer(x, yy, z, this.leafSize(yy - y), 1, BlockIds.leaves);
  }

  private placeBlockLine(a: number[], b: number[], blockId: number): void {
    const d = [0, 0, 0];
    let major = 0;
    for (let i = 0; i < 3; i++) {
      d[i] = b[i] - a[i];
      if (Math.abs(d[i]) > Math.abs(d[major])) major = i;
    }
    if (d[major] === 0) return;
    const a1 = OTHER_COORD_PAIRS[major];
    const a2 = OTHER_COORD_PAIRS[major + 3];
    const step = d[major] > 0 ? 1 : -1;
    const r1 = d[a1] / d[major];
    const r2 = d[a2] / d[major];
    const p = [0, 0, 0];
    const end = d[major] + step;
    for (let i = 0; i !== end; i += step) {
      p[major] = MathHelper.floor_double(a[major] + i + 0.5);
      p[a1] = MathHelper.floor_double(a[a1] + i * r1 + 0.5);
      p[a2] = MathHelper.floor_double(a[a2] + i * r2 + 0.5);
      let meta = 0;
      const dx = Math.abs(p[0] - a[0]);
      const dz = Math.abs(p[2] - a[2]);
      const m = Math.max(dx, dz);
      if (m > 0) {
        if (dx === m) meta = 4;
        else if (dz === m) meta = 8;
      }
      this.setBlockAndMetadata(this.world, p[0], p[1], p[2], blockId, meta);
    }
  }

  private generateLeaves(): void {
    for (const n of this.leafNodes) this.generateLeafNode(n[0], n[1], n[2]);
  }

  private leafNodeNeedsBase(rel: number): boolean {
    return !(rel < this.heightLimit * 0.2);
  }

  private generateTrunk(): void {
    const a = [this.basePos[0], this.basePos[1], this.basePos[2]];
    const b = [this.basePos[0], this.basePos[1] + this.height, this.basePos[2]];
    this.placeBlockLine(a, b, BlockIds.wood);
    if (this.trunkSize === 2) {
      a[0]++;
      b[0]++;
      this.placeBlockLine(a, b, BlockIds.wood);
      a[2]++;
      b[2]++;
      this.placeBlockLine(a, b, BlockIds.wood);
      a[0]--;
      b[0]--;
      this.placeBlockLine(a, b, BlockIds.wood);
    }
  }

  private generateLeafNodeBases(): void {
    const base = [this.basePos[0], this.basePos[1], this.basePos[2]];
    for (const n of this.leafNodes) {
      base[1] = n[3];
      if (this.leafNodeNeedsBase(base[1] - this.basePos[1])) this.placeBlockLine(base, [n[0], n[1], n[2]], BlockIds.wood);
    }
  }

  /** -1 when the line from a to b is free (air or leaves), else the distance to the obstacle. */
  private checkBlockLine(a: number[], b: number[]): number {
    const d = [0, 0, 0];
    let major = 0;
    for (let i = 0; i < 3; i++) {
      d[i] = b[i] - a[i];
      if (Math.abs(d[i]) > Math.abs(d[major])) major = i;
    }
    if (d[major] === 0) return -1;
    const a1 = OTHER_COORD_PAIRS[major];
    const a2 = OTHER_COORD_PAIRS[major + 3];
    const step = d[major] > 0 ? 1 : -1;
    const r1 = d[a1] / d[major];
    const r2 = d[a2] / d[major];
    const p = [0, 0, 0];
    const end = d[major] + step;
    let i = 0;
    for (; i !== end; i += step) {
      p[major] = a[major] + i;
      p[a1] = MathHelper.floor_double(a[a1] + i * r1);
      p[a2] = MathHelper.floor_double(a[a2] + i * r2);
      const id = this.world.getBlockId(p[0], p[1], p[2]);
      if (id !== 0 && id !== BlockIds.leaves) break;
    }
    return i === end ? -1 : Math.abs(i);
  }

  private validTreeLocation(): boolean {
    const a = [this.basePos[0], this.basePos[1], this.basePos[2]];
    const b = [this.basePos[0], this.basePos[1] + this.heightLimit - 1, this.basePos[2]];
    const ground = this.world.getBlockId(this.basePos[0], this.basePos[1] - 1, this.basePos[2]);
    if (ground !== 2 && ground !== 3) return false;
    const hit = this.checkBlockLine(a, b);
    if (hit === -1) return true;
    if (hit < 6) return false;
    this.heightLimit = hit;
    return true;
  }

  override setScale(x: number, y: number, z: number): void {
    this.heightLimitLimit = Math.trunc(x * 12);
    if (x > 0.5) this.leafDistanceLimit = 5;
    this.scaleWidth = y;
    this.leafDensity = z;
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    this.world = w;
    this.rand.setSeed(rand.nextLong());
    this.basePos[0] = x;
    this.basePos[1] = y;
    this.basePos[2] = z;
    if (this.heightLimit === 0) this.heightLimit = 5 + this.rand.nextInt(this.heightLimitLimit);
    if (!this.validTreeLocation()) return false;
    this.generateLeafNodeList();
    this.generateLeaves();
    this.generateTrunk();
    this.generateLeafNodeBases();
    return true;
  }
}
