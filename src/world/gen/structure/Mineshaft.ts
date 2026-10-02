import { Block } from '../../../block/Block';
import { BlockIds as B, ItemIds as I } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { chestContent, enchantedBookContent, GenInventory, generateChestContents, placeSpawner, type ChestContent } from '../ChestLoot';
import { spawnGenEntity } from '../WorldGenSpawning';
import { MapGenStructure } from './MapGenStructure';
import { StructureBoundingBox } from './StructureBoundingBox';
import { StructureComponent } from './StructureComponent';
import { StructureStart } from './StructureStart';

/** StructureMineshaftPieces.mineshaftChestContents. */
const MINESHAFT_LOOT: readonly ChestContent[] = [
  chestContent(I.ingotIron, 0, 1, 5, 10),
  chestContent(I.ingotGold, 0, 1, 3, 5),
  chestContent(I.redstone, 0, 4, 9, 5),
  chestContent(I.dyePowder, 4, 4, 9, 5),
  chestContent(I.diamond, 0, 1, 2, 3),
  chestContent(I.coal, 0, 3, 8, 10),
  chestContent(I.bread, 0, 1, 3, 15),
  chestContent(I.pickaxeIron, 0, 1, 1, 1),
  chestContent(B.rail, 0, 4, 8, 1),
  chestContent(I.melonSeeds, 0, 2, 4, 10),
  chestContent(I.pumpkinSeeds, 0, 2, 4, 10),
];

/** StructureMineshaftPieces.getRandomComponent: 20% crossing, 10% stairs, else a corridor. */
function getRandomComponent(
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): StructureComponent | null {
  const r = rand.nextInt(100);
  if (r >= 80) {
    const bb = ComponentMineshaftCross.findValidPlacement(list, rand, x, y, z, facing);
    if (bb) return new ComponentMineshaftCross(type, rand, bb, facing);
  } else if (r >= 70) {
    const bb = ComponentMineshaftStairs.findValidPlacement(list, rand, x, y, z, facing);
    if (bb) return new ComponentMineshaftStairs(type, rand, bb, facing);
  } else {
    const bb = ComponentMineshaftCorridor.findValidPlacement(list, rand, x, y, z, facing);
    if (bb) return new ComponentMineshaftCorridor(type, rand, bb, facing);
  }
  return null;
}

/** StructureMineshaftPieces.getNextMineShaftComponent: depth 8 and 80 blocks from the start room at most. */
function getNextMineShaftComponent(
  start: StructureComponent,
  list: StructureComponent[],
  rand: JavaRandom,
  x: number,
  y: number,
  z: number,
  facing: number,
  type: number,
): StructureComponent | null {
  if (type > 8) return null;
  if (Math.abs(x - start.getBoundingBox().minX) > 80 || Math.abs(z - start.getBoundingBox().minZ) > 80) return null;
  const c = getRandomComponent(list, rand, x, y, z, facing, type + 1);
  if (c) {
    list.push(c);
    c.buildComponent(start, list, rand);
  }
  return c;
}

/** The dirt-floored room every mineshaft starts from. */
export class ComponentMineshaftRoom extends StructureComponent {
  private readonly roomsLinkedToTheRoom: StructureBoundingBox[] = [];

