/**
 * Container windows against stand-in players: the creative grid and hotbar clicks, furnace
 * smelting and its shift-click routing, workbench crafting with shift-click outputs, chest,
 * dispenser, hopper, brewing stand, enchanting and anvil slot rules.
 * Run: node scripts/run-node-test.mjs tests/containers.test.ts
 */
import '../src/block/Blocks';
import '../src/item/Items';
import '../src/gui/inventory/ContainerBindings';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { JavaRandom } from '../src/core/JavaRandom';
import type { EntityPlayer } from '../src/entity/EntityPlayer';
import { InventoryPlayer } from '../src/entity/InventoryPlayer';
import { CreativeTabs } from '../src/item/CreativeTabs';
import { FurnaceRecipes } from '../src/item/crafting/FurnaceRecipes';
import { ItemStack } from '../src/item/ItemStack';
import { ClickMode, OUTSIDE_WINDOW } from '../src/gui/inventory/Container';
import { ContainerBrewingStand } from '../src/gui/inventory/ContainerBrewingStand';
import { ContainerChest } from '../src/gui/inventory/ContainerChest';
import { ContainerCreative, creativeGridInventory } from '../src/gui/inventory/ContainerCreative';
import { ContainerDispenser } from '../src/gui/inventory/ContainerDispenser';
import { ContainerEnchantment } from '../src/gui/inventory/ContainerEnchantment';
import { ContainerFurnace } from '../src/gui/inventory/ContainerFurnace';
import { ContainerHopper } from '../src/gui/inventory/ContainerHopper';
import { ContainerRepair } from '../src/gui/inventory/ContainerRepair';
import { ContainerWorkbench } from '../src/gui/inventory/ContainerWorkbench';
import { InventoryBasic } from '../src/gui/inventory/InventoryBasic';
import { TileEntityBrewingStand } from '../src/world/tileentity/TileEntityBrewingStand';
import { TileEntityDispenser } from '../src/world/tileentity/TileEntityDispenser';
import { TileEntityFurnace } from '../src/world/tileentity/TileEntityFurnace';
import type { World } from '../src/world/World';
import { check, report } from './harness';

TileEntityFurnace.smeltingResult = (id) => FurnaceRecipes.smelting().getSmeltingResult(id);

/** A world of air with a table/anvil at the origin. */
const blocks = new Map<string, number>([['0,64,0', B.enchantmentTable], ['5,64,0', B.anvil]]);
const spawned: object[] = [];
const world = {
  isRemote: false,
  rand: new JavaRandom(1n),
  provider: { dimensionId: 0 },
  getBlockId: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? 0,
  getBlockMetadata: () => 0,
  isAirBlock: (x: number, y: number, z: number) => !blocks.has(`${x},${y},${z}`),
  getBlockTileEntity: () => null,
  spawnEntityInWorld: (e: object) => spawned.push(e),
  playAuxSFX: () => undefined,
  setBlockToAir: () => true,
  setBlockMetadataWithNotify: () => true,
  markBlockForUpdate: () => undefined,
  updateTileEntityChunkAndDoNothing: () => undefined,
  func_96440_m: () => undefined,
} as unknown as World;

function makePlayer(creative: boolean): EntityPlayer & { dropped: ItemStack[] } {
  const dropped: ItemStack[] = [];
  const p = {
    worldObj: world,
    posX: 0.5,
    posY: 65,
    posZ: 0.5,
    experienceLevel: 30,
    capabilities: { isCreativeMode: creative },
    dropped,
    rand: new JavaRandom(2n),
    dropPlayerItem(s: ItemStack | null) {
      if (s) dropped.push(s);
      return null;
    },
    addExperienceLevel(n: number) {
      this.experienceLevel += n;
    },
    getDistanceSq: (x: number, y: number, z: number) => (x - 0.5) ** 2 + (y - 65) ** 2 + (z - 0.5) ** 2,
    addStat: () => undefined,
  } as unknown as EntityPlayer & { dropped: ItemStack[]; inventory: InventoryPlayer };
  (p as { inventory: InventoryPlayer }).inventory = new InventoryPlayer(p);
  return p;
}

