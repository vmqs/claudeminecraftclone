import { BlockIds as B, ItemIds as I } from '../../../block/BlockIds';
import { JavaRandom } from '../../../core/JavaRandom';
import { Biomes, type BiomeGenBase } from '../../biome/BiomeGenBase';
import type { IWorld } from '../../IWorld';
import { chestContent, enchantedBookContent, placeSpawner, type ChestContent } from '../ChestLoot';
import { MapGenStructure } from './MapGenStructure';
import { StructureBoundingBox } from './StructureBoundingBox';
import { StructureComponent, type StructurePieceBlockSelector } from './StructureComponent';
import { StructureStart } from './StructureStart';

/** EnumDoor: the doorway styles of stronghold rooms. */
export enum EnumDoor {
  OPENING,
  WOOD_DOOR,
  GRATES,
  IRON_DOOR,
}

const STRONGHOLD_CORRIDOR_LOOT: readonly ChestContent[] = [
  chestContent(I.enderPearl, 0, 1, 1, 10),
  chestContent(I.diamond, 0, 1, 3, 3),
  chestContent(I.ingotIron, 0, 1, 5, 10),
  chestContent(I.ingotGold, 0, 1, 3, 5),
  chestContent(I.redstone, 0, 4, 9, 5),
  chestContent(I.bread, 0, 1, 3, 15),
  chestContent(I.appleRed, 0, 1, 3, 15),
  chestContent(I.pickaxeIron, 0, 1, 1, 5),
  chestContent(I.swordIron, 0, 1, 1, 5),
  chestContent(I.plateIron, 0, 1, 1, 5),
  chestContent(I.helmetIron, 0, 1, 1, 5),
  chestContent(I.legsIron, 0, 1, 1, 5),
  chestContent(I.bootsIron, 0, 1, 1, 5),
  chestContent(I.appleGold, 0, 1, 1, 1),
];
const STRONGHOLD_LIBRARY_LOOT: readonly ChestContent[] = [
  chestContent(I.book, 0, 1, 3, 20),
  chestContent(I.paper, 0, 2, 7, 20),
  chestContent(I.emptyMap, 0, 1, 1, 1),
  chestContent(I.compass, 0, 1, 1, 1),
];
const STRONGHOLD_CROSSING_LOOT: readonly ChestContent[] = [
  chestContent(I.ingotIron, 0, 1, 5, 10),
  chestContent(I.ingotGold, 0, 1, 3, 5),
  chestContent(I.redstone, 0, 4, 9, 5),
  chestContent(I.coal, 0, 3, 8, 10),
  chestContent(I.bread, 0, 1, 3, 15),
  chestContent(I.appleRed, 0, 1, 3, 15),
  chestContent(I.pickaxeIron, 0, 1, 1, 1),
];

/** StructureStrongholdStones: stone brick walls, 20% cracked, 30% mossy, 5% silverfish. */
const STRONGHOLD_STONES: StructurePieceBlockSelector = {
  selectedBlockId: 0,
  selectedBlockMetaData: 0,
  selectBlocks(rand: JavaRandom, _x: number, _y: number, _z: number, edge: boolean): void {
    if (!edge) {
      this.selectedBlockId = 0;
      this.selectedBlockMetaData = 0;
      return;
    }
    this.selectedBlockId = B.stoneBrick;
    const r = rand.nextFloat();
    if (r < 0.2) this.selectedBlockMetaData = 2;
    else if (r < 0.5) this.selectedBlockMetaData = 1;
    else if (r < 0.55) {
      this.selectedBlockId = B.silverfish;
      this.selectedBlockMetaData = 2;
    } else this.selectedBlockMetaData = 0;
  },
};

