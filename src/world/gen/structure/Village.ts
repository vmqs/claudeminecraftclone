import { BlockIds as B, ItemIds as I } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import { MathHelper } from '../../../core/MathHelper';
import { Biomes, type BiomeGenBase } from '../../biome/BiomeGenBase';
import type { IWorld } from '../../IWorld';
import { chestContent, type ChestContent } from '../ChestLoot';
import type { BiomeSource } from '../ChunkProviderGenerate';
import { spawnGenEntity } from '../WorldGenSpawning';
import { MapGenStructure } from './MapGenStructure';
import { StructureBoundingBox } from './StructureBoundingBox';
import { StructureComponent } from './StructureComponent';
import { averageGroundLevel, worldRandomSeed } from './StructureRandom';
import { StructureStart } from './StructureStart';

const getRandomIntegerInRange = MathHelper.getRandomIntegerInRange;

/** MapGenVillage.villageSpawnBiomes. */
export const VILLAGE_SPAWN_BIOMES: readonly BiomeGenBase[] = [Biomes.plains, Biomes.desert];

const VILLAGE_BLACKSMITH_LOOT: readonly ChestContent[] = [
  chestContent(I.diamond, 0, 1, 3, 3),
  chestContent(I.ingotIron, 0, 1, 5, 10),
  chestContent(I.ingotGold, 0, 1, 3, 5),
  chestContent(I.bread, 0, 1, 3, 15),
  chestContent(I.appleRed, 0, 1, 3, 15),
  chestContent(I.pickaxeIron, 0, 1, 1, 5),
  chestContent(I.swordIron, 0, 1, 1, 5),
  chestContent(I.plateIron, 0, 1, 1, 5),
  chestContent(I.helmetIron, 0, 1, 1, 5),
  chestContent(I.legsIron, 0, 1, 1, 5),
  chestContent(I.bootsIron, 0, 1, 1, 5),
  chestContent(B.obsidian, 0, 3, 7, 5),
  chestContent(B.sapling, 0, 3, 7, 5),
];

type VillagePieceFactory = (
  start: ComponentVillageStartPiece,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
) => ComponentVillage | null;

/** StructureVillagePieceWeight: a house type with its weight and how many may be built. */
export class StructureVillagePieceWeight {
  villagePiecesSpawned = 0;

  constructor(
    readonly create: VillagePieceFactory,
    readonly villagePieceWeight: number,
    public villagePiecesLimit: number,
  ) {}

  canSpawnMoreVillagePiecesOfType(_type: number): boolean {
    return this.villagePiecesLimit === 0 || this.villagePiecesSpawned < this.villagePiecesLimit;
  }

  canSpawnMoreVillagePieces(): boolean {
    return this.villagePiecesLimit === 0 || this.villagePiecesSpawned < this.villagePiecesLimit;
  }
}

/** A village piece: settles on the ground, swaps materials in deserts, and spawns its villagers. */
export abstract class ComponentVillage extends StructureComponent {
  private villagersSpawned = 0;
  startPiece: ComponentVillageStartPiece;

  constructor(start: ComponentVillageStartPiece | null, type: number) {
    super(type);
    this.startPiece = start!;
  }

  /** getNextComponentNN: a house on the left side of a road. */
  protected getNextComponentNN(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    dy: number,
    offset: number,
  ): StructureComponent | null {
    const bb = this.boundingBox;
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return getNextVillageStructureComponent(start, list, rand, bb.minX - 1, bb.minY + dy, bb.minZ + offset, 1, this.getComponentType());
      case 1:
      case 3:
        return getNextVillageStructureComponent(start, list, rand, bb.minX + offset, bb.minY + dy, bb.minZ - 1, 2, this.getComponentType());
      default:
        return null;
    }
  }

  /** getNextComponentPP: a house on the right side of a road. */
  protected getNextComponentPP(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    dy: number,
    offset: number,
  ): StructureComponent | null {
    const bb = this.boundingBox;
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        return getNextVillageStructureComponent(start, list, rand, bb.maxX + 1, bb.minY + dy, bb.minZ + offset, 3, this.getComponentType());
      case 1:
      case 3:
        return getNextVillageStructureComponent(start, list, rand, bb.minX + offset, bb.minY + dy, bb.maxZ + 1, 0, this.getComponentType());
      default:
        return null;
    }
  }

  /** The mean ground height of the part inside `box` (-1 when none of it is). */
  protected getAverageGroundLevel(w: IWorld, box: StructureBoundingBox): number {
    let sum = 0;
    let n = 0;
    for (let z = this.boundingBox.minZ; z <= this.boundingBox.maxZ; z++) {
      for (let x = this.boundingBox.minX; x <= this.boundingBox.maxX; x++) {
        if (box.isVecInside(x, 64, z)) {
          sum += Math.max(w.getTopSolidOrLiquidBlock(x, z), averageGroundLevel(w));
          n++;
        }
      }
    }
    return n === 0 ? -1 : Math.trunc(sum / n);
  }

  static canVillageGoDeeper(box: StructureBoundingBox | null): boolean {
    return box !== null && box.minY > 10;
  }

  /** Villagers of this piece's profession standing in a row from (x, y, z). */
  protected spawnVillagers(w: IWorld, box: StructureBoundingBox, x: number, y: number, z: number, count: number): void {
    for (let i = this.villagersSpawned; i < count; i++) {
      const wx = this.getXWithOffset(x + i, z);
      const wy = this.getYWithOffset(y);
      const wz = this.getZWithOffset(x + i, z);
      if (!box.isVecInside(wx, wy, wz)) break;
      this.villagersSpawned++;
      spawnGenEntity(w, { name: 'Villager', x: wx + 0.5, y: wy, z: wz + 0.5, yaw: 0, data: { Profession: this.getVillagerType(i) }, init: false });
    }
  }

  /** 0 farmer, 1 librarian, 2 priest, 3 blacksmith, 4 butcher. */
  protected getVillagerType(_i: number): number {
    return 0;
  }

  /** Desert villages are built of sandstone. */
  protected getBiomeSpecificBlock(id: number, _meta: number): number {
    if (this.startPiece.inDesert) {
      if (id === B.wood || id === B.cobblestone || id === B.planks || id === B.gravel) return B.sandStone;
      if (id === B.stairsWoodOak || id === B.stairsCobblestone) return B.stairsSandStone;
    }
    return id;
  }

  protected getBiomeSpecificBlockMetadata(id: number, meta: number): number {
    if (this.startPiece.inDesert) {
      if (id === B.wood || id === B.cobblestone) return 0;
      if (id === B.planks) return 2;
    }
    return meta;
  }

  protected override placeBlockAtCurrentPosition(w: IWorld, id: number, meta: number, x: number, y: number, z: number, box: StructureBoundingBox): void {
    super.placeBlockAtCurrentPosition(w, this.getBiomeSpecificBlock(id, meta), this.getBiomeSpecificBlockMetadata(id, meta), x, y, z, box);
  }

  protected override fillWithBlocks(
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
    super.fillWithMetadataBlocks(
      w,
      box,
      x0,
      y0,
      z0,
      x1,
      y1,
      z1,
      this.getBiomeSpecificBlock(edgeId, 0),
      this.getBiomeSpecificBlockMetadata(edgeId, 0),
      this.getBiomeSpecificBlock(insideId, 0),
      this.getBiomeSpecificBlockMetadata(insideId, 0),
      onlyReplaceSolid,
    );
  }

  protected override fillCurrentPositionBlocksDownwards(w: IWorld, id: number, meta: number, x: number, y: number, z: number, box: StructureBoundingBox): void {
    super.fillCurrentPositionBlocksDownwards(w, this.getBiomeSpecificBlock(id, meta), this.getBiomeSpecificBlockMetadata(id, meta), x, y, z, box);
  }
}

