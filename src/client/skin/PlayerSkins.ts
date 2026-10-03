import { processSkin, sameSkin, SKIN_BYTES } from './SkinImage';

/** The part of a player the skin lookup needs. */
export interface SkinnedPlayer {
  readonly username: string;
}

/**
 * Which skin each player wears (1.5.2's skinUrl, which named a skin server image per username).
 * The local player's own skin comes from the Account Manager; other players' skins arrive over
 * the network and are kept by name. A player without a skin wears the texture pack's Steve
 * (`/mob/char.png`). Skins are processed 64x32 RGBA arrays; the renderer turns each array into a
 * texture and drops it when the array is released. No DOM here: the network code and tests use it.
 */
export class PlayerSkinRegistry {
  private localSkin: Uint8Array | null = null;
  private readonly remote = new Map<string, Uint8Array>();
  /** Bumped whenever the local skin changes (the network sends it again). */
  localVersion = 0;
  /** The player the user controls (set by Minecraft): it wears the local skin. */
  localPlayer: () => object | null = () => null;
  /** Called with arrays that are no longer used (their textures can be freed). */
  readonly releaseListeners: ((rgba: Uint8Array) => void)[] = [];
  /** Called after the local skin changed. */
  readonly localListeners: (() => void)[] = [];

  /** The user's own skin, or null for Steve. */
  get local(): Uint8Array | null {
    return this.localSkin;
  }

  /** Sets the user's own skin (any valid 64x32 RGBA; it is processed like a downloaded skin). */
  setLocal(rgba: Uint8Array | null): void {
    const next = rgba ? processSkin(rgba) : null;
    if (sameSkin(next, this.localSkin)) return;
    const old = this.localSkin;
    this.localSkin = next;
    this.localVersion++;
    if (old) this.release(old);
    for (const l of this.localListeners) l();
  }

  /** Another player's skin by name (null: back to Steve). Invalid data is ignored. */
  setRemote(name: string, rgba: Uint8Array | null): void {
    const old = this.remote.get(name) ?? null;
    if (rgba && rgba.length !== SKIN_BYTES) return;
    const next = rgba ? processSkin(rgba) : null;
    if (sameSkin(next, old)) return;
    if (next) this.remote.set(name, next);
    else this.remote.delete(name);
    if (old) this.release(old);
  }

  getRemote(name: string): Uint8Array | null {
    return this.remote.get(name) ?? null;
  }

  /** Names with a known skin (debugging and tests). */
  remoteNames(): string[] {
    return [...this.remote.keys()];
  }

  /** Forgets every other player's skin (leaving a multiplayer game). */
  clearRemote(): void {
    const all = [...this.remote.values()];
    this.remote.clear();
    for (const s of all) this.release(s);
  }

  /** The skin `player` wears, or null for the default Steve texture. */
  skinFor(player: SkinnedPlayer): Uint8Array | null {
    if (player === this.localPlayer()) return this.localSkin;
    return this.remote.get(player.username) ?? null;
  }

  private release(rgba: Uint8Array): void {
    for (const l of this.releaseListeners) l(rgba);
  }
}

export const PlayerSkins = new PlayerSkinRegistry();
