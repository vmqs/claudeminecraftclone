import { ItemIds } from '../block/BlockIds';
import { Enchantment } from '../enchantment/Enchantment';
import { EnchantmentHelper } from '../enchantment/EnchantmentHelper';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { EnumAction, Item } from './Item';
import { createArrow, createFishHook } from './ItemEntitySpawning';
import { ItemStack } from './ItemStack';

const f = Math.fround;

/** EntityArrow's 1.5.2 setters, called when the arrow class provides them. */
interface ArrowLike {
  canBePickedUp?: number;
  setIsCritical?(v: boolean): void;
  getDamage?(): number;
  setDamage?(v: number): void;
  setKnockbackStrength?(v: number): void;
}

/**
 * The bow: hold right click to draw (72000-tick use, EnumAction.bow), release to shoot. Power is
 * `(t^2 + 2t) / 3` of the seconds drawn, capped at 1 (a full draw is critical). Creative or
 * Infinity needs no arrow and leaves one that cannot be picked up.
 */
export class ItemBow extends Item {
  static readonly bowPullIconNameArray = ['bow_pull_0', 'bow_pull_1', 'bow_pull_2'];
  private iconArray: (Icon | null)[] = [];

  constructor(index: number) {
    super(index);
    this.maxStackSize = 1;
    this.setMaxDamage(384);
    this.setCreativeTab(CreativeTabs.tabCombat);
  }

  override onPlayerStoppedUsing(stack: ItemStack, w: IWorld, player: EntityPlayer, ticksLeft: number): void {
    const free = player.capabilities.isCreativeMode || EnchantmentHelper.getEnchantmentLevel(Enchantment.infinity.effectId, stack) > 0;
    if (!free && !player.inventory.hasItem(ItemIds.arrow)) return;
    const drawn = this.getMaxItemUseDuration(stack) - ticksLeft;
    let power = f(drawn / 20);
    power = f(f(f(power * power) + f(power * 2)) / 3);
    if (power < 0.1) return;
    if (power > 1) power = 1;
    const world = w as World;
    const arrow = createArrow(world, player, f(power * 2));
    const a = arrow as (Entity & ArrowLike) | null;
    if (a) {
      if (power === 1) a.setIsCritical?.(true);
      const powerLvl = EnchantmentHelper.getEnchantmentLevel(Enchantment.power.effectId, stack);
      if (powerLvl > 0 && a.setDamage && a.getDamage) a.setDamage(a.getDamage() + powerLvl * 0.5 + 0.5);
      const punch = EnchantmentHelper.getEnchantmentLevel(Enchantment.punch.effectId, stack);
      if (punch > 0) a.setKnockbackStrength?.(punch);
      if (EnchantmentHelper.getEnchantmentLevel(Enchantment.flame.effectId, stack) > 0) a.setFire(100);
    }
    stack.damageItem(1, player);
    world.playSoundAtEntity(player, 'random.bow', 1, f(f(1 / f(f(Item.itemRand.nextFloat() * f(0.4)) + f(1.2))) + f(power * f(0.5))));
    if (free) {
      if (a) a.canBePickedUp = 2;
    } else {
      player.inventory.consumeInventoryItem(ItemIds.arrow);
    }
    if (!w.isRemote && arrow) w.spawnEntityInWorld(arrow);
  }
  override onEaten(stack: ItemStack): ItemStack {
    return stack;
  }
  override getMaxItemUseDuration(_stack: ItemStack): number {
    return 72000;
  }
  override getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.bow;
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    if (player.capabilities.isCreativeMode || player.inventory.hasItem(ItemIds.arrow)) player.setItemInUse(stack, this.getMaxItemUseDuration(stack));
    return stack;
  }
  override getItemEnchantability(): number {
    return 1;
  }
  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.iconArray = ItemBow.bowPullIconNameArray.map((n) => reg.registerIcon(n));
  }
  /** The drawing frames 0-2 (EntityPlayer.getItemIcon picks them by use time). */
  getItemIconForUseDuration(i: number): Icon | null {
    return this.iconArray[i] ?? null;
  }
  /**
   * EntityPlayer.getItemIcon's bow branch: frame 2 after 18 ticks of drawing, 1 after 13,
   * 0 while drawing at all, else the idle icon.
   */
  getIconForUseTicks(ticksUsed: number): Icon | null {
    if (ticksUsed >= 18) return this.getItemIconForUseDuration(2);
    if (ticksUsed > 13) return this.getItemIconForUseDuration(1);
    if (ticksUsed > 0) return this.getItemIconForUseDuration(0);
    return this.itemIcon;
  }
  override getEnchantKind(): 'weapon' | 'digger' | 'axe' | 'bow' | null {
    return 'bow';
  }
}

/** What a fishing player has (EntityPlayer.fishEntity and EntityFishHook.catchFish). */
interface Fisher {
  fishEntity?: { catchFish(): number } | null;
}

/** The fishing rod: casts a hook, or reels it in (wear = catchFish's result). */
export class ItemFishingRod extends Item {
  private theIcon: Icon | null = null;

  constructor(index: number) {
    super(index);
    this.setMaxDamage(64);
    this.setMaxStackSize(1);
    this.setCreativeTab(CreativeTabs.tabTools);
  }
  override isFull3D(): boolean {
    return true;
  }
  override shouldRotateAroundWhenRendering(): boolean {
    return true;
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const fisher = player as EntityPlayer & Fisher;
    if (fisher.fishEntity) {
      stack.damageItem(fisher.fishEntity.catchFish(), player);
      player.swingItem();
    } else {
      (w as World).playSoundAtEntity(player, 'random.bow', 0.5, f(f(0.4) / f(f(Item.itemRand.nextFloat() * f(0.4)) + f(0.8))));
      if (!w.isRemote) {
        const hook = createFishHook(w as World, player);
        if (hook) w.spawnEntityInWorld(hook);
      }
      player.swingItem();
    }
    return stack;
  }
  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.theIcon = reg.registerIcon('fishingRod_empty');
  }
  /** func_94597_g: the rod without its line, drawn while the hook is out. */
  getCastIcon(): Icon | null {
    return this.theIcon;
  }
}

/** What riding a pig needs (EntityPig.getAIControlledByPlayer). */
interface Steerable {
  getAIControlledByPlayer?(): { isControlledByPlayer(): boolean; boostSpeed(): void };
}

/** Carrot on a stick: boosts a ridden pig for 7 wear; turns back into a fishing rod when used up. */
export class ItemCarrotOnAStick extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabTransport);
    this.setMaxStackSize(1);
    this.setMaxDamage(25);
  }
  override isFull3D(): boolean {
    return true;
  }
  override shouldRotateAroundWhenRendering(): boolean {
    return true;
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    const mount = player.ridingEntity as (Entity & Steerable) | null;
    const ai = mount?.getAIControlledByPlayer?.();
    if (ai && ai.isControlledByPlayer() && stack.getMaxDamage() - stack.getItemDamage() >= 7) {
      ai.boostSpeed();
      stack.damageItem(7, player);
      if (stack.stackSize === 0) {
        const rod = new ItemStack(ItemIds.fishingRod);
        rod.setTagCompound(stack.stackTagCompound);
        return rod;
      }
    }
    return stack;
  }
}
