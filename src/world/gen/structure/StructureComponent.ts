import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import { Direction, Facing } from '../../../core/Facing';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { fillChest, fillDispenser, type ChestContent } from '../ChestLoot';
import { StructureBoundingBox } from './StructureBoundingBox';

/** Blocks whose metadata rotates like BlockDirectional (bed, cocoa, fence gate, pumpkins, repeaters, comparators). */
const DIRECTIONAL = new Set<number>([
  BlockIds.bed,
  BlockIds.cocoaPlant,
  BlockIds.fenceGate,
  BlockIds.pumpkin,
  BlockIds.pumpkinLantern,
  BlockIds.redstoneRepeaterIdle,
  BlockIds.redstoneRepeaterActive,
  BlockIds.redstoneComparatorIdle,
  BlockIds.redstoneComparatorActive,
]);

const STAIRS = new Set<number>([BlockIds.stairsCobblestone, BlockIds.stairsWoodOak, BlockIds.stairsNetherBrick, BlockIds.stairsStoneBrick, BlockIds.stairsSandStone]);

/** StructurePieceBlockSelector: picks the block of each position of a filled box. */
export interface StructurePieceBlockSelector {
  selectedBlockId: number;
  selectedBlockMetaData: number;
  selectBlocks(rand: JavaRandom, x: number, y: number, z: number, edge: boolean): void;
}

export function isLiquidId(id: number): boolean {
  return id > 0 && (Block.blocksList[id]?.blockMaterial.isLiquid() ?? false);
}

/**
 * One piece of a structure (StructureComponent): a bounding box, a facing (coordBaseMode) that
 * rotates the piece's local coordinates, and the helpers that place blocks clipped to the chunk
 * area being populated.
 */
export abstract class StructureComponent {
  boundingBox!: StructureBoundingBox;
  coordBaseMode = -1;

  constructor(public componentType: number) {}

  /** Adds the pieces this one leads to (corridors, doors...). */
  buildComponent(_start: StructureComponent, _list: StructureComponent[], _rand: JavaRandom): void {}

  /** Places the blocks inside `box`; false removes the piece from the structure. */
  abstract addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean;

  getBoundingBox(): StructureBoundingBox {
    return this.boundingBox;
  }

  getComponentType(): number {
    return this.componentType;
  }

  static findIntersecting(list: readonly StructureComponent[], box: StructureBoundingBox): StructureComponent | null {
    for (const c of list) if (c.boundingBox && c.boundingBox.intersectsWith(box)) return c;
    return null;
  }

  getCenter(): [number, number, number] {
    return [this.boundingBox.getCenterX(), this.boundingBox.getCenterY(), this.boundingBox.getCenterZ()];
  }

