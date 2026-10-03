import { DamageSource } from './DamageSource';

const f = Math.fround;

/** What the hunger bar needs from its player (kept narrow so the class has no import cycle). */
export interface FoodPlayer {
  readonly worldObj: { difficultySetting: number };
  shouldHeal(): boolean;
  heal(amount: number): void;
  getHealth(): number;
  attackEntityFrom(src: DamageSource, amount: number): boolean;
}

/** A food item's nourishment (ItemFood.getHealAmount / getSaturationModifier). */
export interface Food {
  getHealAmount(): number;
  getSaturationModifier(): number;
}

/**
 * The hunger bar (FoodStats): food level 0..20, saturation (never above the food level) and
 * exhaustion. Every 4 points of exhaustion eat one point of saturation, or of food once
 * saturation is gone (never on Peaceful). At 18 food or more the player heals half a heart every
 * 80 ticks; at 0 food it starves half a heart every 80 ticks, down to 10 health on Easy, 1 on
 * Normal and to death on Hard.
 */
export class FoodStats {
  private foodLevel = 20;
  private foodSaturationLevel = f(5);
  private foodExhaustionLevel = 0;
  private foodTimer = 0;
  private prevFoodLevel = 20;

  /** Adds hunger points and saturation (food * modifier * 2), both capped as in 1.5.2. */
  addStats(food: number | Food, saturationModifier = 0): void {
    if (typeof food !== 'number') {
      this.addStats(food.getHealAmount(), food.getSaturationModifier());
      return;
    }
    this.foodLevel = Math.min(food + this.foodLevel, 20);
    this.foodSaturationLevel = Math.min(f(this.foodSaturationLevel + f(f(food * f(saturationModifier)) * 2)), this.foodLevel);
  }

  /** Once per tick on the server side of the player. */
  onUpdate(player: FoodPlayer): void {
    const difficulty = player.worldObj.difficultySetting;
    this.prevFoodLevel = this.foodLevel;
    if (this.foodExhaustionLevel > 4) {
      this.foodExhaustionLevel = f(this.foodExhaustionLevel - 4);
      if (this.foodSaturationLevel > 0) this.foodSaturationLevel = Math.max(f(this.foodSaturationLevel - 1), 0);
      else if (difficulty > 0) this.foodLevel = Math.max(this.foodLevel - 1, 0);
    }
    if (this.foodLevel >= 18 && player.shouldHeal()) {
      if (++this.foodTimer >= 80) {
        player.heal(1);
        this.foodTimer = 0;
      }
    } else if (this.foodLevel <= 0) {
      if (++this.foodTimer >= 80) {
        const health = player.getHealth();
        if (health > 10 || difficulty >= 3 || (health > 1 && difficulty >= 2)) player.attackEntityFrom(DamageSource.starve, 1);
        this.foodTimer = 0;
      }
    } else {
      this.foodTimer = 0;
    }
  }

  getFoodLevel(): number {
    return this.foodLevel;
  }

  getPrevFoodLevel(): number {
    return this.prevFoodLevel;
  }

  needFood(): boolean {
    return this.foodLevel < 20;
  }

  /** Exhaustion accumulates up to 40. */
  addExhaustion(amount: number): void {
    this.foodExhaustionLevel = Math.min(f(this.foodExhaustionLevel + f(amount)), 40);
  }

  getSaturationLevel(): number {
    return this.foodSaturationLevel;
  }

  /** The current exhaustion (foodExhaustionLevel), for tests and the dev tools. */
  getExhaustionLevel(): number {
    return this.foodExhaustionLevel;
  }

  setFoodLevel(level: number): void {
    this.foodLevel = level;
  }

  setFoodSaturationLevel(saturation: number): void {
    this.foodSaturationLevel = f(saturation);
  }

  /** The NBT fields (foodLevel, foodTickTimer, foodSaturationLevel, foodExhaustionLevel). */
  writeNBT(): { foodLevel: number; foodTickTimer: number; foodSaturationLevel: number; foodExhaustionLevel: number } {
    return { foodLevel: this.foodLevel, foodTickTimer: this.foodTimer, foodSaturationLevel: this.foodSaturationLevel, foodExhaustionLevel: this.foodExhaustionLevel };
  }

  readNBT(tag: { foodLevel?: number; foodTickTimer?: number; foodSaturationLevel?: number; foodExhaustionLevel?: number }): void {
    if (tag.foodLevel === undefined) return;
    this.foodLevel = tag.foodLevel;
    this.foodTimer = tag.foodTickTimer ?? 0;
    this.foodSaturationLevel = f(tag.foodSaturationLevel ?? 0);
    this.foodExhaustionLevel = f(tag.foodExhaustionLevel ?? 0);
  }
}
