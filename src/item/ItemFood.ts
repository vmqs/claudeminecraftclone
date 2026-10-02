import { ItemIds } from '../block/BlockIds';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { Potion } from '../potion/Potion';
import { applyPotionEffect, PotionEffect } from '../potion/PotionEffect';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { EnumAction, EnumRarity, Item } from './Item';
import { ItemStack } from './ItemStack';

/** What eating needs from a player that later agents may add (FoodStats). */
interface Eater {
  canEat?(alwaysEdible: boolean): boolean;
  getFoodStats?(): { addStats(food: ItemFood): void; needFood(): boolean } | null;
}

/**
 * EntityPlayer.canEat: hungry (or the food is always edible) and able to take damage. Creative
 * players can never eat, exactly like 1.5.2 (their damage is disabled).
 */
export function canPlayerEat(player: EntityPlayer, alwaysEdible: boolean): boolean {
  const p = player as EntityPlayer & Eater;
  if (p.canEat) return p.canEat(alwaysEdible);
  const needFood = p.getFoodStats?.()?.needFood() ?? false;
  return (alwaysEdible || needFood) && !player.capabilities.disableDamage;
}

/** Food (ItemFood): 32 ticks of eating, then hunger, saturation and an optional potion effect. */
export class ItemFood extends Item {
  readonly itemUseDuration = 32;
  private alwaysEdible = false;
  private potionId = 0;
  private potionDuration = 0;
  private potionAmplifier = 0;
  private potionEffectProbability = 0;

  constructor(
    index: number,
    private readonly healAmount: number,
    private readonly saturationModifier: number,
    private readonly isWolfsFavoriteMeatFlag: boolean,
  ) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabFood);
  }

  override onEaten(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    stack.stackSize--;
    (player as EntityPlayer & Eater).getFoodStats?.()?.addStats(this);
    (w as World).playSoundAtEntity(player, 'random.burp', 0.5, Math.fround(Math.fround(w.rand.nextFloat() * Math.fround(0.1)) + Math.fround(0.9)));
    this.onFoodEaten(stack, w, player);
    return stack;
  }
  protected onFoodEaten(_stack: ItemStack, w: IWorld, player: EntityPlayer): void {
    if (!w.isRemote && this.potionId > 0 && w.rand.nextFloat() < this.potionEffectProbability) {
      applyPotionEffect(player, new PotionEffect(this.potionId, this.potionDuration * 20, this.potionAmplifier));
    }
  }
  override getMaxItemUseDuration(_stack: ItemStack): number {
    return 32;
  }
  override getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.eat;
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    if (canPlayerEat(player, this.alwaysEdible)) player.setItemInUse(stack, this.getMaxItemUseDuration(stack));
    return stack;
  }
  getHealAmount(): number {
    return this.healAmount;
  }
  getSaturationModifier(): number {
    return this.saturationModifier;
  }
  isWolfsFavoriteMeat(): boolean {
    return this.isWolfsFavoriteMeatFlag;
  }
  /** The chance (`probability`) of a potion effect when eaten (raw chicken, rotten flesh...). */
  setFoodPotionEffect(id: number, seconds: number, amplifier: number, probability: number): this {
    this.potionId = id;
    this.potionDuration = seconds;
    this.potionAmplifier = amplifier;
    this.potionEffectProbability = Math.fround(probability);
    return this;
  }
  setAlwaysEdible(): this {
    this.alwaysEdible = true;
    return this;
  }
  isAlwaysEdible(): boolean {
    return this.alwaysEdible;
  }
}

/** Mushroom stew: stacks to one and leaves the bowl. */
export class ItemSoup extends ItemFood {
  constructor(index: number, heal: number) {
    super(index, heal, 0.6, false);
    this.setMaxStackSize(1);
  }
  override onEaten(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    super.onEaten(stack, w, player);
    return new ItemStack(ItemIds.bowlEmpty);
  }
}

/** Golden apple: damage 1 is the enchanted (epic, glinting) notch apple with stronger effects. */
export class ItemAppleGold extends ItemFood {
  constructor(index: number, heal: number, saturation: number, wolfMeat: boolean) {
    super(index, heal, saturation, wolfMeat);
    this.setHasSubtypes(true);
  }
  override hasEffect(stack: ItemStack): boolean {
    return stack.getItemDamage() > 0;
  }
  override getRarity(stack: ItemStack): EnumRarity {
    return stack.getItemDamage() === 0 ? EnumRarity.rare : EnumRarity.epic;
  }
  protected override onFoodEaten(stack: ItemStack, w: IWorld, player: EntityPlayer): void {
    if (stack.getItemDamage() > 0) {
      if (!w.isRemote) {
        applyPotionEffect(player, new PotionEffect(Potion.regeneration.id, 600, 3));
        applyPotionEffect(player, new PotionEffect(Potion.resistance.id, 6000, 0));
        applyPotionEffect(player, new PotionEffect(Potion.fireResistance.id, 6000, 0));
      }
    } else {
      super.onFoodEaten(stack, w, player);
    }
  }
  override getSubItems(id: number, _tab: CreativeTabs | null, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0));
    out.push(new ItemStack(id, 1, 1));
  }
}

/** Carrot and potato: food that also plants its crop on farmland (ItemSeedFood). */
export class ItemSeedFood extends ItemFood {
  constructor(
    index: number,
    heal: number,
    saturation: number,
    private readonly cropId: number,
    private readonly soilId: number,
  ) {
    super(index, heal, saturation, false);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    return plantSeed(stack, player, w, x, y, z, side, this.cropId, this.soilId);
  }
}

/** Seeds of wheat, pumpkin, melon and nether wart: plant on top of their soil (ItemSeeds). */
export class ItemSeeds extends Item {
  constructor(
    index: number,
    private readonly blockType: number,
    private readonly soilBlockID: number,
  ) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabMaterials);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    return plantSeed(stack, player, w, x, y, z, side, this.blockType, this.soilBlockID);
  }
}

function plantSeed(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, crop: number, soil: number): boolean {
  if (side !== 1) return false;
  if (!player.canPlayerEdit(x, y, z, side, stack) || !player.canPlayerEdit(x, y + 1, z, side, stack)) return false;
  if (w.getBlockId(x, y, z) === soil && w.isAirBlock(x, y + 1, z)) {
    w.setBlock(x, y + 1, z, crop);
    stack.stackSize--;
    return true;
  }
  return false;
}