  protected isLiquidInStructureBoundingBox(w: IWorld, box: StructureBoundingBox): boolean {
    const bb = this.boundingBox;
    const x0 = Math.max(bb.minX - 1, box.minX);
    const y0 = Math.max(bb.minY - 1, box.minY);
    const z0 = Math.max(bb.minZ - 1, box.minZ);
    const x1 = Math.min(bb.maxX + 1, box.maxX);
    const y1 = Math.min(bb.maxY + 1, box.maxY);
    const z1 = Math.min(bb.maxZ + 1, box.maxZ);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (isLiquidId(w.getBlockId(x, y0, z))) return true;
        if (isLiquidId(w.getBlockId(x, y1, z))) return true;
      }
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (isLiquidId(w.getBlockId(x, y, z0))) return true;
        if (isLiquidId(w.getBlockId(x, y, z1))) return true;
      }
    }
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        if (isLiquidId(w.getBlockId(x0, y, z))) return true;
        if (isLiquidId(w.getBlockId(x1, y, z))) return true;
      }
    }
    return false;
  }

  protected getXWithOffset(x: number, z: number): number {
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return this.boundingBox.minX + x;
      case 1:
        return this.boundingBox.maxX - z;
      case 3:
        return this.boundingBox.minX + z;
      default:
        return x;
    }
  }

  protected getYWithOffset(y: number): number {
    return this.coordBaseMode === -1 ? y : y + this.boundingBox.minY;
  }

  protected getZWithOffset(x: number, z: number): number {
    switch (this.coordBaseMode) {
      case 0:
        return this.boundingBox.minZ + z;
      case 1:
      case 3:
        return this.boundingBox.minZ + x;
      case 2:
        return this.boundingBox.maxZ - z;
      default:
        return z;
    }
  }

  /** getMetadataWithOffset: rotates rails, doors, stairs, ladders, buttons and directional blocks. */
  protected getMetadataWithOffset(id: number, meta: number): number {
    const mode = this.coordBaseMode;
    if (id === BlockIds.rail) {
      if (mode === 1 || mode === 3) return meta === 1 ? 0 : 1;
    } else if (id === BlockIds.doorWood || id === BlockIds.doorIron) {
      if (mode === 0) {
        if (meta === 0) return 2;
        if (meta === 2) return 0;
      } else {
        if (mode === 1) return (meta + 1) & 3;
        if (mode === 3) return (meta + 3) & 3;
      }
    } else if (STAIRS.has(id)) {
      if (mode === 0) {
        if (meta === 2) return 3;
        if (meta === 3) return 2;
      } else if (mode === 1) {
        if (meta === 0) return 2;
        if (meta === 1) return 3;
        if (meta === 2) return 0;
        if (meta === 3) return 1;
      } else if (mode === 3) {
        if (meta === 0) return 2;
        if (meta === 1) return 3;
        if (meta === 2) return 1;
        if (meta === 3) return 0;
      }
    } else if (id === BlockIds.ladder) {
      if (mode === 0) {
        if (meta === 2) return 3;
        if (meta === 3) return 2;
      } else if (mode === 1) {
        if (meta === 2) return 4;
        if (meta === 3) return 5;
        if (meta === 4) return 2;
        if (meta === 5) return 3;
      } else if (mode === 3) {
        if (meta === 2) return 5;
        if (meta === 3) return 4;
        if (meta === 4) return 2;
        if (meta === 5) return 3;
      }
    } else if (id === BlockIds.stoneButton) {
      if (mode === 0) {
        if (meta === 3) return 4;
        if (meta === 4) return 3;
      } else if (mode === 1) {
        if (meta === 3) return 1;
        if (meta === 4) return 2;
        if (meta === 2) return 3;
        if (meta === 1) return 4;
      } else if (mode === 3) {
        if (meta === 3) return 2;
        if (meta === 4) return 1;
        if (meta === 2) return 3;
        if (meta === 1) return 4;
      }
    } else if (id === BlockIds.tripWireSource || DIRECTIONAL.has(id)) {
      if (mode === 0) {
        if (meta === 0 || meta === 2) return Direction.rotateOpposite[meta];
      } else if (mode === 1) {
        if (meta === 2) return 1;
        if (meta === 0) return 3;
        if (meta === 1) return 2;
        if (meta === 3) return 0;
      } else if (mode === 3) {
        if (meta === 2) return 3;
        if (meta === 0) return 1;
        if (meta === 1) return 2;
        if (meta === 3) return 0;
      }
    } else if (id === BlockIds.pistonBase || id === BlockIds.pistonStickyBase || id === BlockIds.lever || id === BlockIds.dispenser) {
      if (mode === 0) {
        if (meta === 2 || meta === 3) return Facing.oppositeSide[meta];
      } else if (mode === 1) {
        if (meta === 2) return 4;
        if (meta === 3) return 5;
        if (meta === 4) return 2;
        if (meta === 5) return 3;
      } else if (mode === 3) {
        if (meta === 2) return 5;
        if (meta === 3) return 4;
        if (meta === 4) return 2;
        if (meta === 5) return 3;
      }
    }
    return meta;
  }

  protected placeBlockAtCurrentPosition(w: IWorld, id: number, meta: number, x: number, y: number, z: number, box: StructureBoundingBox): void {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (box.isVecInside(wx, wy, wz)) w.setBlock(wx, wy, wz, id, meta, 2);
  }

  protected getBlockIdAtCurrentPosition(w: IWorld, x: number, y: number, z: number, box: StructureBoundingBox): number {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    return box.isVecInside(wx, wy, wz) ? w.getBlockId(wx, wy, wz) : 0;
  }

  protected fillWithAir(w: IWorld, box: StructureBoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.placeBlockAtCurrentPosition(w, 0, 0, x, y, z, box);
  }

  /** Box of `edgeId` with `insideId` inside; when `alwaysReplace` is false only non-air spots. */
  protected fillWithBlocks(
    w: IWorld,
    box: StructureBoundingBox,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    edgeId: number,
    insideId: number,
    onlyReplaceSolid: boolean,
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (onlyReplaceSolid && this.getBlockIdAtCurrentPosition(w, x, y, z, box) === 0) continue;
          const inside = y !== y0 && y !== y1 && x !== x0 && x !== x1 && z !== z0 && z !== z1;
          this.placeBlockAtCurrentPosition(w, inside ? insideId : edgeId, 0, x, y, z, box);
        }
      }
    }
  }

  protected fillWithMetadataBlocks(
    w: IWorld,
    box: StructureBoundingBox,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    edgeId: number,
    edgeMeta: number,
    insideId: number,
    insideMeta: number,
    onlyReplaceSolid: boolean,
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (onlyReplaceSolid && this.getBlockIdAtCurrentPosition(w, x, y, z, box) === 0) continue;
          const inside = y !== y0 && y !== y1 && x !== x0 && x !== x1 && z !== z0 && z !== z1;
          if (inside) this.placeBlockAtCurrentPosition(w, insideId, insideMeta, x, y, z, box);
          else this.placeBlockAtCurrentPosition(w, edgeId, edgeMeta, x, y, z, box);
        }
      }
    }
  }

  protected fillWithRandomizedBlocks(
    w: IWorld,
    box: StructureBoundingBox,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    onlyReplaceSolid: boolean,
    rand: JavaRandom,
    selector: StructurePieceBlockSelector,
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (onlyReplaceSolid && this.getBlockIdAtCurrentPosition(w, x, y, z, box) === 0) continue;
          selector.selectBlocks(rand, x, y, z, y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1);
          this.placeBlockAtCurrentPosition(w, selector.selectedBlockId, selector.selectedBlockMetaData, x, y, z, box);
        }
      }
    }
  }

  protected randomlyFillWithBlocks(
    w: IWorld,
    box: StructureBoundingBox,
    rand: JavaRandom,
    chance: number,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    edgeId: number,
    insideId: number,
    onlyReplaceSolid: boolean,
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (rand.nextFloat() > chance) continue;
          if (onlyReplaceSolid && this.getBlockIdAtCurrentPosition(w, x, y, z, box) === 0) continue;
          const inside = y !== y0 && y !== y1 && x !== x0 && x !== x1 && z !== z0 && z !== z1;
          this.placeBlockAtCurrentPosition(w, inside ? insideId : edgeId, 0, x, y, z, box);
        }
      }
    }
  }

  protected randomlyPlaceBlock(w: IWorld, box: StructureBoundingBox, rand: JavaRandom, chance: number, x: number, y: number, z: number, id: number, meta: number): void {
    if (rand.nextFloat() < chance) this.placeBlockAtCurrentPosition(w, id, meta, x, y, z, box);
  }

  /** A rough dome (cave-ins of the stronghold): positions within a 1.05 ellipsoid. */
  protected randomlyRareFillWithBlocks(
    w: IWorld,
    box: StructureBoundingBox,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: number,
    onlyReplaceSolid: boolean,
  ): void {
    const f = Math.fround;
    const sx = f(x1 - x0 + 1);
    const sy = f(y1 - y0 + 1);
    const sz = f(z1 - z0 + 1);
    const cx = f(x0 + f(sx / 2));
    const cz = f(z0 + f(sz / 2));
    for (let y = y0; y <= y1; y++) {
      const dy = f(f(y - y0) / sy);
      for (let x = x0; x <= x1; x++) {
        const dx = f(f(x - cx) / f(sx * 0.5));
        for (let z = z0; z <= z1; z++) {
          const dz = f(f(z - cz) / f(sz * 0.5));
          if (onlyReplaceSolid && this.getBlockIdAtCurrentPosition(w, x, y, z, box) === 0) continue;
          const d = f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz));
          if (d <= f(1.05)) this.placeBlockAtCurrentPosition(w, id, 0, x, y, z, box);
        }
      }
    }
  }

  protected clearCurrentPositionBlocksUpwards(w: IWorld, x: number, y: number, z: number, box: StructureBoundingBox): void {
    const wx = this.getXWithOffset(x, z);
    let wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (!box.isVecInside(wx, wy, wz)) return;
    while (!w.isAirBlock(wx, wy, wz) && wy < 255) {
      w.setBlock(wx, wy, wz, 0, 0, 2);
      wy++;
    }
  }

  protected fillCurrentPositionBlocksDownwards(w: IWorld, id: number, meta: number, x: number, y: number, z: number, box: StructureBoundingBox): void {
    const wx = this.getXWithOffset(x, z);
    let wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (!box.isVecInside(wx, wy, wz)) return;
    while ((w.isAirBlock(wx, wy, wz) || w.getBlockMaterial(wx, wy, wz).isLiquid()) && wy > 1) {
      w.setBlock(wx, wy, wz, id, meta, 2);
      wy--;
    }
  }

  protected generateStructureChestContents(w: IWorld, box: StructureBoundingBox, rand: JavaRandom, x: number, y: number, z: number, table: readonly ChestContent[], count: number): boolean {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (!box.isVecInside(wx, wy, wz) || w.getBlockId(wx, wy, wz) === BlockIds.chest) return false;
    w.setBlock(wx, wy, wz, BlockIds.chest, 0, 2);
    fillChest(w, rand, wx, wy, wz, table, count);
    return true;
  }

  protected generateStructureDispenserContents(
    w: IWorld,
    box: StructureBoundingBox,
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    meta: number,
    table: readonly ChestContent[],
    count: number,
  ): boolean {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (!box.isVecInside(wx, wy, wz) || w.getBlockId(wx, wy, wz) === BlockIds.dispenser) return false;
    w.setBlock(wx, wy, wz, BlockIds.dispenser, this.getMetadataWithOffset(BlockIds.dispenser, meta), 2);
    fillDispenser(w, rand, wx, wy, wz, table, count);
    return true;
  }

  protected placeDoorAtCurrentPosition(w: IWorld, box: StructureBoundingBox, _rand: JavaRandom, x: number, y: number, z: number, dir: number): void {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (box.isVecInside(wx, wy, wz)) placeDoorBlock(w, wx, wy, wz, dir, BlockIds.doorWood);
  }
}

