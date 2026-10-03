/** KeyBinding: a named key (LWJGL code, or button - 100 for mouse buttons) with press counting. */
export class KeyBinding {
  static readonly keybindArray: KeyBinding[] = [];
  static readonly hash = new Map<number, KeyBinding>();
  pressed = false;
  pressTime = 0;
  /** The code the binding starts with ("Reset Keys" goes back to it). */
  readonly keyCodeDefault: number;

  constructor(
    readonly keyDescription: string,
    public keyCode: number,
  ) {
    this.keyCodeDefault = keyCode;
    KeyBinding.keybindArray.push(this);
    KeyBinding.hash.set(keyCode, this);
  }

  static onTick(code: number): void {
    const k = KeyBinding.hash.get(code);
    if (k) k.pressTime++;
  }

  static setKeyBindState(code: number, down: boolean): void {
    const k = KeyBinding.hash.get(code);
    if (k) k.pressed = down;
  }

  static unPressAllKeys(): void {
    for (const k of KeyBinding.keybindArray) {
      k.pressTime = 0;
      k.pressed = false;
    }
  }

  static resetKeyBindingArrayAndHash(): void {
    KeyBinding.hash.clear();
    for (const k of KeyBinding.keybindArray) KeyBinding.hash.set(k.keyCode, k);
  }

  isPressed(): boolean {
    if (this.pressTime === 0) return false;
    this.pressTime--;
    return true;
  }
}
