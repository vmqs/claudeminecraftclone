import { GameSettings } from './GameSettings';

/** What the zoom key needs from the game. */
export interface ZoomClient {
  readonly gameSettings: GameSettings;
  readonly currentScreen: unknown;
  readonly theWorld: unknown;
}

/**
 * OptiFine's zoom key (not in vanilla 1.5.2): while the key is down and no screen is open the
 * field of view (the world's and the hand's) is a quarter of normal and the smooth camera (F8)
 * is on. Letting go restores the smooth camera setting from before and drops the eased mouse
 * movement, as OptiFine did by replacing the mouse filters.
 */
export class ZoomKey {
  /** Zooming this frame. */
  active = false;
  private smoothCameraBefore = false;

  constructor(
    private readonly mc: ZoomClient,
    private readonly onRelease: () => void,
  ) {}

  /** Follows the key once per frame, before the mouse turns the camera. */
  update(): boolean {
    const gs = this.mc.gameSettings;
    const down = this.mc.currentScreen === null && !!this.mc.theWorld && GameSettings.isKeyDown(gs.keyBindZoom);
    if (down && !this.active) {
      this.active = true;
      this.smoothCameraBefore = gs.smoothCamera;
      gs.smoothCamera = true;
    } else if (!down && this.active) {
      this.active = false;
      gs.smoothCamera = this.smoothCameraBefore;
      this.onRelease();
    }
    return this.active;
  }

  /** The field of view for this frame: divided by 4 while zooming. */
  apply(fov: number): number {
    return this.active ? Math.fround(fov / 4) : fov;
  }
}
