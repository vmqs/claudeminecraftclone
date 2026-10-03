import { GuiAccountManager } from '../gui/GuiAccountManager';
import { BootSplash } from './BootSplash';
import type { Minecraft } from './Minecraft';
import { PlayerSkins } from './skin/PlayerSkins';
import { readSkinDataUrl, readSkinFile, saveSkin, skinToDataUrl } from './skin/SkinFiles';
import { SKIN_HEIGHT, SKIN_WIDTH } from './skin/SkinImage';

/**
 * Account helpers on `window.mc.dev.account` (scripts/scenarios/account.json, scripts/mp-test.mjs):
 * upload a skin the way the Account Manager's button does, make a recognisable test skin, set
 * another player's skin, and read the account's state.
 */
export class AccountDevTools {
  constructor(private readonly mc: Minecraft) {}

  /**
   * A test skin as a PNG data URL: a red shirt, blue trousers, a yellow face and a green hat
   * brim, at `width` x `height` (64x32 or 64x64 are skins; anything else tests the refusal).
   */
  testSkinDataUrl(width = 64, height = 32, hue = 0): string {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    const fill = (color: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    const shift = (h: number) => `hsl(${(h + hue) % 360} 80% 50%)`;
    fill('#e8c090', 0, 0, 32, 16); // head
    fill('#202020', 8, 0, 16, 8); // hair on top
    fill('#3070ff', 9, 11, 2, 1); // eyes
    fill('#3070ff', 13, 11, 2, 1);
    fill('#a04030', 10, 14, 4, 1); // mouth
    fill(shift(120), 32, 8, 32, 2); // hat brim band (second layer)
    fill(shift(0), 16, 16, 24, 16); // body
    fill(shift(0), 40, 16, 16, 16); // arms
    fill('#e8c090', 44, 28, 8, 4); // hands
    fill(shift(220), 0, 16, 16, 16); // legs
    fill('#402010', 0, 28, 16, 4); // shoes
    if (height === 64) fill('#ffffff', 0, 32, 64, 32); // a 64x64 skin's lower half (unused in 1.5.2)
    return c.toDataURL('image/png');
  }

  /**
   * Uploads a PNG data URL as if chosen in Upload Skin... (through the open Account Manager when
   * there is one, so its message shows). Resolves with the result.
   */
  async uploadSkin(dataUrl: string): Promise<{ ok: boolean; error?: string }> {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new Blob([bytes], { type: 'image/png' });
    const screen = this.mc.currentScreen;
    if (screen instanceof GuiAccountManager) {
      const ok = await screen.useSkinFile(file);
      return ok ? { ok } : { ok, error: 'refused' };
    }
    const r = await readSkinFile(file);
    if (!r.ok) return { ok: false, error: r.error };
    PlayerSkins.setLocal(r.rgba);
    saveSkin(PlayerSkins.local);
    return { ok: true };
  }

  /** Another player's skin by name (what MC|Skin from the host does), or null for Steve. */
  async setRemoteSkin(name: string, dataUrl: string | null): Promise<boolean> {
    if (!dataUrl) {
      PlayerSkins.setRemote(name, null);
      return true;
    }
    const r = await readSkinDataUrl(dataUrl);
    if (r.ok) PlayerSkins.setRemote(name, r.rgba);
    return r.ok;
  }

  /** The account as the game sees it. */
  state(): Record<string, unknown> {
    const local = PlayerSkins.local;
    return {
      username: this.mc.username,
      playerName: this.mc.thePlayer?.username ?? null,
      skin: local ? `${SKIN_WIDTH}x${SKIN_HEIGHT}` : 'steve',
      skinVersion: PlayerSkins.localVersion,
      savedSkin: (() => {
        try {
          return localStorage.getItem('mc152.skin') !== null;
        } catch {
          return false;
        }
      })(),
      remoteSkins: PlayerSkins.remoteNames(),
      splash: BootSplash.shownIndex + 1,
    };
  }

  /** The local skin as a data URL (null for Steve). */
  skinDataUrl(): string | null {
    return PlayerSkins.local ? skinToDataUrl(PlayerSkins.local) : null;
  }
}
