/**
 * Immediate-mode vertex builder with the original Tessellator API.
 *
 * This module is worker-safe: it only accumulates vertices. On the main thread
 * `Tessellator.drawHandler` is set by the GL facade so `draw()` renders; the mesher
 * worker reads the raw buffer instead.
 *
 * Vertex layout (32 bytes, as in 1.5.2): xyz f32, uv f32, rgba u8, normal s8x3+pad,
 * lightmap s16x2 (brightness & 0xFFFF, brightness >> 16).
 */
export interface TessDrawFlags {
  hasTexture: boolean;
  hasColor: boolean;
  hasNormals: boolean;
  hasBrightness: boolean;
}

export type TessDrawHandler = (mode: number, data: ArrayBuffer, vertexCount: number, flags: TessDrawFlags) => void;

const QUADS = 7;

export class Tessellator {
  static readonly instance = new Tessellator(1 << 16);
  /** Installed by the main thread (GL facade); null in workers. */
  static drawHandler: TessDrawHandler | null = null;

  private buffer: ArrayBuffer;
  private f32: Float32Array;
  private u32: Uint32Array;
  private capacity: number; // vertices

  vertexCount = 0;
  private textureU = 0;
  private textureV = 0;
  private brightness = 0;
  private color = 0;
  private normal = 0;
  hasColor = false;
  hasTexture = false;
  hasBrightness = false;
  hasNormals = false;
  private isColorDisabled = false;
  drawMode = QUADS;
  isDrawing = false;
  xOffset = 0;
  yOffset = 0;
  zOffset = 0;

  constructor(initialVertices = 4096) {
    this.capacity = initialVertices;
    this.buffer = new ArrayBuffer(initialVertices * 32);
    this.f32 = new Float32Array(this.buffer);
    this.u32 = new Uint32Array(this.buffer);
  }

  private grow(): void {
    const nb = new ArrayBuffer(this.buffer.byteLength * 2);
    new Uint8Array(nb).set(new Uint8Array(this.buffer));
    this.buffer = nb;
    this.f32 = new Float32Array(nb);
    this.u32 = new Uint32Array(nb);
    this.capacity *= 2;
  }

  /** Raw access for the mesher (valid until the next reset). */
  getRawFloat32(): Float32Array {
    return this.f32;
  }
  getRawUint32(): Uint32Array {
    return this.u32;
  }

  draw(): number {
    if (!this.isDrawing) throw new Error('Not tesselating!');
    this.isDrawing = false;
    const bytes = this.vertexCount * 32;
    if (this.vertexCount > 0 && Tessellator.drawHandler) {
      Tessellator.drawHandler(this.drawMode, this.buffer, this.vertexCount, {
        hasTexture: this.hasTexture,
        hasColor: this.hasColor,
        hasNormals: this.hasNormals,
        hasBrightness: this.hasBrightness,
      });
    }
    this.reset();
    return bytes;
  }

  reset(): void {
    this.vertexCount = 0;
  }

  startDrawingQuads(): void {
    this.startDrawing(QUADS);
  }

  startDrawing(mode: number): void {
    if (this.isDrawing) throw new Error('Already tesselating!');
    this.isDrawing = true;
    this.reset();
    this.drawMode = mode;
    this.hasNormals = false;
    this.hasColor = false;
    this.hasTexture = false;
    this.hasBrightness = false;
    this.isColorDisabled = false;
  }

  setTextureUV(u: number, v: number): void {
    this.hasTexture = true;
    this.textureU = u;
    this.textureV = v;
  }

  setBrightness(b: number): void {
    this.hasBrightness = true;
    this.brightness = b;
  }

  setColorOpaque_F(r: number, g: number, b: number): void {
    this.setColorOpaque((r * 255) | 0, (g * 255) | 0, (b * 255) | 0);
  }

  setColorRGBA_F(r: number, g: number, b: number, a: number): void {
    this.setColorRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, (a * 255) | 0);
  }

  setColorOpaque(r: number, g: number, b: number): void {
    this.setColorRGBA(r, g, b, 255);
  }

  setColorRGBA(r: number, g: number, b: number, a: number): void {
    if (this.isColorDisabled) return;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    a = a > 255 ? 255 : a < 0 ? 0 : a;
    this.hasColor = true;
    this.color = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  setColorOpaque_I(rgb: number): void {
    this.setColorOpaque((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
  }

  setColorRGBA_I(rgb: number, alpha: number): void {
    this.setColorRGBA((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, alpha);
  }

  disableColor(): void {
    this.isColorDisabled = true;
  }

  setNormal(x: number, y: number, z: number): void {
    this.hasNormals = true;
    const bx = ((x * 127) | 0) & 255;
    const by = ((y * 127) | 0) & 255;
    const bz = ((z * 127) | 0) & 255;
    this.normal = bx | (by << 8) | (bz << 16);
  }

  setTranslation(x: number, y: number, z: number): void {
    this.xOffset = x;
    this.yOffset = y;
    this.zOffset = z;
  }

  addTranslation(x: number, y: number, z: number): void {
    this.xOffset += x;
    this.yOffset += y;
    this.zOffset += z;
  }

  addVertexWithUV(x: number, y: number, z: number, u: number, v: number): void {
    this.hasTexture = true;
    this.textureU = u;
    this.textureV = v;
    this.addVertex(x, y, z);
  }

  addVertex(x: number, y: number, z: number): void {
    if (this.vertexCount >= this.capacity) this.grow();
    const i = this.vertexCount * 8;
    const f = this.f32;
    const u = this.u32;
    f[i] = x + this.xOffset;
    f[i + 1] = y + this.yOffset;
    f[i + 2] = z + this.zOffset;
    if (this.hasTexture) {
      f[i + 3] = this.textureU;
      f[i + 4] = this.textureV;
    }
    if (this.hasColor) u[i + 5] = this.color;
    if (this.hasNormals) u[i + 6] = this.normal;
    if (this.hasBrightness) {
      // Two int16: low 16 bits = block light coordinate, high 16 bits = sky light coordinate.
      u[i + 7] = this.brightness >>> 0;
    }
    this.vertexCount++;
  }
}
