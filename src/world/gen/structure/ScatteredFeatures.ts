import { BlockIds as B, ItemIds as I } from '../../../block/BlockIds';
import { Direction } from '../../../core/Facing';
import type { JavaRandom } from '../../../core/JavaRandom';
import { Biomes, type BiomeGenBase } from '../../biome/BiomeGenBase';
import { spawnListEntry, type SpawnListEntry } from '../../biome/SpawnListEntry';
import type { IWorld } from '../../IWorld';
import { chestContent, enchantedBookContent, type ChestContent } from '../ChestLoot';
import { spawnGenEntity } from '../WorldGenSpawning';
import { averageGroundLevel, worldRandomSeed } from './StructureRandom';
import { StructureBoundingBox } from './StructureBoundingBox';
import { StructureComponent, type StructurePieceBlockSelector } from './StructureComponent';
import { MapGenStructure } from './MapGenStructure';
import { StructureStart } from './StructureStart';

const DESERT_TEMPLE_LOOT: readonly ChestContent[] = [
  chestContent(I.diamond, 0, 1, 3, 3),
  chestContent(I.ingotIron, 0, 1, 5, 10),
  chestContent(I.ingotGold, 0, 2, 7, 15),
  chestContent(I.emerald, 0, 1, 3, 2),
  chestContent(I.bone, 0, 4, 6, 20),
  chestContent(I.rottenFlesh, 0, 3, 7, 16),
];
const JUNGLE_TEMPLE_LOOT = DESERT_TEMPLE_LOOT;
const JUNGLE_TEMPLE_DISPENSER: readonly ChestContent[] = [chestContent(I.arrow, 0, 2, 7, 30)];

/** BlockLever.invertMetadata: the lever meta for a block side. */
function invertLeverMetadata(side: number): number {
  return [0, 5, 4, 3, 2, 1][side] ?? -1;
}

/** StructureScatteredFeatureStones: 40% cobblestone, else mossy cobblestone. */
const JUNGLE_STONES: StructurePieceBlockSelector = {
  selectedBlockId: 0,
  selectedBlockMetaData: 0,
  selectBlocks(rand: JavaRandom): void {
    this.selectedBlockId = rand.nextFloat() < 0.4 ? B.cobblestone : B.cobblestoneMossy;
  },
};

/** ComponentScatteredFeature: a single-piece structure that settles on the average ground height. */
abstract class ComponentScatteredFeature extends StructureComponent {
  /** field_74936_d: the ground level once measured (-1 before). */
  protected groundLevel = -1;

  constructor(
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    super(0);
    this.coordBaseMode = rand.nextInt(4);
    if (this.coordBaseMode === 0 || this.coordBaseMode === 2) this.boundingBox = new StructureBoundingBox(x, y, z, x + sx - 1, y + sy - 1, z + sz - 1);
    else this.boundingBox = new StructureBoundingBox(x, y, z, x + sz - 1, y + sy - 1, z + sx - 1);
  }

  /** func_74935_a: moves the piece to the mean top-solid height of the part inside `box` (once). */
  protected adjustToAverageGround(w: IWorld, box: StructureBoundingBox, dy: number): boolean {
    if (this.groundLevel >= 0) return true;
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
    if (n === 0) return false;
    this.groundLevel = Math.trunc(sum / n);
    this.boundingBox.offset(0, this.groundLevel - this.boundingBox.minY + dy, 0);
    return true;
  }
}

/** The desert temple: a sandstone pyramid over a TNT-trapped treasure room with four chests. */
export class ComponentScatteredFeatureDesertPyramid extends ComponentScatteredFeature {
  private readonly hasPlacedChest = [false, false, false, false];

