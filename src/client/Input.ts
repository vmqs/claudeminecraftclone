import { GuiScreen } from '../gui/GuiScreen';
import { Keyboard, keyCodeFromEvent, lwjglButton, Mouse } from './Keyboard';

/** What the DOM input layer needs from the game. */
export interface InputHost {
  readonly canvas: HTMLCanvasElement;
  /** In game with no screen open: clicks should grab the mouse right away. */
  wantsPointerLock(): boolean;
  /** Requests Pointer Lock (called from inside the click's event handler). */
  requestPointerLock(): void;
  onPointerLockGained(): void;
  onPointerLockLost(): void;
}

/** Keys whose browser default (help, find, reload, focus moves, scrolling...) is suppressed. */
function shouldSuppress(e: KeyboardEvent): boolean {
  if (e.code === 'F12') return false;
  if ((e.ctrlKey || e.metaKey) && !/^F\d+$/.test(e.code)) return false;
  return true;
}

/**
 * Character for Keyboard.getEventCharacter (LWJGL style: '\0' for keys without one). Ctrl
 * (or Cmd) with a letter gives the control character LWJGL reports (Ctrl+A = 0x01, ...).
 */
function eventChar(e: KeyboardEvent): string {
  if ((e.ctrlKey || e.metaKey) && /^[a-z]$/i.test(e.key)) return String.fromCharCode(e.key.toUpperCase().charCodeAt(0) & 0x1f);
  if (e.key.length === 1) return e.key;
  switch (e.key) {
    case 'Enter':
      return '\r';
    case 'Backspace':
      return '\b';
    case 'Tab':
      return '\t';
    case 'Escape':
      return '\x1b';
    default:
      return '\0';
  }
}

/**
 * Feeds DOM keyboard, mouse, wheel and pointer-lock events into the LWJGL-style Keyboard
 * and Mouse queues that Minecraft.runTick drains.
 */
export function installInput(host: InputHost): void {
  const canvas = host.canvas;
  const toDisplay = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(1, r.width);
    const sy = canvas.height / Math.max(1, r.height);
    Mouse.x = Math.trunc((clientX - r.left) * sx);
    Mouse.y = canvas.height - 1 - Math.trunc((clientY - r.top) * sy);
  };

  window.addEventListener('keydown', (e) => {
    const key = keyCodeFromEvent(e);
    if (shouldSuppress(e)) e.preventDefault();
    let char = eventChar(e);
    // The clipboard text only arrives with the paste event that follows: Ctrl+V is typed then.
    if (char === '\x16') char = '\0';
    Keyboard.push({ key, state: true, char, repeat: e.repeat });
  });
  window.addEventListener('keyup', (e) => {
    const key = keyCodeFromEvent(e);
    if (shouldSuppress(e)) e.preventDefault();
    Keyboard.push({ key, state: false, char: '\0', repeat: false });
  });
  window.addEventListener('paste', (e) => {
    GuiScreen.clipboard = e.clipboardData?.getData('text/plain') ?? '';
    Keyboard.push({ key: 0, state: true, char: '\x16', repeat: false });
    Keyboard.push({ key: 0, state: false, char: '\0', repeat: false });
  });

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    canvas.focus();
    toDisplay(e.clientX, e.clientY);
    if (host.wantsPointerLock()) host.requestPointerLock();
    Mouse.push({ button: lwjglButton(e.button), state: true, dWheel: 0, x: Mouse.x, y: Mouse.y });
  });
  window.addEventListener('mouseup', (e) => {
    if (document.pointerLockElement !== canvas) toDisplay(e.clientX, e.clientY);
    const b = lwjglButton(e.button);
    if (!Mouse.isButtonDown(b)) return;
    Mouse.push({ button: b, state: false, dWheel: 0, x: Mouse.x, y: Mouse.y });
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      Mouse.dx += e.movementX;
      Mouse.dy -= e.movementY;
    } else {
      const px = Mouse.x;
      const py = Mouse.y;
      toDisplay(e.clientX, e.clientY);
      Mouse.dx += Mouse.x - px;
      Mouse.dy += Mouse.y - py;
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const d = e.deltaY < 0 ? 120 : -120;
      Mouse.dWheel += d;
      Mouse.push({ button: -1, state: false, dWheel: d, x: Mouse.x, y: Mouse.y });
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) host.onPointerLockGained();
    else host.onPointerLockLost();
  });
  window.addEventListener('blur', () => {
    Keyboard.releaseAll();
    Mouse.releaseAll();
  });
}