  constructor(type: number, rand: JavaRandom, x: number, z: number) {
    super(type);
    this.boundingBox = new StructureBoundingBox(x, 50, z, x + 7 + rand.nextInt(6), 54 + rand.nextInt(6), z + 7 + rand.nextInt(6));
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const type = this.getComponentType();
    let yRange = this.boundingBox.getYSize() - 3 - 1;
    if (yRange <= 0) {
      yRange = 1;
    }
    let p = 0;
    while (p < this.boundingBox.getXSize()) {
      p += rand.nextInt(this.boundingBox.getXSize());
      if (p + 3 > this.boundingBox.getXSize()) {
        break;
      }
      let c = getNextMineShaftComponent(
        start,
        list,
        rand,
        this.boundingBox.minX + p,
        this.boundingBox.minY + rand.nextInt(yRange) + 1,
        this.boundingBox.minZ - 1,
        2,
        type,
      );
      if (c !== null) {
        let b = c.getBoundingBox();
        this.roomsLinkedToTheRoom.push(new StructureBoundingBox(b.minX, b.minY, this.boundingBox.minZ, b.maxX, b.maxY, this.boundingBox.minZ + 1));
      }
      p += 4;
    }
    p = 0;
    while (p < this.boundingBox.getXSize()) {
      p += rand.nextInt(this.boundingBox.getXSize());
      if (p + 3 > this.boundingBox.getXSize()) {
        break;
      }
      let c = getNextMineShaftComponent(
        start,
        list,
        rand,
        this.boundingBox.minX + p,
        this.boundingBox.minY + rand.nextInt(yRange) + 1,
        this.boundingBox.maxZ + 1,
        0,
        type,
      );
      if (c !== null) {
        let b = c.getBoundingBox();
        this.roomsLinkedToTheRoom.push(new StructureBoundingBox(b.minX, b.minY, this.boundingBox.maxZ - 1, b.maxX, b.maxY, this.boundingBox.maxZ));
      }
      p += 4;
    }
    p = 0;
    while (p < this.boundingBox.getZSize()) {
      p += rand.nextInt(this.boundingBox.getZSize());
      if (p + 3 > this.boundingBox.getZSize()) {
        break;
      }
      let c = getNextMineShaftComponent(
        start,
        list,
        rand,
        this.boundingBox.minX - 1,
        this.boundingBox.minY + rand.nextInt(yRange) + 1,
        this.boundingBox.minZ + p,
        1,
        type,
      );
      if (c !== null) {
        let b = c.getBoundingBox();
        this.roomsLinkedToTheRoom.push(new StructureBoundingBox(this.boundingBox.minX, b.minY, b.minZ, this.boundingBox.minX + 1, b.maxY, b.maxZ));
      }
      p += 4;
    }
    p = 0;
    while (p < this.boundingBox.getZSize()) {
      p += rand.nextInt(this.boundingBox.getZSize());
      if (p + 3 > this.boundingBox.getZSize()) {
        break;
      }
      let c = getNextMineShaftComponent(
        start,
        list,
        rand,
        this.boundingBox.maxX + 1,
        this.boundingBox.minY + rand.nextInt(yRange) + 1,
        this.boundingBox.minZ + p,
        3,
        type,
      );
      if (c !== null) {
        let b = c.getBoundingBox();
        this.roomsLinkedToTheRoom.push(new StructureBoundingBox(this.boundingBox.maxX - 1, b.minY, b.minZ, this.boundingBox.maxX, b.maxY, b.maxZ));
      }
      p += 4;
    }
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.minX,
        this.boundingBox.minY,
        this.boundingBox.minZ,
        this.boundingBox.maxX,
        this.boundingBox.minY,
        this.boundingBox.maxZ,
        B.dirt,
        0,
        true,
      );
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.minX,
        this.boundingBox.minY + 1,
        this.boundingBox.minZ,
        this.boundingBox.maxX,
        Math.min(this.boundingBox.minY + 3, this.boundingBox.maxY),
        this.boundingBox.maxZ,
        0,
        0,
        false,
      );
      for (const r of this.roomsLinkedToTheRoom) {
        this.fillWithBlocks(w, box, r.minX, r.maxY - 2, r.minZ, r.maxX, r.maxY, r.maxZ, 0, 0, false);
      }
      this.randomlyRareFillWithBlocks(
        w,
        box,
        this.boundingBox.minX,
        this.boundingBox.minY + 4,
        this.boundingBox.minZ,
        this.boundingBox.maxX,
        this.boundingBox.maxY,
        this.boundingBox.maxZ,
        0,
        false,
      );
      return true;
    }
  }
}

/** A corridor of 2-4 five-block sections with supports, cobwebs, rails, chest minecarts and cave spiders. */
export class ComponentMineshaftCorridor extends StructureComponent {
  private readonly hasRails: boolean;
  private readonly hasSpiders: boolean;
  private spawnerPlaced = false;
  private readonly sectionCount: number;

  constructor(type: number, rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
    this.hasRails = rand.nextInt(3) === 0;
    this.hasSpiders = !this.hasRails && rand.nextInt(23) === 0;
    this.sectionCount = Math.trunc((this.coordBaseMode !== 2 && this.coordBaseMode !== 0 ? box.getXSize() : box.getZSize()) / 5);
  }

