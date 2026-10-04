import { DamageSource } from '../entity/DamageSource';
import type { EntityLiving } from '../entity/EntityLiving';
import type { PotionEffect } from './PotionEffect';

/** DamageSource.causeIndirectMagicDamage (thrown potions; provided by the entities agent's DamageSource). */
interface IndirectMagic {
  causeIndirectMagicDamage?(target: EntityLiving, thrower: EntityLiving): DamageSource;
}

/** What the hunger effect needs from a player (EntityPlayer.addExhaustion; absent until food stats exist). */
interface Exhaustible {
  addExhaustion?(amount: number): void;
}

/**
 * A status effect type (Potion). The 20 effects of 1.5.2 register themselves at
 * `potionTypes[id]` with their lang key, bad-effect flag, liquid colour (bottle tint), status
 * icon (inventory.png cell `x + y * 8`) and effectiveness (duration multiplier when brewed).
 */
export class Potion {
  static readonly potionTypes: (Potion | null)[] = new Array(32).fill(null);

  private name = '';
  private statusIconIndex = -1;
  private effectiveness: number;
  private readonly usable = false;

  /** `instant` marks instant health / instant damage (PotionHealth in 1.5.2). */
  protected constructor(
    readonly id: number,
    private readonly badEffect: boolean,
    private readonly liquidColor: number,
    private readonly instant = false,
  ) {
    Potion.potionTypes[id] = this;
    this.effectiveness = badEffect ? 0.5 : 1.0;
  }

  protected setIconIndex(x: number, y: number): this {
    this.statusIconIndex = x + y * 8;
    return this;
  }

  getId(): number {
    return this.id;
  }

  /** Applies one tick's worth of a lasting effect (regeneration, poison, wither, hunger, heal/harm). */
  performEffect(e: EntityLiving, amplifier: number): void {
    if (this.id === Potion.regeneration.id) {
      if (e.getHealth() < e.getMaxHealth()) e.heal(1);
    } else if (this.id === Potion.poison.id) {
      if (e.getHealth() > 1) e.attackEntityFrom(DamageSource.magic, 1);
    } else if (this.id === Potion.wither.id) {
      e.attackEntityFrom(DamageSource.wither, 1);
    } else if (this.id === Potion.hunger.id && e.isPlayerEntity) {
      (e as EntityLiving & Exhaustible).addExhaustion?.(Math.fround(0.025 * (amplifier + 1)));
    } else if ((this.id === Potion.heal.id && !e.isEntityUndead()) || (this.id === Potion.harm.id && e.isEntityUndead())) {
      e.heal(6 << amplifier);
    } else if ((this.id === Potion.harm.id && !e.isEntityUndead()) || (this.id === Potion.heal.id && e.isEntityUndead())) {
      e.attackEntityFrom(DamageSource.magic, 6 << amplifier);
    }
  }

  /** An instant effect from a splash potion, scaled by the distance factor `scale` (0..1). */
  affectEntity(thrower: EntityLiving | null, target: EntityLiving, amplifier: number, scale: number): void {
    const amount = Math.trunc(scale * (6 << amplifier) + 0.5);
    if ((this.id === Potion.heal.id && !target.isEntityUndead()) || (this.id === Potion.harm.id && target.isEntityUndead())) {
      target.heal(amount);
    } else if ((this.id === Potion.harm.id && !target.isEntityUndead()) || (this.id === Potion.heal.id && target.isEntityUndead())) {
      const indirect = (DamageSource as unknown as IndirectMagic).causeIndirectMagicDamage;
      target.attackEntityFrom(thrower === null || !indirect ? DamageSource.magic : indirect(target, thrower), amount);
    }
  }

  isInstant(): boolean {
    return this.instant;
  }

  /** Whether performEffect runs this tick (`duration` left, `amplifier`). */
  isReady(duration: number, amplifier: number): boolean {
    if (this.instant) return duration >= 1;
    if (this.id === Potion.regeneration.id || this.id === Potion.poison.id) {
      const k = 25 >> amplifier;
      return k > 0 ? duration % k === 0 : true;
    }
    if (this.id === Potion.wither.id) {
      const k = 40 >> amplifier;
      return k > 0 ? duration % k === 0 : true;
    }
    return this.id === Potion.hunger.id;
  }