  constructor(rand: JavaRandom, x: number, z: number) {
    super(rand, x, 64, z, 21, 15, 21);
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    const { sx, sz } = this;
    this.fillWithBlocks(w, box, 0, -4, 0, sx - 1, 0, sz - 1, B.sandStone, B.sandStone, false);
    for (let i = 1; i <= 9; i++) {
      this.fillWithBlocks(w, box, i, i, i, sx - 1 - i, i, sz - 1 - i, B.sandStone, B.sandStone, false);
      this.fillWithBlocks(w, box, i + 1, i, i + 1, sx - 2 - i, i, sz - 2 - i, 0, 0, false);
    }
    for (let x = 0; x < sx; x++) {
      for (let z = 0; z < sz; z++) {
        this.fillCurrentPositionBlocksDownwards(w, B.sandStone, 0, x, -5, z, box);
      }
    }
    const stairsN = this.getMetadataWithOffset(B.stairsSandStone, 3);
    const stairsS = this.getMetadataWithOffset(B.stairsSandStone, 2);
    const stairsW = this.getMetadataWithOffset(B.stairsSandStone, 0);
    const stairsE = this.getMetadataWithOffset(B.stairsSandStone, 1);
    const orange = 1;
    const blue = 11;
    this.fillWithBlocks(w, box, 0, 0, 0, 4, 9, 4, B.sandStone, 0, false);
    this.fillWithBlocks(w, box, 1, 10, 1, 3, 10, 3, B.sandStone, B.sandStone, false);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, 2, 10, 0, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsS, 2, 10, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsW, 0, 10, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsE, 4, 10, 2, box);
    this.fillWithBlocks(w, box, sx - 5, 0, 0, sx - 1, 9, 4, B.sandStone, 0, false);
    this.fillWithBlocks(w, box, sx - 4, 10, 1, sx - 2, 10, 3, B.sandStone, B.sandStone, false);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, sx - 3, 10, 0, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsS, sx - 3, 10, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsW, sx - 5, 10, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsE, sx - 1, 10, 2, box);
    this.fillWithBlocks(w, box, 8, 0, 0, 12, 4, 4, B.sandStone, 0, false);
    this.fillWithBlocks(w, box, 9, 1, 0, 11, 3, 4, 0, 0, false);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 9, 1, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 9, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 9, 3, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 10, 3, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 11, 3, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 11, 2, 1, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 11, 1, 1, box);
    this.fillWithBlocks(w, box, 4, 1, 1, 8, 3, 3, B.sandStone, 0, false);
    this.fillWithBlocks(w, box, 4, 1, 2, 8, 2, 2, 0, 0, false);
    this.fillWithBlocks(w, box, 12, 1, 1, 16, 3, 3, B.sandStone, 0, false);
    this.fillWithBlocks(w, box, 12, 1, 2, 16, 2, 2, 0, 0, false);
    this.fillWithBlocks(w, box, 5, 4, 5, sx - 6, 4, sz - 6, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, 9, 4, 9, 11, 4, 11, 0, 0, false);
    this.fillWithMetadataBlocks(w, box, 8, 1, 8, 8, 3, 8, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithMetadataBlocks(w, box, 12, 1, 8, 12, 3, 8, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithMetadataBlocks(w, box, 8, 1, 12, 8, 3, 12, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithMetadataBlocks(w, box, 12, 1, 12, 12, 3, 12, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithBlocks(w, box, 1, 1, 5, 4, 4, 11, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, sx - 5, 1, 5, sx - 2, 4, 11, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, 6, 7, 9, 6, 7, 11, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, sx - 7, 7, 9, sx - 7, 7, 11, B.sandStone, B.sandStone, false);
    this.fillWithMetadataBlocks(w, box, 5, 5, 9, 5, 7, 11, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithMetadataBlocks(w, box, sx - 6, 5, 9, sx - 6, 7, 11, B.sandStone, 2, B.sandStone, 2, false);
    this.placeBlockAtCurrentPosition(w, 0, 0, 5, 5, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 5, 6, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 6, 6, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, sx - 6, 5, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, sx - 6, 6, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, sx - 7, 6, 10, box);
    this.fillWithBlocks(w, box, 2, 4, 4, 2, 6, 4, 0, 0, false);
    this.fillWithBlocks(w, box, sx - 3, 4, 4, sx - 3, 6, 4, 0, 0, false);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, 2, 4, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, 2, 3, 4, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, sx - 3, 4, 5, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsN, sx - 3, 3, 4, box);
    this.fillWithBlocks(w, box, 1, 1, 3, 2, 2, 3, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, sx - 3, 1, 3, sx - 2, 2, 3, B.sandStone, B.sandStone, false);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, 0, 1, 1, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, 0, sx - 2, 1, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 1, 1, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stoneSingleSlab, 1, sx - 2, 2, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsE, 2, 1, 2, box);
    this.placeBlockAtCurrentPosition(w, B.stairsSandStone, stairsW, sx - 3, 1, 2, box);
    this.fillWithBlocks(w, box, 4, 3, 5, 4, 3, 18, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, sx - 5, 3, 5, sx - 5, 3, 17, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, 3, 1, 5, 4, 2, 16, 0, 0, false);
    this.fillWithBlocks(w, box, sx - 6, 1, 5, sx - 5, 2, 16, 0, 0, false);
    for (let z = 5; z <= 17; z += 2) {
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 4, 1, z, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 4, 2, z, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, sx - 5, 1, z, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, sx - 5, 2, z, box);
    }
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 10, 0, 7, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 10, 0, 8, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 9, 0, 9, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 11, 0, 9, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 8, 0, 10, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 12, 0, 10, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 7, 0, 10, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 13, 0, 10, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 9, 0, 11, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 11, 0, 11, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 10, 0, 12, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 10, 0, 13, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, blue, 10, 0, 10, box);
    for (let x = 0; x <= sx - 1; x += sx - 1) {
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 2, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 2, 2, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 2, 3, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 3, 3, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 4, 1, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, x, 4, 2, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 4, 3, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 5, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 5, 2, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 5, 3, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 6, 1, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, x, 6, 2, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 6, 3, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 7, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 7, 2, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 7, 3, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 8, 1, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 8, 2, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 8, 3, box);
    }
    for (let x = 2; x <= sx - 3; x += sx - 3 - 2) {
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x - 1, 2, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 2, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x + 1, 2, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x - 1, 3, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 3, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x + 1, 3, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x - 1, 4, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, x, 4, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x + 1, 4, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x - 1, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x + 1, 5, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x - 1, 6, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 1, x, 6, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x + 1, 6, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x - 1, 7, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x, 7, 0, box);
      this.placeBlockAtCurrentPosition(w, B.cloth, orange, x + 1, 7, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x - 1, 8, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x, 8, 0, box);
      this.placeBlockAtCurrentPosition(w, B.sandStone, 2, x + 1, 8, 0, box);
    }
    this.fillWithMetadataBlocks(w, box, 8, 4, 0, 12, 6, 0, B.sandStone, 2, B.sandStone, 2, false);
    this.placeBlockAtCurrentPosition(w, 0, 0, 8, 6, 0, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 12, 6, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 9, 5, 0, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 10, 5, 0, box);
    this.placeBlockAtCurrentPosition(w, B.cloth, orange, 11, 5, 0, box);
    this.fillWithMetadataBlocks(w, box, 8, -14, 8, 12, -11, 12, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithMetadataBlocks(w, box, 8, -10, 8, 12, -10, 12, B.sandStone, 1, B.sandStone, 1, false);
    this.fillWithMetadataBlocks(w, box, 8, -9, 8, 12, -9, 12, B.sandStone, 2, B.sandStone, 2, false);
    this.fillWithBlocks(w, box, 8, -8, 8, 12, -1, 12, B.sandStone, B.sandStone, false);
    this.fillWithBlocks(w, box, 9, -11, 9, 11, -1, 11, 0, 0, false);
    this.placeBlockAtCurrentPosition(w, B.pressurePlateStone, 0, 10, -11, 10, box);
    this.fillWithBlocks(w, box, 9, -13, 9, 11, -13, 11, B.tnt, 0, false);
    this.placeBlockAtCurrentPosition(w, 0, 0, 8, -11, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 8, -10, 10, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 7, -10, 10, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 7, -11, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 12, -11, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 12, -10, 10, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 13, -10, 10, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 13, -11, 10, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 10, -11, 8, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 10, -10, 8, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 10, -10, 7, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 10, -11, 7, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 10, -11, 12, box);
    this.placeBlockAtCurrentPosition(w, 0, 0, 10, -10, 12, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 1, 10, -10, 13, box);
    this.placeBlockAtCurrentPosition(w, B.sandStone, 2, 10, -11, 13, box);
    for (let d = 0; d < 4; d++) {
      if (!this.hasPlacedChest[d]) {
        let dx = Direction.offsetX[d] * 2;
        let dz = Direction.offsetZ[d] * 2;
        this.hasPlacedChest[d] = this.generateStructureChestContents(
          w,
          box,
          rand,
          10 + dx,
          -11,
          10 + dz,
          [...DESERT_TEMPLE_LOOT, enchantedBookContent(rand, 1, 1, 1)],
          2 + rand.nextInt(5),
        );
      }
    }
    return true;
  }
}