/** ItemDoor.placeDoorBlock: both halves, hinged on the side with more solid neighbours. */
export function placeDoorBlock(w: IWorld, x: number, y: number, z: number, dir: number, doorId: number): void {
  let dx = 0;
  let dz = 0;
  if (dir === 0) dz = 1;
  if (dir === 1) dx = -1;
  if (dir === 2) dz = -1;
  if (dir === 3) dx = 1;
  const left = (w.isBlockNormalCube(x - dx, y, z - dz) ? 1 : 0) + (w.isBlockNormalCube(x - dx, y + 1, z - dz) ? 1 : 0);
  const right = (w.isBlockNormalCube(x + dx, y, z + dz) ? 1 : 0) + (w.isBlockNormalCube(x + dx, y + 1, z + dz) ? 1 : 0);
  const leftDoor = w.getBlockId(x - dx, y, z - dz) === doorId || w.getBlockId(x - dx, y + 1, z - dz) === doorId;
  const rightDoor = w.getBlockId(x + dx, y, z + dz) === doorId || w.getBlockId(x + dx, y + 1, z + dz) === doorId;
  let mirror = false;
  if (leftDoor && !rightDoor) mirror = true;
  else if (right > left) mirror = true;
  w.setBlock(x, y, z, doorId, dir, 2);
  w.setBlock(x, y + 1, z, doorId, 8 | (mirror ? 1 : 0), 2);
  w.notifyBlocksOfNeighborChange(x, y, z, doorId);
  w.notifyBlocksOfNeighborChange(x, y + 1, z, doorId);
}
