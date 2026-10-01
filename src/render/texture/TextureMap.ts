import { scaleNearest, type ResourceManager, type RGBAImage } from '../../assets/ResourceManager';
import { GL } from '../gl/GL';
import { Icon, type IconRegister, type IconTable } from './Icon';

/** An atlas sprite with optional animation frames (TextureStitched). */
export class TextureStitched extends Icon {
  /** Frames already scaled to the sprite's pixel size; length > 1 means animated. */
  frames: RGBAImage[] = [];
  /** Optional frame sequence from a .txt file: [frameIndex, ticks][]. */
  animation: [number, number][] | null = null;
  frameCounter = 0;
  tickCounter = 0;
  /**
   * Hook for game-state driven sprites (compass, clock): return the frame index to show
   * this tick, or -1 to use the normal animation. Set by the item code.
   */
  frameSelector: ((icon: TextureStitched) => number) | null = null;
  /** Frame currently in the atlas. */
  shownFrame = 0;
}

interface LoadedSprite {
  name: string;
  frames: RGBAImage[]; // un-scaled frames (square)
  animation: [number, number][] | null;
}

/** Parses an animation .txt ("0*2,1,2*3" one or more per line). */
export function parseAnimationInfo(text: string): [number, number][] | null {
  const out: [number, number][] = [];
  try {
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;
      for (const part of line.split(',')) {
        const star = part.indexOf('*');
        if (star > 0) out.push([parseInt(part.slice(0, star), 10), parseInt(part.slice(star + 1), 10)]);
        else out.push([parseInt(part, 10), 1]);
        if (Number.isNaN(out[out.length - 1][0]) || Number.isNaN(out[out.length - 1][1])) throw new Error('bad number');
      }
    }
  } catch {
    return null;
  }
  return out.length > 0 && out.length < 600 ? out : null;
}

/**
 * Stitches "textures/blocks/*.png" (terrain) or "textures/items/*.png" (items) into one
 * atlas. Unlike 1.5.2's free-form stitcher, every sprite is scaled (nearest) to a whole
 * number of square cells of the pack's most common tile size, so mixed 16/32/64 px
 * sprites (Faithful's water and lava strips) pack into a simple grid.
 */
export class TextureMap implements IconRegister {
  private registered = new Map<string, TextureStitched>();
  private animated: TextureStitched[] = [];
  missingIcon = new TextureStitched('missingno');
  texture: WebGLTexture | null = null;
  width = 16;
  height = 16;
  tileSize = 16;
  /** Called before stitching so blocks/items/renderers register their icons. */
  registrars: ((reg: IconRegister) => void)[] = [];

  constructor(
    readonly textureType: number,
    readonly textureName: string,
    readonly basePath: string,
    private readonly missingImage: RGBAImage,
  ) {}

  registerIcon(name: string): Icon {
    let icon = this.registered.get(name);
    if (!icon) {
      icon = new TextureStitched(name);
      this.registered.set(name, icon);
    }
    return icon;
  }

  getMissingIcon(): Icon {
    return this.missingIcon;
  }

  getIcon(name: string): TextureStitched | undefined {
    return this.registered.get(name);
  }

  /** Re-registers every icon, reloads the images from the current pack and re-stitches. */
  async refreshTextures(rm: ResourceManager): Promise<void> {
    for (const r of this.registrars) r(this);
    const names = [...this.registered.keys()];
    const sprites = await Promise.all(names.map((n) => this.loadSprite(rm, n)));

    // Tile size = most common sprite width.
    const counts = new Map<number, number>();
    for (const s of sprites) if (s) counts.set(s.frames[0].width, (counts.get(s.frames[0].width) ?? 0) + 1);
    let tile = 16;
    let best = -1;
    for (const [w, c] of counts) if (c > best || (c === best && w > tile)) [tile, best] = [w, c];
    this.tileSize = tile;

    interface Entry {
      icon: TextureStitched;
      cells: number;
      frames: RGBAImage[];
      animation: [number, number][] | null;
    }
    const entries: Entry[] = [];
    const missingScaled = scaleNearest(this.missingImage, 0, 0, this.missingImage.width, this.missingImage.height, tile, tile);
    entries.push({ icon: this.missingIcon, cells: 1, frames: [missingScaled], animation: null });
    names.forEach((n, i) => {
      const s = sprites[i];
      if (!s) return;
      const cells = Math.max(1, Math.ceil(s.frames[0].width / tile));
      const px = cells * tile;
      const frames = s.frames.map((f) => (f.width === px ? f : scaleNearest(f, 0, 0, f.width, f.height, px, px)));
      entries.push({ icon: this.registered.get(n)!, cells, frames, animation: s.animation });
    });

    // Grid packing, largest first.
    entries.sort((a, b) => b.cells - a.cells || a.icon.iconName.localeCompare(b.icon.iconName));
    const area = entries.reduce((acc, e) => acc + e.cells * e.cells, 0);
    let gw = 1;
    while (gw * gw < area) gw *= 2;
    const occupied: boolean[][] = [];
    const isFree = (x: number, y: number, c: number): boolean => {
      if (x + c > gw) return false;
      for (let yy = y; yy < y + c; yy++) for (let xx = x; xx < x + c; xx++) if (occupied[yy]?.[xx]) return false;
      return true;
    };
    let rows = 0;
    const placements: [Entry, number, number][] = [];
    for (const e of entries) {
      let placed = false;
      for (let y = 0; !placed; y++) {
        for (let x = 0; x <= gw - e.cells; x++) {
          if (isFree(x, y, e.cells)) {
            for (let yy = y; yy < y + e.cells; yy++) {
              occupied[yy] ??= [];
              for (let xx = x; xx < x + e.cells; xx++) occupied[yy][xx] = true;
            }
            placements.push([e, x, y]);
            rows = Math.max(rows, y + e.cells);
            placed = true;
            break;
          }
        }
      }
    }
    let gh = 1;
    while (gh < rows) gh *= 2;
    const W = gw * tile;
    const H = gh * tile;
    this.width = W;
    this.height = H;
    const atlas = new Uint8Array(W * H * 4);
    this.animated = [];
    for (const [e, cx, cy] of placements) {
      const px = e.cells * tile;
      const ox = cx * tile;
      const oy = cy * tile;
      const f0 = e.frames[e.animation ? Math.max(0, Math.min(e.frames.length - 1, e.animation[0][0])) : 0];
      blit(atlas, W, f0, ox, oy);
      e.icon.setPlacement(W, H, ox, oy, px, px);
      e.icon.frames = e.frames;
      e.icon.animation = e.animation;
      e.icon.frameCounter = 0;
      e.icon.tickCounter = 0;
      e.icon.shownFrame = e.animation ? e.animation[0][0] : 0;
      if (e.frames.length > 1) this.animated.push(e.icon);
    }
    for (const [name, icon] of this.registered) {
      if (!placements.some(([e]) => e.icon === icon)) {
        icon.copyFrom(this.missingIcon);
        icon.frames = [];
        if (name !== 'missingno') console.warn(`[textures] missing ${this.basePath}${name}.png`);
      }
    }
    this.upload(atlas, W, H);
  }

