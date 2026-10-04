import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

/** What the swell task drives (EntityCreeper). */
export interface SwellingCreeper extends EntityLiving {
  getCreeperState(): number;
  setCreeperState(state: number): void;
}

/**
 * Creeper fuse control (EntityAICreeperSwell): starts when the attack target is within 3
 * blocks (or the fuse is already burning), stops moving, and keeps the fuse lit while the
 * target stays visible within 7 blocks.
 */
export class EntityAICreeperSwell extends EntityAIBase {
  private creeperAttackTarget: EntityLiving | null = null;

  constructor(private readonly swellingCreeper: SwellingCreeper) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const t = this.swellingCreeper.getAttackTarget();
    return this.swellingCreeper.getCreeperState() > 0 || (t !== null && this.swellingCreeper.getDistanceSqToEntity(t) < 9);
  }

  override startExecuting(): void {
    this.swellingCreeper.getNavigator().clearPathEntity();
    this.creeperAttackTarget = this.swellingCreeper.getAttackTarget();
  }

  override resetTask(): void {
    this.creeperAttackTarget = null;
  }

  override updateTask(): void {
    const c = this.swellingCreeper;
    const t = this.creeperAttackTarget;
    // A target who switched to Creative is no reason to keep the fuse burning.
    if (!t || t.isCreativeInvulnerable() || c.getDistanceSqToEntity(t) > 49 || !c.getEntitySenses().canSee(t)) c.setCreeperState(-1);
    else c.setCreeperState(1);
  }
}