/** The jungle temple: mossy cobblestone, a lever puzzle, tripwire dispenser traps and two chests. */
export class ComponentScatteredFeatureJunglePyramid extends ComponentScatteredFeature {
  private placedMainChest = false;
  private placedHiddenChest = false;
  private placedTrap1 = false;
  private placedTrap2 = false;

  constructor(rand: JavaRandom, x: number, z: number) {
    super(rand, x, 64, z, 12, 10, 15);
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    const { sx, sz } = this;
    if (!this.adjustToAverageGround(w, box, 0)) {
      return false;
    } else {
      const stairsN = this.getMetadataWithOffset(B.stairsCobblestone, 3);
      const stairsS = this.getMetadataWithOffset(B.stairsCobblestone, 2);
      const stairsW = this.getMetadataWithOffset(B.stairsCobblestone, 0);
      const stairsE = this.getMetadataWithOffset(B.stairsCobblestone, 1);
      this.fillWithRandomizedBlocks(w, box, 0, -4, 0, sx - 1, 0, sz - 1, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 1, 2, 9, 2, 2, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 1, 12, 9, 2, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 1, 3, 2, 2, 11, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 9, 1, 3, 9, 2, 11, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 1, 3, 1, 10, 6, 1, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 1, 3, 13, 10, 6, 13, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 1, 3, 2, 1, 6, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 10, 3, 2, 10, 6, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 3, 2, 9, 3, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 6, 2, 9, 6, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 3, 7, 3, 8, 7, 11, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 8, 4, 7, 8, 10, false, rand, JUNGLE_STONES);
      this.fillWithAir(w, box, 3, 1, 3, 8, 2, 11);
      this.fillWithAir(w, box, 4, 3, 6, 7, 3, 9);
      this.fillWithAir(w, box, 2, 4, 2, 9, 5, 12);
      this.fillWithAir(w, box, 4, 6, 5, 7, 6, 9);
      this.fillWithAir(w, box, 5, 7, 6, 6, 7, 8);
      this.fillWithAir(w, box, 5, 1, 2, 6, 2, 2);
      this.fillWithAir(w, box, 5, 2, 12, 6, 2, 12);
      this.fillWithAir(w, box, 5, 5, 1, 6, 5, 1);
      this.fillWithAir(w, box, 5, 5, 13, 6, 5, 13);
      this.placeBlockAtCurrentPosition(w, 0, 0, 1, 5, 5, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 10, 5, 5, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 1, 5, 9, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 10, 5, 9, box);
      for (let z = 0; z <= 14; z += 14) {
        this.fillWithRandomizedBlocks(w, box, 2, 4, z, 2, 5, z, false, rand, JUNGLE_STONES);
        this.fillWithRandomizedBlocks(w, box, 4, 4, z, 4, 5, z, false, rand, JUNGLE_STONES);
        this.fillWithRandomizedBlocks(w, box, 7, 4, z, 7, 5, z, false, rand, JUNGLE_STONES);
        this.fillWithRandomizedBlocks(w, box, 9, 4, z, 9, 5, z, false, rand, JUNGLE_STONES);
      }
      this.fillWithRandomizedBlocks(w, box, 5, 6, 0, 6, 6, 0, false, rand, JUNGLE_STONES);
      for (let x = 0; x <= 11; x += 11) {
        for (let z = 2; z <= 12; z += 2) {
          this.fillWithRandomizedBlocks(w, box, x, 4, z, x, 5, z, false, rand, JUNGLE_STONES);
        }
        this.fillWithRandomizedBlocks(w, box, x, 6, 5, x, 6, 5, false, rand, JUNGLE_STONES);
        this.fillWithRandomizedBlocks(w, box, x, 6, 9, x, 6, 9, false, rand, JUNGLE_STONES);
      }
      this.fillWithRandomizedBlocks(w, box, 2, 7, 2, 2, 9, 2, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 9, 7, 2, 9, 9, 2, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 2, 7, 12, 2, 9, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 9, 7, 12, 9, 9, 12, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 9, 4, 4, 9, 4, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 7, 9, 4, 7, 9, 4, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 9, 10, 4, 9, 10, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 7, 9, 10, 7, 9, 10, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 5, 9, 7, 6, 9, 7, false, rand, JUNGLE_STONES);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 5, 9, 6, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 6, 9, 6, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsS, 5, 9, 8, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsS, 6, 9, 8, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 4, 0, 0, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 5, 0, 0, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 6, 0, 0, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 7, 0, 0, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 4, 1, 8, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 4, 2, 9, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 4, 3, 10, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 7, 1, 8, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 7, 2, 9, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsN, 7, 3, 10, box);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 9, 4, 1, 9, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 7, 1, 9, 7, 1, 9, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 4, 1, 10, 7, 2, 10, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 5, 4, 5, 6, 4, 5, false, rand, JUNGLE_STONES);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsW, 4, 4, 5, box);
      this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsE, 7, 4, 5, box);
      for (let i = 0; i < 4; i++) {
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsS, 5, 0 - i, 6 + i, box);
        this.placeBlockAtCurrentPosition(w, B.stairsCobblestone, stairsS, 6, 0 - i, 6 + i, box);
        this.fillWithAir(w, box, 5, 0 - i, 7 + i, 6, 0 - i, 9 + i);
      }
      this.fillWithAir(w, box, 1, -3, 12, 10, -1, 13);
      this.fillWithAir(w, box, 1, -3, 1, 3, -1, 13);
      this.fillWithAir(w, box, 1, -3, 1, 9, -1, 5);
      for (let z = 1; z <= 13; z += 2) {
        this.fillWithRandomizedBlocks(w, box, 1, -3, z, 1, -2, z, false, rand, JUNGLE_STONES);
      }
      for (let z = 2; z <= 12; z += 2) {
        this.fillWithRandomizedBlocks(w, box, 1, -1, z, 3, -1, z, false, rand, JUNGLE_STONES);
      }
      this.fillWithRandomizedBlocks(w, box, 2, -2, 1, 5, -2, 1, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 7, -2, 1, 9, -2, 1, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 6, -3, 1, 6, -3, 1, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 6, -1, 1, 6, -1, 1, false, rand, JUNGLE_STONES);
      this.placeBlockAtCurrentPosition(w, B.tripWireSource, this.getMetadataWithOffset(B.tripWireSource, 3) | 4, 1, -3, 8, box);
      this.placeBlockAtCurrentPosition(w, B.tripWireSource, this.getMetadataWithOffset(B.tripWireSource, 1) | 4, 4, -3, 8, box);
      this.placeBlockAtCurrentPosition(w, B.tripWire, 4, 2, -3, 8, box);
      this.placeBlockAtCurrentPosition(w, B.tripWire, 4, 3, -3, 8, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 7, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 6, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 4, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 3, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 5, -3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 4, -3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 3, -3, 1, box);
      if (!this.placedTrap1) {
        this.placedTrap1 = this.generateStructureDispenserContents(w, box, rand, 3, -2, 1, 2, JUNGLE_TEMPLE_DISPENSER, 2);
      }
      this.placeBlockAtCurrentPosition(w, B.vine, 15, 3, -2, 2, box);
      this.placeBlockAtCurrentPosition(w, B.tripWireSource, this.getMetadataWithOffset(B.tripWireSource, 2) | 4, 7, -3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.tripWireSource, this.getMetadataWithOffset(B.tripWireSource, 0) | 4, 7, -3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.tripWire, 4, 7, -3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.tripWire, 4, 7, -3, 3, box);
      this.placeBlockAtCurrentPosition(w, B.tripWire, 4, 7, -3, 4, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 8, -3, 6, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 9, -3, 6, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 9, -3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 9, -3, 4, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 9, -2, 4, box);
      if (!this.placedTrap2) {
        this.placedTrap2 = this.generateStructureDispenserContents(w, box, rand, 9, -2, 3, 4, JUNGLE_TEMPLE_DISPENSER, 2);
      }
      this.placeBlockAtCurrentPosition(w, B.vine, 15, 8, -1, 3, box);
      this.placeBlockAtCurrentPosition(w, B.vine, 15, 8, -2, 3, box);
      if (!this.placedMainChest) {
        this.placedMainChest = this.generateStructureChestContents(
          w,
          box,
          rand,
          8,
          -3,
          3,
          [...JUNGLE_TEMPLE_LOOT, enchantedBookContent(rand, 1, 1, 1)],
          2 + rand.nextInt(5),
        );
      }
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 9, -3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 8, -3, 1, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 4, -3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 5, -2, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 5, -1, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 6, -3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 7, -2, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 7, -1, 5, box);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 8, -3, 5, box);
      this.fillWithRandomizedBlocks(w, box, 9, -1, 1, 9, -1, 5, false, rand, JUNGLE_STONES);
      this.fillWithAir(w, box, 8, -3, 8, 10, -1, 10);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 3, 8, -2, 11, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 3, 9, -2, 11, box);
      this.placeBlockAtCurrentPosition(w, B.stoneBrick, 3, 10, -2, 11, box);
      this.placeBlockAtCurrentPosition(w, B.lever, invertLeverMetadata(this.getMetadataWithOffset(B.lever, 2)), 8, -2, 12, box);
      this.placeBlockAtCurrentPosition(w, B.lever, invertLeverMetadata(this.getMetadataWithOffset(B.lever, 2)), 9, -2, 12, box);
      this.placeBlockAtCurrentPosition(w, B.lever, invertLeverMetadata(this.getMetadataWithOffset(B.lever, 2)), 10, -2, 12, box);
      this.fillWithRandomizedBlocks(w, box, 8, -3, 8, 8, -3, 10, false, rand, JUNGLE_STONES);
      this.fillWithRandomizedBlocks(w, box, 10, -3, 8, 10, -3, 10, false, rand, JUNGLE_STONES);
      this.placeBlockAtCurrentPosition(w, B.cobblestoneMossy, 0, 10, -2, 9, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 8, -2, 9, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 8, -2, 10, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneWire, 0, 10, -1, 9, box);
      this.placeBlockAtCurrentPosition(w, B.pistonStickyBase, 1, 9, -2, 8, box);
      this.placeBlockAtCurrentPosition(w, B.pistonStickyBase, this.getMetadataWithOffset(B.pistonStickyBase, 4), 10, -2, 8, box);
      this.placeBlockAtCurrentPosition(w, B.pistonStickyBase, this.getMetadataWithOffset(B.pistonStickyBase, 4), 10, -1, 8, box);
      this.placeBlockAtCurrentPosition(w, B.redstoneRepeaterIdle, this.getMetadataWithOffset(B.redstoneRepeaterIdle, 2), 10, -2, 10, box);
      if (!this.placedHiddenChest) {
        this.placedHiddenChest = this.generateStructureChestContents(
          w,
          box,
          rand,
          9,
          -3,
          10,
          [...JUNGLE_TEMPLE_LOOT, enchantedBookContent(rand, 1, 1, 1)],
          2 + rand.nextInt(5),
        );
      }
      return true;
    }
  }
}