/** Roads (ComponentVillageRoadPiece) do not count towards a village's size. */
export abstract class ComponentVillageRoadPiece extends ComponentVillage {}

export class ComponentVillageWell extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece | null, type: number, rand: JavaRandom, x: number, z: number) {
    super(start, type);
    this.coordBaseMode = rand.nextInt(4);
    switch (this.coordBaseMode) {
      case 0:
      case 2:
        this.boundingBox = new StructureBoundingBox(x, 64, z, x + 6 - 1, 78, z + 6 - 1);
        break;
      default:
        this.boundingBox = new StructureBoundingBox(x, 64, z, x + 6 - 1, 78, z + 6 - 1);
    }
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    getNextComponentVillagePath(
      start as ComponentVillageStartPiece,
      list,
      rand,
      this.boundingBox.minX - 1,
      this.boundingBox.maxY - 4,
      this.boundingBox.minZ + 1,
      1,
      this.getComponentType(),
    );
    getNextComponentVillagePath(
      start as ComponentVillageStartPiece,
      list,
      rand,
      this.boundingBox.maxX + 1,
      this.boundingBox.maxY - 4,
      this.boundingBox.minZ + 1,
      3,
      this.getComponentType(),
    );
    getNextComponentVillagePath(
      start as ComponentVillageStartPiece,
      list,
      rand,
      this.boundingBox.minX + 1,
      this.boundingBox.maxY - 4,
      this.boundingBox.minZ - 1,
      2,
      this.getComponentType(),
    );
    getNextComponentVillagePath(
      start as ComponentVillageStartPiece,
      list,
      rand,
      this.boundingBox.minX + 1,
      this.boundingBox.maxY - 4,
      this.boundingBox.maxZ + 1,
      0,
      this.getComponentType(),
    );
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 3, 0);
    }
    this.fillWithBlocks(w, box, 1, 0, 1, 4, 12, 4, B.cobblestone, B.waterMoving, false);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 12, 2, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 3, 12, 2, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 12, 3, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 3, 12, 3, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 13, 1, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 14, 1, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 13, 1, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 14, 1, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 13, 4, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 14, 4, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 13, 4, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 14, 4, box);
    this.fillWithBlocks(w, box, 1, 15, 1, 4, 15, 4, B.cobblestone, B.cobblestone, false);
    for (let z = 0; z <= 5; z++) {
      for (let x = 0; x <= 5; x++) {
        if (x === 0 || x === 5 || z === 0 || z === 5) {
          this.placeBlockAtCurrentPosition(w, B.gravel, 0, x, 11, z, box);
          this.clearCurrentPositionBlocksUpwards(w, x, 12, z, box);
        }
      }
    }
    return true;
  }
}

export class ComponentVillagePathGen extends ComponentVillageRoadPiece {
  private length = 0;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.length = Math.max(box.getXSize(), box.getZSize());
  }
  static findPieceBox(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
  ): StructureBoundingBox | null {
    for (let len = 7 * getRandomIntegerInRange(rand, 3, 5); len >= 7; len -= 7) {
      const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 3, 3, len, facing);
      if (StructureComponent.findIntersecting(list, bb) === null) {
        return bb;
      }
    }
    return null;
  }
  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    let built = false;
    for (let i = rand.nextInt(5); i < this.length - 8; i += 2 + rand.nextInt(5)) {
      const i2 = this.getNextComponentNN(start as ComponentVillageStartPiece, list, rand, 0, i);
      if (i2 !== null) {
        i += Math.max(i2.boundingBox.getXSize(), i2.boundingBox.getZSize());
        built = true;
      }
    }
    for (let i3 = rand.nextInt(5); i3 < this.length - 8; i3 += 2 + rand.nextInt(5)) {
      const i4 = this.getNextComponentPP(start as ComponentVillageStartPiece, list, rand, 0, i3);
      if (i4 !== null) {
        i3 += Math.max(i4.boundingBox.getXSize(), i4.boundingBox.getZSize());
        built = true;
      }
    }
    if (built && rand.nextInt(3) > 0) {
      switch (this.coordBaseMode) {
        case 0:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.minX - 1,
            this.boundingBox.minY,
            this.boundingBox.maxZ - 2,
            1,
            this.getComponentType(),
          );
          break;
        case 1:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.minX,
            this.boundingBox.minY,
            this.boundingBox.minZ - 1,
            2,
            this.getComponentType(),
          );
          break;
        case 2:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.minX - 1,
            this.boundingBox.minY,
            this.boundingBox.minZ,
            1,
            this.getComponentType(),
          );
          break;
        case 3:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.maxX - 2,
            this.boundingBox.minY,
            this.boundingBox.minZ - 1,
            2,
            this.getComponentType(),
          );
      }
    }
    if (built && rand.nextInt(3) > 0) {
      switch (this.coordBaseMode) {
        case 0:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.maxX + 1,
            this.boundingBox.minY,
            this.boundingBox.maxZ - 2,
            3,
            this.getComponentType(),
          );
          break;
        case 1:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.minX,
            this.boundingBox.minY,
            this.boundingBox.maxZ + 1,
            0,
            this.getComponentType(),
          );
          break;
        case 2:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.maxX + 1,
            this.boundingBox.minY,
            this.boundingBox.minZ,
            3,
            this.getComponentType(),
          );
          break;
        case 3:
          getNextComponentVillagePath(
            start as ComponentVillageStartPiece,
            list,
            rand,
            this.boundingBox.maxX - 2,
            this.boundingBox.minY,
            this.boundingBox.maxZ + 1,
            0,
            this.getComponentType(),
          );
      }
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    const i = this.getBiomeSpecificBlock(B.gravel, 0);
    for (let i2 = this.boundingBox.minX; i2 <= this.boundingBox.maxX; i2++) {
      for (let i3 = this.boundingBox.minZ; i3 <= this.boundingBox.maxZ; i3++) {
        if (box.isVecInside(i2, 64, i3)) {
          let i4 = w.getTopSolidOrLiquidBlock(i2, i3) - 1;
          w.setBlock(i2, i4, i3, i, 0, 2);
        }
      }
    }
    return true;
  }
}