/** A stronghold piece with doorways and exits (ComponentStronghold). */
export abstract class ComponentStronghold extends StructureComponent {
  protected placeDoor(w: IWorld, rand: JavaRandom, box: StructureBoundingBox, door: EnumDoor, x: number, y: number, z: number): void {
    switch (door) {
      case EnumDoor.OPENING:
      default:
        this.fillWithBlocks(w, box, x, y, z, x + 3 - 1, y + 3 - 1, z, 0, 0, false);
        break;
      case EnumDoor.WOOD_DOOR:
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 1, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.doorWood, 0, x + 1, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.doorWood, 8, x + 1, y + 1, z, box);
        break;
      case EnumDoor.GRATES:
        this.placeBlockAtCurrentPosition(w, 0, 0, x + 1, y, z, box);
        this.placeBlockAtCurrentPosition(w, 0, 0, x + 1, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x + 1, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x + 2, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x + 2, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, x + 2, y, z, box);
        break;
      case EnumDoor.IRON_DOOR:
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 1, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y + 2, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, x + 2, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.doorIron, 0, x + 1, y, z, box);
        this.placeBlockAtCurrentPosition(w, B.doorIron, 8, x + 1, y + 1, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneButton, this.getMetadataWithOffset(B.stoneButton, 4), x + 2, y + 1, z + 1, box);
        this.placeBlockAtCurrentPosition(w, B.stoneButton, this.getMetadataWithOffset(B.stoneButton, 3), x + 2, y + 1, z - 1, box);
    }
  }

  protected getRandomDoor(rand: JavaRandom): EnumDoor {
    switch (rand.nextInt(5)) {
      case 2:
        return EnumDoor.WOOD_DOOR;
      case 3:
        return EnumDoor.GRATES;
      case 4:
        return EnumDoor.IRON_DOOR;
      default:
        return EnumDoor.OPENING;
    }
  }

  /** The exit straight ahead. */
  protected getNextComponentNormal(
    start: ComponentStrongholdStairs2,
    list: StructureComponent[],
    rand: JavaRandom,
    dx: number,
    dy: number,
  ): StructureComponent | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
        return getNextValidComponent(start, list, rand, bb.minX + dx, bb.minY + dy, bb.maxZ + 1, this.coordBaseMode, t);
      case 1:
        return getNextValidComponent(start, list, rand, bb.minX - 1, bb.minY + dy, bb.minZ + dx, this.coordBaseMode, t);
      case 2:
        return getNextValidComponent(start, list, rand, bb.minX + dx, bb.minY + dy, bb.minZ - 1, this.coordBaseMode, t);
      case 3:
        return getNextValidComponent(start, list, rand, bb.maxX + 1, bb.minY + dy, bb.minZ + dx, this.coordBaseMode, t);
      default:
        return null;
    }
  }

  /** The exit on the negative side. */
  protected getNextComponentX(
    start: ComponentStrongholdStairs2,
    list: StructureComponent[],
    rand: JavaRandom,
    dy: number,
    offset: number,
  ): StructureComponent | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return getNextValidComponent(start, list, rand, bb.minX - 1, bb.minY + dy, bb.minZ + offset, 1, t);
      case 1:
      case 3:
        return getNextValidComponent(start, list, rand, bb.minX + offset, bb.minY + dy, bb.minZ - 1, 2, t);
      default:
        return null;
    }
  }

  /** The exit on the positive side. */
  protected getNextComponentZ(
    start: ComponentStrongholdStairs2,
    list: StructureComponent[],
    rand: JavaRandom,
    dy: number,
    offset: number,
  ): StructureComponent | null {
    const bb = this.boundingBox;
    const t = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return getNextValidComponent(start, list, rand, bb.maxX + 1, bb.minY + dy, bb.minZ + offset, 3, t);
      case 1:
      case 3:
        return getNextValidComponent(start, list, rand, bb.minX + offset, bb.minY + dy, bb.maxZ + 1, 0, t);
      default:
        return null;
    }
  }

  static canStrongholdGoDeeper(box: StructureBoundingBox | null): boolean {
    return box !== null && box.minY > 10;
  }
}

/** A spiral staircase; the first one of a stronghold (at the start chunk) leads to a crossing. */
export class ComponentStrongholdStairs extends ComponentStronghold {
  private readonly isStart: boolean;
  doorType: EnumDoor;

  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox | null, facing: number, x = 0, z = 0) {
    super(type);
    if (box === null) {
      this.isStart = true;
      this.coordBaseMode = rand.nextInt(4);
      this.doorType = EnumDoor.OPENING;
      this.boundingBox = new StructureBoundingBox(x, 64, z, x + 5 - 1, 74, z + 5 - 1);
    } else {
      this.isStart = false;
      this.coordBaseMode = facing;
      this.doorType = this.getRandomDoor(rand);
      this.boundingBox = box;
    }
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    if (this.isStart) pieces.strongComponentType = ComponentStrongholdCrossing.findValidPlacement;
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 1, 1);
  }

  static getStrongholdStairsComponent(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdStairs | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -7, 0, 5, 11, 5, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdStairs(type, rand, bb, facing)
      : null;
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 10, 4, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 7, 0);
      this.placeDoor(w, rand, box, EnumDoor.OPENING, 1, 1, 4);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 6, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 5, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 1, 6, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 5, 2, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 4, 3, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 1, 5, 3, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 4, 3, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 3, 3, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 3, 4, 3, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 2, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 3, 3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 2, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 1, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 1, 2, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 1, 2, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 1, 1, 3, box);
      return true;
    }
  }
}

/** The start staircase, which tracks the piece budget and the portal room. */
export class ComponentStrongholdStairs2 extends ComponentStrongholdStairs {
  strongholdPieceWeight: StructureStrongholdPieceWeight | null = null;
  strongholdPortalRoom: ComponentStrongholdPortalRoom | null = null;
  /** field_75026_c: pieces still to be expanded. */
  readonly pendingPieces: StructureComponent[] = [];

  constructor(type: number, rand: JavaRandom, x: number, z: number) {
    super(type, rand, null, 0, x, z);
  }

  /** Eyes of ender lead to the portal room. */
  override getCenter(): [number, number, number] {
    return this.strongholdPortalRoom !== null ? this.strongholdPortalRoom.getCenter() : super.getCenter();
  }
}

export class ComponentStrongholdCorridor extends ComponentStronghold {
  steps = 0;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.steps = facing !== 2 && facing !== 0 ? box.getXSize() : box.getZSize();
  }
  static findPieceBox(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number): StructureBoundingBox | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, 4, facing);
    let hit = StructureComponent.findIntersecting(list, bb);
    if (hit === null) {
      return null;
    } else {
      if (hit.getBoundingBox().minY === bb.minY) {
        for (let n = 3; n >= 1; n--) {
          bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, n - 1, facing);
          if (!hit.getBoundingBox().intersectsWith(bb)) {
            return StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, n, facing);
          }
        }
      }
      return null;
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      for (let z = 0; z < this.steps; z++) {
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 0, 0, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 0, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 0, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 0, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 4, 0, z, box);
        for (let y = 1; y <= 3; y++) {
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 0, y, z, box);
          this.placeBlockAtCurrentPosition(w, 0, 0, 1, y, z, box);
          this.placeBlockAtCurrentPosition(w, 0, 0, 2, y, z, box);
          this.placeBlockAtCurrentPosition(w, 0, 0, 3, y, z, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 4, y, z, box);
        }
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 0, 4, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 4, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 4, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 4, z, box);
        this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 4, 4, z, box);
      }
      return true;
    }
  }
}

