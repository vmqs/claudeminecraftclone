import { GL } from './gl/GL';

/** Texture unit indices as used by the original (GL_TEXTURE0 / GL_TEXTURE1). */
export const OpenGlHelper = {
  defaultTexUnit: 0,
  lightmapTexUnit: 1,

  setActiveTexture(unit: number): void {
    GL.activeTexture(unit);
  },

  /** Sets the lightmap coordinate for draws without per-vertex brightness (values 0..240). */
  setLightmapTextureCoords(_unit: number, u: number, v: number): void {
    GL.setLightmapTextureCoords(u, v);
  },
};
