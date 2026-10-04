import { toBipedSpace } from '../../client/model/ModelPose';
import { ALPHA_BLEND, PART_RIGHT_ARM, type PlayerModelData } from '../../client/model/PlayerModelFormat';
import { ATTR_JOINTS, ATTR_NORMAL, ATTR_POS, ATTR_UV, ATTR_WEIGHTS, GL, type DrawFlags } from '../gl/GL';

const STRIDE = 32;
const FLAGS: DrawFlags = { hasTexture: true, hasColor: false, hasNormals: true, hasBrightness: false };
/** Largest texture side uploaded (bigger pictures from other players are scaled down). */
const MAX_TEXTURE_SIDE = 2048;

interface Group {
  /** Byte offset into the index buffer. */
  offset: number;
  count: number;
  material: number;
}

/**
 * A custom player model on the GPU: one interleaved vertex buffer in biped space (position,
 * UV, normal, four part indices and weights), one index buffer holding the whole model followed
 * by the right arm's triangles (the first-person hand), and the textures (trilinear, repeating:
 * these are photographs, not 16-pixel art). Drawn with GL.drawSkinned.
 */
export class CustomModelMesh {
  private constructor(
    private readonly vao: WebGLVertexArrayObject,
    private readonly vbo: WebGLBuffer,
    private readonly ibo: WebGLBuffer,
    private readonly indexType: number,
    private readonly groups: Group[],
    private readonly armGroups: Group[],
    private readonly textures: (WebGLTexture | null)[],
    readonly data: PlayerModelData,
    /** Triangles drawn per model. */
    readonly triangles: number,
  ) {}

  private disposed = false;

  /** Whether any triangles belong to the right arm (the first-person hand). */
  get hasArm(): boolean {
    return this.armGroups.length > 0;
  }

