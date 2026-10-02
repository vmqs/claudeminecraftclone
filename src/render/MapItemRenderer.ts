import { MapColor } from '../block/Material';
import type { MapData } from '../item/ItemMap';
import { GL } from './gl/GL';
import { Tessellator } from './gl/Tessellator';
import type { TextureManager } from './texture/TextureManager';

const f = Math.fround;

/**
 * Draws a filled map's 128x128 pixels and its markers (MapItemRenderer): empty pixels are a
 * faint dark checkerboard, the others the map colour at one of three shades (180, 220, 255).
 */
export class MapItemRenderer {
  private readonly pixels = new Uint8Array(128 * 128 * 4);
  private texture: WebGLTexture | null = null;

  constructor(private readonly anaglyph: () => boolean) {}

  renderMap(engine: TextureManager, data: MapData): void {
    const px = this.pixels;
    for (let i = 0; i < 16384; i++) {
      const c = data.colors[i];
      const o = i * 4;
      if (c >> 2 === 0) {
        // Transparent black; blended with GL_ONE so only the alpha darkens.
        px[o] = px[o + 1] = px[o + 2] = 0;
        px[o + 3] = (((i + (i >> 7)) & 1) * 8 + 16) & 255;
        continue;
      }
      const rgb = MapColor.mapColorArray[c >> 2]?.colorValue ?? 0;
      const shade = (c & 3) === 2 ? 255 : (c & 3) === 0 ? 180 : 220;
      let r = Math.trunc((((rgb >> 16) & 255) * shade) / 255);
      let g = Math.trunc((((rgb >> 8) & 255) * shade) / 255);
      let b = Math.trunc(((rgb & 255) * shade) / 255);
      if (this.anaglyph()) {
        const ar = Math.trunc((r * 30 + g * 59 + b * 11) / 100);
        const ag = Math.trunc((r * 30 + g * 70) / 100);
        const ab = Math.trunc((r * 30 + b * 70) / 100);
        r = ar;
        g = ag;
        b = ab;
      }
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
    this.texture ??= engine.allocateTexture(128, 128);
    engine.updateTexture(this.texture, px, 128, 128);
    const t = Tessellator.instance;
    GL.bindTexture(this.texture);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.ONE, GL.ONE_MINUS_SRC_ALPHA);
    GL.disable(GL.ALPHA_TEST);
    const z = f(-0.01);
    t.startDrawingQuads();
    t.addVertexWithUV(0, 128, z, 0, 1);
    t.addVertexWithUV(128, 128, z, 1, 1);
    t.addVertexWithUV(128, 0, z, 1, 0);
    t.addVertexWithUV(0, 0, z, 0, 0);
    t.draw();
    GL.enable(GL.ALPHA_TEST);
    GL.disable(GL.BLEND);
    engine.bindTexture('/misc/mapicons.png');
    let n = 0;
    for (const m of data.playersVisibleOnMap.values()) {
      GL.pushMatrix();
      GL.translate(f(f(m.centerX / 2) + 64), f(f(m.centerZ / 2) + 64), f(-0.02));
      GL.rotate(f((m.iconRotation * 360) / 16), 0, 0, 1);
      GL.scale(4, 4, 3);
      GL.translate(f(-0.125), f(0.125), 0);
      const u0 = f((m.iconSize % 4) / 4);
      const v0 = f(Math.trunc(m.iconSize / 4) / 4);
      const u1 = f(((m.iconSize % 4) + 1) / 4);
      const v1 = f((Math.trunc(m.iconSize / 4) + 1) / 4);
      const mz = f(n * f(0.001));
      t.startDrawingQuads();
      t.addVertexWithUV(-1, 1, mz, u0, v0);
      t.addVertexWithUV(1, 1, mz, u1, v0);
      t.addVertexWithUV(1, -1, mz, u1, v1);
      t.addVertexWithUV(-1, -1, mz, u0, v1);
      t.draw();
      GL.popMatrix();
      n++;
    }
  }
}
