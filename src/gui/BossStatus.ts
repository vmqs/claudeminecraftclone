/**
 * The boss bar the HUD draws (BossStatus). The Ender Dragon and Wither renderers call
 * setBossStatus every frame they render the boss; the bar shows for 100 frames after that.
 */
export const BossStatus = {
  healthScale: 0,
  statusBarLength: 0,
  bossName: null as string | null,
  hasColorModifier: false,

  setBossStatus(boss: { getMaxHealth(): number; getBossHealth?(): number; getHealth(): number; getEntityName(): string }, colorModifier: boolean): void {
    const health = boss.getBossHealth ? boss.getBossHealth() : boss.getHealth();
    this.healthScale = Math.fround(health / boss.getMaxHealth());
    this.statusBarLength = 100;
    this.bossName = boss.getEntityName();
    this.hasColorModifier = colorModifier;
  },
};
