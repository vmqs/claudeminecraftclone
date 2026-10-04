import { Block } from '../../../block/Block';
import { BlockIds as B } from '../../../block/BlockIds';
import { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { placeSpawner } from '../ChestLoot';
import { StructureBoundingBox } from '../structure/StructureBoundingBox';
import { StructureComponent } from '../structure/StructureComponent';

/**
 * The pieces of a Nether fortress (StructureNetherBridgePieces and its ComponentNetherBridge*
 * classes). A fortress grows from a bridge crossing: every piece asks for the next piece at each
 * of its exits, drawn by weight from the bridge list (open-air bridges, crossings, stairs, the
 * blaze balcony, the lava well) or, behind a door, the corridor list (corridors, turns, stairs,
 * the nether wart room). Pieces that would collide, dip to y <= 10, or reach more than 112
 * blocks from the start become dead ends. 1.5.2 fortresses have no chests.
 */

const BRICK = B.netherBrick;
const FENCE = B.netherFence;
const AIR = 0;

/** A filled box in a piece's local coordinates: x0, y0, z0, x1, y1, z1, block. */
type Fill = readonly [number, number, number, number, number, number, number];

/** What createNextComponent may build: a piece class with its 1.5.2 placement check. */
interface PieceFactory {
  create(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgePiece | null;
}

/**
 * StructureNetherBridgePieceWeight: how often a piece is drawn, how many a fortress may have
 * (0 = any number) and whether it may follow itself.
 */
export class PieceWeight {
  placeCount = 0;

  constructor(
    readonly factory: PieceFactory,
    readonly weight: number,
    readonly maxPlaceCount: number,
    readonly allowInRow = false,
  ) {}

  canSpawnMore(): boolean {
    return this.maxPlaceCount === 0 || this.placeCount < this.maxPlaceCount;
  }
}

/** The facing-rotated box of a new piece at an exit, or null where it may not go. */
function placement(list: StructureComponent[], x: number, y: number, z: number, ox: number, oy: number, oz: number, w: number, h: number, d: number, facing: number): StructureBoundingBox | null {
  const box = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, ox, oy, oz, w, h, d, facing);
  return box.minY > 10 && StructureComponent.findIntersecting(list, box) === null ? box : null;
}

/** ComponentNetherBridgePiece: the exit logic shared by every fortress piece. */
export abstract class NetherBridgePiece extends StructureComponent {
  constructor(type: number, facing: number, box: StructureBoundingBox) {
    super(type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }

  /** getTotalWeight: the summed weight, or -1 once no limited piece can be placed any more. */
  private static totalWeight(weights: readonly PieceWeight[]): number {
    let limited = false;
    let total = 0;
    for (const pw of weights) {
      if (pw.maxPlaceCount > 0 && pw.placeCount < pw.maxPlaceCount) limited = true;
      total += pw.weight;
    }
    return limited ? total : -1;
  }

  /**
   * Draws a piece from `weights` (five tries). A draw that hits a piece which may not follow the
   * previous one gives up the try; one whose placement fails falls through to the next entries
   * of the list, as the original's loop does. Without a piece the exit gets a dead end.
   */
  private drawPiece(start: NetherBridgeStartPiece, weights: PieceWeight[], list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgePiece | null {
    const total = NetherBridgePiece.totalWeight(weights);
    const canDraw = total > 0 && depth <= 30;
    for (let tries = 0; tries < 5 && canDraw; tries++) {
      let r = rand.nextInt(total);
      for (const pw of weights) {
        r -= pw.weight;
        if (r < 0) {
          if (!pw.canSpawnMore() || (pw === start.lastPlaced && !pw.allowInRow)) break;
          const piece = pw.factory.create(list, rand, x, y, z, facing, depth);
          if (piece) {
            pw.placeCount++;
            start.lastPlaced = pw;
            if (!pw.canSpawnMore()) weights.splice(weights.indexOf(pw), 1);
            return piece;
          }
        }
      }
    }
    return NetherBridgeEnd.create(list, rand, x, y, z, facing, depth);
  }

  /**
   * The piece at an exit (x, y, z) facing `facing`: drawn from the corridor list when
   * `corridor`, else the bridge list. Beyond 112 blocks of the start a dead end is made but, as
   * in the original, not kept (it only uses up randomness).
   */
  private nextPiece(start: NetherBridgeStartPiece, list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number, corridor: boolean): NetherBridgePiece | null {
    const sb = start.getBoundingBox();
    if (Math.abs(x - sb.minX) > 112 || Math.abs(z - sb.minZ) > 112) return NetherBridgeEnd.create(list, rand, x, y, z, facing, depth);
    const piece = this.drawPiece(start, corridor ? start.secondaryWeights : start.primaryWeights, list, rand, x, y, z, facing, depth + 1);
    if (piece) {
      list.push(piece);
      start.pendingChildren.push(piece);
    }
    return piece;
  }

  /** getNextComponentNormal: the exit straight ahead, `along` across and `up` above the piece's origin. */
  protected nextAhead(start: NetherBridgeStartPiece, list: StructureComponent[], rand: JavaRandom, along: number, up: number, corridor: boolean): NetherBridgePiece | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
        return this.nextPiece(start, list, rand, bb.minX + along, bb.minY + up, bb.maxZ + 1, 0, t, corridor);
      case 1:
        return this.nextPiece(start, list, rand, bb.minX - 1, bb.minY + up, bb.minZ + along, 1, t, corridor);
      case 2:
        return this.nextPiece(start, list, rand, bb.minX + along, bb.minY + up, bb.minZ - 1, 2, t, corridor);
      case 3:
        return this.nextPiece(start, list, rand, bb.maxX + 1, bb.minY + up, bb.minZ + along, 3, t, corridor);
      default:
        return null;
    }
  }

  /** getNextComponentX: the exit on the piece's left (west or north side). */
  protected nextLeft(start: NetherBridgeStartPiece, list: StructureComponent[], rand: JavaRandom, up: number, along: number, corridor: boolean): NetherBridgePiece | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return this.nextPiece(start, list, rand, bb.minX - 1, bb.minY + up, bb.minZ + along, 1, t, corridor);
      case 1:
      case 3:
        return this.nextPiece(start, list, rand, bb.minX + along, bb.minY + up, bb.minZ - 1, 2, t, corridor);
      default:
        return null;
    }
  }

  /** getNextComponentZ: the exit on the piece's right (east or south side). */
  protected nextRight(start: NetherBridgeStartPiece, list: StructureComponent[], rand: JavaRandom, up: number, along: number, corridor: boolean): NetherBridgePiece | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return this.nextPiece(start, list, rand, bb.maxX + 1, bb.minY + up, bb.minZ + along, 3, t, corridor);
      case 1:
      case 3:
        return this.nextPiece(start, list, rand, bb.minX + along, bb.minY + up, bb.maxZ + 1, 0, t, corridor);
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------ building helpers

  protected fillBox(w: IWorld, box: StructureBoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    this.fillWithBlocks(w, box, x0, y0, z0, x1, y1, z1, id, id, false);
  }

  /** Fills the boxes in order (later boxes overwrite earlier ones). */
  protected fillAll(w: IWorld, box: StructureBoundingBox, fills: readonly Fill[]): void {
    for (const [x0, y0, z0, x1, y1, z1, id] of fills) this.fillWithBlocks(w, box, x0, y0, z0, x1, y1, z1, id, id, false);
  }

  /** Brick pillars from below the piece down to the ground (or lava) under x0..x1, z0..z1. */
  protected pillars(w: IWorld, box: StructureBoundingBox, x0: number, x1: number, z0: number, z1: number): void {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, x, -1, z, box);
  }

  /** The supports of a bridge end: rows 0..2 of `x0..x1` at both ends of a `length`-long span along z. */
  protected endPillarsZ(w: IWorld, box: StructureBoundingBox, x0: number, x1: number, last: number): void {
    for (let x = x0; x <= x1; x++) {
      for (let i = 0; i <= 2; i++) {
        this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, x, -1, i, box);
        this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, x, -1, last - i, box);
      }
    }
  }

  /** The same along x: columns 0..2 and last-2..last under rows z0..z1. */
  protected endPillarsX(w: IWorld, box: StructureBoundingBox, z0: number, z1: number, last: number): void {
    for (let i = 0; i <= 2; i++) {
      for (let z = z0; z <= z1; z++) {
        this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, i, -1, z, box);
        this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, last - i, -1, z, box);
      }
    }
  }
}