export class ComponentVillageTorch extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static findPieceBox(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
  ): StructureBoundingBox | null {
    let type = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 3, 4, 2, facing);
    return StructureComponent.findIntersecting(list, type) !== null ? null : type;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 4 - 1, 0);
    }
    this.fillWithBlocks(w, box, 0, 0, 0, 2, 3, 1, 0, 0, false);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 0, 0, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, 15, 1, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 0, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 1, 3, 1, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 1, 3, -1, box);
    return true;
  }
}

export class ComponentVillageHouse4_Garden extends ComponentVillage {
  private averageGroundLevel = -1;
  private isRoofAccessible = false;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.isRoofAccessible = rand.nextBoolean();
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageHouse4_Garden | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 5, 6, 5, facing);
    return StructureComponent.findIntersecting(list, bb) !== null ? null : new ComponentVillageHouse4_Garden(start, type, rand, bb, facing);
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 6 - 1, 0);
    }
    this.fillWithBlocks(w, box, 0, 0, 0, 4, 0, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 4, 0, 4, 4, 4, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 1, 4, 1, 3, 4, 3, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 3, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 3, 4, box);
    this.fillWithBlocks(w, box, 0, 1, 1, 0, 3, 3, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 4, 1, 1, 4, 3, 3, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 1, 4, 3, 3, 4, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 1, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 1, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 1, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 2, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 3, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 3, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 3, 1, 0, box);
    if (this.getBlockIdAtCurrentPosition(w, 2, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 2, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 2, 0, -1, box);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 3, 3, 3, 0, 0, false);
    if (this.isRoofAccessible) {
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 0, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 2, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 3, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 0, 5, 4, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 5, 4, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 2, 5, 4, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 3, 5, 4, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 5, 4, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 5, 1, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 5, 2, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 5, 3, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 0, 5, 1, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 0, 5, 2, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 0, 5, 3, box);
    }
    if (this.isRoofAccessible) {
      const ladderMeta3 = this.getMetadataWithOffset(B.ladder, 3);
      this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 3, 1, 3, box);
      this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 3, 2, 3, box);
      this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 3, 3, 3, box);
      this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta3, 3, 4, 3, box);
    }
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 3, 1, box);
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) {
        this.clearCurrentPositionBlocksUpwards(w, x, 6, z, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x, -1, z, box);
      }
    }
    this.spawnVillagers(w, box, 1, 1, 2, 1);
    return true;
  }
}

export class ComponentVillageChurch extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageChurch | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 5, 12, 9, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageChurch(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 12 - 1, 0);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 3, 3, 7, 0, 0, false);
    this.fillWithBlocks(w, box, 1, 5, 1, 3, 9, 3, 0, 0, false);
    this.fillWithBlocks(w, box, 1, 0, 0, 3, 0, 8, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 1, 0, 3, 10, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 1, 1, 0, 10, 3, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 4, 1, 1, 4, 10, 3, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 0, 4, 0, 4, 7, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 4, 0, 4, 4, 4, 7, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 1, 8, 3, 4, 8, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 5, 4, 3, 10, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 5, 5, 3, 5, 7, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 9, 0, 4, 9, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 4, 0, 4, 4, 4, B.cobblestone, B.cobblestone, false);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 0, 11, 2, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 4, 11, 2, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 2, 11, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 2, 11, 4, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 1, 1, 6, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 1, 1, 7, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 2, 1, 7, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 3, 1, 6, box);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 3, 1, 7, box);
    this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 1, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 2, 1, 6, box);
    this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 3, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 1), 1, 2, 7, box);
    this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 0), 3, 2, 7, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 3, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 3, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 6, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 7, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 6, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 7, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 6, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 7, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 6, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 7, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 3, 6, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 3, 6, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 3, 8, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 4, 7, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 1, 4, 6, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 3, 4, 6, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 4, 5, box);
    const ladderMeta4 = this.getMetadataWithOffset(B.ladder, 4);
    for (let y = 1; y <= 9; y++) {
      this.placeBlockAtCurrentPosition(w, B.ladder, ladderMeta4, 3, y, 3, box);
    }
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 2, 0, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 2, 1, 0, this.getMetadataWithOffset(B.doorWood, 1));
    if (this.getBlockIdAtCurrentPosition(w, 2, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 2, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 2, 0, -1, box);
    }
    for (let z = 0; z < 9; z++) {
      for (let x = 0; x < 5; x++) {
        this.clearCurrentPositionBlocksUpwards(w, x, 12, z, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x, -1, z, box);
      }
    }
    this.spawnVillagers(w, box, 2, 1, 2, 1);
    return true;
  }
  protected override getVillagerType(i: number): number {
    return 2;
  }
}

