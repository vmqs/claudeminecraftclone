import { Mouse } from './Keyboard';

/** MouseHelper: grabs the cursor with Pointer Lock and reports per-frame movement. */
export class MouseHelper {
  deltaX = 0;
  deltaY = 0;
  /** Called when the browser refuses the lock (no user gesture, or unsupported). */
  onGrabFailed: (() => void) | null = null;
  private lockPending = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    document.addEventListener('pointerlockchange', () => {
      this.lockPending = false;
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockPending = false;
      if (!this.isLocked) this.onGrabFailed?.();
    });
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Asks for Pointer Lock unless it is held or already requested. */
  requestLock(): void {
    if (this.isLocked || this.lockPending) return;
    this.lockPending = true;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') {
        r.catch(() => {
          this.lockPending = false;
          if (!this.isLocked) this.onGrabFailed?.();
        });
      }
    } catch {
      this.lockPending = false;
      this.onGrabFailed?.();
    }
  }

  grabMouseCursor(): void {
    Mouse.grabbed = true;
    Mouse.getDX();
    Mouse.getDY();
    this.deltaX = 0;
    this.deltaY = 0;
    this.requestLock();
  }

  ungrabMouseCursor(): void {
    Mouse.grabbed = false;
    Mouse.x = Math.trunc(this.canvas.width / 2);
    Mouse.y = Math.trunc(this.canvas.height / 2);
    if (this.isLocked) document.exitPointerLock();
  }

  mouseXYChange(): void {
    this.deltaX = Mouse.getDX();
    this.deltaY = Mouse.getDY();
  }
}