  /** Uploads a model; resolves once its textures are decoded. */
  static async create(data: PlayerModelData): Promise<CustomModelMesh> {
    const textures = await Promise.all(data.textures.map((t) => decodeTexture(t.bytes, t.mime)));
    const gl = GL.gl;
    const vc = data.positions.length / 3;
    const buf = new ArrayBuffer(vc * STRIDE);
    const f32 = new Float32Array(buf);
    const u8 = new Uint8Array(buf);
    const i8 = new Int8Array(buf);
    for (let i = 0; i < vc; i++) {
      const b = toBipedSpace(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
      const o = i * 8;
      f32[o] = b[0];
      f32[o + 1] = b[1];
      f32[o + 2] = b[2];
      f32[o + 3] = data.uvs[i * 2];
      f32[o + 4] = data.uvs[i * 2 + 1];
      const ob = i * STRIDE;
      // Biped space flips y and z.
      i8[ob + 20] = data.normals[i * 3];
      i8[ob + 21] = -data.normals[i * 3 + 1];
      i8[ob + 22] = -data.normals[i * 3 + 2];
      for (let k = 0; k < 4; k++) {
        u8[ob + 24 + k] = data.joints[i * 4 + k];
        u8[ob + 28 + k] = data.weights[i * 4 + k];
      }
    }
    // The right arm alone: triangles mostly bound to it, per material.
    const armTris: number[][] = data.materials.map(() => []);
    const armWeight = (v: number): number => {
      let s = 0;
      for (let k = 0; k < 4; k++) if (data.joints[v * 4 + k] === PART_RIGHT_ARM) s += data.weights[v * 4 + k];
      return s;
    };
    for (const g of data.groups) {
      for (let j = g.start; j < g.start + g.count; j += 3) {
        const a = data.indices[j];
        const b = data.indices[j + 1];
        const c = data.indices[j + 2];
        if (armWeight(a) + armWeight(b) + armWeight(c) >= 3 * 160) armTris[g.material].push(a, b, c);
      }
    }
    const armCount = armTris.reduce((s, l) => s + l.length, 0);
    const wide = vc > 65535;
    const total = data.indices.length + armCount;
    const indices = wide ? new Uint32Array(total) : new Uint16Array(total);
    indices.set(data.indices);
    const bytesPer = wide ? 4 : 2;
    const groups: Group[] = data.groups.map((g) => ({ offset: g.start * bytesPer, count: g.count, material: g.material }));
    const armGroups: Group[] = [];
    let at = data.indices.length;
    armTris.forEach((list, material) => {
      if (!list.length) return;
      indices.set(list, at);
      armGroups.push({ offset: at * bytesPer, count: list.length, material });
      at += list.length;
    });
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.vertexAttribPointer(ATTR_POS, 3, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(ATTR_UV, 2, gl.FLOAT, false, STRIDE, 12);
    gl.vertexAttribPointer(ATTR_NORMAL, 3, gl.BYTE, true, STRIDE, 20);
    gl.vertexAttribPointer(ATTR_JOINTS, 4, gl.UNSIGNED_BYTE, false, STRIDE, 24);
    gl.vertexAttribPointer(ATTR_WEIGHTS, 4, gl.UNSIGNED_BYTE, true, STRIDE, 28);
    for (const a of [ATTR_POS, ATTR_UV, ATTR_NORMAL, ATTR_JOINTS, ATTR_WEIGHTS]) gl.enableVertexAttribArray(a);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return new CustomModelMesh(vao, vbo, ibo, wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, groups, armGroups, textures, data, data.indices.length / 3);
  }

  /**
   * Draws the model (or only the right arm) with the current matrices and state. Materials
   * multiply the current colour unless texturing is off (the red hurt flash draws a flat colour).
   */
  draw(bones: Float32Array, armOnly = false): void {
    if (this.disposed) return;
    const textured = GL.isEnabled(GL.TEXTURE_2D);
    const c = GL.colorValue;
    const r = c[0];
    const g = c[1];
    const b = c[2];
    const a = c[3];
    const blendWasOn = GL.isEnabled(GL.BLEND);
    let blending = false;
    const prevTex = GL.boundTexture;
    for (const grp of armOnly ? this.armGroups : this.groups) {
      const m = this.data.materials[grp.material];
      if (textured) {
        GL.color((r * m.color[0]) / 255, (g * m.color[1]) / 255, (b * m.color[2]) / 255, (a * m.color[3]) / 255);
        GL.bindTexture(m.texture >= 0 ? this.textures[m.texture] : null);
        if (m.alpha === ALPHA_BLEND && !blendWasOn && !blending) {
          GL.enable(GL.BLEND);
          GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
          GL.depthMask(false);
          blending = true;
        }
      }
      GL.drawSkinned(this.vao, this.indexType, grp.offset, grp.count, bones, FLAGS);
    }
    if (blending) {
      GL.disable(GL.BLEND);
      GL.depthMask(true);
    }
    GL.color(r, g, b, a);
    if (textured) GL.bindTexture(prevTex);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = GL.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ibo);
    gl.bindTexture(gl.TEXTURE_2D, null);
    GL.noteTextureBinding(null);
    for (const t of this.textures) if (t) gl.deleteTexture(t);
  }
}

/** Decodes an image file into a mipmapped texture (null when it cannot be read). */
async function decodeTexture(bytes: Uint8Array, mime: string): Promise<WebGLTexture | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    return null;
  }
  try {
    let source: TexImageSource = bmp;
    if (bmp.width > MAX_TEXTURE_SIDE || bmp.height > MAX_TEXTURE_SIDE) {
      const k = MAX_TEXTURE_SIDE / Math.max(bmp.width, bmp.height);
      const w = Math.max(1, Math.floor(bmp.width * k));
      const h = Math.max(1, Math.floor(bmp.height * k));
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      source = canvas;
    }
    const gl = GL.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    GL.noteTextureBinding(tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  } finally {
    bmp.close();
  }
}
