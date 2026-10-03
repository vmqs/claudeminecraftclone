import type { EntityLiving } from '../EntityLiving';

/** Requests a jump for the next movement update (EntityJumpHelper). */
export class EntityJumpHelper {
  private isJumping = false;

  constructor(private readonly entity: EntityLiving) {}

  setJumping(): void {
    this.isJumping = true;
  }

  doJump(): void {
    this.entity.setJumping(this.isJumping);
    this.isJumping = false;
  }
}