  private async loadSprite(rm: ResourceManager, name: string): Promise<LoadedSprite | null> {
    const png = `${this.basePath}${name}.png`;
    const layer = rm.layerOf(png);
    if (!layer) return null;
    const img = await rm.getImage(png, layer);
    if (!img) return null;
    // The .txt must come from the same layer as the image (as TextureMap did).
    const txtPath = `${this.basePath}${name}.txt`;
    const txt = rm.hasIn(layer, txtPath) ? await rm.getText(txtPath, layer) : null;
    if (txt !== null) {
      const fw = img.width;
      const count = Math.floor(img.height / fw);
      const frames: RGBAImage[] = [];
      for (let i = 0; i < count; i++) frames.push(scaleNearest(img, 0, i * fw, fw, fw, fw, fw));
      return { name, frames, animation: parseAnimationInfo(txt) };
    }
    if (img.width !== img.height) {
      console.warn(`[textures] skipping ${png}: broken aspect ratio and not an animation`);
      return null;
    }
    return { name, frames: [img], animation: null };
  }

  private upload(pixels: Uint8Array, w: number, h: number): void {
    const gl = GL.gl;
    if (!this.texture) this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    GL.noteTextureBinding(this.texture);
  }

  /** Advances animated sprites by one tick (TextureStitched.updateAnimation). */
  updateAnimations(): void {
    if (!this.texture) return;
    const gl = GL.gl;
    let bound = false;
    for (const icon of this.animated) {
      let frame: number;
      if (icon.frameSelector) {
        const sel = icon.frameSelector(icon);
        frame = sel >= 0 ? sel % icon.frames.length : icon.shownFrame;
      } else if (icon.animation) {
        const anim = icon.animation;
        icon.tickCounter++;
        frame = icon.shownFrame;
        if (icon.tickCounter >= anim[icon.frameCounter][1]) {
          icon.frameCounter = (icon.frameCounter + 1) % anim.length;
          icon.tickCounter = 0;
          const f = anim[icon.frameCounter][0];
          if (f >= 0 && f < icon.frames.length) frame = f;
        }
      } else {
        icon.frameCounter = (icon.frameCounter + 1) % icon.frames.length;
        frame = icon.frameCounter;
      }
      if (frame !== icon.shownFrame) {
        icon.shownFrame = frame;
        if (!bound) {
          gl.bindTexture(gl.TEXTURE_2D, this.texture);
          GL.noteTextureBinding(this.texture);
          bound = true;
        }
        const f = icon.frames[frame];
        gl.texSubImage2D(gl.TEXTURE_2D, 0, icon.originX, icon.originY, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(f.data.buffer, f.data.byteOffset, f.data.byteLength));
      }
    }
  }

  /** Atlas layout for workers. */
  getIconTable(): IconTable {
    const icons: IconTable['icons'] = {};
    for (const [name, icon] of this.registered) icons[name] = [icon.originX, icon.originY, icon.width, icon.height];
    const m = this.missingIcon;
    return { sheetWidth: this.width, sheetHeight: this.height, icons, missing: [m.originX, m.originY, m.width, m.height] };
  }
}

function blit(dst: Uint8Array, dstW: number, src: RGBAImage, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4;
    dst.set(src.data.subarray(s, s + src.width * 4), ((oy + y) * dstW + ox) * 4);
  }
}