// ==================================================================== bridge pieces

/** ComponentNetherBridgeStraight: 19 blocks of open bridge on arches. */
export class NetherBridgeStraight extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeStraight | null {
    const box = placement(list, x, y, z, -1, -3, 0, 5, 10, 19, facing);
    return box ? new NetherBridgeStraight(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextAhead(start as NetherBridgeStartPiece, list, rand, 1, 3, false);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 3, 0, 4, 4, 18, BRICK],
      [1, 5, 0, 3, 7, 18, AIR],
      [0, 5, 0, 0, 5, 18, BRICK],
      [4, 5, 0, 4, 5, 18, BRICK],
      [0, 2, 0, 4, 2, 5, BRICK],
      [0, 2, 13, 4, 2, 18, BRICK],
      [0, 0, 0, 4, 1, 3, BRICK],
      [0, 0, 15, 4, 1, 18, BRICK],
    ]);
    this.endPillarsZ(w, box, 0, 4, 18);
    this.fillAll(w, box, [
      [0, 1, 1, 0, 4, 1, FENCE],
      [0, 3, 4, 0, 4, 4, FENCE],
      [0, 3, 14, 0, 4, 14, FENCE],
      [0, 1, 17, 0, 4, 17, FENCE],
      [4, 1, 1, 4, 4, 1, FENCE],
      [4, 3, 4, 4, 4, 4, FENCE],
      [4, 3, 14, 4, 4, 14, FENCE],
      [4, 1, 17, 4, 4, 17, FENCE],
    ]);
    return true;
  }
}