/** The witch hut on stilts in swamps, with its witch. */
export class ComponentScatteredFeatureSwampHut extends ComponentScatteredFeature {
  private hasWitch = false;

  constructor(rand: JavaRandom, x: number, z: number) {
    super(rand, x, 64, z, 7, 5, 9);
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (!this.adjustToAverageGround(w, box, 0)) {
      return false;
    } else {
      this.fillWithMetadataBlocks(w, box, 1, 1, 1, 5, 1, 7, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 1, 4, 2, 5, 4, 7, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 2, 1, 0, 4, 1, 0, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 2, 2, 2, 3, 3, 2, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 1, 2, 3, 1, 3, 6, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 5, 2, 3, 5, 3, 6, B.planks, 1, B.planks, 1, false);
      this.fillWithMetadataBlocks(w, box, 2, 2, 7, 4, 3, 7, B.planks, 1, B.planks, 1, false);
      this.fillWithBlocks(w, box, 1, 0, 2, 1, 3, 2, B.wood, B.wood, false);
      this.fillWithBlocks(w, box, 5, 0, 2, 5, 3, 2, B.wood, B.wood, false);
      this.fillWithBlocks(w, box, 1, 0, 7, 1, 3, 7, B.wood, B.wood, false);
      this.fillWithBlocks(w, box, 5, 0, 7, 5, 3, 7, B.wood, B.wood, false);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 2, 3, 2, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 3, 3, 7, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 1, 3, 4, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 5, 3, 4, box);
      this.placeBlockAtCurrentPosition(w, 0, 0, 5, 3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.flowerPot, 7, 1, 3, 5, box);
      this.placeBlockAtCurrentPosition(w, B.workbench, 0, 3, 2, 6, box);
      this.placeBlockAtCurrentPosition(w, B.cauldron, 0, 4, 2, 6, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 1, 2, 1, box);
      this.placeBlockAtCurrentPosition(w, B.fence, 0, 5, 2, 1, box);
      const stairsN = this.getMetadataWithOffset(B.stairsWoodOak, 3);
      const stairsE = this.getMetadataWithOffset(B.stairsWoodOak, 1);
      const stairsW = this.getMetadataWithOffset(B.stairsWoodOak, 0);
      const stairsS = this.getMetadataWithOffset(B.stairsWoodOak, 2);
      this.fillWithMetadataBlocks(w, box, 0, 4, 1, 6, 4, 1, B.stairsWoodSpruce, stairsN, B.stairsWoodSpruce, stairsN, false);
      this.fillWithMetadataBlocks(w, box, 0, 4, 2, 0, 4, 7, B.stairsWoodSpruce, stairsW, B.stairsWoodSpruce, stairsW, false);
      this.fillWithMetadataBlocks(w, box, 6, 4, 2, 6, 4, 7, B.stairsWoodSpruce, stairsE, B.stairsWoodSpruce, stairsE, false);
      this.fillWithMetadataBlocks(w, box, 0, 4, 8, 6, 4, 8, B.stairsWoodSpruce, stairsS, B.stairsWoodSpruce, stairsS, false);
      for (let z = 2; z <= 7; z += 5) {
        for (let x = 1; x <= 5; x += 4) {
          this.fillCurrentPositionBlocksDownwards(w, B.wood, 0, x, -1, z, box);
        }
      }
      if (!this.hasWitch) {
        const wx = this.getXWithOffset(2, 5);
        const wy = this.getYWithOffset(2);
        const wz = this.getZWithOffset(2, 5);
        if (box.isVecInside(wx, wy, wz)) {
          this.hasWitch = true;
          spawnGenEntity(w, { name: 'Witch', x: wx + 0.5, y: wy, z: wz + 0.5, yaw: 0 });
        }
      }
      return true;
    }
  }
}

