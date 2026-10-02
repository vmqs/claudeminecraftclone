import { BlockIds, ItemIds } from '../../block/BlockIds';
import type { JavaRandom } from '../../core/JavaRandom';
import { WeightedRandom, type WeightedRandomItem } from '../../core/WeightedRandom';
import type { TagCompound } from '../../item/ItemStack';
import { TileEntity } from '../tileentity/TileEntity';
import type { IWorld } from '../IWorld';

/** An item stack as tile-entity NBT data (ItemStack.writeToNBT: id, Count, Damage, tag). */
export interface ItemStackData {
  id: number;
  Count: number;
  Damage: number;
  tag?: TagCompound;
}

/** WeightedRandomChestContent: an item with a count range and a weight. */
export interface ChestContent extends WeightedRandomItem {
  readonly stack: ItemStackData;
  readonly min: number;
  readonly max: number;
}

export function chestContent(id: number, damage: number, min: number, max: number, weight: number, tag?: TagCompound): ChestContent {
  return { stack: tag ? { id, Count: 1, Damage: damage, tag } : { id, Count: 1, Damage: damage }, min, max, itemWeight: weight };
}

const STACK_16 = new Set<number>([ItemIds.sign, ItemIds.bucketEmpty, ItemIds.snowball, ItemIds.egg, ItemIds.enderPearl]);
const STACK_1 = new Set<number>([
  ItemIds.flintAndSteel,
  ItemIds.bow,
  ItemIds.bowlSoup,
  ItemIds.doorWood,
  ItemIds.bucketWater,
  ItemIds.bucketLava,
  ItemIds.minecartEmpty,
  ItemIds.saddle,
  ItemIds.doorIron,
  ItemIds.boat,
  ItemIds.bucketMilk,
  ItemIds.minecartCrate,
  ItemIds.minecartPowered,
  ItemIds.fishingRod,
  ItemIds.cake,
  ItemIds.bed,
  ItemIds.shears,
  ItemIds.potion,
  ItemIds.writableBook,
  ItemIds.writtenBook,
  ItemIds.carrotOnAStick,
  ItemIds.enchantedBook,
  ItemIds.minecartTnt,
  ItemIds.minecartHopper,
]);
const TOOL_IDS: [number, number][] = [
  [256, 258],
  [267, 279],
  [283, 286],
  [290, 294],
  [298, 317],
  [2256, 2267],
];

/** Item.getItemStackLimit for the items world generation can place in containers. */
export function maxStackSize(id: number): number {
  if (id < 256) return 64;
  if (STACK_16.has(id)) return 16;
  if (STACK_1.has(id)) return 1;
  for (const [a, b] of TOOL_IDS) if (id >= a && id <= b) return 1;
  return 64;
}

/** A chest or dispenser inventory being filled by world generation. */
export class GenInventory {
  readonly slots: (ItemStackData | null)[];

  constructor(readonly size: number) {
    this.slots = new Array(size).fill(null);
  }

  getSizeInventory(): number {
    return this.size;
  }

  setInventorySlotContents(slot: number, stack: ItemStackData): void {
    this.slots[slot] = stack;
  }

  /** The "Items" NBT list (Slot + stack data) of TileEntityChest / TileEntityDispenser. */
  toItemsTag(): TagCompound[] {
    const out: TagCompound[] = [];
    this.slots.forEach((s, i) => {
      if (s) out.push({ Slot: i, ...structuredClone(s) });
    });
    return out;
  }
}

/** WeightedRandomChestContent.generateChestContents (also generateDispenserContents). */
export function generateChestContents(rand: JavaRandom, table: readonly ChestContent[], inv: GenInventory, count: number): void {
  for (let i = 0; i < count; i++) {
    const c = WeightedRandom.getRandomItem(rand, table)!;
    const n = c.min + rand.nextInt(c.max - c.min + 1);
    if (maxStackSize(c.stack.id) >= n) {
      const s = structuredClone(c.stack);
      s.Count = n;
      inv.setInventorySlotContents(rand.nextInt(inv.getSizeInventory()), s);
    } else {
      for (let k = 0; k < n; k++) {
        const s = structuredClone(c.stack);
        s.Count = 1;
        inv.setInventorySlotContents(rand.nextInt(inv.getSizeInventory()), s);
      }
    }
  }
}