/** ComponentNetherBridgeCrossing3: the large bridge crossing (also the fortress's start piece). */
export class NetherBridgeCrossing3 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCrossing3 | null {
    const box = placement(list, x, y, z, -8, -3, 0, 19, 10, 19, facing);
    return box ? new NetherBridgeCrossing3(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const s = start as NetherBridgeStartPiece;
    this.nextAhead(s, list, rand, 8, 3, false);
    this.nextLeft(s, list, rand, 3, 8, false);
    this.nextRight(s, list, rand, 3, 8, false);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [7, 3, 0, 11, 4, 18, BRICK],
      [0, 3, 7, 18, 4, 11, BRICK],
      [8, 5, 0, 10, 7, 18, AIR],
      [0, 5, 8, 18, 7, 10, AIR],
      [7, 5, 0, 7, 5, 7, BRICK],
      [7, 5, 11, 7, 5, 18, BRICK],
      [11, 5, 0, 11, 5, 7, BRICK],
      [11, 5, 11, 11, 5, 18, BRICK],
      [0, 5, 7, 7, 5, 7, BRICK],
      [11, 5, 7, 18, 5, 7, BRICK],
      [0, 5, 11, 7, 5, 11, BRICK],
      [11, 5, 11, 18, 5, 11, BRICK],
      [7, 2, 0, 11, 2, 5, BRICK],
      [7, 2, 13, 11, 2, 18, BRICK],
      [7, 0, 0, 11, 1, 3, BRICK],
      [7, 0, 15, 11, 1, 18, BRICK],
    ]);
    this.endPillarsZ(w, box, 7, 11, 18);
    this.fillAll(w, box, [
      [0, 2, 7, 5, 2, 11, BRICK],
      [13, 2, 7, 18, 2, 11, BRICK],
      [0, 0, 7, 3, 1, 11, BRICK],
      [15, 0, 7, 18, 1, 11, BRICK],
    ]);
    this.endPillarsX(w, box, 7, 11, 18);
    return true;
  }
}

/** ComponentNetherBridgeStartPiece: the first crossing, which also holds the fortress's draw state. */
export class NetherBridgeStartPiece extends NetherBridgeCrossing3 {
  /** The weight of the piece placed last (theNetherBridgePieceWeight). */
  lastPlaced: PieceWeight | null = null;
  readonly primaryWeights: PieceWeight[];
  readonly secondaryWeights: PieceWeight[];
  /** Pieces whose exits are still to be built (field_74967_d), taken in random order. */
  readonly pendingChildren: NetherBridgePiece[] = [];

  constructor(rand: JavaRandom, x: number, z: number) {
    const facing = rand.nextInt(4);
    super(0, facing, new StructureBoundingBox(x, 64, z, x + 19 - 1, 73, z + 19 - 1));
    // The weight tables are shared, as in the original; every fortress starts their counts over.
    for (const pw of PRIMARY) pw.placeCount = 0;
    for (const pw of SECONDARY) pw.placeCount = 0;
    this.primaryWeights = [...PRIMARY];
    this.secondaryWeights = [...SECONDARY];
  }
}

/** ComponentNetherBridgeEnd: a broken-off bridge end of random lengths (seeded per piece). */
export class NetherBridgeEnd extends NetherBridgePiece {
  private readonly fillSeed: number;

  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type, facing, box);
    this.fillSeed = rand.nextInt();
  }

  static create(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeEnd | null {
    const box = placement(list, x, y, z, -1, -3, 0, 5, 10, 8, facing);
    return box ? new NetherBridgeEnd(depth, rand, box, facing) : null;
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    const r = new JavaRandom(BigInt(this.fillSeed));
    for (let x = 0; x <= 4; x++) {
      for (let y = 3; y <= 4; y++) this.fillBox(w, box, x, y, 0, x, y, r.nextInt(8), BRICK);
    }
    this.fillBox(w, box, 0, 5, 0, 0, 5, r.nextInt(8), BRICK);
    this.fillBox(w, box, 4, 5, 0, 4, 5, r.nextInt(8), BRICK);
    for (let x = 0; x <= 4; x++) this.fillBox(w, box, x, 2, 0, x, 2, r.nextInt(5), BRICK);
    for (let x = 0; x <= 4; x++) {
      for (let y = 0; y <= 1; y++) this.fillBox(w, box, x, y, 0, x, y, r.nextInt(3), BRICK);
    }
    return true;
  }
}