export class ComponentStrongholdChestCorridor extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  hasMadeChest = false;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdChestCorridor | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, 7, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdChestCorridor(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 1, 1);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 4, 6, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 1, 0);
      this.placeDoor(w, rand, box, EnumDoor.OPENING, 1, 1, 6);
      this.fillWithBlocks(w, box, 3, 1, 2, 3, 1, 4, B.stoneBrick, B.stoneBrick, false);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 5, 3, 1, 1, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 5, 3, 1, 5, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 5, 3, 2, 2, box);
      this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 5, 3, 2, 4, box);
      for (let z = 2; z <= 4; z++) {
        this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 5, 2, 1, z, box);
      }
      if (!this.hasMadeChest) {
        const i3 = this.getYWithOffset(2);
        const i = this.getXWithOffset(3, 3);
        const i2 = this.getZWithOffset(3, 3);
        if (box.isVecInside(i, i3, i2)) {
          this.hasMadeChest = true;
          this.generateStructureChestContents(w, box, rand, 3, 2, 3, [...STRONGHOLD_CORRIDOR_LOOT, enchantedBookContent(rand, 1, 1, 1)], 2 + rand.nextInt(2));
        }
      }
      return true;
    }
  }
}

export class ComponentStrongholdCrossing extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  leftLow = false;
  leftHigh = false;
  rightLow = false;
  rightHigh = false;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
    this.leftLow = rand.nextBoolean();
    this.leftHigh = rand.nextBoolean();
    this.rightLow = rand.nextBoolean();
    this.rightHigh = rand.nextInt(3) > 0;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdCrossing | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -4, -3, 0, 10, 9, 11, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdCrossing(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    let i = 3;
    let i2 = 5;
    if (this.coordBaseMode === 1 || this.coordBaseMode === 2) {
      i = 8 - i;
      i2 = 8 - i2;
    }
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 5, 1);
    if (this.leftLow) {
      this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, i, 1);
    }
    if (this.leftHigh) {
      this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, i2, 7);
    }
    if (this.rightLow) {
      this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, i, 1);
    }
    if (this.rightHigh) {
      this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, i2, 7);
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 9, 8, 10, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 4, 3, 0);
      if (this.leftLow) {
        this.fillWithBlocks(w, box, 0, 3, 1, 0, 5, 3, 0, 0, false);
      }
      if (this.rightLow) {
        this.fillWithBlocks(w, box, 9, 3, 1, 9, 5, 3, 0, 0, false);
      }
      if (this.leftHigh) {
        this.fillWithBlocks(w, box, 0, 5, 7, 0, 7, 9, 0, 0, false);
      }
      if (this.rightHigh) {
        this.fillWithBlocks(w, box, 9, 5, 7, 9, 7, 9, 0, 0, false);
      }
      this.fillWithBlocks(w, box, 5, 1, 10, 7, 3, 10, 0, 0, false);
      this.fillWithRandomizedBlocks(w, box, 1, 2, 1, 8, 2, 6, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 5, 4, 4, 9, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 8, 1, 5, 8, 4, 9, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 1, 4, 7, 3, 4, 9, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 1, 3, 5, 3, 3, 6, false, rand, STRONGHOLD_STONES);
      this.fillWithBlocks(w, box, 1, 3, 4, 3, 3, 4, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithBlocks(w, box, 1, 4, 6, 3, 4, 6, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithRandomizedBlocks(w, box, 5, 1, 7, 7, 1, 8, false, rand, STRONGHOLD_STONES);
      this.fillWithBlocks(w, box, 5, 1, 9, 7, 1, 9, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithBlocks(w, box, 5, 2, 7, 7, 2, 7, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithBlocks(w, box, 4, 5, 7, 4, 5, 9, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithBlocks(w, box, 8, 5, 7, 8, 5, 9, B.stoneSingleSlab, B.stoneSingleSlab, false);
      this.fillWithBlocks(w, box, 5, 5, 7, 7, 5, 9, B.stoneDoubleSlab, B.stoneDoubleSlab, false);
      this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 6, 5, 6, box);
      return true;
    }
  }
}

export class ComponentStrongholdLeftTurn extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdLeftTurn | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, 5, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdLeftTurn(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    if (this.coordBaseMode !== 2 && this.coordBaseMode !== 3) {
      this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, 1, 1);
    } else {
      this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, 1, 1);
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 4, 4, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 1, 0);
      if (this.coordBaseMode !== 2 && this.coordBaseMode !== 3) {
        this.fillWithBlocks(w, box, 4, 1, 1, 4, 3, 3, 0, 0, false);
      } else {
        this.fillWithBlocks(w, box, 0, 1, 1, 0, 3, 3, 0, 0, false);
      }
      return true;
    }
  }
}