  static findValidPlacement(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number): StructureBoundingBox | null {
    let bb = new StructureBoundingBox(x, y, z, x, y + 2, z);
    let n;
    for (n = rand.nextInt(3) + 2; n > 0; n--) {
      let len = n * 5;
      switch (facing) {
        case 0:
          bb.maxX = x + 2;
          bb.maxZ = z + (len - 1);
          break;
        case 1:
          bb.minX = x - (len - 1);
          bb.maxZ = z + 2;
          break;
        case 2:
          bb.maxX = x + 2;
          bb.minZ = z - (len - 1);
          break;
        case 3:
          bb.maxX = x + (len - 1);
          bb.maxZ = z + 2;
      }
      if (StructureComponent.findIntersecting(list, bb) === null) {
        break;
      }
    }
    return n > 0 ? bb : null;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const type = this.getComponentType();
    let r = rand.nextInt(4);
    switch (this.coordBaseMode) {
      case 0:
        if (r <= 1) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.minX,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.maxZ + 1,
            this.coordBaseMode,
            type,
          );
        } else if (r === 2) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.minX - 1,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.maxZ - 3,
            1,
            type,
          );
        } else {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.maxX + 1,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.maxZ - 3,
            3,
            type,
          );
        }
        break;
      case 1:
        if (r <= 1) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.minX - 1,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.minZ,
            this.coordBaseMode,
            type,
          );
        } else if (r === 2) {
          getNextMineShaftComponent(start, list, rand, this.boundingBox.minX, this.boundingBox.minY - 1 + rand.nextInt(3), this.boundingBox.minZ - 1, 2, type);
        } else {
          getNextMineShaftComponent(start, list, rand, this.boundingBox.minX, this.boundingBox.minY - 1 + rand.nextInt(3), this.boundingBox.maxZ + 1, 0, type);
        }
        break;
      case 2:
        if (r <= 1) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.minX,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.minZ - 1,
            this.coordBaseMode,
            type,
          );
        } else if (r === 2) {
          getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY - 1 + rand.nextInt(3), this.boundingBox.minZ, 1, type);
        } else {
          getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY - 1 + rand.nextInt(3), this.boundingBox.minZ, 3, type);
        }
        break;
      case 3:
        if (r <= 1) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.maxX + 1,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.minZ,
            this.coordBaseMode,
            type,
          );
        } else if (r === 2) {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.maxX - 3,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.minZ - 1,
            2,
            type,
          );
        } else {
          getNextMineShaftComponent(
            start,
            list,
            rand,
            this.boundingBox.maxX - 3,
            this.boundingBox.minY - 1 + rand.nextInt(3),
            this.boundingBox.maxZ + 1,
            0,
            type,
          );
        }
    }
    if (type < 8) {
      if (this.coordBaseMode !== 2 && this.coordBaseMode !== 0) {
        for (let x = this.boundingBox.minX + 3; x + 3 <= this.boundingBox.maxX; x += 5) {
          let r = rand.nextInt(5);
          if (r === 0) {
            getNextMineShaftComponent(start, list, rand, x, this.boundingBox.minY, this.boundingBox.minZ - 1, 2, type + 1);
          } else if (r === 1) {
            getNextMineShaftComponent(start, list, rand, x, this.boundingBox.minY, this.boundingBox.maxZ + 1, 0, type + 1);
          }
        }
      } else {
        for (let z = this.boundingBox.minZ + 3; z + 3 <= this.boundingBox.maxZ; z += 5) {
          let r = rand.nextInt(5);
          if (r === 0) {
            getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY, z, 1, type + 1);
          } else if (r === 1) {
            getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY, z, 3, type + 1);
          }
        }
      }
    }
  }

  /** A chest minecart on a rail instead of a chest. */
  protected override generateStructureChestContents(
    w: IWorld,
    box: StructureBoundingBox,
    rand: JavaRandom,
    x: number,
    y: number,
    z: number,
    table: readonly ChestContent[],
    count: number,
  ): boolean {
    const wx = this.getXWithOffset(x, z);
    const wy = this.getYWithOffset(y);
    const wz = this.getZWithOffset(x, z);
    if (!box.isVecInside(wx, wy, wz) || w.getBlockId(wx, wy, wz) !== 0) return false;
    w.setBlock(wx, wy, wz, B.rail, this.getMetadataWithOffset(B.rail, rand.nextBoolean() ? 1 : 0), 2);
    const inv = new GenInventory(27);
    generateChestContents(rand, table, inv, count);
    spawnGenEntity(w, { name: 'MinecartChest', x: wx + 0.5, y: wy + 0.5, z: wz + 0.5, yaw: 0, data: { Items: inv.toItemsTag() }, init: false });
    return true;
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      let len = this.sectionCount * 5 - 1;
      this.fillWithBlocks(w, box, 0, 0, 0, 2, 1, len, 0, 0, false);
      this.randomlyFillWithBlocks(w, box, rand, 0.8, 0, 2, 0, 2, 2, len, 0, 0, false);
      if (this.hasSpiders) {
        this.randomlyFillWithBlocks(w, box, rand, 0.6, 0, 0, 0, 2, 1, len, B.web, 0, false);
      }
      for (let i = 0; i < this.sectionCount; i++) {
        let z = 2 + i * 5;
        this.fillWithBlocks(w, box, 0, 0, z, 0, 1, z, B.fence, 0, false);
        this.fillWithBlocks(w, box, 2, 0, z, 2, 1, z, B.fence, 0, false);
        if (rand.nextInt(4) === 0) {
          this.fillWithBlocks(w, box, 0, 2, z, 0, 2, z, B.planks, 0, false);
          this.fillWithBlocks(w, box, 2, 2, z, 2, 2, z, B.planks, 0, false);
        } else {
          this.fillWithBlocks(w, box, 0, 2, z, 2, 2, z, B.planks, 0, false);
        }
        this.randomlyPlaceBlock(w, box, rand, 0.1, 0, 2, z - 1, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.1, 2, 2, z - 1, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.1, 0, 2, z + 1, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.1, 2, 2, z + 1, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 0, 2, z - 2, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 2, 2, z - 2, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 0, 2, z + 2, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 2, 2, z + 2, B.web, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 1, 2, z - 1, B.torchWood, 0);
        this.randomlyPlaceBlock(w, box, rand, 0.05, 1, 2, z + 1, B.torchWood, 0);
        if (rand.nextInt(100) === 0) {
          this.generateStructureChestContents(w, box, rand, 2, 0, z - 1, [...MINESHAFT_LOOT, enchantedBookContent(rand, 1, 1, 1)], 3 + rand.nextInt(4));
        }
        if (rand.nextInt(100) === 0) {
          this.generateStructureChestContents(w, box, rand, 0, 0, z + 1, [...MINESHAFT_LOOT, enchantedBookContent(rand, 1, 1, 1)], 3 + rand.nextInt(4));
        }
        if (this.hasSpiders && !this.spawnerPlaced) {
          let sy = this.getYWithOffset(0);
          let sz = z - 1 + rand.nextInt(3);
          let sx = this.getXWithOffset(1, sz);
          sz = this.getZWithOffset(1, sz);
          if (box.isVecInside(sx, sy, sz)) {
            this.spawnerPlaced = true;
            w.setBlock(sx, sy, sz, B.mobSpawner, 0, 2);
            placeSpawner(w, sx, sy, sz, 'CaveSpider');
          }
        }
      }
      for (let x = 0; x <= 2; x++) {
        for (let z = 0; z <= len; z++) {
          let id = this.getBlockIdAtCurrentPosition(w, x, -1, z, box);
          if (id === 0) {
            this.placeBlockAtCurrentPosition(w, B.planks, 0, x, -1, z, box);
          }
        }
      }
      if (this.hasRails) {
        for (let z = 0; z <= len; z++) {
          let id = this.getBlockIdAtCurrentPosition(w, 1, -1, z, box);
          if (id > 0 && Block.opaqueCubeLookup[id]) {
            this.randomlyPlaceBlock(w, box, rand, 0.7, 1, 0, z, B.rail, this.getMetadataWithOffset(B.rail, 0));
          }
        }
      }
      return true;
    }
  }
}

