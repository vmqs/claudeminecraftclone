import { I18n } from '../core/I18n';
import type { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';

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

  static causeMobDamage(e: Entity): DamageSource {
    return new EntityDamageSource('mob', e);
  }
  static causePlayerDamage(e: Entity): DamageSource {
    return new EntityDamageSource('player', e);
  }
  /** An arrow hit; the shooter (or the arrow when shot by nobody) gets the blame. */
  static causeArrowDamage(arrow: Entity, shooter: Entity | null): DamageSource {
    return new EntityDamageSourceIndirect('arrow', arrow, shooter).setProjectile();
  }
  /** A fireball hit: "fireball" when it has a shooter, otherwise plain "onFire". */
  static causeFireballDamage(fireball: Entity, shooter: Entity | null): DamageSource {
    return shooter === null
      ? new EntityDamageSourceIndirect('onFire', fireball, fireball).setFireDamage().setProjectile()
      : new EntityDamageSourceIndirect('fireball', fireball, shooter).setFireDamage().setProjectile();
  }
  /** Snowballs, eggs, ender pearls. */
  static causeThrownDamage(thrown: Entity, thrower: Entity | null): DamageSource {
    return new EntityDamageSourceIndirect('thrown', thrown, thrower).setProjectile();
  }
  /** Splash potions of harming. */
  static causeIndirectMagicDamage(potion: Entity, thrower: Entity | null): DamageSource {
    return new EntityDamageSourceIndirect('indirectMagic', potion, thrower).setDamageBypassesArmor().setMagicDamage();
  }
  static causeThornsDamage(e: Entity): DamageSource {
    return new EntityDamageSource('thorns', e).setMagicDamage();
  }
  /** "explosion.player" naming whoever set it off, or a plain "explosion". */
  static setExplosionSource(explosion: { getExplosivePlacedBy(): Entity | null } | null): DamageSource {
    const by = explosion?.getExplosivePlacedBy() ?? null;
    return by !== null ? new EntityDamageSource('explosion.player', by).setDifficultyScaled().setExplosion() : new DamageSource('explosion').setDifficultyScaled().setExplosion();
  }

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
  /** "death.attack.<type>", or "<type>.player" naming the last attacker when that key exists. */
  getDeathMessage(victim: EntityLiving): string {
    const attacker = victim.getLastAttacker();
    const key = 'death.attack.' + this.damageType;
    if (attacker && I18n.canTranslate(key + '.player')) return I18n.translateToLocalFormatted(key + '.player', victim.getEntityName(), attacker.getEntityName());
    return I18n.translateToLocalFormatted(key, victim.getEntityName());
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
  override getDeathMessage(victim: EntityLiving): string {
    const held = this.source.isLivingEntity ? (this.source as EntityLiving).getHeldItem() : null;
    const key = 'death.attack.' + this.damageType;
    if (held?.hasDisplayName() && I18n.canTranslate(key + '.item')) return I18n.translateToLocalFormatted(key + '.item', victim.getEntityName(), this.source.getEntityName(), held.getDisplayName());
    return I18n.translateToLocalFormatted(key, victim.getEntityName(), this.source.getEntityName());
  }
  /** Scaled by difficulty when a mob (not a player) dealt it. */
  override isDifficultyScaled(): boolean {
    return this.source.isLivingEntity && !this.source.isPlayerEntity;
  }
}

/**
 * Damage dealt through another entity (EntityDamageSourceIndirect): an arrow, fireball or thrown
 * item is the source, its shooter the one to blame.
 */
export class EntityDamageSourceIndirect extends EntityDamageSource {
  constructor(
    type: string,
    direct: Entity,
    private readonly indirectEntity: Entity | null,
  ) {
    super(type, direct);
  }
  override getSourceOfDamage(): Entity | null {
    return this.source;
  }
  override getEntity(): Entity | null {
    return this.indirectEntity;
  }
  override getDeathMessage(victim: EntityLiving): string {
    const blamed = (this.indirectEntity ?? this.source).getEntityName();
    const held = this.indirectEntity?.isLivingEntity ? (this.indirectEntity as EntityLiving).getHeldItem() : null;
    const key = 'death.attack.' + this.damageType;
    if (held?.hasDisplayName() && I18n.canTranslate(key + '.item')) return I18n.translateToLocalFormatted(key + '.item', victim.getEntityName(), blamed, held.getDisplayName());
    return I18n.translateToLocalFormatted(key, victim.getEntityName(), blamed);
  }
}