/** ComponentNetherBridgeCrossing: a small roofless room where a bridge splits three ways. */
export class NetherBridgeCrossing extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCrossing | null {
    const box = placement(list, x, y, z, -2, 0, 0, 7, 9, 7, facing);
    return box ? new NetherBridgeCrossing(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const s = start as NetherBridgeStartPiece;
    this.nextAhead(s, list, rand, 2, 0, false);
    this.nextLeft(s, list, rand, 0, 2, false);
    this.nextRight(s, list, rand, 0, 2, false);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 6, 1, 6, BRICK],
      [0, 2, 0, 6, 7, 6, AIR],
      [0, 2, 0, 1, 6, 0, BRICK],
      [0, 2, 6, 1, 6, 6, BRICK],
      [5, 2, 0, 6, 6, 0, BRICK],
      [5, 2, 6, 6, 6, 6, BRICK],
      [0, 2, 0, 0, 6, 1, BRICK],
      [0, 2, 5, 0, 6, 6, BRICK],
      [6, 2, 0, 6, 6, 1, BRICK],
      [6, 2, 5, 6, 6, 6, BRICK],
      [2, 6, 0, 4, 6, 0, BRICK],
      [2, 5, 0, 4, 5, 0, FENCE],
      [2, 6, 6, 4, 6, 6, BRICK],
      [2, 5, 6, 4, 5, 6, FENCE],
      [0, 6, 2, 0, 6, 4, BRICK],
      [0, 5, 2, 0, 5, 4, FENCE],
      [6, 6, 2, 6, 6, 4, BRICK],
      [6, 5, 2, 6, 5, 4, FENCE],
    ]);
    this.pillars(w, box, 0, 6, 0, 6);
    return true;
  }
}

/** ComponentNetherBridgeStairs: a stair tower climbing to a bridge exit on its right. */
export class NetherBridgeStairs extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeStairs | null {
    const box = placement(list, x, y, z, -2, 0, 0, 7, 11, 7, facing);
    return box ? new NetherBridgeStairs(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextRight(start as NetherBridgeStartPiece, list, rand, 6, 2, false);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 6, 1, 6, BRICK],
      [0, 2, 0, 6, 10, 6, AIR],
      [0, 2, 0, 1, 8, 0, BRICK],
      [5, 2, 0, 6, 8, 0, BRICK],
      [0, 2, 1, 0, 8, 6, BRICK],
      [6, 2, 1, 6, 8, 6, BRICK],
      [1, 2, 6, 5, 8, 6, BRICK],
      [0, 3, 2, 0, 5, 4, FENCE],
      [6, 3, 2, 6, 5, 2, FENCE],
      [6, 3, 4, 6, 5, 4, FENCE],
    ]);
    this.placeBlockAtCurrentPosition(w, BRICK, 0, 5, 2, 5, box);
    this.fillAll(w, box, [
      [4, 2, 5, 4, 3, 5, BRICK],
      [3, 2, 5, 3, 4, 5, BRICK],
      [2, 2, 5, 2, 5, 5, BRICK],
      [1, 2, 5, 1, 6, 5, BRICK],
      [1, 7, 1, 5, 7, 4, BRICK],
      [6, 8, 2, 6, 8, 4, AIR],
      [2, 6, 0, 4, 8, 0, BRICK],
      [2, 5, 0, 4, 5, 0, FENCE],
    ]);
    this.pillars(w, box, 0, 6, 0, 6);
    return true;
  }
}