/** A crossing of corridors, sometimes two floors high. */
export class ComponentMineshaftCross extends StructureComponent {
  private readonly corridorDirection: number;
  private readonly isMultipleFloors: boolean;

  constructor(type: number, _rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.corridorDirection = facing;
    this.boundingBox = box;
    this.isMultipleFloors = box.getYSize() > 3;
  }

  static findValidPlacement(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number): StructureBoundingBox | null {
    let bb = new StructureBoundingBox(x, y, z, x, y + 2, z);
    if (rand.nextInt(4) === 0) {
      bb.maxY += 4;
    }
    switch (facing) {
      case 0:
        bb.minX = x - 1;
        bb.maxX = x + 3;
        bb.maxZ = z + 4;
        break;
      case 1:
        bb.minX = x - 4;
        bb.minZ = z - 1;
        bb.maxZ = z + 3;
        break;
      case 2:
        bb.minX = x - 1;
        bb.maxX = x + 3;
        bb.minZ = z - 4;
        break;
      case 3:
        bb.maxX = x + 4;
        bb.minZ = z - 1;
        bb.maxZ = z + 3;
    }
    return StructureComponent.findIntersecting(list, bb) !== null ? null : bb;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const type = this.getComponentType();
    switch (this.corridorDirection) {
      case 0:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.maxZ + 1, 0, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 1, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 3, type);
        break;
      case 1:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.minZ - 1, 2, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.maxZ + 1, 0, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 1, type);
        break;
      case 2:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.minZ - 1, 2, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 1, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 3, type);
        break;
      case 3:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.minZ - 1, 2, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY, this.boundingBox.maxZ + 1, 0, type);
        getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY, this.boundingBox.minZ + 1, 3, type);
    }
    if (this.isMultipleFloors) {
      if (rand.nextBoolean()) {
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY + 3 + 1, this.boundingBox.minZ - 1, 2, type);
      }
      if (rand.nextBoolean()) {
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY + 3 + 1, this.boundingBox.minZ + 1, 1, type);
      }
      if (rand.nextBoolean()) {
        getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY + 3 + 1, this.boundingBox.minZ + 1, 3, type);
      }
      if (rand.nextBoolean()) {
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX + 1, this.boundingBox.minY + 3 + 1, this.boundingBox.maxZ + 1, 0, type);
      }
    }
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      if (this.isMultipleFloors) {
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX + 1,
          this.boundingBox.minY,
          this.boundingBox.minZ,
          this.boundingBox.maxX - 1,
          this.boundingBox.minY + 3 - 1,
          this.boundingBox.maxZ,
          0,
          0,
          false,
        );
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX,
          this.boundingBox.minY,
          this.boundingBox.minZ + 1,
          this.boundingBox.maxX,
          this.boundingBox.minY + 3 - 1,
          this.boundingBox.maxZ - 1,
          0,
          0,
          false,
        );
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX + 1,
          this.boundingBox.maxY - 2,
          this.boundingBox.minZ,
          this.boundingBox.maxX - 1,
          this.boundingBox.maxY,
          this.boundingBox.maxZ,
          0,
          0,
          false,
        );
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX,
          this.boundingBox.maxY - 2,
          this.boundingBox.minZ + 1,
          this.boundingBox.maxX,
          this.boundingBox.maxY,
          this.boundingBox.maxZ - 1,
          0,
          0,
          false,
        );
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX + 1,
          this.boundingBox.minY + 3,
          this.boundingBox.minZ + 1,
          this.boundingBox.maxX - 1,
          this.boundingBox.minY + 3,
          this.boundingBox.maxZ - 1,
          0,
          0,
          false,
        );
      } else {
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX + 1,
          this.boundingBox.minY,
          this.boundingBox.minZ,
          this.boundingBox.maxX - 1,
          this.boundingBox.maxY,
          this.boundingBox.maxZ,
          0,
          0,
          false,
        );
        this.fillWithBlocks(
          w,
          box,
          this.boundingBox.minX,
          this.boundingBox.minY,
          this.boundingBox.minZ + 1,
          this.boundingBox.maxX,
          this.boundingBox.maxY,
          this.boundingBox.maxZ - 1,
          0,
          0,
          false,
        );
      }
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.minX + 1,
        this.boundingBox.minY,
        this.boundingBox.minZ + 1,
        this.boundingBox.minX + 1,
        this.boundingBox.maxY,
        this.boundingBox.minZ + 1,
        B.planks,
        0,
        false,
      );
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.minX + 1,
        this.boundingBox.minY,
        this.boundingBox.maxZ - 1,
        this.boundingBox.minX + 1,
        this.boundingBox.maxY,
        this.boundingBox.maxZ - 1,
        B.planks,
        0,
        false,
      );
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.maxX - 1,
        this.boundingBox.minY,
        this.boundingBox.minZ + 1,
        this.boundingBox.maxX - 1,
        this.boundingBox.maxY,
        this.boundingBox.minZ + 1,
        B.planks,
        0,
        false,
      );
      this.fillWithBlocks(
        w,
        box,
        this.boundingBox.maxX - 1,
        this.boundingBox.minY,
        this.boundingBox.maxZ - 1,
        this.boundingBox.maxX - 1,
        this.boundingBox.maxY,
        this.boundingBox.maxZ - 1,
        B.planks,
        0,
        false,
      );
      for (let x = this.boundingBox.minX; x <= this.boundingBox.maxX; x++) {
        for (let z = this.boundingBox.minZ; z <= this.boundingBox.maxZ; z++) {
          let id = this.getBlockIdAtCurrentPosition(w, x, this.boundingBox.minY - 1, z, box);
          if (id === 0) {
            this.placeBlockAtCurrentPosition(w, B.planks, 0, x, this.boundingBox.minY - 1, z, box);
          }
        }
      }
      return true;
    }
  }
}

