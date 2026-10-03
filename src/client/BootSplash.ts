import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { deleteTexture } from '../render/entity/SkinTextures';
import type { TextureManager } from '../render/texture/TextureManager';

/**
 * The boot splash (Minecraft.loadScreen, which showed the Mojang logo on white while the game
 * loaded): one of two pictures, picked with even odds on every launch and stretched over the
 * whole window, aspect ratio ignored. It stays up for as long as the Mojang screen did: from the
 * start of loading until the title screen appears. The files live in public/splash/ and load
 * with a relative URL, so the game works under any GitHub Pages path. `?splash=1` or `?splash=2`
 * picks one (screenshots).
 */
export const SPLASH_IMAGES = ['splash/splash1.png', 'splash/splash2.png'] as const;

/** Waits at most this long for the picture before loading goes on without it. */
const LOAD_TIMEOUT_MS = 3000;

/** 0 or 1: the forced choice from `?splash=`, otherwise a coin flip. */
export function pickSplash(random: () => number = Math.random, search = typeof location === 'undefined' ? '' : location.search): number {
  const forced = new URLSearchParams(search).get('splash');
  if (forced === '1' || forced === '2') return Number(forced) - 1;
  return random() < 0.5 ? 0 : 1;
}

/** Loads a splash picture into a LINEAR, clamped texture (null when it cannot be loaded). */
export async function loadSplashTexture(engine: TextureManager, index: number): Promise<WebGLTexture | null> {
  try {
    const url = new URL(SPLASH_IMAGES[index], document.baseURI).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const tex = engine.allocateTexture(1, 1, true);
    engine.setupTextureExt(tex, bmp, true, true);
    bmp.close();
    return tex;
  } catch (e) {
    console.warn('[splash] could not load', SPLASH_IMAGES[index], e);
    return null;
  }
}

/** The texture stretched over (0, 0)-(w, h) of the current projection. */
export function drawStretched(tex: WebGLTexture, w: number, h: number): void {
  GL.bindTexture(tex);
  GL.color(1, 1, 1, 1);
  const t = Tessellator.instance;
  t.startDrawingQuads();
  t.setColorOpaque_I(0xffffff);
  t.addVertexWithUV(0, h, 0, 0, 1);
  t.addVertexWithUV(w, h, 0, 1, 1);
  t.addVertexWithUV(w, 0, 0, 1, 0);
  t.addVertexWithUV(0, 0, 0, 0, 0);
  t.draw();
}

export class BootSplash {
  /** The picture shown at the last boot (0 or 1; -1 before), for automation. */
  static shownIndex = -1;
  private tex: WebGLTexture | null = null;
  private readonly onResize = () => this.draw();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: TextureManager,
  ) {}

  /** Loads the picked picture (bounded by a timeout) and draws it. */
  async show(index = pickSplash()): Promise<void> {
    BootSplash.shownIndex = index;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), LOAD_TIMEOUT_MS));
    this.tex = await Promise.race([loadSplashTexture(this.engine, index), timeout]);
    this.draw();
    window.addEventListener('resize', this.onResize);
  }

  /** Draws the splash over the whole canvas (again after a resize while loading). */
  draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    GL.viewport(0, 0, w, h);
    GL.clearColor(0, 0, 0, 1);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    if (!this.tex) return;
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, w, h, 0, 1000, 3000);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -2000);
    GL.disable(GL.LIGHTING);
    GL.disable(GL.FOG);
    GL.disable(GL.DEPTH_TEST);
    GL.enable(GL.TEXTURE_2D);
    drawStretched(this.tex, w, h);
    GL.enable(GL.DEPTH_TEST);
  }

  /** The title screen is up: stop redrawing and free the picture. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.tex) deleteTexture(this.tex);
    this.tex = null;
  }
}