class StructureScatteredFeatureStart extends StructureStart {
  constructor(biome: BiomeGenBase, rand: JavaRandom, cx: number, cz: number) {
    super();
    if (biome === Biomes.jungle || biome === Biomes.jungleHills) this.components.push(new ComponentScatteredFeatureJunglePyramid(rand, cx * 16, cz * 16));
    else if (biome === Biomes.swampland) this.components.push(new ComponentScatteredFeatureSwampHut(rand, cx * 16, cz * 16));
    else this.components.push(new ComponentScatteredFeatureDesertPyramid(rand, cx * 16, cz * 16));
    this.updateBoundingBox();
  }
}

const SCATTERED_BIOMES: readonly BiomeGenBase[] = [Biomes.desert, Biomes.desertHills, Biomes.jungle, Biomes.jungleHills, Biomes.swampland];

/**
 * MapGenScatteredFeature: one temple or witch hut per 32x32-chunk region at a random spot
 * (at least 8 chunks from the region's far edges), if the biome there allows it.
 */
export class MapGenScatteredFeature extends MapGenStructure {
  /** Witches spawn in witch huts (ChunkProviderGenerate.getPossibleCreatures). */
  readonly scatteredFeatureSpawnList: SpawnListEntry[] = [spawnListEntry('Witch', 1, 1, 1)];
  private maxDistance = 32;
  private readonly minDistance = 8;