  setPotionName(name: string): this {
    this.name = name;
    return this;
  }

  /** The lang key, e.g. "potion.moveSpeed". */
  getName(): string {
    return this.name;
  }

  hasStatusIcon(): boolean {
    return this.statusIconIndex >= 0;
  }

  getStatusIconIndex(): number {
    return this.statusIconIndex;
  }

  isBadEffect(): boolean {
    return this.badEffect;
  }

  /** "m:ss" of the remaining duration, or "**:**" for a permanent effect. */
  static getDurationString(e: PotionEffect): string {
    if (e.getIsPotionDurationMax()) return '**:**';
    return ticksToElapsedTime(e.getDuration());
  }

  protected setEffectiveness(v: number): this {
    this.effectiveness = v;
    return this;
  }

  getEffectiveness(): number {
    return this.effectiveness;
  }

  isUsable(): boolean {
    return this.usable;
  }

  getLiquidColor(): number {
    return this.liquidColor;
  }

  // The order of these fields is the registration order of 1.5.2 (the potionTypes table).
  static readonly moveSpeed: Potion = new Potion(1, false, 8171462).setPotionName('potion.moveSpeed').setIconIndex(0, 0);
  static readonly moveSlowdown: Potion = new Potion(2, true, 5926017).setPotionName('potion.moveSlowdown').setIconIndex(1, 0);
  static readonly digSpeed: Potion = new Potion(3, false, 14270531).setPotionName('potion.digSpeed').setIconIndex(2, 0).setEffectiveness(1.5);
  static readonly digSlowdown: Potion = new Potion(4, true, 4866583).setPotionName('potion.digSlowDown').setIconIndex(3, 0);
  static readonly damageBoost: Potion = new Potion(5, false, 9643043).setPotionName('potion.damageBoost').setIconIndex(4, 0);
  static readonly heal: Potion = new Potion(6, false, 16262179, true).setPotionName('potion.heal');
  static readonly harm: Potion = new Potion(7, true, 4393481, true).setPotionName('potion.harm');
  static readonly jump: Potion = new Potion(8, false, 7889559).setPotionName('potion.jump').setIconIndex(2, 1);
  static readonly confusion: Potion = new Potion(9, true, 5578058).setPotionName('potion.confusion').setIconIndex(3, 1).setEffectiveness(0.25);
  static readonly regeneration: Potion = new Potion(10, false, 13458603).setPotionName('potion.regeneration').setIconIndex(7, 0).setEffectiveness(0.25);
  static readonly resistance: Potion = new Potion(11, false, 10044730).setPotionName('potion.resistance').setIconIndex(6, 1);
  static readonly fireResistance: Potion = new Potion(12, false, 14981690).setPotionName('potion.fireResistance').setIconIndex(7, 1);
  static readonly waterBreathing: Potion = new Potion(13, false, 3035801).setPotionName('potion.waterBreathing').setIconIndex(0, 2);
  static readonly invisibility: Potion = new Potion(14, false, 8356754).setPotionName('potion.invisibility').setIconIndex(0, 1);
  static readonly blindness: Potion = new Potion(15, true, 2039587).setPotionName('potion.blindness').setIconIndex(5, 1).setEffectiveness(0.25);
  static readonly nightVision: Potion = new Potion(16, false, 2039713).setPotionName('potion.nightVision').setIconIndex(4, 1);
  static readonly hunger: Potion = new Potion(17, true, 5797459).setPotionName('potion.hunger').setIconIndex(1, 1);
  static readonly weakness: Potion = new Potion(18, true, 4738376).setPotionName('potion.weakness').setIconIndex(5, 0);
  static readonly poison: Potion = new Potion(19, true, 5149489).setPotionName('potion.poison').setIconIndex(6, 0).setEffectiveness(0.25);
  static readonly wither: Potion = new Potion(20, true, 3484199).setPotionName('potion.wither').setIconIndex(1, 2).setEffectiveness(0.25);
}

/** StringUtils.ticksToElapsedTime: "m:ss". */
export function ticksToElapsedTime(ticks: number): string {
  let s = Math.trunc(ticks / 20);
  const m = Math.trunc(s / 60);
  s %= 60;
  return s < 10 ? `${m}:0${s}` : `${m}:${s}`;
}

