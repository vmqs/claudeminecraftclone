import type { GameSettings } from './GameSettings';

export class MovementInput {
  moveStrafe = 0;
  moveForward = 0;
  jump = false;
  sneak = false;
  /** The sprint key asks to sprint (held, or toggled on). Not in 1.5.2, where only double-tapping forward sprints. */
  sprint = false;

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
    let presses = 0;
    while (s.keyBindSprint.isPressed()) presses++;
    if (s.toggleSprint) {
      if (presses & 1) s.sprintToggledOn = !s.sprintToggledOn;
      this.sprint = s.sprintToggledOn;
    } else {
      this.sprint = s.keyBindSprint.pressed;
    }
    if (this.sneak) {
      this.moveStrafe = Math.fround(this.moveStrafe * 0.3);
      this.moveForward = Math.fround(this.moveForward * 0.3);
    }
  }
}