// --- Creative container ------------------------------------------------------------------
{
  const p = makePlayer(true);
  const c = new ContainerCreative(p);
  check('creative window has 45 grid + 9 hotbar slots', c.inventorySlots.length === 54);
  CreativeTabs.tabBlock.displayAllReleventItems(c.itemList);
  c.scrollTo(0);
  const first = creativeGridInventory.getStackInSlot(0);
  check('building blocks start with stone', first?.itemID === B.stone, String(first?.itemID));
  check('building blocks need a scroll bar', c.hasMoreThan1PageOfItemsInList());
  c.scrollTo(1);
  const rows = Math.trunc(c.itemList.length / 9) - 5 + 1;
  check('scrolled to the last rows', creativeGridInventory.getStackInSlot(0) === c.itemList[rows * 9], `${rows}`);
  p.inventory.setInventorySlotContents(3, new ItemStack(B.dirt, 5));
  c.transferStackInSlot(p, 45 + 3);
  check('shift-click on a hotbar slot clears it', p.inventory.getStackInSlot(3) === null);
  check('creative drag only into the lower rows', !c.canDragIntoSlot(c.getSlot(0)) && c.canDragIntoSlot(c.getSlot(45)));
}

// --- Furnace ------------------------------------------------------------------------------
{
  const p = makePlayer(false);
  const te = new TileEntityFurnace();
  te.worldObj = world;
  TileEntityFurnace.updateBlockState = () => undefined;
  const c = new ContainerFurnace(p.inventory, te);
  check('furnace window has 3 + 36 slots', c.inventorySlots.length === 39);
  p.inventory.setInventorySlotContents(9, new ItemStack(B.oreIron, 3));
  p.inventory.setInventorySlotContents(10, new ItemStack(I.coal, 1));
  p.inventory.setInventorySlotContents(11, new ItemStack(B.dirt, 1));
  c.slotClick(3, 0, ClickMode.QUICK_MOVE, p);
  check('shift-click iron ore goes to the input', te.getStackInSlot(0)?.itemID === B.oreIron && te.getStackInSlot(0)?.stackSize === 3);
  c.slotClick(4, 0, ClickMode.QUICK_MOVE, p);
  check('shift-click coal goes to the fuel slot', te.getStackInSlot(1)?.itemID === I.coal);
  c.slotClick(5, 0, ClickMode.QUICK_MOVE, p);
  check('shift-click dirt goes to the hotbar', p.inventory.getStackInSlot(0)?.itemID === B.dirt);
  for (let t = 0; t < 200 * 3 + 2; t++) te.updateEntity();
  check('three ingots after 600 ticks', te.getStackInSlot(2)?.itemID === I.ingotIron && te.getStackInSlot(2)?.stackSize === 3, String(te.getStackInSlot(2)?.stackSize));
  check('coal still burning (1600 ticks)', te.isBurning() && te.getStackInSlot(1) === null);
  check('output slot rejects items', !c.getSlot(2).isItemValid(new ItemStack(I.ingotIron)));
  c.slotClick(2, 0, ClickMode.QUICK_MOVE, p);
  const ingots = p.inventory.mainInventory.find((s) => s?.itemID === I.ingotIron);
  check('shift-click output moves ingots to the inventory', ingots?.stackSize === 3 && te.getStackInSlot(2) === null);
  check('taking iron pays experience orbs (0.7 each)', spawned.length >= 2, String(spawned.length));
  // Burn times of 1.5.2.
  const burn = (s: ItemStack) => TileEntityFurnace.getItemBurnTime(s);
  check('burn times', burn(new ItemStack(I.bucketLava)) === 20000 && burn(new ItemStack(I.blazeRod)) === 2400 && burn(new ItemStack(B.sapling)) === 100 && burn(new ItemStack(B.planks)) === 300 && burn(new ItemStack(B.woodSingleSlab)) === 150 && burn(new ItemStack(I.stick)) === 100 && burn(new ItemStack(I.pickaxeWood)) === 200);
  // A lava bucket leaves its empty bucket.
  const te2 = new TileEntityFurnace();
  te2.worldObj = world;
  te2.setInventorySlotContents(0, new ItemStack(B.sand, 1));
  te2.setInventorySlotContents(1, new ItemStack(I.bucketLava, 1));
  te2.updateEntity();
  check('lava bucket becomes an empty bucket', te2.getStackInSlot(1)?.itemID === I.bucketEmpty && te2.furnaceBurnTime === 20000);
}

