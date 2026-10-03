import type { EntityLiving } from '../entity/EntityLiving';
import type { TagCompound } from '../item/ItemStack';
import { Potion } from './Potion';

/** An active or brewed effect (PotionEffect): potion id, duration in ticks and amplifier (0 = level I). */
export class PotionEffect {
  private potionID: number;
  private duration: number;
  private amplifier: number;
  private isSplashPotion = false;
  private isAmbient: boolean;
  private isPotionDurationMax = false;

  constructor(id: number, duration: number, amplifier = 0, ambient = false) {
    this.potionID = id;
    this.duration = duration;
    this.amplifier = amplifier;
    this.isAmbient = ambient;
  }

  /** The copy constructor (splash and ambient flags are not copied, as in 1.5.2). */
  static copyOf(e: PotionEffect): PotionEffect {
    return new PotionEffect(e.potionID, e.duration, e.amplifier);
  }

  /** Merges a re-applied effect: a higher amplifier wins, then a longer duration. */
  combine(o: PotionEffect): void {
    if (o.amplifier > this.amplifier) {
      this.amplifier = o.amplifier;
      this.duration = o.duration;
    } else if (o.amplifier === this.amplifier && this.duration < o.duration) {
      this.duration = o.duration;
    } else if (!o.isAmbient && this.isAmbient) {
      this.isAmbient = o.isAmbient;
    }
  }

  getPotionID(): number {
    return this.potionID;
  }
  getDuration(): number {
    return this.duration;
  }
  getAmplifier(): number {
    return this.amplifier;
  }
  isSplashPotionEffect(): boolean {
    return this.isSplashPotion;
  }
  setSplashPotion(v: boolean): void {
    this.isSplashPotion = v;
  }
  getIsAmbient(): boolean {
    return this.isAmbient;
  }

  /** Ticks the effect on `e`; false once it has run out. */
  onUpdate(e: EntityLiving): boolean {
    if (this.duration > 0) {
      if (Potion.potionTypes[this.potionID]!.isReady(this.duration, this.amplifier)) this.performEffect(e);
      this.duration--;
    }
    return this.duration > 0;
  }

  performEffect(e: EntityLiving): void {
    if (this.duration > 0) Potion.potionTypes[this.potionID]!.performEffect(e, this.amplifier);
  }

  /** The lang key of the effect, e.g. "potion.moveSpeed". */
  getEffectName(): string {
    return Potion.potionTypes[this.potionID]!.getName();
  }

  toString(): string {
    let s = this.amplifier > 0 ? `${this.getEffectName()} x ${this.amplifier + 1}, Duration: ${this.duration}` : `${this.getEffectName()}, Duration: ${this.duration}`;
    if (this.isSplashPotion) s += ', Splash: true';
    return Potion.potionTypes[this.potionID]!.isUsable() ? `(${s})` : s;
  }

  equals(o: PotionEffect): boolean {
    return this.potionID === o.potionID && this.amplifier === o.amplifier && this.duration === o.duration && this.isSplashPotion === o.isSplashPotion && this.isAmbient === o.isAmbient;
  }

  /** writeCustomPotionEffectToNBT (CustomPotionEffects entries). */
  writeCustomPotionEffectToNBT(t: TagCompound = {}): TagCompound {
    t.Id = this.potionID & 255;
    t.Amplifier = this.amplifier & 255;
    t.Duration = this.duration;
    t.Ambient = this.isAmbient;
    return t;
  }

  static readCustomPotionEffectFromNBT(t: TagCompound): PotionEffect {
    const byte = (v: unknown) => ((Number(v ?? 0) << 24) >> 24);
    return new PotionEffect(byte(t.Id), Number(t.Duration ?? 0), byte(t.Amplifier), t.Ambient === true || t.Ambient === 1);
  }

  setPotionDurationMax(v: boolean): void {
    this.isPotionDurationMax = v;
  }
  getIsPotionDurationMax(): boolean {
    return this.isPotionDurationMax;
  }
}

/** What an entity offers to potion items (EntityLiving.addPotionEffect & co.; added by the effects agent). */
export interface PotionEffectTarget {
  addPotionEffect?(e: PotionEffect): void;
  clearActivePotions?(): void;
}

/**
 * Applies an effect to an entity if the entity supports potion effects yet (the hook drinkable
 * potions, golden apples, food and splash potions go through).
 */
export function applyPotionEffect(e: object, effect: PotionEffect): void {
  (e as PotionEffectTarget).addPotionEffect?.(effect);
}

/** Milk: removes every active effect (EntityLiving.clearActivePotions). */
export function clearPotionEffects(e: object): void {
  (e as PotionEffectTarget).clearActivePotions?.();
}