export class ComponentVillageHouse1 extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageHouse1 | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 9, 9, 6, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageHouse1(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 9 - 1, 0);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 7, 5, 4, 0, 0, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 8, 0, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 5, 0, 8, 5, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 6, 1, 8, 6, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 7, 2, 8, 7, 3, B.cobblestone, B.cobblestone, false);
    const stairsMeta3 = this.getMetadataWithOffset(B.stairsWoodOak, 3);
    const stairsMeta2 = this.getMetadataWithOffset(B.stairsWoodOak, 2);
    for (let z = -1; z <= 2; z++) {
      for (let x = 0; x <= 8; x++) {
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta3, x, 6 + z, z, box);
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta2, x, 6 + z, 5 - z, box);
      }
    }
    this.fillWithBlocks(w, box, 0, 1, 0, 0, 1, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 1, 5, 8, 1, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 8, 1, 0, 8, 1, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 2, 1, 0, 7, 1, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 2, 0, 0, 4, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 2, 5, 0, 4, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 8, 2, 5, 8, 4, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 8, 2, 0, 8, 4, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 2, 1, 0, 4, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 2, 5, 7, 4, 5, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 8, 2, 1, 8, 4, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 2, 0, 7, 4, 0, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 6, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 6, 3, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 3, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 3, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 3, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 3, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 3, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 6, 2, 5, box);
    this.fillWithBlocks(w, box, 1, 4, 1, 7, 4, 1, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 4, 4, 7, 4, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 3, 4, 7, 3, 4, B.bookShelf, B.bookShelf, false);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 7, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, this.getMetadataWithOffset(B.stairsWoodOak, 0), 7, 1, 3, box);
    const stairsMeta32 = this.getMetadataWithOffset(B.stairsWoodOak, 3);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta32, 6, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta32, 5, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta32, 4, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta32, 3, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 6, 1, 3, box);
    this.placeBlockAtCurrentPosition(w, B.pressurePlatePlanks, 0, 6, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 4, 1, 3, box);
    this.placeBlockAtCurrentPosition(w, B.pressurePlatePlanks, 0, 4, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.workbench, 0, 7, 1, 1, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 1, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 1, 2, 0, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 1, 1, 0, this.getMetadataWithOffset(B.doorWood, 1));
    if (this.getBlockIdAtCurrentPosition(w, 1, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 1, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 1, 0, -1, box);
    }
    for (let z2 = 0; z2 < 6; z2++) {
      for (let x2 = 0; x2 < 9; x2++) {
        this.clearCurrentPositionBlocksUpwards(w, x2, 9, z2, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x2, -1, z2, box);
      }
    }
    this.spawnVillagers(w, box, 2, 1, 2, 1);
    return true;
  }
  protected override getVillagerType(i: number): number {
    return 1;
  }
}

export class ComponentVillageWoodHut extends ComponentVillage {
  private averageGroundLevel = -1;
  private isTallHouse = false;
  private tablePosition = 0;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.isTallHouse = rand.nextBoolean();
    this.tablePosition = rand.nextInt(3);
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageWoodHut | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 4, 6, 5, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageWoodHut(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 6 - 1, 0);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 3, 5, 4, 0, 0, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 3, 0, 4, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 0, 1, 2, 0, 3, B.dirt, B.dirt, false);
    if (this.isTallHouse) {
      this.fillWithBlocks(w, box, 1, 4, 1, 2, 4, 3, B.wood, B.wood, false);
    } else {
      this.fillWithBlocks(w, box, 1, 5, 1, 2, 5, 3, B.wood, B.wood, false);
    }
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 1, 4, 0, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 2, 4, 0, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 1, 4, 4, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 2, 4, 4, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 4, 1, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 4, 3, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 3, 4, 1, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 3, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 3, 4, 3, box);
    this.fillWithBlocks(w, box, 0, 1, 0, 0, 3, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 3, 1, 0, 3, 3, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 0, 1, 4, 0, 3, 4, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 3, 1, 4, 3, 3, 4, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 0, 1, 1, 0, 3, 3, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 3, 1, 1, 3, 3, 3, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 1, 0, 2, 3, 0, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 1, 4, 2, 3, 4, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 3, 2, 2, box);
    if (this.tablePosition > 0) {
      this.placeBlockAtCurrentPosition(w, B.fence, 0, this.tablePosition, 1, 3, box);
      this.placeBlockAtCurrentPosition(w, B.pressurePlatePlanks, 0, this.tablePosition, 2, 3, box);
    }
    this.placeBlockAtCurrentPosition(w, 0, 0, 1, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 1, 2, 0, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 1, 1, 0, this.getMetadataWithOffset(B.doorWood, 1));
    if (this.getBlockIdAtCurrentPosition(w, 1, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 1, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 1, 0, -1, box);
    }
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 4; x++) {
        this.clearCurrentPositionBlocksUpwards(w, x, 6, z, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x, -1, z, box);
      }
    }
    this.spawnVillagers(w, box, 1, 1, 2, 1);
    return true;
  }
}

