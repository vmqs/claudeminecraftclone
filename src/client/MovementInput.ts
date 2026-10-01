import type { GameSettings } from './GameSettings';

export class MovementInput {
  moveStrafe = 0;
  moveForward = 0;
  jump = false;
  sneak = false;

  updatePlayerMoveState(): void {}
}

/** Keyboard-driven movement: WASD, jump and sneak (sneaking scales input by 0.3). */
export class MovementInputFromOptions extends MovementInput {
  constructor(private readonly gameSettings: GameSettings) {
    super();
  }

  override updatePlayerMoveState(): void {
    const s = this.gameSettings;
    this.moveStrafe = 0;
    this.moveForward = 0;
    if (s.keyBindForward.pressed) this.moveForward++;
    if (s.keyBindBack.pressed) this.moveForward--;
    if (s.keyBindLeft.pressed) this.moveStrafe++;
    if (s.keyBindRight.pressed) this.moveStrafe--;
    this.jump = s.keyBindJump.pressed;
    this.sneak = s.keyBindSneak.pressed;
    if (this.sneak) {
      this.moveStrafe = Math.fround(this.moveStrafe * 0.3);
      this.moveForward = Math.fround(this.moveForward * 0.3);
    }
  }
}