/** ComponentNetherBridgeThrone: the blaze spawner balcony, a dead end. */
export class NetherBridgeThrone extends NetherBridgePiece {
  private hasSpawner = false;

  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeThrone | null {
    const box = placement(list, x, y, z, -2, 0, 0, 7, 8, 9, facing);
    return box ? new NetherBridgeThrone(depth, facing, box) : null;
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 2, 0, 6, 7, 7, AIR],
      [1, 0, 0, 5, 1, 7, BRICK],
      [1, 2, 1, 5, 2, 7, BRICK],
      [1, 3, 2, 5, 3, 7, BRICK],
      [1, 4, 3, 5, 4, 7, BRICK],
      [1, 2, 0, 1, 4, 2, BRICK],
      [5, 2, 0, 5, 4, 2, BRICK],
      [1, 5, 2, 1, 5, 3, BRICK],
      [5, 5, 2, 5, 5, 3, BRICK],
      [0, 5, 3, 0, 5, 8, BRICK],
      [6, 5, 3, 6, 5, 8, BRICK],
      [1, 5, 8, 5, 5, 8, BRICK],
    ]);
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 1, 6, 3, box);
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 5, 6, 3, box);
    this.fillAll(w, box, [
      [0, 6, 3, 0, 6, 8, FENCE],
      [6, 6, 3, 6, 6, 8, FENCE],
      [1, 6, 8, 5, 7, 8, FENCE],
      [2, 8, 8, 4, 8, 8, FENCE],
    ]);
    if (!this.hasSpawner) {
      const y = this.getYWithOffset(5);
      const x = this.getXWithOffset(3, 5);
      const z = this.getZWithOffset(3, 5);
      if (box.isVecInside(x, y, z)) {
        this.hasSpawner = true;
        w.setBlock(x, y, z, B.mobSpawner, 0, 2);
        placeSpawner(w, x, y, z, 'Blaze');
      }
    }
    this.pillars(w, box, 0, 6, 0, 6);
    return true;
  }
}

/**
 * The 13x14x13 halls (the lava well and the nether wart room): brick walls with window
 * battlements on a cross-shaped bridge deck.
 */
abstract class NetherBridgeHall extends NetherBridgePiece {
  /** The walls, roof and floor slab. */
  protected buildWalls(w: IWorld, box: StructureBoundingBox): void {
    this.fillAll(w, box, [
      [0, 3, 0, 12, 4, 12, BRICK],
      [0, 5, 0, 12, 13, 12, AIR],
      [0, 5, 0, 1, 12, 12, BRICK],
      [11, 5, 0, 12, 12, 12, BRICK],
      [2, 5, 11, 4, 12, 12, BRICK],
      [8, 5, 11, 10, 12, 12, BRICK],
      [5, 9, 11, 7, 12, 12, BRICK],
      [2, 5, 0, 4, 12, 1, BRICK],
      [8, 5, 0, 10, 12, 1, BRICK],
      [5, 9, 0, 7, 12, 1, BRICK],
      [2, 11, 2, 10, 12, 10, BRICK],
    ]);
  }

  /** The window fences, the battlements on the roof edge and the side windows. */
  protected buildRailing(w: IWorld, box: StructureBoundingBox): void {
    for (let i = 1; i <= 11; i += 2) {
      this.fillAll(w, box, [
        [i, 10, 0, i, 11, 0, FENCE],
        [i, 10, 12, i, 11, 12, FENCE],
        [0, 10, i, 0, 11, i, FENCE],
        [12, 10, i, 12, 11, i, FENCE],
      ]);
      this.placeBlockAtCurrentPosition(w, BRICK, 0, i, 13, 0, box);
      this.placeBlockAtCurrentPosition(w, BRICK, 0, i, 13, 12, box);
      this.placeBlockAtCurrentPosition(w, BRICK, 0, 0, 13, i, box);
      this.placeBlockAtCurrentPosition(w, BRICK, 0, 12, 13, i, box);
      this.placeBlockAtCurrentPosition(w, FENCE, 0, i + 1, 13, 0, box);
      this.placeBlockAtCurrentPosition(w, FENCE, 0, i + 1, 13, 12, box);
      this.placeBlockAtCurrentPosition(w, FENCE, 0, 0, 13, i + 1, box);
      this.placeBlockAtCurrentPosition(w, FENCE, 0, 12, 13, i + 1, box);
    }
    // As in the original the corner (0, 13, 0) is set twice and (12, 13, 12) never.
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 0, 13, 0, box);
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 0, 13, 12, box);
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 0, 13, 0, box);
    this.placeBlockAtCurrentPosition(w, FENCE, 0, 12, 13, 0, box);
    for (let i = 3; i <= 9; i += 2) {
      this.fillBox(w, box, 1, 7, i, 1, 8, i, FENCE);
      this.fillBox(w, box, 11, 7, i, 11, 8, i, FENCE);
    }
  }

  /** The cross-shaped bridge deck under the hall and its supports. */
  protected buildBase(w: IWorld, box: StructureBoundingBox): void {
    this.fillAll(w, box, [
      [4, 2, 0, 8, 2, 12, BRICK],
      [0, 2, 4, 12, 2, 8, BRICK],
      [4, 0, 0, 8, 1, 3, BRICK],
      [4, 0, 9, 8, 1, 12, BRICK],
      [0, 0, 4, 3, 1, 8, BRICK],
      [9, 0, 4, 12, 1, 8, BRICK],
    ]);
    this.endPillarsZ(w, box, 4, 8, 12);
    this.endPillarsX(w, box, 4, 8, 12);
  }
}