export class ComponentStrongholdLibrary extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  isLargeRoom = false;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
    this.isLargeRoom = box.getYSize() > 6;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdLibrary | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -4, -1, 0, 14, 11, 15, facing);
    if (!ComponentStronghold.canStrongholdGoDeeper(bb) || StructureComponent.findIntersecting(list, bb) !== null) {
      bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -4, -1, 0, 14, 6, 15, facing);
      if (!ComponentStronghold.canStrongholdGoDeeper(bb) || StructureComponent.findIntersecting(list, bb) !== null) {
        return null;
      }
    }
    return new ComponentStrongholdLibrary(type, rand, bb, facing);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      let i = 11;
      if (!this.isLargeRoom) {
        i = 6;
      }
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 13, i - 1, 14, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 4, 1, 0);
      this.randomlyFillWithBlocks(w, box, rand, 0.07, 2, 1, 1, 11, 4, 13, B.web, B.web, false);
      for (let z = 1; z <= 13; z++) {
        if ((z - 1) % 4 === 0) {
          this.fillWithBlocks(w, box, 1, 1, z, 1, 4, z, B.planks, B.planks, false);
          this.fillWithBlocks(w, box, 12, 1, z, 12, 4, z, B.planks, B.planks, false);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 3, z, box);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 11, 3, z, box);
          if (this.isLargeRoom) {
            this.fillWithBlocks(w, box, 1, 6, z, 1, 9, z, B.planks, B.planks, false);
            this.fillWithBlocks(w, box, 12, 6, z, 12, 9, z, B.planks, B.planks, false);
          }
        } else {
          this.fillWithBlocks(w, box, 1, 1, z, 1, 4, z, B.bookShelf, B.bookShelf, false);
          this.fillWithBlocks(w, box, 12, 1, z, 12, 4, z, B.bookShelf, B.bookShelf, false);
          if (this.isLargeRoom) {
            this.fillWithBlocks(w, box, 1, 6, z, 1, 9, z, B.bookShelf, B.bookShelf, false);
            this.fillWithBlocks(w, box, 12, 6, z, 12, 9, z, B.bookShelf, B.bookShelf, false);
          }
        }
      }
      for (let z3 = 3; z3 < 12; z3 += 2) {
        this.fillWithBlocks(w, box, 3, 1, z3, 4, 3, z3, B.bookShelf, B.bookShelf, false);
        this.fillWithBlocks(w, box, 6, 1, z3, 7, 3, z3, B.bookShelf, B.bookShelf, false);
        this.fillWithBlocks(w, box, 9, 1, z3, 10, 3, z3, B.bookShelf, B.bookShelf, false);
      }
      if (this.isLargeRoom) {
        this.fillWithBlocks(w, box, 1, 5, 1, 3, 5, 13, B.planks, B.planks, false);
        this.fillWithBlocks(w, box, 10, 5, 1, 12, 5, 13, B.planks, B.planks, false);
        this.fillWithBlocks(w, box, 4, 5, 1, 9, 5, 2, B.planks, B.planks, false);
        this.fillWithBlocks(w, box, 4, 5, 12, 9, 5, 13, B.planks, B.planks, false);
        this.placeBlockAtCurrentPosition(w, B.planks, 0, 9, 5, 11, box);
        this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 5, 11, box);
        this.placeBlockAtCurrentPosition(w, B.planks, 0, 9, 5, 10, box);
        this.fillWithBlocks(w, box, 3, 6, 2, 3, 6, 12, B.fence, B.fence, false);
        this.fillWithBlocks(w, box, 10, 6, 2, 10, 6, 10, B.fence, B.fence, false);
        this.fillWithBlocks(w, box, 4, 6, 2, 9, 6, 2, B.fence, B.fence, false);
        this.fillWithBlocks(w, box, 4, 6, 12, 8, 6, 12, B.fence, B.fence, false);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, 9, 6, 11, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, 8, 6, 11, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, 9, 6, 10, box);
        const ladderMeta3 = this.getMetadataWithOffset(B.ladder, 3);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 1, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 2, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 3, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 4, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 5, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 6, 13, box);
        this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 10, 7, 13, box);
        let x = 7;
        let z2 = 7;
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 1, 9, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x, 9, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 1, 8, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x, 8, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 1, 7, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x, 7, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 2, 7, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x + 1, 7, z2, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 1, 7, z2 - 1, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x - 1, 7, z2 + 1, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x, 7, z2 - 1, box);
        this.placeBlockAtCurrentPosition(w, B.fence, 0, x, 7, z2 + 1, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x - 2, 8, z2, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x + 1, 8, z2, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x - 1, 8, z2 - 1, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x - 1, 8, z2 + 1, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x, 8, z2 - 1, box);
        this.placeBlockAtCurrentPosition(w, B.torchWood, 0, x, 8, z2 + 1, box);
      }
      this.generateStructureChestContents(w, box, rand, 3, 3, 5, [...STRONGHOLD_LIBRARY_LOOT, enchantedBookContent(rand, 1, 5, 2)], 1 + rand.nextInt(4));
      if (this.isLargeRoom) {
        this.placeBlockAtCurrentPosition(w, 0, 0, 12, 9, 1, box);
        this.generateStructureChestContents(w, box, rand, 12, 8, 1, [...STRONGHOLD_LIBRARY_LOOT, enchantedBookContent(rand, 1, 5, 2)], 1 + rand.nextInt(4));
      }
      return true;
    }
  }
}