// --- Workbench ---------------------------------------------------------------------------
{
  const p = makePlayer(false);
  blocks.set('1,64,1', B.workbench);
  const c = new ContainerWorkbench(p.inventory, world, 1, 64, 1);
  // 3 planks in a row + 2 sticks below = wooden pickaxe; fill with stacks of 2 to craft twice.
  for (let col = 0; col < 3; col++) c.putStackInSlot(1 + col, new ItemStack(B.planks, 2));
  c.putStackInSlot(1 + 4, new ItemStack(I.stick, 2));
  c.putStackInSlot(1 + 7, new ItemStack(I.stick, 2));
  c.onCraftMatrixChanged(c.getSlot(1).inventory);
  check('workbench shows a wooden pickaxe', c.getSlot(0).getStack()?.itemID === I.pickaxeWood, String(c.getSlot(0).getStack()?.itemID));
  c.slotClick(0, 0, ClickMode.QUICK_MOVE, p);
  const picks = p.inventory.mainInventory.filter((s) => s?.itemID === I.pickaxeWood).length;
  check('shift-click crafts until the grid runs out', picks === 2 && c.getSlot(1).getStack() === null, String(picks));
  // Torches: coal over stick = 4.
  c.putStackInSlot(1, new ItemStack(I.coal, 1));
  c.putStackInSlot(4, new ItemStack(I.stick, 1));
  c.onCraftMatrixChanged(c.getSlot(1).inventory);
  check('coal over a stick makes 4 torches', c.getSlot(0).getStack()?.itemID === B.torchWood && c.getSlot(0).getStack()?.stackSize === 4);
  c.slotClick(0, 0, ClickMode.PICKUP, p);
  check('picking up the torches uses the ingredients', p.inventory.getItemStack()?.stackSize === 4 && c.getSlot(1).getStack() === null);
  p.inventory.setItemStack(null);
  c.putStackInSlot(5, new ItemStack(B.dirt, 1));
  c.onCraftGuiClosed(p);
  check('closing the table drops the grid', p.dropped.some((s) => s.itemID === B.dirt));
}

// --- Chest, dispenser, hopper --------------------------------------------------------------
{
  const p = makePlayer(false);
  const chest = new InventoryBasic('container.chest', false, 27);
  const c = new ContainerChest(p.inventory, chest);
  p.inventory.setInventorySlotContents(0, new ItemStack(B.cobblestone, 64));
  c.slotClick(27 + 27, 0, ClickMode.QUICK_MOVE, p);
  check('shift-click hotbar into the chest', chest.getStackInSlot(0)?.stackSize === 64 && p.inventory.getStackInSlot(0) === null);
  c.slotClick(0, 1, ClickMode.PICKUP, p);
  check('right click takes half', p.inventory.getItemStack()?.stackSize === 32 && chest.getStackInSlot(0)?.stackSize === 32);
  c.slotClick(OUTSIDE_WINDOW, 1, ClickMode.PICKUP, p);
  check('right click outside drops one', p.dropped.length === 1 && p.inventory.getItemStack()?.stackSize === 31);
  p.inventory.setItemStack(null);

  const disp = new TileEntityDispenser();
  const d = new ContainerDispenser(p.inventory, disp);
  check('dispenser window has 9 + 36 slots', d.inventorySlots.length === 45);
  const hopperInv = new InventoryBasic('container.hopper', false, 5);
  const h = new ContainerHopper(p.inventory, hopperInv);
  check('hopper window has 5 + 36 slots', h.inventorySlots.length === 41 && h.getSlot(4).xDisplayPosition === 44 + 4 * 18);
}

