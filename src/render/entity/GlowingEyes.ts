import { GL } from '../gl/GL';
import { OpenGlHelper } from '../OpenGlHelper';

/**
 * The lighting of the spider and enderman eye layers. The original passes the lightmap
 * coordinates (0xF0F0, 0): the block-light coordinate lands far past the 16x16 lightmap, and
 * its GL_CLAMP wrap with linear filtering blends the last texel half and half with the black
 * border, so the eyes glow at half the full-block-light colour (row sky 0) in any light.
 * WebGL only clamps to the edge texel, so the same value comes from that texel (240, 0) drawn
 * at half colour.
 */
export function applyGlowingEyesLight(): void {
  OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, 240, 0);
  GL.color(0.5, 0.5, 0.5, 1);
}
