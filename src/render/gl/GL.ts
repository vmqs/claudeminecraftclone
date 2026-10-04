import { MatrixStack, mat4Invert, type Mat4 } from './MatrixStack';
import { compileProgram, FRAG_SRC, VERT_SRC } from './Shader';

/**
 * Fixed-function OpenGL 1.x emulation on WebGL2 (GL11 + GLU + the bits of OpenGlHelper
 * the original used). Method and constant names follow GL11 without the `gl`/`GL_`
 * prefixes, so `GL11.glEnable(GL11.GL_BLEND)` ports to `GL.enable(GL.BLEND)`.
 *
 * State is mirrored in JS and pushed to WebGL lazily when something is drawn.
 */

// Attribute locations shared by every vertex format.
export const ATTR_POS = 0;
export const ATTR_UV = 1;
export const ATTR_COLOR = 2;
export const ATTR_NORMAL = 3;
export const ATTR_LIGHT = 4;
/** Bone indices and weights of skinned meshes (custom player models). */
export const ATTR_JOINTS = 5;
export const ATTR_WEIGHTS = 6;
/** Bone matrices a skinned draw can use. */
export const MAX_BONES = 8;

interface Uniforms {
  proj: WebGLUniformLocation;
  mv: WebGLUniformLocation;
  texMat: WebGLUniformLocation;
  posScale: WebGLUniformLocation;
  lighting: WebGLUniformLocation;
  light0: WebGLUniformLocation;
  light1: WebGLUniformLocation;
  normalMat: WebGLUniformLocation;
  tex: WebGLUniformLocation;
  lightmap: WebGLUniformLocation;
  useTex: WebGLUniformLocation;
  useLightmap: WebGLUniformLocation;
  alphaRef: WebGLUniformLocation;
  fogMode: WebGLUniformLocation;
  fogParams: WebGLUniformLocation;
  fogColor: WebGLUniformLocation;
  skinning: WebGLUniformLocation;
  bones: WebGLUniformLocation;
}

/** Bytes per vertex of the Tessellator's dynamic format (same layout as the original). */
export const DYNAMIC_STRIDE = 32;
/** Bytes per vertex of the compact static terrain format. */
export const TERRAIN_STRIDE = 16;
/** Terrain positions are int16 in 1/1024 block units relative to the section origin. */
export const TERRAIN_POS_SCALE = 1 / 1024;

/** A recorded glNewList/glEndList block: static VBOs replayed with the current state. */
export class DisplayList {
  draws: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; mode: number; count: number; flags: DrawFlags }[] = [];
}

/** One uploaded terrain mesh (a section's pass). */
export interface TerrainMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  vertexCount: number;
}

export interface DrawFlags {
  hasTexture: boolean;
  hasColor: boolean;
  hasNormals: boolean;
  hasBrightness: boolean;
}

/** Whether a cached Float32 vector equals the first three values of `v` as Float32. */
function sameVec3(cached: Float32Array, v: ArrayLike<number>): boolean {
  return cached[0] === Math.fround(v[0]) && cached[1] === Math.fround(v[1]) && cached[2] === Math.fround(v[2]);
}

class GLFacade {
  // ---- GL11 constants (same numeric values as OpenGL / WebGL) ----
  readonly ZERO = 0;
  readonly ONE = 1;
  readonly SRC_COLOR = 768;
  readonly ONE_MINUS_SRC_COLOR = 769;
  readonly SRC_ALPHA = 770;
  readonly ONE_MINUS_SRC_ALPHA = 771;
  readonly DST_ALPHA = 772;
  readonly ONE_MINUS_DST_ALPHA = 773;
  readonly DST_COLOR = 774;
  readonly ONE_MINUS_DST_COLOR = 775;

  readonly NEVER = 512;
  readonly LESS = 513;
  readonly EQUAL = 514;
  readonly LEQUAL = 515;
  readonly GREATER = 516;
  readonly NOTEQUAL = 517;
  readonly GEQUAL = 518;
  readonly ALWAYS = 519;

  readonly POINTS = 0;
  readonly LINES = 1;
  readonly LINE_LOOP = 2;
  readonly LINE_STRIP = 3;
  readonly TRIANGLES = 4;
  readonly TRIANGLE_STRIP = 5;
  readonly TRIANGLE_FAN = 6;
  readonly QUADS = 7;

  readonly BLEND = 3042;
  readonly DEPTH_TEST = 2929;
  readonly CULL_FACE = 2884;
  readonly ALPHA_TEST = 3008;
  readonly FOG = 2912;
  readonly LIGHTING = 2896;
  readonly LIGHT0 = 16384;
  readonly LIGHT1 = 16385;
  readonly TEXTURE_2D = 3553;
  readonly COLOR_MATERIAL = 2903;
  readonly NORMALIZE = 2977;
  readonly RESCALE_NORMAL = 32826;
  readonly POLYGON_OFFSET_FILL = 32823;
  /** Pseudo-capability: TEXTURE_2D on the lightmap unit (OpenGlHelper.lightmapTexUnit). */
  readonly LIGHTMAP = 0x10001;

