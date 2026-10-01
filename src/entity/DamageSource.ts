import type { Entity } from './Entity';

/** DamageSource with the static sources of 1.5.2 used by blocks and the world. */
export class DamageSource {
  private isUnblockable = false;
  private isDamageAllowedInCreativeMode = false;
  private hungerDamage = 0.3;
  private fireDamage = false;
  private projectile = false;
  private difficultyScaled = false;
  private magicDamage = false;
  private explosion = false;

  constructor(readonly damageType: string) {}

  static inFire = new DamageSource('inFire').setFireDamage();
  static onFire = new DamageSource('onFire').setDamageBypassesArmor().setFireDamage();
  static lava = new DamageSource('lava').setFireDamage();
  static inWall = new DamageSource('inWall').setDamageBypassesArmor();
  static drown = new DamageSource('drown').setDamageBypassesArmor();
  static starve = new DamageSource('starve').setDamageBypassesArmor();
  static cactus = new DamageSource('cactus');
  static fall = new DamageSource('fall').setDamageBypassesArmor();
  static outOfWorld = new DamageSource('outOfWorld').setDamageBypassesArmor().setDamageAllowedInCreativeMode();
  static generic = new DamageSource('generic').setDamageBypassesArmor();
  static magic = new DamageSource('magic').setDamageBypassesArmor().setMagicDamage();
  static wither = new DamageSource('wither').setDamageBypassesArmor();
  static anvil = new DamageSource('anvil');
  static fallingBlock = new DamageSource('fallingBlock');

  setDamageBypassesArmor(): this {
    this.isUnblockable = true;
    this.hungerDamage = 0;
    return this;
  }
  setDamageAllowedInCreativeMode(): this {
    this.isDamageAllowedInCreativeMode = true;
    return this;
  }
  setFireDamage(): this {
    this.fireDamage = true;
    return this;
  }
  setProjectile(): this {
    this.projectile = true;
    return this;
  }
  setExplosion(): this {
    this.explosion = true;
    return this;
  }
  setDifficultyScaled(): this {
    this.difficultyScaled = true;
    return this;
  }
  setMagicDamage(): this {
    this.magicDamage = true;
    return this;
  }
  isUnblockableDamage(): boolean {
    return this.isUnblockable;
  }
  canHarmInCreative(): boolean {
    return this.isDamageAllowedInCreativeMode;
  }
  getHungerDamage(): number {
    return this.hungerDamage;
  }
  isFireDamage(): boolean {
    return this.fireDamage;
  }
  isProjectile(): boolean {
    return this.projectile;
  }
  isExplosion(): boolean {
    return this.explosion;
  }
  isDifficultyScaled(): boolean {
    return this.difficultyScaled;
  }
  isMagicDamage(): boolean {
    return this.magicDamage;
  }
  /** The attacking entity, if any (EntityDamageSource overrides). */
  getEntity(): Entity | null {
    return null;
  }
  getSourceOfDamage(): Entity | null {
    return this.getEntity();
  }
  getDamageType(): string {
    return this.damageType;
  }
}

/** Damage caused directly by an entity (mob / player attacks). */
export class EntityDamageSource extends DamageSource {
  constructor(
    type: string,
    protected readonly source: Entity,
  ) {
    super(type);
  }
  override getEntity(): Entity | null {
    return this.source;
  }
  static causeMobDamage(e: Entity): DamageSource {
    return new EntityDamageSource('mob', e);
  }
  static causePlayerDamage(e: Entity): DamageSource {
    return new EntityDamageSource('player', e);
  }
}