  constructor(options?: Map<string, string>) {
    super();
    const d = options?.get('distance');
    if (d !== undefined) this.maxDistance = parseIntWithDefaultAndMax(d, this.maxDistance, this.minDistance + 1);
  }

  protected canSpawnStructureAtCoords(cx: number, cz: number): boolean {
    let x = cx;
    let z = cz;
    if (x < 0) x -= this.maxDistance - 1;
    if (z < 0) z -= this.maxDistance - 1;
    let rx = Math.trunc(x / this.maxDistance);
    let rz = Math.trunc(z / this.maxDistance);
    const r = worldRandomSeed(this.ctx.seed, rx, rz, 14357617);
    rx *= this.maxDistance;
    rz *= this.maxDistance;
    rx += r.nextInt(this.maxDistance - this.minDistance);
    rz += r.nextInt(this.maxDistance - this.minDistance);
    if (cx !== rx || cz !== rz) return false;
    return SCATTERED_BIOMES.includes(this.ctx.biomeSource.getBiomeGenAt(cx * 16 + 8, cz * 16 + 8));
  }

  protected getStructureStart(cx: number, cz: number): StructureStart {
    return new StructureScatteredFeatureStart(this.ctx.biomeSource.getBiomeGenAt(cx * 16 + 8, cz * 16 + 8), this.rand, cx, cz);
  }
}

/** MathHelper.parseIntWithDefaultAndMax (the minimum, despite the name). */
export function parseIntWithDefaultAndMax(s: string, def: number, min: number): number {
  const n = /^[-+]?\d+$/.test(s) ? Number.parseInt(s, 10) : Number.NaN;
  return Number.isNaN(n) ? def : Math.max(min, n);
}
