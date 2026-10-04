/**
 * LWJGL 2 Keyboard/Mouse emulation over DOM events: key codes, names, polled state and
 * the event queues the original drains with Keyboard.next() / Mouse.next().
 */

/** LWJGL key codes by name (Keyboard.KEY_*). */
export const Keys = {
  NONE: 0, ESCAPE: 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
  MINUS: 12, EQUALS: 13, BACK: 14, TAB: 15, Q: 16, W: 17, E: 18, R: 19, T: 20, Y: 21, U: 22, I: 23, O: 24, P: 25,
  LBRACKET: 26, RBRACKET: 27, RETURN: 28, LCONTROL: 29, A: 30, S: 31, D: 32, F: 33, G: 34, H: 35, J: 36, K: 37,
  L: 38, SEMICOLON: 39, APOSTROPHE: 40, GRAVE: 41, LSHIFT: 42, BACKSLASH: 43, Z: 44, X: 45, C: 46, V: 47, B: 48,
  N: 49, M: 50, COMMA: 51, PERIOD: 52, SLASH: 53, RSHIFT: 54, MULTIPLY: 55, LMENU: 56, SPACE: 57, CAPITAL: 58,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, NUMLOCK: 69, SCROLL: 70,
  NUMPAD7: 71, NUMPAD8: 72, NUMPAD9: 73, SUBTRACT: 74, NUMPAD4: 75, NUMPAD5: 76, NUMPAD6: 77, ADD: 78,
  NUMPAD1: 79, NUMPAD2: 80, NUMPAD3: 81, NUMPAD0: 82, DECIMAL: 83, F11: 87, F12: 88, NUMPADENTER: 156,
  RCONTROL: 157, DIVIDE: 181, RMENU: 184, PAUSE: 197, HOME: 199, UP: 200, PRIOR: 201, LEFT: 203, RIGHT: 205,
  END: 207, DOWN: 208, NEXT: 209, INSERT: 210, DELETE: 211, LMETA: 219, RMETA: 220,
} as const;

const keyNames: string[] = [];
for (const [name, code] of Object.entries(Keys)) keyNames[code] = name;

/** KeyboardEvent.code -> LWJGL key code. */
const codeMap: Record<string, number> = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10,
  Digit0: 11, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20,
  KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27, Enter: 28,
  ControlLeft: 29, KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38,
  Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43, KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47,
  KeyB: 48, KeyN: 49, KeyM: 50, Comma: 51, Period: 52, Slash: 53, ShiftRight: 54, NumpadMultiply: 55,
  AltLeft: 56, Space: 57, CapsLock: 58, F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67,
  F10: 68, NumLock: 69, ScrollLock: 70, Numpad7: 71, Numpad8: 72, Numpad9: 73, NumpadSubtract: 74, Numpad4: 75,
  Numpad5: 76, Numpad6: 77, NumpadAdd: 78, Numpad1: 79, Numpad2: 80, Numpad3: 81, Numpad0: 82,
  NumpadDecimal: 83, F11: 87, F12: 88, NumpadEnter: 156, ControlRight: 157, NumpadDivide: 181, AltRight: 184,
  Pause: 197, Home: 199, ArrowUp: 200, PageUp: 201, ArrowLeft: 203, ArrowRight: 205, End: 207, ArrowDown: 208,
  PageDown: 209, Insert: 210, Delete: 211, MetaLeft: 219, MetaRight: 220, IntlBackslash: 86,
};

export function keyCodeFromEvent(e: KeyboardEvent): number {
  return codeMap[e.code] ?? 0;
}

interface KeyEvent {
  key: number;
  state: boolean;
  char: string;
  repeat: boolean;
}

interface MouseEvent_ {
  button: number;
  state: boolean;
  dWheel: number;
  x: number;
  y: number;
}

export const Keyboard = {
  KEY_NONE: 0,
  down: new Uint8Array(256),
  queue: [] as KeyEvent[],
  current: null as KeyEvent | null,
  repeatEvents: false,

  getKeyName(code: number): string {
    return keyNames[code] ?? `KEY_${code}`;
  },
  isKeyDown(code: number): boolean {
    return code > 0 && code < 256 && this.down[code] === 1;
  },
  /** Advances to the next queued event (Keyboard.next). */
  next(): boolean {
    while (this.queue.length > 0) {
      const e = this.queue.shift()!;
      if (e.repeat && !this.repeatEvents) continue;
      this.current = e;
      return true;
    }
    this.current = null;
    return false;
  },
  getEventKey(): number {
    return this.current?.key ?? 0;
  },
  getEventKeyState(): boolean {
    return this.current?.state ?? false;
  },
  getEventCharacter(): string {
    return this.current?.char ?? '\0';
  },
  enableRepeatEvents(on: boolean): void {
    this.repeatEvents = on;
  },
  push(e: KeyEvent): void {
    if (e.key > 0 && e.key < 256 && !e.repeat) this.down[e.key] = e.state ? 1 : 0;
    this.queue.push(e);
    if (this.queue.length > 256) this.queue.shift();
  },
  releaseAll(): void {
    for (let i = 0; i < 256; i++) {
      if (this.down[i]) this.queue.push({ key: i, state: false, char: '\0', repeat: false });
      this.down[i] = 0;
    }
  },
};

export const Mouse = {
  buttons: new Uint8Array(8),
  queue: [] as MouseEvent_[],
  current: null as MouseEvent_ | null,
  /** Display-pixel position with LWJGL's bottom-left origin. */
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
  dWheel: 0,
  grabbed: false,

  isButtonDown(b: number): boolean {
    return b >= 0 && b < 8 && this.buttons[b] === 1;
  },
  getX(): number {
    return this.x;
  },
  getY(): number {
    return this.y;
  },
  /** Movement since the last call (Mouse.getDX); +y is up. */
  getDX(): number {
    const v = this.dx;
    this.dx = 0;
    return v;
  },
  getDY(): number {
    const v = this.dy;
    this.dy = 0;
    return v;
  },
  getDWheel(): number {
    const v = this.dWheel;
    this.dWheel = 0;
    return v;
  },
  next(): boolean {
    this.current = this.queue.shift() ?? null;
    return this.current !== null;
  },
  getEventButton(): number {
    return this.current?.button ?? -1;
  },
  getEventButtonState(): boolean {
    return this.current?.state ?? false;
  },
  getEventDWheel(): number {
    return this.current?.dWheel ?? 0;
  },
  getEventX(): number {
    return this.current?.x ?? this.x;
  },
  getEventY(): number {
    return this.current?.y ?? this.y;
  },
  push(e: MouseEvent_): void {
    if (e.button >= 0 && e.button < 8) this.buttons[e.button] = e.state ? 1 : 0;
    this.queue.push(e);
    if (this.queue.length > 256) this.queue.shift();
  },
  releaseAll(): void {
    for (let b = 0; b < 8; b++) if (this.buttons[b]) this.push({ button: b, state: false, dWheel: 0, x: this.x, y: this.y });
  },
};

/** DOM mouse button -> LWJGL button (0 left, 1 right, 2 middle). */
export function lwjglButton(domButton: number): number {
  return domButton === 0 ? 0 : domButton === 2 ? 1 : domButton === 1 ? 2 : domButton;
}