  readonly FRONT = 1028;
  readonly BACK = 1029;
  readonly FRONT_AND_BACK = 1032;

  readonly MODELVIEW = 5888;
  readonly PROJECTION = 5889;
  readonly TEXTURE = 5890;

  readonly LINEAR = 9729;
  readonly EXP = 2048;
  readonly SMOOTH = 7425;
  readonly FLAT = 7424;

  readonly COLOR_BUFFER_BIT = 16384;
  readonly DEPTH_BUFFER_BIT = 256;

  gl!: WebGL2RenderingContext;
  canvas!: HTMLCanvasElement;
  /** Device pixels per CSS pixel; line widths are scaled by it. */
  pixelRatio = 1;

  readonly modelview = new MatrixStack(64);
  readonly projection = new MatrixStack(16);
  readonly texture0 = new MatrixStack(8);
  private current: MatrixStack = this.modelview;

  // Capability mirror.
  private blend = false;
  private depthTest = false;
  private cull = false;
  private alphaTest = false;
  private fog = false;
  private lighting = false;
  private texture2D = true;
  private lightmapEnabled = false;
  private polyOffsetFill = false;

  private blendSrc = 1;
  private blendDst = 0;
  private depthMaskValue = true;
  private depthFuncValue = 513;
  private alphaRef = 0.1;
  private cullFaceMode = 1029;
  private colorMaskValue: [boolean, boolean, boolean, boolean] = [true, true, true, true];
  private lineWidthValue = 1;
  private polyFactor = 0;
  private polyUnits = 0;

  /** Current glColor. */
  readonly colorValue = new Float32Array([1, 1, 1, 1]);
  /** Current glNormal. */
  readonly normalValue = new Float32Array([0, 0, 1]);
  /** Current lightmap coordinates (OpenGlHelper.setLightmapTextureCoords). */
  readonly lightCoord = new Float32Array([240, 240]);

  private fogMode = 9729;
  private fogStart = 0;
  private fogEnd = 1;
  private fogDensity = 1;
  readonly fogColor = new Float32Array([0, 0, 0]);

  /** Light directions (already in eye space). */
  readonly light0 = new Float32Array([0, 1, 0]);
  readonly light1 = new Float32Array([0, 1, 0]);

  private boundTex0: WebGLTexture | null = null;
  private boundTex1: WebGLTexture | null = null;
  private activeUnit = 0;

  private program!: WebGLProgram;
  private u!: Uniforms;
  private dynVao!: WebGLVertexArrayObject;
  private dynVbo!: WebGLBuffer;
  private dynVboSize = 0;
  private quadIndexBuffer!: WebGLBuffer;
  private quadIndexCapacity = 0; // in quads
  private whiteTex!: WebGLTexture;
  private lineScratch = new Float32Array(0);

  // Uniform caches.
  private lastProjVersion = -1;
  private lastMvKey = '';
  private normalMat = new Float32Array(9);
  private tmpInv = new Float64Array(16) as Mat4;
  private f32mat = new Float32Array(16);

  /** Counters for the F3 screen / profiling. */
  drawCalls = 0;

  init(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: new URLSearchParams(location.search).has('preserve'),
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.canvas = canvas;
    this.program = compileProgram(gl, VERT_SRC, FRAG_SRC);
    const loc = (n: string) => gl.getUniformLocation(this.program, n)!;
    this.u = {
      proj: loc('u_proj'),
      mv: loc('u_mv'),
      texMat: loc('u_texMat'),
      posScale: loc('u_posScale'),
      lighting: loc('u_lighting'),
      light0: loc('u_light0'),
      light1: loc('u_light1'),
      normalMat: loc('u_normalMat'),
      tex: loc('u_tex'),
      lightmap: loc('u_lightmap'),
      useTex: loc('u_useTex'),
      useLightmap: loc('u_useLightmap'),
      alphaRef: loc('u_alphaRef'),
      fogMode: loc('u_fogMode'),
      fogParams: loc('u_fogParams'),
      fogColor: loc('u_fogColor'),
      skinning: loc('u_skinning'),
      bones: loc('u_bones'),
    };
    gl.useProgram(this.program);
    gl.uniform1i(this.u.tex, 0);
    gl.uniform1i(this.u.lightmap, 1);

    this.dynVao = gl.createVertexArray()!;
    this.dynVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.dynVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVbo);
    gl.vertexAttribPointer(ATTR_POS, 3, gl.FLOAT, false, DYNAMIC_STRIDE, 0);
    gl.vertexAttribPointer(ATTR_UV, 2, gl.FLOAT, false, DYNAMIC_STRIDE, 12);
    gl.vertexAttribPointer(ATTR_COLOR, 4, gl.UNSIGNED_BYTE, true, DYNAMIC_STRIDE, 20);
    gl.vertexAttribPointer(ATTR_NORMAL, 3, gl.BYTE, true, DYNAMIC_STRIDE, 24);
    gl.vertexAttribPointer(ATTR_LIGHT, 2, gl.SHORT, false, DYNAMIC_STRIDE, 28);
    gl.enableVertexAttribArray(ATTR_POS);
    this.quadIndexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
    this.ensureQuadIndices(16384);
    gl.bindVertexArray(null);

