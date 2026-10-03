import { DamageSource } from '../entity/DamageSource';
import { EntityList } from '../entity/EntityList';
import { ItemStack } from '../item/ItemStack';
import { EnumGameType } from '../world/EnumGameType';
import type { Minecraft } from './Minecraft';

/** The survival numbers of the local player, for scenario assertions. */
export interface SurvivalState {
  mode: string;
  hardcore: boolean;
  difficulty: number;
  health: number;
  food: number;
  saturation: number;
  exhaustion: number;
  air: number;
  armor: number;
  level: number;
  xpTotal: number;
  xpProgress: number;
  score: number;
  hurtTime: number;
  hurtResistantTime: number;
  dead: boolean;
  flying: boolean;
  allowFlying: boolean;
  disableDamage: boolean;
  /** Damage of the block being mined (0..1) and whether mining is in progress. */
  mining: number;
  hitting: boolean;
  /** The bed / spawn point, if any. */
  bed: [number, number, number] | null;
}

/** `mc.dev.survival`: inspect and steer the survival state from scenarios. */
export class SurvivalDevTools {
  constructor(private readonly mc: Minecraft) {}

  state(): SurvivalState | null {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return null;
    const food = p.getFoodStats();
    const bed = p.getBedLocation();
    return {
      mode: this.mc.playerController.getCurrentGameType().getName(),
      hardcore: w.worldInfo.hardcore,
      difficulty: w.difficultySetting,
      health: p.getHealth(),
      food: food.getFoodLevel(),
      saturation: food.getSaturationLevel(),
      exhaustion: food.getExhaustionLevel(),
      air: p.getAir(),
      armor: p.getTotalArmorValue(),
      level: p.experienceLevel,
      xpTotal: p.experienceTotal,
      xpProgress: p.experience,
      score: p.getScore(),
      hurtTime: p.hurtTime,
      hurtResistantTime: p.hurtResistantTime,
      dead: p.getHealth() <= 0,
      flying: p.capabilities.isFlying,
      allowFlying: p.capabilities.allowFlying,
      disableDamage: p.capabilities.disableDamage,
      mining: this.mc.playerController.getCurBlockDamage(),
      hitting: this.mc.playerController.isHitting(),
      bed: bed ? [bed.posX, bed.posY, bed.posZ] : null,
    };
  }

  /** Switches the game mode like /gamemode (0 survival, 1 creative, 2 adventure). */
  setMode(mode: number | string): void {
    const p = this.mc.thePlayer;
    if (p) p.setGameType(typeof mode === 'number' ? EnumGameType.getByID(mode) : EnumGameType.getByName(mode));
  }

  setHealth(h: number): void {
    this.mc.thePlayer?.setEntityHealth(h);
  }

  setFood(level: number, saturation?: number): void {
    const food = this.mc.thePlayer?.getFoodStats();
    if (!food) return;
    food.setFoodLevel(level);
    if (saturation !== undefined) food.setFoodSaturationLevel(saturation);
  }

  exhaust(amount: number): void {
    this.mc.thePlayer?.addExhaustion(amount);
  }

  /** Damages the player with a named DamageSource (`fall`, `lava`, `generic`, ...). */
  damage(source: string, amount: number): boolean {
    const p = this.mc.thePlayer;
    const src = (DamageSource as unknown as Record<string, DamageSource | undefined>)[source];
    return !!p && !!src && src instanceof DamageSource && p.attackEntityFrom(src, amount);
  }

  /** Ends the spawn protection (EntityPlayerMP.initialInvulnerability) so damage applies at once. */
  vulnerable(): void {
    const p = this.mc.thePlayer;
    if (p) p.initialInvulnerability = 0;
  }

  /** Puts armour (an item id, 0 to clear) in slot 0 boots .. 3 helmet. */
  armor(slot: number, id: number): void {
    const p = this.mc.thePlayer;
    if (p) p.inventory.armorInventory[slot] = id === 0 ? null : new ItemStack(id, 1, 0);
  }

  /** Adds experience points (and levels) like an orb or /xp. */
  xp(points: number, levels = 0): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    if (levels !== 0) p.addExperienceLevel(levels);
    if (points > 0) p.addExperience(points);
  }

  /** Stacks in the inventory as [id, count, damage]; armour last. */
  inventory(): [number, number, number][] {
    const p = this.mc.thePlayer;
    if (!p) return [];
    const out: [number, number, number][] = [];
    for (const s of [...p.inventory.mainInventory, ...p.inventory.armorInventory]) if (s) out.push([s.itemID, s.stackSize, s.getItemDamage()]);
    return out;
  }

  /** Dropped item entities near the player as [id, count]. */
  drops(radius = 8): [number, number][] {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return [];
    const out: [number, number][] = [];
    for (const e of w.loadedEntityList) {
      const item = e as unknown as { getEntityItem?: () => ItemStack };
      if (typeof item.getEntityItem === 'function' && !e.isDead && e.getDistanceToEntity(p) <= radius) {
        const s = item.getEntityItem();
        out.push([s.itemID, s.stackSize]);
      }
    }
    return out;
  }

  /** Removes dropped items and orbs around the player (keeps the scene tidy between steps). */
  clearDrops(radius = 16): void {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return;
    for (const e of w.loadedEntityList) {
      const name = EntityList.getEntityString(e);
      if ((name === 'Item' || name === 'XPOrb') && e.getDistanceToEntity(p) <= radius) e.setDead();
    }
  }
}