export class ComponentStrongholdPortalRoom extends ComponentStronghold {
  hasSpawner = false;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdPortalRoom | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -4, -1, 0, 11, 8, 16, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdPortalRoom(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    if (start !== null) {
      (start as ComponentStrongholdStairs2).strongholdPortalRoom = this;
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 10, 7, 15, false, rand, STRONGHOLD_STONES);
    this.placeDoor(w, rand, box, EnumDoor.GRATES, 4, 1, 0);
    let y = 6;
    this.fillWithRandomizedBlocks(w, box, 1, y, 1, 1, y, 14, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 9, y, 1, 9, y, 14, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 2, y, 1, 8, y, 2, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 2, y, 14, 8, y, 14, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 1, 1, 1, 2, 1, 4, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 8, 1, 1, 9, 1, 4, false, rand, STRONGHOLD_STONES);
    this.fillWithBlocks(w, box, 1, 1, 1, 1, 1, 3, B.lavaMoving, B.lavaMoving, false);
    this.fillWithBlocks(w, box, 9, 1, 1, 9, 1, 3, B.lavaMoving, B.lavaMoving, false);
    this.fillWithRandomizedBlocks(w, box, 3, 1, 8, 7, 1, 12, false, rand, STRONGHOLD_STONES);
    this.fillWithBlocks(w, box, 4, 1, 9, 6, 1, 11, B.lavaMoving, B.lavaMoving, false);
    for (let z = 3; z < 14; z += 2) {
      this.fillWithBlocks(w, box, 0, 3, z, 0, 4, z, B.fenceIron, B.fenceIron, false);
      this.fillWithBlocks(w, box, 10, 3, z, 10, 4, z, B.fenceIron, B.fenceIron, false);
    }
    for (let x2 = 2; x2 < 9; x2 += 2) {
      this.fillWithBlocks(w, box, x2, 3, 15, x2, 4, 15, B.fenceIron, B.fenceIron, false);
    }
    const stairsMeta3 = this.getMetadataWithOffset(B.stairsStoneBrick, 3);
    this.fillWithRandomizedBlocks(w, box, 4, 1, 5, 6, 1, 7, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 4, 2, 6, 6, 2, 7, false, rand, STRONGHOLD_STONES);
    this.fillWithRandomizedBlocks(w, box, 4, 3, 7, 6, 3, 7, false, rand, STRONGHOLD_STONES);
    for (let x = 4; x <= 6; x++) {
      this.placeBlockAtCurrentPosition(w, B.stairsStoneBrick, stairsMeta3, x, 1, 4, box);
      this.placeBlockAtCurrentPosition(w, B.stairsStoneBrick, stairsMeta3, x, 2, 5, box);
      this.placeBlockAtCurrentPosition(w, B.stairsStoneBrick, stairsMeta3, x, 3, 6, box);
    }
    let i6 = 2;
    let i = 0;
    let i2 = 3;
    let i3 = 1;
    switch (this.coordBaseMode) {
      case 0:
        i6 = 0;
        i = 2;
        break;
      case 1:
        i6 = 1;
        i = 3;
        i2 = 0;
        i3 = 2;
        break;
      case 2:
      default:
        break;
      case 3:
        i6 = 3;
        i = 1;
        i2 = 0;
        i3 = 2;
    }
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i6 + (rand.nextFloat() > 0.9 ? 4 : 0), 4, 3, 8, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i6 + (rand.nextFloat() > 0.9 ? 4 : 0), 5, 3, 8, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i6 + (rand.nextFloat() > 0.9 ? 4 : 0), 6, 3, 8, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i + (rand.nextFloat() > 0.9 ? 4 : 0), 4, 3, 12, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i + (rand.nextFloat() > 0.9 ? 4 : 0), 5, 3, 12, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i + (rand.nextFloat() > 0.9 ? 4 : 0), 6, 3, 12, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i2 + (rand.nextFloat() > 0.9 ? 4 : 0), 3, 3, 9, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i2 + (rand.nextFloat() > 0.9 ? 4 : 0), 3, 3, 10, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i2 + (rand.nextFloat() > 0.9 ? 4 : 0), 3, 3, 11, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i3 + (rand.nextFloat() > 0.9 ? 4 : 0), 7, 3, 9, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i3 + (rand.nextFloat() > 0.9 ? 4 : 0), 7, 3, 10, box);
    this.placeBlockAtCurrentPosition(w, B.endPortalFrame, i3 + (rand.nextFloat() > 0.9 ? 4 : 0), 7, 3, 11, box);
    if (!this.hasSpawner) {
      y = this.getYWithOffset(3);
      const i4 = this.getXWithOffset(5, 6);
      const i5 = this.getZWithOffset(5, 6);
      if (box.isVecInside(i4, y, i5)) {
        this.hasSpawner = true;
        w.setBlock(i4, y, i5, B.mobSpawner, 0, 2);
        placeSpawner(w, i4, y, i5, 'Silverfish');
      }
    }
    return true;
  }
}

export class ComponentStrongholdPrison extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdPrison | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 9, 5, 11, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdPrison(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 1, 1);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 8, 4, 10, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 1, 0);
      this.fillWithBlocks(w, box, 1, 1, 10, 3, 3, 10, 0, 0, false);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 1, 4, 3, 1, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 3, 4, 3, 3, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 7, 4, 3, 7, false, rand, STRONGHOLD_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 9, 4, 3, 9, false, rand, STRONGHOLD_STONES);
      this.fillWithBlocks(w, box, 4, 1, 4, 4, 3, 6, B.fenceIron, B.fenceIron, false);
      this.fillWithBlocks(w, box, 5, 1, 5, 7, 3, 5, B.fenceIron, B.fenceIron, false);
      this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, 4, 3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, 4, 3, 8, box);
      this.placeBlockAtCurrentPosition(w, B.doorIron, this.getMetadataWithOffset(B.doorIron, 3), 4, 1, 2, box);
      this.placeBlockAtCurrentPosition(w, B.doorIron, this.getMetadataWithOffset(B.doorIron, 3) + 8, 4, 2, 2, box);
      this.placeBlockAtCurrentPosition(w, B.doorIron, this.getMetadataWithOffset(B.doorIron, 3), 4, 1, 8, box);
      this.placeBlockAtCurrentPosition(w, B.doorIron, this.getMetadataWithOffset(B.doorIron, 3) + 8, 4, 2, 8, box);
      return true;
    }
  }
}