export class ComponentVillageHall extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageHall | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 9, 7, 11, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageHall(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 7 - 1, 0);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 7, 4, 4, 0, 0, false);
    this.fillWithBlocks(w, box, 2, 1, 6, 8, 4, 10, 0, 0, false);
    this.fillWithBlocks(w, box, 2, 0, 6, 8, 0, 10, B.dirt, B.dirt, false);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, 0, 6, box);
    this.fillWithBlocks(w, box, 2, 1, 6, 2, 1, 10, B.fence, B.fence, false);
    this.fillWithBlocks(w, box, 8, 1, 6, 8, 1, 10, B.fence, B.fence, false);
    this.fillWithBlocks(w, box, 3, 1, 10, 7, 1, 10, B.fence, B.fence, false);
    this.fillWithBlocks(w, box, 1, 0, 1, 7, 0, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 0, 3, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 8, 0, 0, 8, 3, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 0, 0, 7, 1, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 0, 5, 7, 1, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 2, 0, 7, 3, 0, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 2, 5, 7, 3, 5, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 4, 1, 8, 4, 1, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 4, 4, 8, 4, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 5, 2, 8, 5, 3, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 0, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 0, 4, 3, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 4, 3, box);
    const stairsMeta3 = this.getMetadataWithOffset(B.stairsWoodOak, 3);
    const stairsMeta2 = this.getMetadataWithOffset(B.stairsWoodOak, 2);
    for (let z = -1; z <= 2; z++) {
      for (let x = 0; x <= 8; x++) {
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta3, x, 4 + z, z, box);
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta2, x, 4 + z, 5 - z, box);
      }
    }
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 3, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 6, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 2, 1, 3, box);
    this.placeBlockAtCurrentPosition(w, B.pressurePlatePlanks, 0, 2, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 1, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, this.getMetadataWithOffset(B.stairsWoodOak, 3), 2, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, this.getMetadataWithOffset(B.stairsWoodOak, 1), 1, 1, 3, box);
    this.fillWithBlocks(w, box, 5, 0, 1, 7, 0, 3, B.stoneDoubleSlab, B.stoneDoubleSlab, false);
    this.placeBlockAtCurrentPosition(w, B.stoneDoubleSlab, 0, 6, 1, 1, box);
    this.placeBlockAtCurrentPosition(w, B.stoneDoubleSlab, 0, 6, 1, 2, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 3, 1, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 2, 1, 0, this.getMetadataWithOffset(B.doorWood, 1));
    if (this.getBlockIdAtCurrentPosition(w, 2, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 2, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 2, 0, -1, box);
    }
    this.placeBlockAtCurrentPosition(w, 0, 0, 6, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 6, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 6, 3, 4, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 6, 1, 5, this.getMetadataWithOffset(B.doorWood, 1));
    for (let z2 = 0; z2 < 5; z2++) {
      for (let x2 = 0; x2 < 9; x2++) {
        this.clearCurrentPositionBlocksUpwards(w, x2, 7, z2, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x2, -1, z2, box);
      }
    }
    this.spawnVillagers(w, box, 4, 1, 2, 2);
    return true;
  }
  protected override getVillagerType(i: number): number {
    return i === 0 ? 4 : 0;
  }
}

export class ComponentVillageField extends ComponentVillage {
  private averageGroundLevel = -1;
  private cropTypeA = 0;
  private cropTypeB = 0;
  private cropTypeC = 0;
  private cropTypeD = 0;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.cropTypeA = this.getRandomCrop(rand);
    this.cropTypeB = this.getRandomCrop(rand);
    this.cropTypeC = this.getRandomCrop(rand);
    this.cropTypeD = this.getRandomCrop(rand);
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageField | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 13, 4, 9, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageField(start, type, rand, bb, facing)
      : null;
  }
  private getRandomCrop(rand: JavaRandom): number {
    switch (rand.nextInt(5)) {
      case 0:
        return B.carrot;
      case 1:
        return B.potato;
      default:
        return B.crops;
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 4 - 1, 0);
    }
    this.fillWithBlocks(w, box, 0, 1, 0, 12, 4, 8, 0, 0, false);
    this.fillWithBlocks(w, box, 1, 0, 1, 2, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 4, 0, 1, 5, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 7, 0, 1, 8, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 10, 0, 1, 11, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 0, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 6, 0, 0, 6, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 12, 0, 0, 12, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 1, 0, 0, 11, 0, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 1, 0, 8, 11, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 3, 0, 1, 3, 0, 7, B.waterMoving, B.waterMoving, false);
    this.fillWithBlocks(w, box, 9, 0, 1, 9, 0, 7, B.waterMoving, B.waterMoving, false);
    for (let z = 1; z <= 7; z++) {
      this.placeBlockAtCurrentPosition(w, this.cropTypeA, getRandomIntegerInRange(rand, 2, 7), 1, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeA, getRandomIntegerInRange(rand, 2, 7), 2, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeB, getRandomIntegerInRange(rand, 2, 7), 4, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeB, getRandomIntegerInRange(rand, 2, 7), 5, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeC, getRandomIntegerInRange(rand, 2, 7), 7, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeC, getRandomIntegerInRange(rand, 2, 7), 8, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeD, getRandomIntegerInRange(rand, 2, 7), 10, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeD, getRandomIntegerInRange(rand, 2, 7), 11, 1, z, box);
    }
    for (let z2 = 0; z2 < 9; z2++) {
      for (let x = 0; x < 13; x++) {
        this.clearCurrentPositionBlocksUpwards(w, x, 4, z2, box);
        this.fillCurrentPositionBlocksDownwards(w, B.dirt, 0, x, -1, z2, box);
      }
    }
    return true;
  }
}

export class ComponentVillageField2 extends ComponentVillage {
  private averageGroundLevel = -1;
  private cropTypeA = 0;
  private cropTypeB = 0;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.cropTypeA = this.pickRandomCrop(rand);
    this.cropTypeB = this.pickRandomCrop(rand);
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageField2 | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 7, 4, 9, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageField2(start, type, rand, bb, facing)
      : null;
  }
  private pickRandomCrop(rand: JavaRandom): number {
    switch (rand.nextInt(5)) {
      case 0:
        return B.carrot;
      case 1:
        return B.potato;
      default:
        return B.crops;
    }
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 4 - 1, 0);
    }
    this.fillWithBlocks(w, box, 0, 1, 0, 6, 4, 8, 0, 0, false);
    this.fillWithBlocks(w, box, 1, 0, 1, 2, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 4, 0, 1, 5, 0, 7, B.tilledField, B.tilledField, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 0, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 6, 0, 0, 6, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 1, 0, 0, 5, 0, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 1, 0, 8, 5, 0, 8, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 3, 0, 1, 3, 0, 7, B.waterMoving, B.waterMoving, false);
    for (let z = 1; z <= 7; z++) {
      this.placeBlockAtCurrentPosition(w, this.cropTypeA, getRandomIntegerInRange(rand, 2, 7), 1, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeA, getRandomIntegerInRange(rand, 2, 7), 2, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeB, getRandomIntegerInRange(rand, 2, 7), 4, 1, z, box);
      this.placeBlockAtCurrentPosition(w, this.cropTypeB, getRandomIntegerInRange(rand, 2, 7), 5, 1, z, box);
    }
    for (let z2 = 0; z2 < 9; z2++) {
      for (let x = 0; x < 7; x++) {
        this.clearCurrentPositionBlocksUpwards(w, x, 4, z2, box);
        this.fillCurrentPositionBlocksDownwards(w, B.dirt, 0, x, -1, z2, box);
      }
    }
    return true;
  }
}

