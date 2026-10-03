import { BlockIds } from '../block/BlockIds';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import { DamageSource } from './DamageSource';
import type { EntityLiving } from './EntityLiving';

/** One recorded hit (CombatEntry): source, time, health before, damage, where it happened, fall. */
interface CombatEntry {
  source: DamageSource;
  time: number;
  healthBefore: number;
  damage: number;
  /** "ladder", "vines", "water" or null (the fall's start). */
  location: string | null;
  fallDistance: number;
}

/** The translated name of the entity behind a source (null for blocks and the world). */
function attackerName(e: CombatEntry): string | null {
  const a = e.source.getEntity();
  return a ? a.getEntityName() : null;
}

/** How far the hit counted as a fall (the void counts as an endless fall). */
function fallOf(e: CombatEntry): number {
  return e.source === DamageSource.outOfWorld ? 3.4028234663852886e38 : e.fallDistance;
}

/**
 * The recent damage a living entity took (CombatTracker), kept until 100 ticks (300 after a
 * mob or player hit) pass without damage. It writes the death message: falls get the
 * "fell from a high place / off a ladder / doomed to fall / finished by" family, everything
 * else the last source's own message.
 */
export class CombatTracker {
  private readonly entries: CombatEntry[] = [];
  private lastDamageTime = 0;
  private inCombat = false;
  private takingDamage = false;
  private fallSuffix: string | null = null;

  constructor(private readonly fighter: EntityLiving) {}

  /** Where a fall would start from: a ladder, vines or water. */
  private calculateFallSuffix(): void {
    this.fallSuffix = null;
    const e = this.fighter;
    if (e.isOnLadder()) {
      const id = e.worldObj.getBlockId(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.boundingBox.minY), MathHelper.floor_double(e.posZ));
      if (id === BlockIds.ladder) this.fallSuffix = 'ladder';
      else if (id === BlockIds.vine) this.fallSuffix = 'vines';
    } else if (e.isInWater()) {
      this.fallSuffix = 'water';
    }
  }

  /** A hit of `damage` taken with `healthBefore` health. */
  trackDamage(src: DamageSource, healthBefore: number, damage: number): void {
    this.resetIfIdle();
    this.calculateFallSuffix();
    const entry: CombatEntry = { source: src, time: this.fighter.ticksExisted, healthBefore, damage, location: this.fallSuffix, fallDistance: this.fighter.fallDistance };
    this.entries.push(entry);
    this.lastDamageTime = this.fighter.ticksExisted;
    this.takingDamage = true;
    this.inCombat = this.inCombat || !!entry.source.getEntity()?.isLivingEntity;
  }

  getDeathMessage(): string {
    const name = this.fighter.getEntityName();
    if (this.entries.length === 0) return name + ' died';
    const fall = this.getBestFallEntry();
    const last = this.entries[this.entries.length - 1];
    const lastName = attackerName(last);
    const lastAttacker = last.source.getEntity();
    if (fall && last.source === DamageSource.fall) {
      const fallName = attackerName(fall);
      if (fall.source === DamageSource.fall || fall.source === DamageSource.outOfWorld) {
        return I18n.translateToLocalFormatted('death.fell.accident.' + (fall.location ?? 'generic'), name);
      }
      if (fallName !== null && (lastName === null || fallName !== lastName)) {
        const by = fall.source.getEntity();
        const held = by?.isLivingEntity ? (by as EntityLiving).getHeldItem() : null;
        if (held && held.hasDisplayName()) return I18n.translateToLocalFormatted('death.fell.assist.item', name, lastName, held.getDisplayName());
        return I18n.translateToLocalFormatted('death.fell.assist', name, fallName);
      }
      if (lastName !== null) {
        const held = lastAttacker?.isLivingEntity ? (lastAttacker as EntityLiving).getHeldItem() : null;
        if (held && held.hasDisplayName()) return I18n.translateToLocalFormatted('death.fell.finish.item', name, lastName, held.getDisplayName());
        return I18n.translateToLocalFormatted('death.fell.finish', name, lastName);
      }
      return I18n.translateToLocalFormatted('death.fell.killer', name);
    }
    return last.source.getDeathMessage(this.fighter);
  }

  /** Who did the most damage, a player if it dealt at least a third of the best (func_94550_c). */
  getBestAttacker(): EntityLiving | null {
    let living: EntityLiving | null = null;
    let player: EntityLiving | null = null;
    let livingDamage = 0;
    let playerDamage = 0;
    for (const e of this.entries) {
      const a = e.source.getEntity();
      if (a?.isPlayerEntity && (player === null || e.damage > playerDamage)) {
        playerDamage = e.damage;
        player = a as EntityLiving;
      }
      if (a?.isLivingEntity && (living === null || e.damage > livingDamage)) {
        livingDamage = e.damage;
        living = a as EntityLiving;
      }
    }
    return player !== null && playerDamage >= livingDamage / 3 ? player : living;
  }

  /** The hit that started the longest fall (or, failing that, the biggest hit with a location). */
  private getBestFallEntry(): CombatEntry | null {
    let fallEntry: CombatEntry | null = null;
    let located: CombatEntry | null = null;
    // Mirrors the original, whose "biggest located hit" threshold variable never grows past 0.
    const locatedDamage = 0;
    let longest = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const before = i > 0 ? this.entries[i - 1] : null;
      if ((e.source === DamageSource.fall || e.source === DamageSource.outOfWorld) && fallOf(e) > 0 && (fallEntry === null || fallOf(e) > longest)) {
        fallEntry = i > 0 ? before : e;
        longest = fallOf(e);
      }
      if (e.location !== null && (located === null || e.damage > locatedDamage)) located = e;
    }
    if (longest > 5 && fallEntry !== null) return fallEntry;
    return locatedDamage > 5 && located !== null ? located : null;
  }

  /** Forgets the fight after 100 ticks without damage (300 when a mob or player was involved). */
  private resetIfIdle(): void {
    const idle = this.inCombat ? 300 : 100;
    if (this.takingDamage && this.fighter.ticksExisted - this.lastDamageTime > idle) {
      this.entries.length = 0;
      this.takingDamage = false;
      this.inCombat = false;
    }
  }
}
