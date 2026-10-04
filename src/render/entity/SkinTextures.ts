import { PlayerSkins, type SkinnedPlayer } from '../../client/skin/PlayerSkins';
import { SKIN_HEIGHT, SKIN_WIDTH } from '../../client/skin/SkinImage';
import { GL } from '../gl/GL';
import type { TextureManager } from '../texture/TextureManager';

/** Deletes a texture, making sure the GL facade does not think it is still bound. */
export function deleteTexture(tex: WebGLTexture): void {
  const gl = GL.gl;
  gl.bindTexture(gl.TEXTURE_2D, null);
  GL.noteTextureBinding(null);
  gl.deleteTexture(tex);
}

/** One texture per skin array (RenderEngine's downloaded-image textures). */
const textures = new Map<Uint8Array, WebGLTexture>();

PlayerSkins.releaseListeners.push((rgba) => {
  const tex = textures.get(rgba);
  if (!tex) return;
  textures.delete(rgba);
  deleteTexture(tex);
});

/** The texture of a skin array, created on first use (64x32, NEAREST like every skin). */
export function getSkinTexture(engine: TextureManager, rgba: Uint8Array): WebGLTexture {
  let tex = textures.get(rgba);
  if (!tex) {
    tex = engine.allocateTexture(SKIN_WIDTH, SKIN_HEIGHT);
    engine.updateTexture(tex, rgba, SKIN_WIDTH, SKIN_HEIGHT);
    textures.set(rgba, tex);
  }
  return tex;
}

/**
 * Binds a skin, or `fallback` (the pack's /mob/char.png) for Steve: loadDownloadableImageTexture
 * / getTextureForDownloadableImage.
 */
export function bindSkin(engine: TextureManager | null, rgba: Uint8Array | null, fallback: string): void {
  if (!engine) return;
  if (rgba) GL.bindTexture(getSkinTexture(engine, rgba));
  else engine.bindTexture(fallback);
}

/** Binds the skin a player wears (RenderPlayer, the first-person arm, the inventory preview). */
export function bindPlayerSkin(engine: TextureManager | null, player: SkinnedPlayer & { getTexture(): string | null }): void {
  bindSkin(engine, PlayerSkins.skinFor(player), player.getTexture() ?? '/mob/char.png');
}