/** A stairway down one level. */
export class ComponentMineshaftStairs extends StructureComponent {
  constructor(type: number, _rand: JavaRandom, box: StructureBoundingBox, facing: number) {
    super(type);
    this.coordBaseMode = facing;
    this.boundingBox = box;
  }

  static findValidPlacement(list: StructureComponent[], rand: JavaRandom, x: number, y: number, z: number, facing: number): StructureBoundingBox | null {
    let bb = new StructureBoundingBox(x, y - 5, z, x, y + 2, z);
    switch (facing) {
      case 0:
        bb.maxX = x + 2;
        bb.maxZ = z + 8;
        break;
      case 1:
        bb.minX = x - 8;
        bb.maxZ = z + 2;
        break;
      case 2:
        bb.maxX = x + 2;
        bb.minZ = z - 8;
        break;
      case 3:
        bb.maxX = x + 8;
        bb.maxZ = z + 2;
    }
    return StructureComponent.findIntersecting(list, bb) !== null ? null : bb;
  }

  override buildComponent(start: StructureComponent, list: StructureComponent[], rand: JavaRandom): void {
    const type = this.getComponentType();
    switch (this.coordBaseMode) {
      case 0:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX, this.boundingBox.minY, this.boundingBox.maxZ + 1, 0, type);
        break;
      case 1:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX - 1, this.boundingBox.minY, this.boundingBox.minZ, 1, type);
        break;
      case 2:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.minX, this.boundingBox.minY, this.boundingBox.minZ - 1, 2, type);
        break;
      case 3:
        getNextMineShaftComponent(start, list, rand, this.boundingBox.maxX + 1, this.boundingBox.minY, this.boundingBox.minZ, 3, type);
    }
  }

  addComponentParts(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): boolean {
    if (this.isLiquidInStructureBoundingBox(w, box)) {
      return false;
    } else {
      this.fillWithBlocks(w, box, 0, 5, 0, 2, 7, 1, 0, 0, false);
      this.fillWithBlocks(w, box, 0, 0, 7, 2, 2, 8, 0, 0, false);
      for (let i = 0; i < 5; i++) {
        this.fillWithBlocks(w, box, 0, 5 - i - (i < 4 ? 1 : 0), 2 + i, 2, 7 - i, 2 + i, 0, 0, false);
      }
      return true;
    }
  }
}

class StructureMineshaftStart extends StructureStart {
  constructor(rand: JavaRandom, cx: number, cz: number) {
    super();
    const room = new ComponentMineshaftRoom(0, rand, (cx << 4) + 2, (cz << 4) + 2);
    this.components.push(room);
    room.buildComponent(room, this.components, rand);
    this.updateBoundingBox();
    this.markAvailableHeight(rand, 10);
  }
}

/** MapGenMineshaft: 1% of chunks (fewer near the origin) start a mineshaft. */
export class MapGenMineshaft extends MapGenStructure {
  private chance = 0.01;

  constructor(options?: Map<string, string>) {
    super();
    const c = options?.get('chance');
    if (c !== undefined) {
      const v = Number(c);
      if (c.trim() !== '' && !Number.isNaN(v)) this.chance = v;
    }
  }

  protected canSpawnStructureAtCoords(cx: number, cz: number): boolean {
    return this.rand.nextDouble() < this.chance && this.rand.nextInt(80) < Math.max(Math.abs(cx), Math.abs(cz));
  }

  protected getStructureStart(cx: number, cz: number): StructureStart {
    return new StructureMineshaftStart(this.rand, cx, cz);
  }
}