export class ComponentVillageHouse2 extends ComponentVillage {
  private averageGroundLevel = -1;
  private hasMadeChest = false;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageHouse2 | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 10, 6, 7, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageHouse2(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 6 - 1, 0);
    }
    this.fillWithBlocks(w, box, 0, 1, 0, 9, 4, 6, 0, 0, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 9, 0, 6, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 4, 0, 9, 4, 6, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 0, 5, 0, 9, 5, 6, B.stoneSingleSlab, B.stoneSingleSlab, false);
    this.fillWithBlocks(w, box, 1, 5, 1, 8, 5, 5, 0, 0, false);
    this.fillWithBlocks(w, box, 1, 1, 0, 2, 3, 0, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 1, 0, 0, 4, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 3, 1, 0, 3, 4, 0, B.wood, B.wood, false);
    this.fillWithBlocks(w, box, 0, 1, 6, 0, 4, 6, B.wood, B.wood, false);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 3, 3, 1, box);
    this.fillWithBlocks(w, box, 3, 1, 2, 3, 3, 2, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 4, 1, 3, 5, 3, 3, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 1, 1, 0, 3, 5, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 1, 6, 5, 3, 6, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 5, 1, 0, 5, 3, 0, B.fence, B.fence, false);
    this.fillWithBlocks(w, box, 9, 1, 0, 9, 3, 0, B.fence, B.fence, false);
    this.fillWithBlocks(w, box, 6, 1, 4, 9, 4, 6, B.cobblestone, B.cobblestone, false);
    this.placeBlockAtCurrentPosition(w, B.lavaMoving, 0, 7, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.lavaMoving, 0, 8, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, 9, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.fenceIron, 0, 9, 2, 4, box);
    this.fillWithBlocks(w, box, 7, 2, 4, 8, 2, 5, 0, 0, false);
    this.placeBlockAtCurrentPosition(w, B.cobblestone, 0, 6, 1, 3, box);
    this.placeBlockAtCurrentPosition(w, B.furnaceIdle, 0, 6, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.furnaceIdle, 0, 6, 3, 3, box);
    this.placeBlockAtCurrentPosition(w, B.stoneDoubleSlab, 0, 8, 1, 1, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 6, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 4, 2, 6, box);
    this.placeBlockAtCurrentPosition(w, B.fence, 0, 2, 1, 4, box);
    this.placeBlockAtCurrentPosition(w, B.pressurePlatePlanks, 0, 2, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 1, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, this.getMetadataWithOffset(B.stairsWoodOak, 3), 2, 1, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, this.getMetadataWithOffset(B.stairsWoodOak, 1), 1, 1, 4, box);
    if (!this.hasMadeChest) {
      const i = this.getYWithOffset(1);
      const i2 = this.getXWithOffset(5, 5);
      const i3 = this.getZWithOffset(5, 5);
      if (box.isVecInside(i2, i, i3)) {
        this.hasMadeChest = true;
        this.generateStructureChestContents(w, box, rand, 5, 1, 5, VILLAGE_BLACKSMITH_LOOT, 3 + rand.nextInt(6));
      }
    }
    for (let x = 6; x <= 8; x++) {
      if (this.getBlockIdAtCurrentPosition(w, x, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, x, -1, -1, box) !== 0) {
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), x, 0, -1, box);
      }
    }
    for (let z = 0; z < 7; z++) {
      for (let x2 = 0; x2 < 10; x2++) {
        this.clearCurrentPositionBlocksUpwards(w, x2, 6, z, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x2, -1, z, box);
      }
    }
    this.spawnVillagers(w, box, 7, 1, 1, 1);
    return true;
  }
  protected override getVillagerType(i: number): number {
    return 3;
  }
}

