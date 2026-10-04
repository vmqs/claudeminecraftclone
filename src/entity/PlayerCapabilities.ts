const f = Math.fround;

/** Abilities granted by the game mode (Creative: invulnerable, may fly, instant build). */
export class PlayerCapabilities {
  disableDamage = false;
  isFlying = false;
  allowFlying = false;
  isCreativeMode = false;
  allowEdit = true;
  private flySpeed = f(0.05);
  private walkSpeed = f(0.1);

  getFlySpeed(): number {
    return this.flySpeed;
  }
  setFlySpeed(v: number): void {
    this.flySpeed = f(v);
  }
  getWalkSpeed(): number {
    return this.walkSpeed;
  }
  setPlayerWalkSpeed(v: number): void {
    this.walkSpeed = f(v);
  }

  /** EnumGameType.CREATIVE.configurePlayerCapabilities. */
  setCreative(): void {
    this.allowFlying = true;
    this.isCreativeMode = true;
    this.disableDamage = true;
  }
}