/** ComponentNetherBridgeEntrance: the hall with the lava well, leading into the corridors. */
export class NetherBridgeEntrance extends NetherBridgeHall {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeEntrance | null {
    const box = placement(list, x, y, z, -5, -3, 0, 13, 14, 13, facing);
    return box ? new NetherBridgeEntrance(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextAhead(start as NetherBridgeStartPiece, list, rand, 5, 3, true);
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.buildWalls(w, box);
    this.fillBox(w, box, 5, 8, 0, 7, 8, 0, FENCE);
    this.buildRailing(w, box);
    this.buildBase(w, box);
    this.fillAll(w, box, [
      [5, 5, 5, 7, 5, 7, BRICK],
      [6, 1, 6, 6, 4, 6, AIR],
    ]);
    this.placeBlockAtCurrentPosition(w, BRICK, 0, 6, 0, 6, box);
    this.placeBlockAtCurrentPosition(w, B.lavaMoving, 0, 6, 5, 6, box);
    const x = this.getXWithOffset(6, 6);
    const y = this.getYWithOffset(5);
    const z = this.getZWithOffset(6, 6);
    if (box.isVecInside(x, y, z)) {
      // The lava starts flowing down the well at once (scheduled updates made immediate).
      const gw = w as IWorld & { scheduledUpdatesAreImmediate?: boolean };
      gw.scheduledUpdatesAreImmediate = true;
      Block.blocksList[B.lavaMoving]?.updateTick(w, x, y, z, rand);
      gw.scheduledUpdatesAreImmediate = false;
    }
    return true;
  }
}

/** ComponentNetherBridgeNetherStalkRoom: the hall with the stairs and the nether wart beds. */
export class NetherBridgeNetherStalkRoom extends NetherBridgeHall {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeNetherStalkRoom | null {
    const box = placement(list, x, y, z, -5, -3, 0, 13, 14, 13, facing);
    return box ? new NetherBridgeNetherStalkRoom(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const s = start as NetherBridgeStartPiece;
    this.nextAhead(s, list, rand, 5, 3, true);
    this.nextAhead(s, list, rand, 5, 11, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.buildWalls(w, box);
    this.buildRailing(w, box);
    const stairs = B.stairsNetherBrick;
    const up = this.getMetadataWithOffset(stairs, 3);
    for (let i = 0; i <= 6; i++) {
      const z = i + 4;
      for (let x = 5; x <= 7; x++) this.placeBlockAtCurrentPosition(w, stairs, up, x, 5 + i, z, box);
      if (z >= 5 && z <= 8) this.fillBox(w, box, 5, 5, z, 7, i + 4, z, BRICK);
      else if (z >= 9 && z <= 10) this.fillBox(w, box, 5, 8, z, 7, i + 4, z, BRICK);
      if (i >= 1) this.fillBox(w, box, 5, 6 + i, z, 7, 9 + i, z, AIR);
    }
    for (let x = 5; x <= 7; x++) this.placeBlockAtCurrentPosition(w, stairs, up, x, 12, 11, box);
    this.fillAll(w, box, [
      [5, 6, 7, 5, 7, 7, FENCE],
      [7, 6, 7, 7, 7, 7, FENCE],
      [5, 13, 12, 7, 13, 12, AIR],
      [2, 5, 2, 3, 5, 3, BRICK],
      [2, 5, 9, 3, 5, 10, BRICK],
      [2, 5, 4, 2, 5, 8, BRICK],
      [9, 5, 2, 10, 5, 3, BRICK],
      [9, 5, 9, 10, 5, 10, BRICK],
      [10, 5, 4, 10, 5, 8, BRICK],
    ]);
    const east = this.getMetadataWithOffset(stairs, 0);
    const west = this.getMetadataWithOffset(stairs, 1);
    for (const z of [2, 3, 9, 10]) this.placeBlockAtCurrentPosition(w, stairs, west, 4, 5, z, box);
    for (const z of [2, 3, 9, 10]) this.placeBlockAtCurrentPosition(w, stairs, east, 8, 5, z, box);
    this.fillAll(w, box, [
      [3, 4, 4, 4, 4, 8, B.slowSand],
      [8, 4, 4, 9, 4, 8, B.slowSand],
      [3, 5, 4, 4, 5, 8, B.netherStalk],
      [8, 5, 4, 9, 5, 8, B.netherStalk],
    ]);
    this.buildBase(w, box);
    return true;
  }
}

// ==================================================================== corridor pieces

/** ComponentNetherBridgeCorridor5: a straight indoor corridor. */
export class NetherBridgeCorridor5 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCorridor5 | null {
    const box = placement(list, x, y, z, -1, 0, 0, 5, 7, 5, facing);
    return box ? new NetherBridgeCorridor5(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextAhead(start as NetherBridgeStartPiece, list, rand, 1, 0, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 4, 1, 4, BRICK],
      [0, 2, 0, 4, 5, 4, AIR],
      [0, 2, 0, 0, 5, 4, BRICK],
      [4, 2, 0, 4, 5, 4, BRICK],
      [0, 3, 1, 0, 4, 1, FENCE],
      [0, 3, 3, 0, 4, 3, FENCE],
      [4, 3, 1, 4, 4, 1, FENCE],
      [4, 3, 3, 4, 4, 3, FENCE],
      [0, 6, 0, 4, 6, 4, BRICK],
    ]);
    this.pillars(w, box, 0, 4, 0, 4);
    return true;
  }
}

/** ComponentNetherBridgeCrossing2: an indoor four-way corridor crossing. */
export class NetherBridgeCrossing2 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCrossing2 | null {
    const box = placement(list, x, y, z, -1, 0, 0, 5, 7, 5, facing);
    return box ? new NetherBridgeCrossing2(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const s = start as NetherBridgeStartPiece;
    this.nextAhead(s, list, rand, 1, 0, true);
    this.nextLeft(s, list, rand, 0, 1, true);
    this.nextRight(s, list, rand, 0, 1, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 4, 1, 4, BRICK],
      [0, 2, 0, 4, 5, 4, AIR],
      [0, 2, 0, 0, 5, 0, BRICK],
      [4, 2, 0, 4, 5, 0, BRICK],
      [0, 2, 4, 0, 5, 4, BRICK],
      [4, 2, 4, 4, 5, 4, BRICK],
      [0, 6, 0, 4, 6, 4, BRICK],
    ]);
    this.pillars(w, box, 0, 4, 0, 4);
    return true;
  }
}