export class ComponentVillageHouse3 extends ComponentVillage {
  private averageGroundLevel = -1;
  constructor(start: ComponentVillageStartPiece, type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(start, type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }
  static create(
    start: ComponentVillageStartPiece,
    list: StructureComponent[],
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    facing: number,
    type: number,
  ): ComponentVillageHouse3 | null {
    const bb = StructureBoundingBox.getComponentToAddBoundingBox(x, y, z, 0, 0, 0, 9, 7, 12, facing);
    return ComponentVillage.canVillageGoDeeper(bb) && StructureComponent.findIntersecting(list, bb) === null
      ? new ComponentVillageHouse3(start, type, rand, bb, facing)
      : null;
  }
  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.averageGroundLevel < 0) {
      this.averageGroundLevel = this.getAverageGroundLevel(w, box);
      if (this.averageGroundLevel < 0) {
        return true;
      }
      this.boundingBox.offset(0, this.averageGroundLevel - this.boundingBox.maxY + 7 - 1, 0);
    }
    this.fillWithBlocks(w, box, 1, 1, 1, 7, 4, 4, 0, 0, false);
    this.fillWithBlocks(w, box, 2, 1, 6, 8, 4, 10, 0, 0, false);
    this.fillWithBlocks(w, box, 2, 0, 5, 8, 0, 10, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 0, 1, 7, 0, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 0, 0, 0, 3, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 8, 0, 0, 8, 3, 10, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 0, 0, 7, 2, 0, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 0, 5, 2, 1, 5, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 2, 0, 6, 2, 3, 10, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 3, 0, 10, 7, 3, 10, B.cobblestone, B.cobblestone, false);
    this.fillWithBlocks(w, box, 1, 2, 0, 7, 3, 0, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 1, 2, 5, 2, 3, 5, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 4, 1, 8, 4, 1, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 4, 4, 3, 4, 4, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 0, 5, 2, 8, 5, 3, B.planks, B.planks, false);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 0, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 0, 4, 3, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 4, 2, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 4, 3, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 4, 4, box);
    const stairsMeta3 = this.getMetadataWithOffset(B.stairsWoodOak, 3);
    const stairsMeta2 = this.getMetadataWithOffset(B.stairsWoodOak, 2);
    for (let z = -1; z <= 2; z++) {
      for (let x = 0; x <= 8; x++) {
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta3, x, 4 + z, z, box);
        if ((z > -1 || x <= 1) && (z > 0 || x <= 3) && (z > 1 || x <= 4 || x >= 6)) {
          this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta2, x, 4 + z, 5 - z, box);
        }
      }
    }
    this.fillWithBlocks(w, box, 3, 4, 5, 3, 4, 10, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 7, 4, 2, 7, 4, 10, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 4, 5, 4, 4, 5, 10, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 6, 5, 4, 6, 5, 10, B.planks, B.planks, false);
    this.fillWithBlocks(w, box, 5, 6, 3, 5, 6, 10, B.planks, B.planks, false);
    const stairsMeta0 = this.getMetadataWithOffset(B.stairsWoodOak, 0);
    for (let x2 = 4; x2 >= 1; x2--) {
      this.placeBlockAtCurrentPosition(w, B.planks, 0, x2, 2 + x2, 7 - x2, box);
      for (let z2 = 8 - x2; z2 <= 10; z2++) {
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta0, x2, 2 + x2, z2, box);
      }
    }
    const stairsMeta1 = this.getMetadataWithOffset(B.stairsWoodOak, 1);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 6, 6, 3, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 7, 5, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta1, 6, 6, 4, box);
    for (let x3 = 6; x3 <= 8; x3++) {
      for (let z3 = 5; z3 <= 10; z3++) {
        this.placeBlockAtCurrentPosition(w, B.stairsWoodOak, stairsMeta1, x3, 12 - x3, z3, box);
      }
    }
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 0, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 0, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 4, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 6, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 3, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 4, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 8, 2, 5, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 6, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 7, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 8, 2, 8, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 8, 2, 9, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 2, 2, 6, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 7, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 2, 2, 8, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 2, 2, 9, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 4, 4, 10, box);
    this.placeBlockAtCurrentPosition(w, B.thinGlass, 0, 5, 4, 10, box);
    this.placeBlockAtCurrentPosition(w, B.wood, 0, 6, 4, 10, box);
    this.placeBlockAtCurrentPosition(w, B.planks, 0, 5, 5, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 1, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 2, 2, 0, box);
    this.placeBlockAtCurrentPosition(w, B.torchWood, 0, 2, 3, 1, box);
    this.placeDoorAtCurrentPosition(w, box, rand, 2, 1, 0, this.getMetadataWithOffset(B.doorWood, 1));
    this.fillWithBlocks(w, box, 1, 0, -1, 3, 2, -1, 0, 0, false);
    if (this.getBlockIdAtCurrentPosition(w, 2, 0, -1, box) === 0 && this.getBlockIdAtCurrentPosition(w, 2, -1, -1, box) !== 0) {
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, this.getMetadataWithOffset(B.stairsCobblestone, 3), 2, 0, -1, box);
    }
    for (let z4 = 0; z4 < 5; z4++) {
      for (let x4 = 0; x4 < 9; x4++) {
        this.clearCurrentPositionBlocksUpwards(w, x4, 7, z4, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x4, -1, z4, box);
      }
    }
    for (let z5 = 5; z5 < 11; z5++) {
      for (let x5 = 2; x5 < 9; x5++) {
        this.clearCurrentPositionBlocksUpwards(w, x5, 7, z5, box);
        this.fillCurrentPositionBlocksDownwards(w, B.cobblestone, 0, x5, -1, z5, box);
      }
    }
    this.spawnVillagers(w, box, 4, 1, 2, 2);
    return true;
  }
}

/** The well in the middle of the village, which knows the village's biome and piece budget. */
export class ComponentVillageStartPiece extends ComponentVillageWell {
  readonly inDesert: boolean;
  structVillagePieceWeight: StructureVillagePieceWeight | null = null;
  /** field_74932_i / field_74930_j: houses and roads still to be expanded. */
  readonly pendingHouses: StructureComponent[] = [];
  readonly pendingRoads: StructureComponent[] = [];

  constructor(
    readonly worldChunkMngr: BiomeSource,
    type: number,
    rand: JavaRandom,
    x: number,
    z: number,
    readonly structureVillageWeightedPieceList: StructureVillagePieceWeight[],
    readonly terrainType: number,
  ) {
    super(null, 0, rand, x, z);
    const biome = worldChunkMngr.getBiomeGenAt(x, z);
    this.inDesert = biome === Biomes.desert || biome === Biomes.desertHills;
    this.startPiece = this;
  }

  getWorldChunkManager(): BiomeSource {
    return this.worldChunkMngr;
  }
}

/** StructureVillagePieces.getStructureVillageWeightedPieceList: this village's house budget. */
function getStructureVillageWeightedPieceList(rand: JavaRandom, size: number): StructureVillagePieceWeight[] {
  const list = [
    new StructureVillagePieceWeight(ComponentVillageHouse4_Garden.create, 4, getRandomIntegerInRange(rand, 2 + size, 4 + size * 2)),
    new StructureVillagePieceWeight(ComponentVillageChurch.create, 20, getRandomIntegerInRange(rand, 0 + size, 1 + size)),
    new StructureVillagePieceWeight(ComponentVillageHouse1.create, 20, getRandomIntegerInRange(rand, 0 + size, 2 + size)),
    new StructureVillagePieceWeight(ComponentVillageWoodHut.create, 3, getRandomIntegerInRange(rand, 2 + size, 5 + size * 3)),
    new StructureVillagePieceWeight(ComponentVillageHall.create, 15, getRandomIntegerInRange(rand, 0 + size, 2 + size)),
    new StructureVillagePieceWeight(ComponentVillageField.create, 3, getRandomIntegerInRange(rand, 1 + size, 4 + size)),
    new StructureVillagePieceWeight(ComponentVillageField2.create, 3, getRandomIntegerInRange(rand, 2 + size, 4 + size * 2)),
    new StructureVillagePieceWeight(ComponentVillageHouse2.create, 15, getRandomIntegerInRange(rand, 0, 1 + size)),
    new StructureVillagePieceWeight(ComponentVillageHouse3.create, 8, getRandomIntegerInRange(rand, 0 + size, 3 + size * 2)),
  ];
  return list.filter((p) => p.villagePiecesLimit !== 0);
}

/** func_75079_a: total weight, or -1 when every type has reached its limit. */
function totalWeight(list: readonly StructureVillagePieceWeight[]): number {
  let any = false;
  let total = 0;
  for (const p of list) {
    if (p.villagePiecesLimit > 0 && p.villagePiecesSpawned < p.villagePiecesLimit) any = true;
    total += p.villagePieceWeight;
  }
  return any ? total : -1;
}