    this.whiteTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.depthTest = true;
    this.depthFuncValue = gl.LEQUAL;
    gl.cullFace(gl.BACK);
    gl.blendFunc(gl.ONE, gl.ZERO);
  }

  // ------------------------------------------------------------------ matrices

  matrixMode(mode: number): void {
    this.current = mode === this.PROJECTION ? this.projection : mode === this.TEXTURE ? this.texture0 : this.modelview;
  }
  pushMatrix(): void {
    this.current.push();
  }
  popMatrix(): void {
    this.current.pop();
  }
  loadIdentity(): void {
    this.current.loadIdentity();
  }
  translate(x: number, y: number, z: number): void {
    this.current.translate(x, y, z);
  }
  rotate(angle: number, x: number, y: number, z: number): void {
    this.current.rotate(angle, x, y, z);
  }
  scale(x: number, y: number, z: number): void {
    this.current.scale(x, y, z);
  }
  multMatrix(m: Mat4): void {
    this.current.multMatrix(m);
  }
  loadMatrix(m: ArrayLike<number>): void {
    this.current.load(m);
  }
  ortho(l: number, r: number, b: number, t: number, n: number, f: number): void {
    this.current.ortho(l, r, b, t, n, f);
  }
  /** GLU.gluPerspective */
  perspective(fovy: number, aspect: number, near: number, far: number): void {
    this.current.perspective(fovy, aspect, near, far);
  }

  // ------------------------------------------------------------------ capabilities

  enable(cap: number): void {
    this.setCap(cap, true);
  }
  disable(cap: number): void {
    this.setCap(cap, false);
  }
  isEnabled(cap: number): boolean {
    switch (cap) {
      case this.BLEND:
        return this.blend;
      case this.DEPTH_TEST:
        return this.depthTest;
      case this.CULL_FACE:
        return this.cull;
      case this.ALPHA_TEST:
        return this.alphaTest;
      case this.FOG:
        return this.fog;
      case this.LIGHTING:
        return this.lighting;
      case this.TEXTURE_2D:
        return this.activeUnit === 0 ? this.texture2D : this.lightmapEnabled;
      case this.LIGHTMAP:
        return this.lightmapEnabled;
      case this.POLYGON_OFFSET_FILL:
        return this.polyOffsetFill;
      default:
        return false;
    }
  }

  private setCap(cap: number, on: boolean): void {
    const gl = this.gl;
    switch (cap) {
      case this.BLEND:
        if (this.blend !== on) on ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
        this.blend = on;
        break;
      case this.DEPTH_TEST:
        if (this.depthTest !== on) on ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
        this.depthTest = on;
        break;
      case this.CULL_FACE:
        if (this.cull !== on) on ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
        this.cull = on;
        break;
      case this.POLYGON_OFFSET_FILL:
        if (this.polyOffsetFill !== on) on ? gl.enable(gl.POLYGON_OFFSET_FILL) : gl.disable(gl.POLYGON_OFFSET_FILL);
        this.polyOffsetFill = on;
        break;
      case this.ALPHA_TEST:
        this.alphaTest = on;
        break;
      case this.FOG:
        this.fog = on;
        break;
      case this.LIGHTING:
        this.lighting = on;
        break;
      case this.TEXTURE_2D:
        if (this.activeUnit === 0) this.texture2D = on;
        else this.lightmapEnabled = on;
        break;
      case this.LIGHTMAP:
        this.lightmapEnabled = on;
        break;
      default:
        // COLOR_MATERIAL, NORMALIZE, RESCALE_NORMAL, LIGHT0/1 are implied by the shader.
        break;
    }
  }

  blendFunc(src: number, dst: number): void {
    if (src !== this.blendSrc || dst !== this.blendDst) {
      this.gl.blendFunc(src, dst);
      this.blendSrc = src;
      this.blendDst = dst;
    }
  }

  depthMask(flag: boolean): void {
    if (flag !== this.depthMaskValue) {
      this.gl.depthMask(flag);
      this.depthMaskValue = flag;
    }
  }

  depthFunc(func: number): void {
    if (func !== this.depthFuncValue) {
      this.gl.depthFunc(func);
      this.depthFuncValue = func;
    }
  }

  /** Only GL_GREATER is used by the original. */
  alphaFunc(_func: number, ref: number): void {
    this.alphaRef = ref;
  }

  cullFace(mode: number): void {
    if (mode !== this.cullFaceMode) {
      this.gl.cullFace(mode);
      this.cullFaceMode = mode;
    }
  }

  colorMask(r: boolean, g: boolean, b: boolean, a: boolean): void {
    const m = this.colorMaskValue;
    if (m[0] !== r || m[1] !== g || m[2] !== b || m[3] !== a) {
      this.gl.colorMask(r, g, b, a);
      this.colorMaskValue = [r, g, b, a];
    }
  }

  polygonOffset(factor: number, units: number): void {
    if (factor !== this.polyFactor || units !== this.polyUnits) {
      this.gl.polygonOffset(factor, units);
      this.polyFactor = factor;
      this.polyUnits = units;
    }
  }

  lineWidth(w: number): void {
    this.lineWidthValue = w;
  }

  shadeModel(_mode: number): void {
    // Smooth shading is always on in WebGL; flat shading is never needed by the ported code.
  }

  color(r: number, g: number, b: number, a = 1): void {
    const c = this.colorValue;
    c[0] = r;
    c[1] = g;
    c[2] = b;
    c[3] = a;
  }

  normal(x: number, y: number, z: number): void {
    const n = this.normalValue;
    n[0] = x;
    n[1] = y;
    n[2] = z;
  }

  clearColor(r: number, g: number, b: number, a: number): void {
    this.gl.clearColor(r, g, b, a);
  }

  clear(mask: number): void {
    // Clearing ignores the colour/depth masks in WebGL just like GL; make sure depth writes are on.
    const gl = this.gl;
    if (mask & this.DEPTH_BUFFER_BIT && !this.depthMaskValue) gl.depthMask(true);
    gl.clear(mask);
    if (mask & this.DEPTH_BUFFER_BIT && !this.depthMaskValue) gl.depthMask(false);
  }

  viewport(x: number, y: number, w: number, h: number): void {
    this.gl.viewport(x, y, w, h);
  }

  // ------------------------------------------------------------------ fog

  fogi(mode: number): void {
    this.fogMode = mode;
  }
  fogStartEnd(start: number, end: number): void {
    this.fogStart = start;
    this.fogEnd = end;
  }
  setFogStart(v: number): void {
    this.fogStart = v;
  }
  setFogEnd(v: number): void {
    this.fogEnd = v;
  }
  setFogDensity(d: number): void {
    this.fogDensity = d;
  }
  setFogColor(r: number, g: number, b: number): void {
    this.fogColor[0] = r;
    this.fogColor[1] = g;
    this.fogColor[2] = b;
  }

  // ------------------------------------------------------------------ textures

  /** glActiveTexture: 0 = default unit, 1 = lightmap unit. */
  activeTexture(unit: number): void {
    this.activeUnit = unit;
  }

  bindTexture(tex: WebGLTexture | null): void {
    const gl = this.gl;
    if (this.activeUnit === 0) {
      if (tex !== this.boundTex0) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        this.boundTex0 = tex;
      }
    } else if (tex !== this.boundTex1) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.activeTexture(gl.TEXTURE0);
      this.boundTex1 = tex;
    }
  }

  get boundTexture(): WebGLTexture | null {
    return this.boundTex0;
  }

  /** Tells the facade that something else bound a texture on unit 0 (e.g. a texture upload). */
  noteTextureBinding(tex: WebGLTexture | null): void {
    this.boundTex0 = tex;
  }

  /**
   * glCopyTexSubImage2D into the texture bound on unit 0, from the framebuffer's lower-left
   * corner. The default framebuffer has no alpha, so the texture is (re)specified as RGB.
   */
  copyFramebufferToTexture(w: number, h: number): void {
    const gl = this.gl;
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, w, h, 0);
  }

  /** OpenGlHelper.setLightmapTextureCoords(lightmapTexUnit, u, v) */
  setLightmapTextureCoords(u: number, v: number): void {
    this.lightCoord[0] = u;
    this.lightCoord[1] = v;
  }

  setLights(l0: ArrayLike<number>, l1: ArrayLike<number>): void {
    this.light0.set(l0);
    this.light1.set(l1);
  }

  // ------------------------------------------------------------------ drawing

  private ensureQuadIndices(quads: number): void {
    if (quads <= this.quadIndexCapacity) return;
    let cap = Math.max(this.quadIndexCapacity, 1024);
    while (cap < quads) cap *= 2;
    const idx = new Uint32Array(cap * 6);
    // Split along the v1-v3 diagonal, as Mesa (the reference captures' GL) decomposes GL_QUADS so
    // the last vertex stays the provoking one: it decides how colours, smooth light and per-vertex
    // fog interpolate across a quad.
    for (let q = 0, v = 0, i = 0; q < cap; q++, v += 4) {
      idx[i++] = v;
      idx[i++] = v + 1;
      idx[i++] = v + 3;
      idx[i++] = v + 1;
      idx[i++] = v + 2;
      idx[i++] = v + 3;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadIndexCapacity = cap;
  }

  /** The shared quad -> triangle index buffer (bind it inside a VAO that draws quads). */
  getQuadIndexBuffer(quads: number): WebGLBuffer {
    // Bind a null VAO first so the element binding change doesn't leak into a user VAO.
    this.gl.bindVertexArray(null);
    this.ensureQuadIndices(quads);
    return this.quadIndexBuffer;
  }

  /**
   * Pushes matrices, capabilities and uniforms for a draw. There is one program, so a uniform
   * keeps its value until it is set again: values equal to the last ones sent are skipped
   * (matrices by their stack's version), which leaves most draws with a few GL calls.
   */
  applyState(posScale: number, hasTexture: boolean, skinning = false): void {
    const gl = this.gl;
    const u = this.u;
    const c = this.sent;
    if (!c.program) {
      gl.useProgram(this.program);
      c.program = true;
    }
    if (skinning !== c.skinning) {
      gl.uniform1i(u.skinning, skinning ? 1 : 0);
      c.skinning = skinning;
    }
    if (this.projection.version !== this.lastProjVersion) {
      this.f32mat.set(this.projection.top);
      gl.uniformMatrix4fv(u.proj, false, this.f32mat);
      this.lastProjVersion = this.projection.version;
    }
    if (this.modelview.version !== c.mvVersion) {
      this.f32mat.set(this.modelview.top);
      gl.uniformMatrix4fv(u.mv, false, this.f32mat);
      c.mvVersion = this.modelview.version;
    }
    if (this.texture0.version !== c.texVersion) {
      this.f32mat.set(this.texture0.top);
      gl.uniformMatrix4fv(u.texMat, false, this.f32mat);
      c.texVersion = this.texture0.version;
    }
    if (posScale !== c.posScale) {
      gl.uniform1f(u.posScale, posScale);
      c.posScale = posScale;
    }
    const lighting = this.lighting ? 1 : 0;
    if (lighting !== c.lighting) {
      gl.uniform1i(u.lighting, lighting);
      c.lighting = lighting;
    }
    if (this.lighting) {
      if (!sameVec3(c.light0, this.light0)) {
        gl.uniform3fv(u.light0, this.light0);
        c.light0.set(this.light0);
      }
      if (!sameVec3(c.light1, this.light1)) {
        gl.uniform3fv(u.light1, this.light1);
        c.light1.set(this.light1);
      }
    }
    if (this.lighting && this.modelview.version !== c.normalVersion) {
      c.normalVersion = this.modelview.version;
      const inv = mat4Invert(this.tmpInv, this.modelview.top);
      const n = this.normalMat;
      if (inv) {
        // Normal matrix = transpose(inverse(mv)) upper 3x3.
        n[0] = inv[0];
        n[1] = inv[4];
        n[2] = inv[8];
        n[3] = inv[1];
        n[4] = inv[5];
        n[5] = inv[9];
        n[6] = inv[2];
        n[7] = inv[6];
        n[8] = inv[10];
      }
      gl.uniformMatrix3fv(u.normalMat, false, n);
    }
    const useTex = this.texture2D && hasTexture !== false ? 1 : 0;
    if (useTex !== c.useTex) {
      gl.uniform1i(u.useTex, useTex);
      c.useTex = useTex;
    }
    if (this.texture2D && !this.boundTex0) gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    const useLightmap = this.lightmapEnabled ? 1 : 0;
    if (useLightmap !== c.useLightmap) {
      gl.uniform1i(u.useLightmap, useLightmap);
      c.useLightmap = useLightmap;
    }
    const alphaRef = this.alphaTest ? this.alphaRef : -1;
    if (alphaRef !== c.alphaRef) {
      gl.uniform1f(u.alphaRef, alphaRef);
      c.alphaRef = alphaRef;
    }
    const fogMode = this.fog ? (this.fogMode === this.EXP ? 2 : 1) : 0;
    if (fogMode !== c.fogMode) {
      gl.uniform1i(u.fogMode, fogMode);
      c.fogMode = fogMode;
    }
    if (this.fog) {
      if (this.fogStart !== c.fogStart || this.fogEnd !== c.fogEnd || this.fogDensity !== c.fogDensity) {
        gl.uniform3f(u.fogParams, this.fogStart, this.fogEnd, this.fogDensity);
        c.fogStart = this.fogStart;
        c.fogEnd = this.fogEnd;
        c.fogDensity = this.fogDensity;
      }
      if (!sameVec3(c.fogColor, this.fogColor)) {
        gl.uniform3fv(u.fogColor, this.fogColor);
        c.fogColor.set(this.fogColor);
      }
    }
  }

  /** The uniform values last sent to the program (see applyState). */
  private readonly sent = {
    program: false,
    skinning: false,
    mvVersion: -1,
    texVersion: -1,
    normalVersion: -1,
    posScale: Number.NaN,
    lighting: -1,
    light0: new Float32Array([Number.NaN, 0, 0]),
    light1: new Float32Array([Number.NaN, 0, 0]),
    useTex: -1,
    useLightmap: -1,
    alphaRef: Number.NaN,
    fogMode: -1,
    fogStart: Number.NaN,
    fogEnd: Number.NaN,
    fogDensity: Number.NaN,
    fogColor: new Float32Array([Number.NaN, 0, 0]),
  };

  /** Sets the constant attribute values used when an attribute array is disabled. */
  applyConstantAttribs(flags: DrawFlags): void {
    const gl = this.gl;
    if (!flags.hasColor) gl.vertexAttrib4fv(ATTR_COLOR, this.colorValue);
    if (!flags.hasNormals) gl.vertexAttrib3fv(ATTR_NORMAL, this.normalValue);
    if (!flags.hasBrightness) gl.vertexAttrib2fv(ATTR_LIGHT, this.lightCoord);
    if (!flags.hasTexture) gl.vertexAttrib2f(ATTR_UV, 0, 0);
  }

  /**
   * Draws vertices in the Tessellator's 32-byte format. `data` is a view over
   * `vertexCount * 32` bytes.
   */
  drawDynamic(mode: number, data: ArrayBuffer, vertexCount: number, flags: DrawFlags): void {
    if (vertexCount === 0) return;
    if (this.recording) {
      this.recordDraw(mode, data, vertexCount, flags);
      return;
    }
    if ((mode === this.LINES || mode === this.LINE_STRIP || mode === this.LINE_LOOP) && this.lineWidthValue * this.pixelRatio > 1.5) {
      this.drawWideLines(mode, data, vertexCount, flags);
      return;
    }
    const gl = this.gl;
    this.applyState(1, flags.hasTexture);
    gl.bindVertexArray(this.dynVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVbo);
    const bytes = vertexCount * DYNAMIC_STRIDE;
    if (bytes > this.dynVboSize) {
      this.dynVboSize = Math.max(bytes, this.dynVboSize * 2, 65536);
      gl.bufferData(gl.ARRAY_BUFFER, this.dynVboSize, gl.STREAM_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(data, 0, bytes));
    const toggle = (loc: number, on: boolean) => (on ? gl.enableVertexAttribArray(loc) : gl.disableVertexAttribArray(loc));
    toggle(ATTR_UV, flags.hasTexture);
    toggle(ATTR_COLOR, flags.hasColor);
    toggle(ATTR_NORMAL, flags.hasNormals);
    toggle(ATTR_LIGHT, flags.hasBrightness);
    this.applyConstantAttribs(flags);
    if (mode === this.QUADS) {
      const quads = vertexCount >> 2;
      if (quads > this.quadIndexCapacity) {
        gl.bindVertexArray(null);
        this.ensureQuadIndices(quads);
        gl.bindVertexArray(this.dynVao);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
      gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_INT, 0);
    } else {
      gl.drawArrays(mode, 0, vertexCount);
    }
    this.drawCalls++;
    gl.bindVertexArray(null);
  }

  /**
   * WebGL lines are 1px wide; emulate glLineWidth > 1 by expanding each segment into a
   * screen-space quad (done on the CPU with the current matrices).
   */
  private drawWideLines(mode: number, data: ArrayBuffer, vertexCount: number, flags: DrawFlags): void {
    const f = new Float32Array(data, 0, vertexCount * 8);
    const u32 = new Uint32Array(data, 0, vertexCount * 8);
    const segs: [number, number][] = [];
    if (mode === this.LINES) for (let i = 0; i + 1 < vertexCount; i += 2) segs.push([i, i + 1]);
    else {
      for (let i = 0; i + 1 < vertexCount; i++) segs.push([i, i + 1]);
      if (mode === this.LINE_LOOP && vertexCount > 2) segs.push([vertexCount - 1, 0]);
    }
    const mvp = new Float64Array(16);
    const p = this.projection.top;
    const m = this.modelview.top;
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += p[k * 4 + r] * m[c * 4 + k];
        mvp[c * 4 + r] = s;
      }
    const w = this.gl.drawingBufferWidth;
    const h = this.gl.drawingBufferHeight;
    const half = (this.lineWidthValue * this.pixelRatio) / 2;
    const needed = segs.length * 4 * 8;
    if (this.lineScratch.length < needed) this.lineScratch = new Float32Array(needed * 2);
    const out = this.lineScratch;
    const outU = new Uint32Array(out.buffer);
    const clip = (i: number, o: number[]) => {
      const x = f[i * 8], y = f[i * 8 + 1], z = f[i * 8 + 2];
      o[0] = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
      o[1] = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
      o[2] = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14];
      o[3] = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    };
    const a = [0, 0, 0, 0];
    const b = [0, 0, 0, 0];
    let n = 0;
    for (const [i0, i1] of segs) {
      clip(i0, a);
      clip(i1, b);
      // Clip against the near plane (w > epsilon) so the projection stays valid.
      const eps = 1e-5;
      if (a[3] < eps && b[3] < eps) continue;
      if (a[3] < eps || b[3] < eps) {
        const t = (eps - a[3]) / (b[3] - a[3]);
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, eps];
        if (a[3] < eps) a.splice(0, 4, ...q);
        else b.splice(0, 4, ...q);
      }
      const ax = (a[0] / a[3]) * w * 0.5, ay = (a[1] / a[3]) * h * 0.5;
      const bx = (b[0] / b[3]) * w * 0.5, by = (b[1] / b[3]) * h * 0.5;
      let dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Perpendicular offset in NDC, plus a small extension along the line to fill corners.
      const px = (-dy * half) / (w * 0.5), py = (dx * half) / (h * 0.5);
      const ex = (dx * half) / (w * 0.5), ey = (dy * half) / (h * 0.5);
      const verts: [number[], number, number, number][] = [
        [a, -1, i0, -1],
        [a, 1, i0, -1],
        [b, 1, i1, 1],
        [b, -1, i1, 1],
      ];
      for (const [v, side, src, along] of verts) {
        const o = n * 8;
        out[o] = v[0] + (px * side + ex * along) * v[3];
        out[o + 1] = v[1] + (py * side + ey * along) * v[3];
        out[o + 2] = v[2];
        out[o + 3] = f[src * 8 + 3];
        out[o + 4] = f[src * 8 + 4];
        outU[o + 5] = u32[src * 8 + 5];
        outU[o + 6] = u32[src * 8 + 6];
        outU[o + 7] = u32[src * 8 + 7];
        // Divide by w now so the quad can be drawn with identity matrices (keeps depth correct).
        out[o] /= v[3];
        out[o + 1] /= v[3];
        out[o + 2] /= v[3];
        n++;
      }
    }
    if (n === 0) return;
    this.matrixMode(this.PROJECTION);
    this.pushMatrix();
    this.loadIdentity();
    this.matrixMode(this.MODELVIEW);
    this.pushMatrix();
    this.loadIdentity();
    const savedFog = this.fog;
    this.fog = false;
    const savedWidth = this.lineWidthValue;
    this.lineWidthValue = 1;
    // Lines have no facing; the generated quads may wind either way.
    const savedCull = this.cull;
    this.setCap(this.CULL_FACE, false);
    this.drawDynamic(this.QUADS, out.buffer as ArrayBuffer, n, flags);
    this.setCap(this.CULL_FACE, savedCull);
    this.lineWidthValue = savedWidth;
    this.fog = savedFog;
    this.popMatrix();
    this.matrixMode(this.PROJECTION);
    this.popMatrix();
    this.matrixMode(this.MODELVIEW);
  }

  // ------------------------------------------------------------------ display lists

  private recording: DisplayList | null = null;

  genList(): DisplayList {
    return new DisplayList();
  }

  /** glNewList(list, GL_COMPILE): Tessellator draws are captured instead of drawn. */
  newList(list: DisplayList): void {
    this.deleteList(list);
    this.recording = list;
  }

  endList(): void {
    this.recording = null;
  }

  deleteList(list: DisplayList): void {
    for (const d of list.draws) {
      this.gl.deleteVertexArray(d.vao);
      this.gl.deleteBuffer(d.vbo);
    }
    list.draws = [];
  }

  private recordDraw(mode: number, data: ArrayBuffer, vertexCount: number, flags: DrawFlags): void {
    const gl = this.gl;
    if (mode === this.QUADS) this.getQuadIndexBuffer(vertexCount >> 2);
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(data, 0, vertexCount * DYNAMIC_STRIDE), gl.STATIC_DRAW);
    gl.vertexAttribPointer(ATTR_POS, 3, gl.FLOAT, false, DYNAMIC_STRIDE, 0);
    gl.vertexAttribPointer(ATTR_UV, 2, gl.FLOAT, false, DYNAMIC_STRIDE, 12);
    gl.vertexAttribPointer(ATTR_COLOR, 4, gl.UNSIGNED_BYTE, true, DYNAMIC_STRIDE, 20);
    gl.vertexAttribPointer(ATTR_NORMAL, 3, gl.BYTE, true, DYNAMIC_STRIDE, 24);
    gl.vertexAttribPointer(ATTR_LIGHT, 2, gl.SHORT, false, DYNAMIC_STRIDE, 28);
    gl.enableVertexAttribArray(ATTR_POS);
    const toggle = (loc: number, on: boolean) => (on ? gl.enableVertexAttribArray(loc) : gl.disableVertexAttribArray(loc));
    toggle(ATTR_UV, flags.hasTexture);
    toggle(ATTR_COLOR, flags.hasColor);
    toggle(ATTR_NORMAL, flags.hasNormals);
    toggle(ATTR_LIGHT, flags.hasBrightness);
    if (mode === this.QUADS) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
    gl.bindVertexArray(null);
    this.recording!.draws.push({ vao, vbo, mode, count: vertexCount, flags: { ...flags } });
  }

  /** glCallList: replays the recorded draws with the current matrices and state. */
  callList(list: DisplayList): void {
    const gl = this.gl;
    for (const d of list.draws) {
      this.applyState(1, d.flags.hasTexture);
      gl.bindVertexArray(d.vao);
      this.applyConstantAttribs(d.flags);
      if (d.mode === this.QUADS) {
        const quads = d.count >> 2;
        if (quads > this.quadIndexCapacity) {
          gl.bindVertexArray(null);
          this.ensureQuadIndices(quads);
          gl.bindVertexArray(d.vao);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
        }
        gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_INT, 0);
      } else {
        gl.drawArrays(d.mode, 0, d.count);
      }
      this.drawCalls++;
    }
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------------ skinned meshes

  /**
   * Draws `count` indices (from byte `offset`) of a skinned mesh's VAO (custom player models,
   * built by src/render/entity/CustomModelMesh.ts: positions, UVs, normals, joints and weights)
   * with the current state, each vertex blended from `bones` (MAX_BONES column-major matrices).
   */
  drawSkinned(vao: WebGLVertexArrayObject, indexType: number, offset: number, count: number, bones: Float32Array, flags: DrawFlags): void {
    if (count <= 0) return;
    const gl = this.gl;
    this.applyState(1, flags.hasTexture, true);
    gl.uniformMatrix4fv(this.u.bones, false, bones, 0, MAX_BONES * 16);
    gl.bindVertexArray(vao);
    this.applyConstantAttribs(flags);
    gl.drawElements(gl.TRIANGLES, count, indexType, offset);
    this.drawCalls++;
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------------ terrain meshes

  private static readonly TERRAIN_FLAGS: DrawFlags = { hasTexture: true, hasColor: true, hasNormals: false, hasBrightness: true };

  /** Uploads compact terrain vertices (see SectionMesher) into a new or reused mesh. */
  uploadTerrain(mesh: TerrainMesh | null, data: ArrayBuffer, vertexCount: number): TerrainMesh {
    const gl = this.gl;
    this.getQuadIndexBuffer(vertexCount >> 2);
    if (!mesh) {
      const vao = gl.createVertexArray()!;
      const vbo = gl.createBuffer()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.vertexAttribPointer(ATTR_POS, 3, gl.SHORT, false, TERRAIN_STRIDE, 0);
      gl.vertexAttribPointer(ATTR_LIGHT, 2, gl.UNSIGNED_BYTE, false, TERRAIN_STRIDE, 6);
      gl.vertexAttribPointer(ATTR_UV, 2, gl.UNSIGNED_SHORT, true, TERRAIN_STRIDE, 8);
      gl.vertexAttribPointer(ATTR_COLOR, 4, gl.UNSIGNED_BYTE, true, TERRAIN_STRIDE, 12);
      gl.enableVertexAttribArray(ATTR_POS);
      gl.enableVertexAttribArray(ATTR_LIGHT);
      gl.enableVertexAttribArray(ATTR_UV);
      gl.enableVertexAttribArray(ATTR_COLOR);
      gl.disableVertexAttribArray(ATTR_NORMAL);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
      gl.bindVertexArray(null);
      mesh = { vao, vbo, vertexCount: 0 };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(data, 0, vertexCount * TERRAIN_STRIDE), gl.STATIC_DRAW);
    mesh.vertexCount = vertexCount;
    return mesh;
  }

  deleteTerrain(mesh: TerrainMesh): void {
    this.gl.deleteVertexArray(mesh.vao);
    this.gl.deleteBuffer(mesh.vbo);
  }

  /** Draws a terrain mesh with the current matrices (translate to the section origin first). */
  drawTerrain(mesh: TerrainMesh): void {
    if (mesh.vertexCount === 0) return;
    const gl = this.gl;
    const quads = mesh.vertexCount >> 2;
    if (quads > this.quadIndexCapacity) this.getQuadIndexBuffer(quads);
    this.applyState(TERRAIN_POS_SCALE, true);
    gl.bindVertexArray(mesh.vao);
    gl.vertexAttrib3fv(ATTR_NORMAL, this.normalValue);
    gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_INT, 0);
    this.drawCalls++;
    gl.bindVertexArray(null);
  }

  /** Called at the start of each frame. */
  beginFrame(): void {
    this.drawCalls = 0;
  }
}

export const GL = new GLFacade();
export type { GLFacade };