/** ComponentNetherBridgeCorridor2: a corridor turning right. */
export class NetherBridgeCorridor2 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCorridor2 | null {
    const box = placement(list, x, y, z, -1, 0, 0, 5, 7, 5, facing);
    return box ? new NetherBridgeCorridor2(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextRight(start as NetherBridgeStartPiece, list, rand, 0, 1, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 4, 1, 4, BRICK],
      [0, 2, 0, 4, 5, 4, AIR],
      [0, 2, 0, 0, 5, 4, BRICK],
      [0, 3, 1, 0, 4, 1, FENCE],
      [0, 3, 3, 0, 4, 3, FENCE],
      [4, 2, 0, 4, 5, 0, BRICK],
      [1, 2, 4, 4, 5, 4, BRICK],
      [1, 3, 4, 1, 4, 4, FENCE],
      [3, 3, 4, 3, 4, 4, FENCE],
      [0, 6, 0, 4, 6, 4, BRICK],
    ]);
    this.pillars(w, box, 0, 4, 0, 4);
    return true;
  }
}

/** ComponentNetherBridgeCorridor: a corridor turning left. */
export class NetherBridgeCorridor extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCorridor | null {
    const box = placement(list, x, y, z, -1, 0, 0, 5, 7, 5, facing);
    return box ? new NetherBridgeCorridor(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextLeft(start as NetherBridgeStartPiece, list, rand, 0, 1, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 4, 1, 4, BRICK],
      [0, 2, 0, 4, 5, 4, AIR],
      [4, 2, 0, 4, 5, 4, BRICK],
      [4, 3, 1, 4, 4, 1, FENCE],
      [4, 3, 3, 4, 4, 3, FENCE],
      [0, 2, 0, 0, 5, 0, BRICK],
      [0, 2, 4, 3, 5, 4, BRICK],
      [1, 3, 4, 1, 4, 4, FENCE],
      [3, 3, 4, 3, 4, 4, FENCE],
      [0, 6, 0, 4, 6, 4, BRICK],
    ]);
    this.pillars(w, box, 0, 4, 0, 4);
    return true;
  }
}