export class ComponentStrongholdRoomCrossing extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  roomType = 0;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
    this.roomType = rand.nextInt(5);
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdRoomCrossing | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -4, -1, 0, 11, 7, 11, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdRoomCrossing(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 4, 1);
    this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, 1, 4);
    this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, 1, 4);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 10, 6, 10, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 4, 1, 0);
      this.fillWithBlocks(w, box, 4, 1, 10, 6, 3, 10, 0, 0, false);
      this.fillWithBlocks(w, box, 0, 1, 4, 0, 3, 6, 0, 0, false);
      this.fillWithBlocks(w, box, 10, 1, 4, 10, 3, 6, 0, 0, false);
      switch (this.roomType) {
        case 0:
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 2, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 3, 5, box);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 4, 3, 5, box);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 6, 3, 5, box);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 5, 3, 4, box);
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 5, 3, 6, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 4, 1, 4, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 4, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 4, 1, 6, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 6, 1, 4, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 6, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 6, 1, 6, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 5, 1, 4, box);
          this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 0, 5, 1, 6, box);
          break;
        case 1:
          for (let i = 0; i < 5; i++) {
            this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 1, 3 + i, box);
            this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 7, 1, 3 + i, box);
            this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3 + i, 1, 3, box);
            this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3 + i, 1, 7, box);
          }
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 2, 5, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 5, 3, 5, box);
          this.placeBlockAtCurrentPosition(w, B.waterMoving, 0, 5, 4, 5, box);
          break;
        case 2:
          for (let z = 1; z <= 9; z++) {
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 1, 3, z, box);
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 9, 3, z, box);
          }
          for (let x = 1; x <= 9; x++) {
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, x, 3, 1, box);
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, x, 3, 9, box);
          }
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 5, 1, 4, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 5, 1, 6, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 5, 3, 4, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 5, 3, 6, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, 1, 5, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 3, 5, box);
          this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, 3, 5, box);
          for (let y = 1; y <= 3; y++) {
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, y, 4, box);
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, y, 4, box);
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, y, 6, box);
            this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, y, 6, box);
          }
          this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 5, 3, 5, box);
          for (let z2 = 2; z2 <= 8; z2++) {
            this.placeBlockAtCurrentPosition(w, B.planks, 0, 2, 3, z2, box);
            this.placeBlockAtCurrentPosition(w, B.planks, 0, 3, 3, z2, box);
            if (z2 <= 3 || z2 >= 7) {
              this.placeBlockAtCurrentPosition(w, B.planks, 0, 4, 3, z2, box);
              this.placeBlockAtCurrentPosition(w, B.planks, 0, 5, 3, z2, box);
              this.placeBlockAtCurrentPosition(w, B.planks, 0, 6, 3, z2, box);
            }
            this.placeBlockAtCurrentPosition(w, B.planks, 0, 7, 3, z2, box);
            this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 3, z2, box);
          }
          this.placeBlockAtCurrentPosition(w, B.ladder, this.getMetadataWithOffset(B.ladder, 4), 9, 1, 3, box);
          this.placeBlockAtCurrentPosition(w, B.ladder, this.getMetadataWithOffset(B.ladder, 4), 9, 2, 3, box);
          this.placeBlockAtCurrentPosition(w, B.ladder, this.getMetadataWithOffset(B.ladder, 4), 9, 3, 3, box);
          this.generateStructureChestContents(w, box, rand, 3, 4, 8, [...STRONGHOLD_CROSSING_LOOT, enchantedBookContent(rand, 1, 1, 1)], 1 + rand.nextInt(4));
      }
      return true;
    }
  }
}

export class ComponentStrongholdStairsStraight extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdStairsStraight | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -7, 0, 5, 11, 8, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdStairsStraight(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 1, 1);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 10, 7, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 7, 0);
      this.placeDoor(w, rand, box, EnumDoor.OPENING, 1, 1, 7);
      const stairsMeta2 = this.getMetadataWithOffset(B.stairsCobblestone, 2);
      for (let i = 0; i < 6; i++) {
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsMeta2, 1, 6 - i, 1 + i, box);
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsMeta2, 2, 6 - i, 1 + i, box);
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsMeta2, 3, 6 - i, 1 + i, box);
        if (i < 5) {
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 1, 5 - i, 1 + i, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 2, 5 - i, 1 + i, box);
          this.placeBlockAtCurrentPosition(w, B.stoneBrick, 0, 3, 5 - i, 1 + i, box);
        }
      }
      return true;
    }
  }
}

export class ComponentStrongholdStraight extends ComponentStronghold {
  doorType = EnumDoor.OPENING;
  expandsX = false;
  expandsZ = false;
  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.doorType = this.getRandomDoor(rand);
    this.boundingBox = box;
    this.expandsX = rand.nextInt(2) === 0;
    this.expandsZ = rand.nextInt(2) === 0;
  }
  static findValidPlacement(
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentStrongholdStraight | null {
    let bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, -1, -1, 0, 5, 5, 7, facing);
    return ComponentStronghold.canStrongholdGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentStrongholdStraight(type, rand, bb, facing)
      : null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    this.getNextComponentNormal(start as ComponentStrongholdStairs2, list, rand, 1, 1);
    if (this.expandsX) {
      this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, 1, 2);
    }
    if (this.expandsZ) {
      this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, 1, 2);
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 4, 6, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 1, 0);
      this.placeDoor(w, rand, box, EnumDoor.OPENING, 1, 1, 6);
      this.randomlyPlaceBlock(w, box, rand, 0.1, 1, 2, 1, B.torchWood, 0);
      this.randomlyPlaceBlock(w, box, rand, 0.1, 3, 2, 1, B.torchWood, 0);
      this.randomlyPlaceBlock(w, box, rand, 0.1, 1, 2, 5, B.torchWood, 0);
      this.randomlyPlaceBlock(w, box, rand, 0.1, 3, 2, 5, B.torchWood, 0);
      if (this.expandsX) {
        this.fillWithBlocks(w, box, 0, 1, 2, 0, 3, 4, 0, 0, false);
      }
      if (this.expandsZ) {
        this.fillWithBlocks(w, box, 4, 1, 2, 4, 3, 4, 0, 0, false);
      }
      return true;
    }
  }
}

