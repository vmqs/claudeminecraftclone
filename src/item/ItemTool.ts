import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { IWorld } from '../world/IWorld';
import { CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import type { ItemStack } from './ItemStack';

/** EnumToolMaterial: harvest level, uses, mining speed, extra damage and enchantability. */
export class EnumToolMaterial {
  static readonly WOOD = new EnumToolMaterial('WOOD', 0, 59, 2, 0, 15);
  static readonly STONE = new EnumToolMaterial('STONE', 1, 131, 4, 1, 5);
  static readonly IRON = new EnumToolMaterial('IRON', 2, 250, 6, 2, 14);
  static readonly EMERALD = new EnumToolMaterial('EMERALD', 3, 1561, 8, 3, 10);
  static readonly GOLD = new EnumToolMaterial('GOLD', 0, 32, 12, 0, 22);

  private constructor(
    readonly name: string,
    private readonly harvestLevel: number,
    private readonly maxUses: number,
    private readonly efficiencyOnProperMaterial: number,
    private readonly damageVsEntity: number,
    private readonly enchantability: number,
  ) {}

  getMaxUses(): number {
    return this.maxUses;
  }
  getEfficiencyOnProperMaterial(): number {
    return this.efficiencyOnProperMaterial;
  }
  getDamageVsEntity(): number {
    return this.damageVsEntity;
  }
  getHarvestLevel(): number {
    return this.harvestLevel;
  }
  getEnchantability(): number {
    return this.enchantability;
  }
  /** The item (or block) id that repairs tools of this material on an anvil. */
  getToolCraftingMaterial(): number {
    switch (this) {
      case EnumToolMaterial.WOOD:
        return BlockIds.planks;
      case EnumToolMaterial.STONE:
        return BlockIds.cobblestone;
      case EnumToolMaterial.GOLD:
        return ItemIds.ingotGold;
      case EnumToolMaterial.IRON:
        return ItemIds.ingotIron;
      case EnumToolMaterial.EMERALD:
        return ItemIds.diamond;
      default:
        return 0;
    }
  }
  toString(): string {
    return this.name;
  }
}

/**
 * A mining tool (ItemTool): fast against its block list, 2 wear per hit, 1 per block broken.
 * Damage against entities is the tool's base (1 shovel, 2 pickaxe, 3 axe) plus the material's.
 */
export class ItemTool extends Item {
  protected efficiencyOnProperMaterial: number;
  private readonly damageVsEntity: number;

  protected constructor(
    index: number,
    baseDamage: number,
    protected readonly toolMaterial: EnumToolMaterial,
    private readonly blocksEffectiveAgainst: readonly number[],
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setMaxDamage(toolMaterial.getMaxUses());
    this.efficiencyOnProperMaterial = toolMaterial.getEfficiencyOnProperMaterial();
    this.damageVsEntity = baseDamage + toolMaterial.getDamageVsEntity();
    this.setCreativeTab(CreativeTabs.tabTools);
  }

  override getStrVsBlock(_stack: ItemStack, block: Block): number {
    return this.blocksEffectiveAgainst.includes(block.blockID) ? this.efficiencyOnProperMaterial : 1;
  }
  override hitEntity(stack: ItemStack, _target: EntityLiving, attacker: EntityLiving): boolean {
    stack.damageItem(2, attacker);
    return true;
  }
  override onBlockDestroyed(stack: ItemStack, w: IWorld, id: number, x: number, y: number, z: number, e: EntityLiving): boolean {
    if (Block.blocksList[id]!.getBlockHardness(w, x, y, z) !== 0) stack.damageItem(1, e);
    return true;
  }
  override getDamageVsEntity(_e: Entity): number {
    return this.damageVsEntity;
  }
  override isFull3D(): boolean {
    return true;
  }
  override getItemEnchantability(): number {
    return this.toolMaterial.getEnchantability();
  }
  getToolMaterialName(): string {
    return this.toolMaterial.toString();
  }
  override getIsRepairable(stack: ItemStack, material: ItemStack): boolean {
    return this.toolMaterial.getToolCraftingMaterial() === material.itemID ? true : super.getIsRepairable(stack, material);
  }
  override getEnchantKind(): 'weapon' | 'digger' | 'axe' | 'bow' | null {
    return 'digger';
  }
}

const B = BlockIds;

/** Shovel (ItemSpade): grass, dirt, sand, gravel, snow, clay, farmland, soul sand, mycelium. */
export class ItemSpade extends ItemTool {
  private static readonly blocksEffectiveAgainst = [B.grass, B.dirt, B.sand, B.gravel, B.snow, B.blockSnow, B.blockClay, B.tilledField, B.slowSand, B.mycelium];
  constructor(index: number, material: EnumToolMaterial) {
    super(index, 1, material, ItemSpade.blocksEffectiveAgainst);
  }
  override canHarvestBlock(b: Block): boolean {
    return b.blockID === B.snow || b.blockID === B.blockSnow;
  }
}

/** Pickaxe: stone-like blocks, ores by harvest level; any rock, iron or anvil material at full speed. */
export class ItemPickaxe extends ItemTool {
  private static readonly blocksEffectiveAgainst = [
    B.cobblestone,
    B.stoneDoubleSlab,
    B.stoneSingleSlab,
    B.stone,
    B.sandStone,
    B.cobblestoneMossy,
    B.oreIron,
    B.blockIron,
    B.oreCoal,
    B.blockGold,
    B.oreGold,
    B.oreDiamond,
    B.blockDiamond,
    B.ice,
    B.netherrack,
    B.oreLapis,
    B.blockLapis,
    B.oreRedstone,
    B.oreRedstoneGlowing,
    B.rail,
    B.railDetector,
    B.railPowered,
    B.railActivator,
  ];
  constructor(index: number, material: EnumToolMaterial) {
    super(index, 2, material, ItemPickaxe.blocksEffectiveAgainst);
  }
  override canHarvestBlock(b: Block): boolean {
    const lvl = this.toolMaterial.getHarvestLevel();
    const id = b.blockID;
    if (id === B.obsidian) return lvl === 3;
    if (id === B.blockDiamond || id === B.oreDiamond) return lvl >= 2;
    if (id === B.oreEmerald || id === B.blockEmerald) return lvl >= 2;
    if (id === B.blockGold || id === B.oreGold) return lvl >= 2;
    if (id === B.blockIron || id === B.oreIron) return lvl >= 1;
    if (id === B.blockLapis || id === B.oreLapis) return lvl >= 1;
    if (id === B.oreRedstone || id === B.oreRedstoneGlowing) return lvl >= 2;
    const m = b.blockMaterial;
    return m === Material.rock || m === Material.iron || m === Material.anvil;
  }
  override getStrVsBlock(stack: ItemStack, b: Block): number {
    const m = b?.blockMaterial;
    return b && (m === Material.iron || m === Material.anvil || m === Material.rock) ? this.efficiencyOnProperMaterial : super.getStrVsBlock(stack, b);
  }
}

/** Axe (ItemAxe, "hatchet"): wood, plants and vines at full speed. */
export class ItemAxe extends ItemTool {
  private static readonly blocksEffectiveAgainst = [B.planks, B.bookShelf, B.wood, B.chest, B.stoneDoubleSlab, B.stoneSingleSlab, B.pumpkin, B.pumpkinLantern];
  constructor(index: number, material: EnumToolMaterial) {
    super(index, 3, material, ItemAxe.blocksEffectiveAgainst);
  }
  override getStrVsBlock(stack: ItemStack, b: Block): number {
    const m = b?.blockMaterial;
    return b && (m === Material.wood || m === Material.plants || m === Material.vine) ? this.efficiencyOnProperMaterial : super.getStrVsBlock(stack, b);
  }
  override getEnchantKind(): 'weapon' | 'digger' | 'axe' | 'bow' | null {
    return 'axe';
  }
}