// --- Brewing stand ---------------------------------------------------------------------------
{
  const p = makePlayer(false);
  const stand = new TileEntityBrewingStand();
  stand.worldObj = world;
  const c = new ContainerBrewingStand(p.inventory, stand);
  check('bottle slots take potions and bottles only', c.getSlot(0).isItemValid(new ItemStack(I.potion)) && c.getSlot(0).isItemValid(new ItemStack(I.glassBottle)) && !c.getSlot(0).isItemValid(new ItemStack(B.dirt)));
  check('ingredient slot takes nether wart, not dirt', c.getSlot(3).isItemValid(new ItemStack(I.netherStalkSeeds)) && !c.getSlot(3).isItemValid(new ItemStack(B.dirt)));
  p.inventory.setInventorySlotContents(9, new ItemStack(I.netherStalkSeeds, 4));
  c.slotClick(4, 0, ClickMode.QUICK_MOVE, p);
  check('shift-click wart into the ingredient slot', stand.getStackInSlot(3)?.stackSize === 4);

  // Brewing: water + nether wart -> awkward (16); awkward + sugar -> swiftness; + gunpowder -> splash.
  const brew = (bottles: number[], ingredient: number): number[] => {
    bottles.forEach((d, i) => stand.setInventorySlotContents(i, new ItemStack(I.potion, 1, d)));
    stand.setInventorySlotContents(3, new ItemStack(ingredient, 1));
    let ticks = 0;
    while (stand.getStackInSlot(3) !== null && ticks < 1000) {
      stand.updateEntity();
      ticks++;
    }
    check(`brewing takes 400 ticks (+1 to start) with ${ingredient}`, ticks === 401, String(ticks));
    return bottles.map((_, i) => stand.getStackInSlot(i)!.getItemDamage());
  };
  const awkward = brew([0, 0, 0], I.netherStalkSeeds);
  check('water + nether wart = awkward potion', awkward.every((d) => d === 16), awkward.join(','));
  const swift = brew([16], I.sugar);
  check('awkward + sugar = swiftness', swift[0] === 8194, swift.join(','));
  const splash = brew([8194], I.gunpowder);
  check('swiftness + gunpowder = splash swiftness', splash[0] === 16386, splash.join(','));
  stand.setInventorySlotContents(0, new ItemStack(I.potion, 1, 0));
  stand.setInventorySlotContents(3, new ItemStack(B.dirt, 1));
  stand.updateEntity();
  check('dirt does not brew', stand.getBrewTime() === 0);
}

// --- Enchanting table and anvil ------------------------------------------------------------
{
  const p = makePlayer(false);
  const c = new ContainerEnchantment(p.inventory, world, 0, 64, 0);
  c.getSlot(0).putStack(new ItemStack(I.pickaxeDiamond));
  check('an enchantable item gets three offers', c.enchantLevels.every((l) => l > 0), c.enchantLevels.join(','));
  const level = c.enchantLevels[2];
  check('enchanting works and costs levels', c.enchantItem(p, 2) && (c.getSlot(0).getStack()?.isItemEnchanted() ?? false) && (p as unknown as { experienceLevel: number }).experienceLevel === 30 - level);
  c.getSlot(0).putStack(new ItemStack(B.dirt));
  check('dirt gets no offers', c.enchantLevels.every((l) => l === 0));

  const a = new ContainerRepair(p.inventory, world, 5, 64, 0, p);
  const damaged = new ItemStack(I.pickaxeDiamond);
  damaged.setItemDamage(1000);
  a.getSlot(0).putStack(damaged);
  a.getSlot(1).putStack(new ItemStack(I.diamond, 2));
  const out = a.getSlot(2).getStack();
  check('anvil repairs with diamonds', out !== null && out.getItemDamage() < 1000 && a.maximumCost > 0, `${out?.getItemDamage()} cost ${a.maximumCost}`);
  a.getSlot(1).putStack(null);
  a.updateItemName('Digger');
  check('renaming alone costs levels', a.getSlot(2).getStack()?.getDisplayName() === 'Digger' && a.maximumCost > 0);
}

report();