export class ComponentStrongholdRightTurn extends ComponentStrongholdLeftTurn {
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    if (this.coordBaseMode !== 2 && this.coordBaseMode !== 3) {
      this.getNextComponentX(start as ComponentStrongholdStairs2, list, rand, 1, 1);
    } else {
      this.getNextComponentZ(start as ComponentStrongholdStairs2, list, rand, 1, 1);
    }
  }
  override addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithRandomizedBlocks(w, box, 0, 0, 0, 4, 4, 4, true, rand, STRONGHOLD_STONES);
      this.placeDoor(w, rand, box, this.doorType, 1, 1, 0);
      if (this.coordBaseMode !== 2 && this.coordBaseMode !== 3) {
        this.fillWithBlocks(w, box, 0, 1, 1, 0, 3, 3, 0, 0, false);
      } else {
        this.fillWithBlocks(w, box, 4, 1, 1, 4, 3, 3, 0, 0, false);
      }
      return true;
    }
  }
}

type StrongholdPieceFactory = (
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
) => ComponentStronghold | null;

/** StructureStrongholdPieceWeight (and its subclasses for the library and portal room depth rules). */
class StructureStrongholdPieceWeight {
  instancesSpawned = 0;

  constructor(
    readonly create: StrongholdPieceFactory,
    readonly pieceWeight: number,
    readonly instancesLimit: number,
    private readonly minDepth = 0,
  ) {}

  canSpawnMoreStructuresOfType(type: number): boolean {
    return (this.instancesLimit === 0 || this.instancesSpawned < this.instancesLimit) && type > this.minDepth;
  }

  canSpawnMoreStructures(): boolean {
    return this.instancesLimit === 0 || this.instancesSpawned < this.instancesLimit;
  }
}

/** The weighted piece list; right turns use the left turn's placement, as in 1.5.2. */
const PIECE_WEIGHTS: readonly StructureStrongholdPieceWeight[] = [
  new StructureStrongholdPieceWeight(ComponentStrongholdStraight.findValidPlacement, 40, 0),
  new StructureStrongholdPieceWeight(ComponentStrongholdPrison.findValidPlacement, 5, 5),
  new StructureStrongholdPieceWeight(ComponentStrongholdLeftTurn.findValidPlacement, 20, 0),
  new StructureStrongholdPieceWeight(ComponentStrongholdRightTurn.findValidPlacement, 20, 0),
  new StructureStrongholdPieceWeight(ComponentStrongholdRoomCrossing.findValidPlacement, 10, 6),
  new StructureStrongholdPieceWeight(ComponentStrongholdStairsStraight.findValidPlacement, 5, 5),
  new StructureStrongholdPieceWeight(ComponentStrongholdStairs.getStrongholdStairsComponent, 5, 5),
  new StructureStrongholdPieceWeight(ComponentStrongholdCrossing.findValidPlacement, 5, 4),
  new StructureStrongholdPieceWeight(ComponentStrongholdChestCorridor.findValidPlacement, 5, 4),
  new StructureStrongholdPieceWeight(ComponentStrongholdLibrary.findValidPlacement, 10, 2, 4),
  new StructureStrongholdPieceWeight(ComponentStrongholdPortalRoom.findValidPlacement, 20, 1, 5),
];

/** StructureStrongholdPieces' static state, reset for every stronghold. */
const pieces = {
  structurePieceList: [] as StructureStrongholdPieceWeight[],
  strongComponentType: null as StrongholdPieceFactory | null,
  totalWeight: 0,
};

function prepareStructurePieces(): void {
  pieces.structurePieceList = [];
  for (const p of PIECE_WEIGHTS) {
    p.instancesSpawned = 0;
    pieces.structurePieceList.push(p);
  }
  pieces.strongComponentType = null;
}

function canAddStructurePieces(): boolean {
  let any = false;
  pieces.totalWeight = 0;
  for (const p of pieces.structurePieceList) {
    if (p.instancesLimit > 0 && p.instancesSpawned < p.instancesLimit) any = true;
    pieces.totalWeight += p.pieceWeight;
  }
  return any;
}

function getNextComponent(
  start: ComponentStrongholdStairs2,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): ComponentStronghold | null {
  if (!canAddStructurePieces()) return null;
  if (pieces.strongComponentType !== null) {
    const c = pieces.strongComponentType(list, rand, x, y, z, facing, type);
    pieces.strongComponentType = null;
    if (c) return c;
  }
  for (let tries = 0; tries < 5; tries++) {
    let r = rand.nextInt(pieces.totalWeight);
    for (const p of pieces.structurePieceList) {
      r -= p.pieceWeight;
      if (r >= 0) continue;
      if (!p.canSpawnMoreStructuresOfType(type) || p === start.strongholdPieceWeight) break;
      const c = p.create(list, rand, x, y, z, facing, type);
      if (c) {
        p.instancesSpawned++;
        start.strongholdPieceWeight = p;
        if (!p.canSpawnMoreStructures()) pieces.structurePieceList.splice(pieces.structurePieceList.indexOf(p), 1);
        return c;
      }
    }
  }
  const bb = ComponentStrongholdCorridor.findPieceBox(list, rand, x, y, z, facing);
  return bb !== null && bb.minY > 1 ? new ComponentStrongholdCorridor(type, rand, bb, facing) : null;
}

