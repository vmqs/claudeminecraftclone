import type { ResourceManager, RGBAImage } from '../../assets/ResourceManager';
import { GL } from '../gl/GL';
import { TextureMap } from './TextureMap';
import type { Icon } from './Icon';

interface LoadedTexture {
  tex: WebGLTexture;
  width: number;
  height: number;
  loaded: boolean;
  promise: Promise<void>;
}

/**
 * RenderEngine: path -> GL texture with the original's options (%blur%, %clamp%),
 * NEAREST filtering, REPEAT wrapping by default, the two stitched atlases
 * ("/terrain.png" and "/gui/items.png") and dynamic textures. Reloads everything when
 * the texture pack changes.
 */
export class TextureManager {
  private textures = new Map<string, LoadedTexture>();
  private contents = new Map<string, Promise<RGBAImage | null>>();
  readonly textureMapBlocks: TextureMap;
  readonly textureMapItems: TextureMap;
  readonly missingImage: RGBAImage;
  /** Called after a pack switch finished reloading (atlases restitched). */
  reloadListeners: (() => void)[] = [];
  private reloading: Promise<void> | null = null;

  constructor(readonly resources: ResourceManager) {
    this.missingImage = makeMissingImage();
    this.textureMapBlocks = new TextureMap(0, 'terrain', 'textures/blocks/', this.missingImage);
    this.textureMapItems = new TextureMap(1, 'items', 'textures/items/', this.missingImage);
    resources.onPackChanged(() => void this.refreshTextures());
  }

  /** Stitches both atlases (call after the block/item registries exist). */
  async refreshTextureMaps(): Promise<void> {
    await Promise.all([this.textureMapBlocks.refreshTextures(this.resources), this.textureMapItems.refreshTextures(this.resources)]);
  }

  /** Reloads every texture from the newly selected pack (RenderEngine.refreshTextures). */
  refreshTextures(): Promise<void> {
    const run = async () => {
      this.contents.clear();
      await this.refreshTextureMaps();
      await Promise.all([...this.textures.entries()].map(([key, t]) => this.loadInto(key, t)));
      for (const l of this.reloadListeners) l();
    };
    this.reloading = (this.reloading ?? Promise.resolve()).then(run, run);
    return this.reloading;
  }

  bindTexture(path: string): void {
    GL.bindTexture(this.getTexture(path));
  }

  getTexture(path: string): WebGLTexture {
    if (path === '/terrain.png') return this.textureMapBlocks.texture ?? this.getTexture('missing');
    if (path === '/gui/items.png') return this.textureMapItems.texture ?? this.getTexture('missing');
    let t = this.textures.get(path);
    if (!t) {
      const gl = GL.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      GL.noteTextureBinding(tex);
      t = { tex, width: 1, height: 1, loaded: false, promise: Promise.resolve() };
      this.textures.set(path, t);
      t.promise = this.loadInto(path, t);
    }
    return t.tex;
  }

  /** Whether `path` has finished loading. */
  isLoaded(path: string): boolean {
    return this.textures.get(path)?.loaded ?? false;
  }

  /** Starts loading textures and resolves when they are ready. */
  async preload(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map((p) => {
        this.getTexture(p);
        return this.textures.get(p)?.promise;
      }),
    );
  }

  /** Size of a loaded texture in pixels (1x1 while loading). */
  getTextureSize(path: string): [number, number] {
    const t = this.textures.get(path);
    return t ? [t.width, t.height] : [1, 1];
  }

  private async loadInto(key: string, t: LoadedTexture): Promise<void> {
    let path = key;
    let blur = false;
    let clamp = false;
    if (path.startsWith('%blur%')) {
      blur = true;
      path = path.slice(6);
    }
    if (path.startsWith('%clamp%')) {
      clamp = true;
      path = path.slice(7);
    }
    let source: ImageBitmap | RGBAImage | null = null;
    try {
      source = this.resources.has(path) ? await this.resources.getImageBitmap(path) : null;
    } catch (e) {
      console.warn('[textures] failed to load', path, e);
    }
    if (!source) source = this.missingImage;
    this.setupTextureExt(t.tex, source, blur, clamp);
    t.width = source.width;
    t.height = source.height;
    t.loaded = true;
    if ('close' in source) source.close();
  }

  setupTextureExt(tex: WebGLTexture, img: ImageBitmap | RGBAImage, blur: boolean, clamp: boolean): void {
    const gl = GL.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    GL.noteTextureBinding(tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if ('data' in img) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }
    const filter = blur ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const wrap = clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  /** A texture owned by the caller (e.g. the lightmap); not reloaded on pack change. */
  allocateTexture(width: number, height: number, linear = false): WebGLTexture {
    const gl = GL.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    GL.noteTextureBinding(tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** createTextureFromBytes: uploads RGBA bytes into an existing texture. */
  updateTexture(tex: WebGLTexture, rgba: Uint8Array, width: number, height: number): void {
    const gl = GL.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    GL.noteTextureBinding(tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  /** Pixels of an image file from the current pack (getTextureContents). */
  getTextureContents(path: string): Promise<RGBAImage | null> {
    let p = this.contents.get(path);
    if (!p) {
      p = this.resources.has(path) ? this.resources.getImage(path) : Promise.resolve(null);
      this.contents.set(path, p);
    }
    return p;
  }

  updateDynamicTextures(): void {
    this.textureMapBlocks.updateAnimations();
    this.textureMapItems.updateAnimations();
  }

  getMissingIcon(type: number): Icon {
    return type === 0 ? this.textureMapBlocks.getMissingIcon() : this.textureMapItems.getMissingIcon();
  }

  /**
   * RenderEngine.resetBoundTexture. The original cached the last bound id and needed this
   * after binding behind its back; the GL facade tracks the real binding, so nothing to do.
   */
  resetBoundTexture(): void {}
}

/** The 64x64 "missing texture" image: white with "missing"/"texture" lines of black text. */
function makeMissingImage(): RGBAImage {
  const w = 64;
  const h = 64;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.font = '12px sans-serif';
  let y = 10;
  let i = 0;
  while (y < 64) {
    ctx.fillText(i++ % 2 === 0 ? 'missing' : 'texture', 1, y);
    y += 12;
    if (i % 2 === 0) y += 5;
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return { width: w, height: h, data };
}