/** Enchantment.field_92090_c (every enchantment, by id) as [effectId, maxLevel]; min level is 1. */
const BOOK_ENCHANTMENTS: [number, number][] = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 3],
  [6, 1],
  [7, 3],
  [16, 5],
  [17, 5],
  [18, 5],
  [19, 2],
  [20, 2],
  [21, 3],
  [32, 5],
  [33, 1],
  [34, 3],
  [35, 3],
  [48, 5],
  [49, 2],
  [50, 1],
  [51, 1],
];

/** ItemEnchantedBook.func_92109_a: a book with one random enchantment at a random level. */
export function randomEnchantedBook(rand: JavaRandom): ItemStackData {
  const [id, maxLevel] = BOOK_ENCHANTMENTS[rand.nextInt(BOOK_ENCHANTMENTS.length)];
  const lvl = 1 >= maxLevel ? 1 : rand.nextInt(maxLevel - 1 + 1) + 1;
  return { id: ItemIds.enchantedBook, Count: 1, Damage: 0, tag: { StoredEnchantments: [{ id, lvl }] } };
}

/** ItemEnchantedBook.func_92112_a: a chest entry holding such a book. */
export function enchantedBookContent(rand: JavaRandom, min: number, max: number, weight: number): ChestContent {
  const book = randomEnchantedBook(rand);
  return { stack: book, min, max, itemWeight: weight };
}

/** Receives tile-entity NBT from generation (the worker's GenWorld). */
export interface GenTileEntitySink {
  setGenTileEntity(x: number, y: number, z: number, tag: TagCompound): void;
}

/**
 * Stores a generated tile entity (chest, dispenser, spawner contents) as NBT at (x, y, z). In the
 * worker the tag travels with the chunk; on a live world it is loaded through TileEntity.
 */
export function putTileEntityTag(w: IWorld, x: number, y: number, z: number, tag: TagCompound): void {
  const t: TagCompound = { ...tag, x, y, z };
  if ('setGenTileEntity' in w) {
    (w as IWorld & GenTileEntitySink).setGenTileEntity(x, y, z, t);
    return;
  }
  const te = TileEntity.createAndLoadEntity(t);
  if (te) w.setBlockTileEntity(x, y, z, te);
}

/** A chest at (x, y, z) filled from `table` (StructureComponent.generateStructureChestContents' fill). */
export function fillChest(w: IWorld, rand: JavaRandom, x: number, y: number, z: number, table: readonly ChestContent[], count: number): void {
  const inv = new GenInventory(27);
  generateChestContents(rand, table, inv, count);
  putTileEntityTag(w, x, y, z, { id: 'Chest', Items: inv.toItemsTag() });
}

/** A dispenser at (x, y, z) filled from `table`. */
export function fillDispenser(w: IWorld, rand: JavaRandom, x: number, y: number, z: number, table: readonly ChestContent[], count: number): void {
  const inv = new GenInventory(9);
  generateChestContents(rand, table, inv, count);
  putTileEntityTag(w, x, y, z, { id: 'Trap', Items: inv.toItemsTag() });
}

/** A mob spawner (MobSpawnerBaseLogic defaults) for an EntityList name. */
export function placeSpawner(w: IWorld, x: number, y: number, z: number, entityId: string): void {
  putTileEntityTag(w, x, y, z, {
    id: 'MobSpawner',
    EntityId: entityId,
    Delay: 20,
    MinSpawnDelay: 200,
    MaxSpawnDelay: 800,
    SpawnCount: 4,
    MaxNearbyEntities: 6,
    RequiredPlayerRange: 16,
    SpawnRange: 4,
  });
}

/** WorldServer.bonusChestContent. */
export const BONUS_CHEST_CONTENT: readonly ChestContent[] = [
  chestContent(ItemIds.stick, 0, 1, 3, 10),
  chestContent(BlockIds.planks, 0, 1, 3, 10),
  chestContent(BlockIds.wood, 0, 1, 3, 10),
  chestContent(ItemIds.axeStone, 0, 1, 1, 3),
  chestContent(ItemIds.axeWood, 0, 1, 1, 5),
  chestContent(ItemIds.pickaxeStone, 0, 1, 1, 3),
  chestContent(ItemIds.pickaxeWood, 0, 1, 1, 5),
  chestContent(ItemIds.appleRed, 0, 2, 3, 5),
  chestContent(ItemIds.bread, 0, 2, 3, 3),
];
