import { ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { I18n } from '../core/I18n';
import { EnumMovingObjectType } from '../core/MovingObjectPosition';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { Potion } from '../potion/Potion';
import { applyPotionEffect, PotionEffect } from '../potion/PotionEffect';
import { PotionHelper } from '../potion/PotionHelper';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { EnumAction, Item } from './Item';
import { createThrowable } from './ItemEntitySpawning';
import { ItemStack, type TagCompound } from './ItemStack';
import { playThrowSound } from './ItemThrowable';

/** Damage bit 14 (16384): a splash potion. */
export function isSplash(damage: number): boolean {
  return (damage & 16384) !== 0;
}

/** The creative list of brewable potions (ItemPotion.field_77835_b): effect list -> damage. */
const creativePotions = new Map<string, number>();

function effectsKey(effects: readonly PotionEffect[]): string {
  return effects.map((e) => `${e.getPotionID()}:${e.getAmplifier()}:${e.getDuration()}:${e.isSplashPotionEffect()}:${e.getIsAmbient()}`).join('|');
}

/**
 * Potions (ItemPotion): the damage value is the brewing bit field (see PotionHelper). Drinkable
 * potions take 32 ticks (Creative keeps the bottle); splash potions are thrown. The icon is the
 * tinted contents (pass 0) under the bottle (pass 1).
 */
export class ItemPotion extends Item {
  private readonly effectCache = new Map<number, PotionEffect[] | null>();
  private bottleIcon: Icon | null = null;
  private splashIcon: Icon | null = null;
  private contentsIcon: Icon | null = null;

  constructor(index: number) {
    super(index);
    this.setMaxStackSize(1);
    this.setHasSubtypes(true);
    this.setMaxDamage(0);
    this.setCreativeTab(CreativeTabs.tabBrewing);
  }

  /** The effects of a stack: CustomPotionEffects when present, else brewed from the damage. */
  getEffects(stack: ItemStack | number): PotionEffect[] | null {
    if (typeof stack !== 'number') {
      const custom = stack.getTagCompound()?.CustomPotionEffects;
      if (Array.isArray(custom)) return custom.map((t) => PotionEffect.readCustomPotionEffectFromNBT(t as TagCompound));
      stack = stack.getItemDamage();
    }
    let list = this.effectCache.get(stack);
    if (list === undefined) {
      list = PotionHelper.getPotionEffects(stack, false);
      this.effectCache.set(stack, list);
    }
    return list;
  }

  override onEaten(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    if (!w.isRemote) {
      for (const e of this.getEffects(stack) ?? []) applyPotionEffect(player, PotionEffect.copyOf(e));
    }
    if (!player.capabilities.isCreativeMode) {
      if (stack.stackSize <= 0) return new ItemStack(ItemIds.glassBottle);
      player.inventory.addItemStackToInventory(new ItemStack(ItemIds.glassBottle));
    }
    return stack;
  }
  override getMaxItemUseDuration(_stack: ItemStack): number {
    return 32;
  }
  override getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.drink;
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    if (!isSplash(stack.getItemDamage())) {
      player.setItemInUse(stack, this.getMaxItemUseDuration(stack));
      return stack;
    }
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    playThrowSound(w, player);
    if (!w.isRemote) {
      const e = createThrowable('ThrownPotion', w as World, player, stack);
      if (e) w.spawnEntityInWorld(e);
    }
    return stack;
  }
  override onItemUse(): boolean {
    return false;
  }
  override getIconFromDamage(damage: number): Icon | null {
    return isSplash(damage) ? this.splashIcon : this.bottleIcon;
  }
  override getIconFromDamageForRenderPass(damage: number, pass: number): Icon | null {
    return pass === 0 ? this.contentsIcon : super.getIconFromDamageForRenderPass(damage, pass);
  }
  /** The liquid colour of a damage value (RenderGlobal's splash particles use it too). */
  getColorFromDamage(damage: number): number {
    return PotionHelper.getLiquidColor(damage, false);
  }
  override getColorFromItemStack(stack: ItemStack, pass: number): number {
    return pass > 0 ? 0xffffff : this.getColorFromDamage(stack.getItemDamage());
  }
  override requiresMultipleRenderPasses(): boolean {
    return true;
  }
  /** Whether any effect is instant (instant health / damage: the splash uses "instantSpell"). */
  isEffectInstant(damage: number): boolean {
    const list = this.getEffects(damage);
    return !!list && list.some((e) => Potion.potionTypes[e.getPotionID()]!.isInstant());
  }

  /** "Water Bottle", "Splash Potion of Healing", "Awkward Potion"... */
  override getItemDisplayName(stack: ItemStack): string {
    const d = stack.getItemDamage();
    if (d === 0) return I18n.translateToLocal('item.emptyPotion.name').trim();
    const prefix = isSplash(d) ? I18n.translateToLocal('potion.prefix.grenade').trim() + ' ' : '';
    const effects = this.getEffects(stack);
    if (effects && effects.length > 0) return prefix + I18n.translateToLocal(effects[0].getEffectName() + '.postfix').trim();
    return I18n.translateToLocal(PotionHelper.getPotionPrefix(d)).trim() + ' ' + super.getItemDisplayName(stack);
  }

  /** One line per effect: name, potency (II...), duration; red for harmful effects. */
  override addInformation(stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    if (stack.getItemDamage() === 0) return;
    const effects = this.getEffects(stack);
    if (!effects || effects.length === 0) {
      lines.push('§7' + I18n.translateToLocal('potion.empty').trim());
      return;
    }
    for (const e of effects) {
      let s = I18n.translateToLocal(e.getEffectName()).trim();
      if (e.getAmplifier() > 0) s += ' ' + I18n.translateToLocal('potion.potency.' + e.getAmplifier()).trim();
      if (e.getDuration() > 20) s += ' (' + Potion.getDurationString(e) + ')';
      lines.push((Potion.potionTypes[e.getPotionID()]!.isBadEffect() ? '§c' : '§7') + s);
    }
  }

  override hasEffect(stack: ItemStack): boolean {
    const list = this.getEffects(stack);
    return !!list && list.length > 0;
  }

  /** Water bottle, then every distinct brewable potion (drinkable and splash, plain/II/extended). */
  override getSubItems(id: number, tab: CreativeTabs | null, out: ItemStack[]): void {
    super.getSubItems(id, tab, out);
    if (creativePotions.size === 0) {
      for (let base = 0; base <= 15; base++) {
        for (let kind = 0; kind <= 1; kind++) {
          const d = kind === 0 ? base | 8192 : base | 16384;
          for (let variant = 0; variant <= 2; variant++) {
            const damage = variant === 0 ? d : variant === 1 ? d | 32 : d | 64;
            const effects = PotionHelper.getPotionEffects(damage, false);
            if (effects && effects.length > 0) creativePotions.set(effectsKey(effects), damage);
          }
        }
      }
    }
    for (const damage of creativePotions.values()) out.push(new ItemStack(id, 1, damage));
  }

  override registerIcons(reg: IconRegister): void {
    this.bottleIcon = reg.registerIcon('potion');
    this.splashIcon = reg.registerIcon('potion_splash');
    this.contentsIcon = reg.registerIcon('potion_contents');
  }
  /** func_94589_d: the shared potion icons by name (the glass bottle and splash renderer use them). */
  getIconByName(name: string): Icon | null {
    return name === 'potion' ? this.bottleIcon : name === 'potion_splash' ? this.splashIcon : name === 'potion_contents' ? this.contentsIcon : null;
  }
}

/** The glass bottle: fills with water from a water block it is pointed at; drawn as the empty potion. */
export class ItemGlassBottle extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabBrewing);
  }
  override getIconFromDamage(_damage: number): Icon | null {
    return Item.itemsList[ItemIds.potion]?.getIconFromDamage(0) ?? null;
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const hit = this.getMovingObjectPositionFromPlayer(w as World, player, true);
    if (!hit || hit.typeOfHit !== EnumMovingObjectType.TILE) return stack;
    const { blockX: x, blockY: y, blockZ: z } = hit;
    if (!player.canPlayerEdit(x, y, z, hit.sideHit, stack)) return stack;
    if (w.getBlockMaterial(x, y, z) === Material.water) {
      stack.stackSize--;
      if (stack.stackSize <= 0) return new ItemStack(ItemIds.potion);
      if (!player.inventory.addItemStackToInventory(new ItemStack(ItemIds.potion))) player.dropPlayerItem(new ItemStack(ItemIds.potion, 1, 0));
    }
    return stack;
  }
  override registerIcons(_reg: IconRegister): void {}
}