/** getNextVillageComponent: a weighted house (five tries), else a lamp post. */
function getNextVillageComponent(
  start: ComponentVillageStartPiece,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): ComponentVillage | null {
  const total = totalWeight(start.structureVillageWeightedPieceList);
  if (total <= 0) return null;
  for (let tries = 0; tries < 5; tries++) {
    let r = rand.nextInt(total);
    for (const p of start.structureVillageWeightedPieceList) {
      r -= p.villagePieceWeight;
      if (r >= 0) continue;
      if (!p.canSpawnMoreVillagePiecesOfType(type) || (p === start.structVillagePieceWeight && start.structureVillageWeightedPieceList.length > 1)) break;
      const c = p.create(start, list, rand, x, y, z, facing, type);
      if (c) {
        p.villagePiecesSpawned++;
        start.structVillagePieceWeight = p;
        if (!p.canSpawnMoreVillagePieces()) start.structureVillageWeightedPieceList.splice(start.structureVillageWeightedPieceList.indexOf(p), 1);
        return c;
      }
    }
  }
  const bb = ComponentVillageTorch.findPieceBox(start, list, rand, x, y, z, facing);
  return bb ? new ComponentVillageTorch(start, type, rand, bb, facing) : null;
}

/** getNextVillageStructureComponent: a house within 112 blocks of the well, inside village biomes. */
function getNextVillageStructureComponent(
  start: ComponentVillageStartPiece,
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
  const c = getNextVillageComponent(start, list, rand, x, y, z, facing, type + 1);
  if (!c) return null;
  const bb = c.boundingBox;
  const cx = Math.trunc((bb.minX + bb.maxX) / 2);
  const cz = Math.trunc((bb.minZ + bb.maxZ) / 2);
  const size = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
  if (!start.getWorldChunkManager().areBiomesViable(cx, cz, Math.trunc(size / 2) + 4, VILLAGE_SPAWN_BIOMES)) return null;
  list.push(c);
  start.pendingHouses.push(c);
  return c;
}

/** getNextComponentVillagePath: a road of 3 to 5 sections. */
function getNextComponentVillagePath(
  start: ComponentVillageStartPiece,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): StructureComponent | null {
  if (type > 3 + start.terrainType) return null;
  if (Math.abs(x - start.getBoundingBox().minX) > 112 || Math.abs(z - start.getBoundingBox().minZ) > 112) return null;
  const bb = ComponentVillagePathGen.findPieceBox(start, list, rand, x, y, z, facing);
  if (!bb || bb.minY <= 10) return null;
  const path = new ComponentVillagePathGen(start, type, rand, bb, facing);
  const pb = path.boundingBox;
  const cx = Math.trunc((pb.minX + pb.maxX) / 2);
  const cz = Math.trunc((pb.minZ + pb.maxZ) / 2);
  const size = Math.max(pb.maxX - pb.minX, pb.maxZ - pb.minZ);
  if (!start.getWorldChunkManager().areBiomesViable(cx, cz, Math.trunc(size / 2) + 4, VILLAGE_SPAWN_BIOMES)) return null;
  list.push(path);
  start.pendingRoads.push(path);
  return path;
}

class StructureVillageStart extends StructureStart {
  private readonly hasMoreThanTwoComponents: boolean;

  constructor(biomes: BiomeSource, rand: JavaRandom, cx: number, cz: number, size: number) {
    super();
    const pieces = getStructureVillageWeightedPieceList(rand, size);
    const well = new ComponentVillageStartPiece(biomes, 0, rand, (cx << 4) + 2, (cz << 4) + 2, pieces, size);
    this.components.push(well);
    well.buildComponent(well, this.components, rand);
    const roads = well.pendingRoads;
    const houses = well.pendingHouses;
    while (roads.length > 0 || houses.length > 0) {
      if (roads.length === 0) {
        const c = houses.splice(rand.nextInt(houses.length), 1)[0];
        c.buildComponent(well, this.components, rand);
      } else {
        const c = roads.splice(rand.nextInt(roads.length), 1)[0];
        c.buildComponent(well, this.components, rand);
      }
    }
    this.updateBoundingBox();
    let n = 0;
    for (const c of this.components) if (!(c instanceof ComponentVillageRoadPiece)) n++;
    this.hasMoreThanTwoComponents = n > 2;
  }

  override isSizeableStructure(): boolean {
    return this.hasMoreThanTwoComponents;
  }
}

/**
 * MapGenVillage: one village attempt per 32x32-chunk region (Superflat: "village(size=,
 * distance=)"), placed where plains or desert covers the start chunk.
 */
export class MapGenVillage extends MapGenStructure {
  private terrainType = 0;
  private distance = 32;
  private readonly minDistance = 8;

  constructor(options?: Map<string, string>) {
    super();
    for (const [k, v] of options ?? []) {
      if (k === 'size') this.terrainType = parseIntWithMin(v, this.terrainType, 0);
      else if (k === 'distance') this.distance = parseIntWithMin(v, this.distance, this.minDistance + 1);
    }
  }

  protected canSpawnStructureAtCoords(cx: number, cz: number): boolean {
    let x = cx;
    let z = cz;
    if (x < 0) x -= this.distance - 1;
    if (z < 0) z -= this.distance - 1;
    let rx = Math.trunc(x / this.distance);
    let rz = Math.trunc(z / this.distance);
    const r = worldRandomSeed(this.ctx.seed, rx, rz, 10387312);
    rx *= this.distance;
    rz *= this.distance;
    rx += r.nextInt(this.distance - this.minDistance);
    rz += r.nextInt(this.distance - this.minDistance);
    return cx === rx && cz === rz && this.ctx.biomeSource.areBiomesViable(cx * 16 + 8, cz * 16 + 8, 0, VILLAGE_SPAWN_BIOMES);
  }

  protected getStructureStart(cx: number, cz: number): StructureStart {
    return new StructureVillageStart(this.ctx.biomeSource, this.rand, cx, cz, this.terrainType);
  }
}

/** MathHelper.parseIntWithDefaultAndMax: an int, at least `min` (the default on bad input). */
function parseIntWithMin(s: string, def: number, min: number): number {
  const n = /^[-+]?\d+$/.test(s) ? Number.parseInt(s, 10) : Number.NaN;
  return Math.max(min, Number.isNaN(n) ? def : n);
}
