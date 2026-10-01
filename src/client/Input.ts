import { GuiScreen } from '../gui/GuiScreen';
import { Keyboard, keyCodeFromEvent, lwjglButton, Mouse } from './Keyboard';

/** What the DOM input layer needs from the game. */
export interface InputHost {
  readonly canvas: HTMLCanvasElement;
  /** In game with no screen open: clicks should grab the mouse right away. */
  wantsPointerLock(): boolean;
  onPointerLockLost(): void;
}

/** Keys whose browser default (help, find, reload, focus moves, scrolling...) is suppressed. */
function shouldSuppress(e: KeyboardEvent): boolean {
  if (e.code === 'F12') return false;
  if ((e.ctrlKey || e.metaKey) && !/^F\d+$/.test(e.code)) return false;
  return true;
}

/** Character for Keyboard.getEventCharacter (LWJGL style: '\0' for keys without one). */
function eventChar(e: KeyboardEvent): string {
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
    Keyboard.push({ key, state: true, char: eventChar(e), repeat: e.repeat });
  });
  window.addEventListener('keyup', (e) => {
    const key = keyCodeFromEvent(e);
    if (shouldSuppress(e)) e.preventDefault();
    Keyboard.push({ key, state: false, char: '\0', repeat: false });
  });
  window.addEventListener('paste', (e) => {
    GuiScreen.clipboard = e.clipboardData?.getData('text/plain') ?? '';
  });

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    canvas.focus();
    toDisplay(e.clientX, e.clientY);
    if (host.wantsPointerLock() && document.pointerLockElement !== canvas) {
      try {
        const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (r && typeof r.catch === 'function') r.catch(() => undefined);
      } catch {
        // The game retries from setIngameFocus.
      }
    }
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
    if (document.pointerLockElement !== canvas) host.onPointerLockLost();
  });
  window.addEventListener('blur', () => {
    Keyboard.releaseAll();
    Mouse.releaseAll();
  });
}