/** ComponentNetherBridgeCorridor3: an indoor staircase climbing seven blocks. */
export class NetherBridgeCorridor3 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCorridor3 | null {
    const box = placement(list, x, y, z, -1, -7, 0, 5, 14, 10, facing);
    return box ? new NetherBridgeCorridor3(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.nextAhead(start as NetherBridgeStartPiece, list, rand, 1, 0, true);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    const stairs = B.stairsNetherBrick;
    const meta = this.getMetadataWithOffset(stairs, 2);
    for (let z = 0; z <= 9; z++) {
      const floor = Math.max(1, 7 - z);
      const roof = Math.min(Math.max(floor + 5, 14 - z), 13);
      this.fillBox(w, box, 0, 0, z, 4, floor, z, BRICK);
      this.fillBox(w, box, 1, floor + 1, z, 3, roof - 1, z, AIR);
      if (z <= 6) {
        for (let x = 1; x <= 3; x++) this.placeBlockAtCurrentPosition(w, stairs, meta, x, floor + 1, z, box);
      }
      this.fillBox(w, box, 0, roof, z, 4, roof, z, BRICK);
      this.fillBox(w, box, 0, floor + 1, z, 0, roof - 1, z, BRICK);
      this.fillBox(w, box, 4, floor + 1, z, 4, roof - 1, z, BRICK);
      if ((z & 1) === 0) {
        this.fillBox(w, box, 0, floor + 2, z, 0, floor + 3, z, FENCE);
        this.fillBox(w, box, 4, floor + 2, z, 4, floor + 3, z, FENCE);
      }
      for (let x = 0; x <= 4; x++) this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, x, -1, z, box);
    }
    return true;
  }
}

/** ComponentNetherBridgeCorridor4: a T-shaped corridor junction with a balcony. */
export class NetherBridgeCorridor4 extends NetherBridgePiece {
  static create(list: StructureComponent[], _rand: JavaRandom, x: number, y: number, z: number, facing: number, depth: number): NetherBridgeCorridor4 | null {
    const box = placement(list, x, y, z, -3, 0, 0, 9, 7, 9, facing);
    return box ? new NetherBridgeCorridor4(depth, facing, box) : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const s = start as NetherBridgeStartPiece;
    const along = this.coordBaseMode === 1 || this.coordBaseMode === 2 ? 5 : 1;
    // Each side exit leads into corridors seven times in eight, else onto a bridge.
    this.nextLeft(s, list, rand, 0, along, rand.nextInt(8) > 0);
    this.nextRight(s, list, rand, 0, along, rand.nextInt(8) > 0);
  }

  addComponentParts(w: IWorld, _rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillAll(w, box, [
      [0, 0, 0, 8, 1, 8, BRICK],
      [0, 2, 0, 8, 5, 8, AIR],
      [0, 6, 0, 8, 6, 5, BRICK],
      [0, 2, 0, 2, 5, 0, BRICK],
      [6, 2, 0, 8, 5, 0, BRICK],
      [1, 3, 0, 1, 4, 0, FENCE],
      [7, 3, 0, 7, 4, 0, FENCE],
      [0, 2, 4, 8, 2, 8, BRICK],
      [1, 1, 4, 2, 2, 4, AIR],
      [6, 1, 4, 7, 2, 4, AIR],
      [0, 3, 8, 8, 3, 8, FENCE],
      [0, 3, 6, 0, 3, 7, FENCE],
      [8, 3, 6, 8, 3, 7, FENCE],
      [0, 3, 4, 0, 5, 5, BRICK],
      [8, 3, 4, 8, 5, 5, BRICK],
      [1, 3, 5, 2, 5, 5, BRICK],
      [6, 3, 5, 7, 5, 5, BRICK],
      [1, 4, 5, 1, 5, 5, FENCE],
      [7, 4, 5, 7, 5, 5, FENCE],
    ]);
    for (let z = 0; z <= 5; z++) for (let x = 0; x <= 8; x++) this.fillCurrentPositionBlocksDownwards(w, BRICK, 0, x, -1, z, box);
    return true;
  }
}

// ==================================================================== weights

/** StructureNetherBridgePieces.primaryComponents: the open-air bridge pieces. */
const PRIMARY: readonly PieceWeight[] = [
  new PieceWeight(NetherBridgeStraight, 30, 0, true),
  new PieceWeight(NetherBridgeCrossing3, 10, 4),
  new PieceWeight(NetherBridgeCrossing, 10, 4),
  new PieceWeight(NetherBridgeStairs, 10, 3),
  new PieceWeight(NetherBridgeThrone, 5, 2),
  new PieceWeight(NetherBridgeEntrance, 5, 1),
];

/** StructureNetherBridgePieces.secondaryComponents: the indoor corridor pieces. */
const SECONDARY: readonly PieceWeight[] = [
  new PieceWeight(NetherBridgeCorridor5, 25, 0, true),
  new PieceWeight(NetherBridgeCrossing2, 15, 5),
  new PieceWeight(NetherBridgeCorridor2, 5, 10),
  new PieceWeight(NetherBridgeCorridor, 5, 10),
  new PieceWeight(NetherBridgeCorridor3, 10, 3, true),
  new PieceWeight(NetherBridgeCorridor4, 7, 2),
  new PieceWeight(NetherBridgeNetherStalkRoom, 5, 2),
];