/** getNextValidComponent: at most 50 deep and 112 blocks from the start. */
function getNextValidComponent(
  start: ComponentStrongholdStairs2,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): StructureComponent | null {
  if (type > 50) return null;
  if (Math.abs(x - start.getBoundingBox().minX) > 112 || Math.abs(z - start.getBoundingBox().minZ) > 112) return null;
  const c = getNextComponent(start, list, rand, x, y, z, facing, type + 1);
  if (c) {
    list.push(c);
    start.pendingPieces.push(c);
  }
  return c;
}

class StructureStrongholdStart extends StructureStart {
  constructor(rand: JavaRandom, cx: number, cz: number) {
    super();
    prepareStructurePieces();
    const stairs = new ComponentStrongholdStairs2(0, rand, (cx << 4) + 2, (cz << 4) + 2);
    this.components.push(stairs);
    stairs.buildComponent(stairs, this.components, rand);
    const pending = stairs.pendingPieces;
    while (pending.length > 0) {
      const c = pending.splice(rand.nextInt(pending.length), 1)[0];
      c.buildComponent(stairs, this.components, rand);
    }
    this.updateBoundingBox();
    this.markAvailableHeight(rand, 10);
  }
}

const STRONGHOLD_BIOMES: readonly BiomeGenBase[] = [
  Biomes.desert,
  Biomes.forest,
  Biomes.extremeHills,
  Biomes.swampland,
  Biomes.taiga,
  Biomes.icePlains,
  Biomes.iceMountains,
  Biomes.desertHills,
  Biomes.forestHills,
  Biomes.extremeHillsEdge,
  Biomes.jungle,
  Biomes.jungleHills,
];

/**
 * MapGenStronghold: three strongholds (Superflat: "stronghold(count=, distance=, spread=)") in a
 * ring 640 to 1152 blocks from the origin, each moved to a nearby allowed biome.
 */
export class MapGenStronghold extends MapGenStructure {
  private ranBiomeCheck = false;
  private structureCoords: [number, number][];
  private distance = 32;
  private spread = 3;

  constructor(options?: Map<string, string>) {
    super();
    let count = 3;
    for (const [k, v] of options ?? []) {
      if (k === 'distance') this.distance = parseDoubleWithMin(v, this.distance, 1);
      else if (k === 'count') count = parseIntWithMin(v, count, 1);
      else if (k === 'spread') this.spread = parseIntWithMin(v, this.spread, 1);
    }
    this.structureCoords = new Array(count);
  }

  /** The chunk positions of the strongholds (computed once per world). */
  getStrongholdChunks(): [number, number][] {
    if (!this.ranBiomeCheck) {
      const rand = new JavaRandom(this.ctx.seed);
      let angle = rand.nextDouble() * Math.PI * 2;
      let ring = 1;
      for (let i = 0; i < this.structureCoords.length; i++) {
        const dist = (1.25 * ring + rand.nextDouble()) * this.distance * ring;
        let cx = Math.round(Math.cos(angle) * dist);
        let cz = Math.round(Math.sin(angle) * dist);
        const pos = this.ctx.biomeSource.findBiomePosition((cx << 4) + 8, (cz << 4) + 8, 112, STRONGHOLD_BIOMES, rand);
        if (pos) {
          cx = pos[0] >> 4;
          cz = pos[1] >> 4;
        }
        this.structureCoords[i] = [cx, cz];
        angle += (Math.PI * 2 * ring) / this.spread;
        if (i === this.spread) {
          ring += 2 + rand.nextInt(5);
          this.spread += 1 + rand.nextInt(2);
        }
      }
      this.ranBiomeCheck = true;
    }
    return this.structureCoords;
  }

  protected canSpawnStructureAtCoords(cx: number, cz: number): boolean {
    for (const [x, z] of this.getStrongholdChunks()) if (cx === x && cz === z) return true;
    return false;
  }

  protected override getCoordList(): [number, number, number][] | null {
    return this.structureCoords.filter((c) => c !== undefined).map(([x, z]) => [(x << 4) + 8, 64, (z << 4) + 8] as [number, number, number]);
  }

  protected getStructureStart(cx: number, cz: number): StructureStart {
    let start = new StructureStrongholdStart(this.rand, cx, cz);
    while (start.components.length === 0 || (start.components[0] as ComponentStrongholdStairs2).strongholdPortalRoom === null) {
      start = new StructureStrongholdStart(this.rand, cx, cz);
    }
    return start;
  }
}

function parseIntWithMin(s: string, def: number, min: number): number {
  const n = /^[-+]?\d+$/.test(s) ? Number.parseInt(s, 10) : Number.NaN;
  return Math.max(min, Number.isNaN(n) ? def : n);
}

/** MathHelper.func_82713_a: a double, at least `min` (the default on bad input). */
function parseDoubleWithMin(s: string, def: number, min: number): number {
  const n = s.trim() === '' ? Number.NaN : Number(s);
  return Math.max(min, Number.isNaN(n) ? def : n);
}
