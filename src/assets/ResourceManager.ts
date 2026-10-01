/**
 * Layered asset lookup: [selected texture pack] -> [vanilla 1.5.2 resources].
 *
 * Paths are given the way the original used them ("/gui/gui.png",
 * "textures/blocks/stone.png", "sound3/step/grass1.ogg", "lang/en_US.lang");
 * the leading slash is optional.
 */
export interface PackInfo {
  id: string;
  name: string;
  description: string;
  files: string[];
}

export interface Manifest {
  version: string;
  vanilla: string[];
  sounds: string[];
  packs: PackInfo[];
  defaultPack: string | null;
}

/** Decoded RGBA pixels (non-premultiplied). */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const PACK_KEY = 'mc152.texturePack';

function norm(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

type PackListener = () => void;

export class ResourceManager {
  manifest!: Manifest;
  /** Absolute base URL of public/assets/ (works under a GitHub Pages sub-path). */
  readonly baseUrl: string;
  private vanilla = new Set<string>();
  private sounds = new Set<string>();
  private packFiles = new Map<string, Set<string>>();
  private selected: string | null = null;
  private listeners: PackListener[] = [];
  private textCache = new Map<string, Promise<string | null>>();

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? new URL('./assets/', document.baseURI).href;
  }

  async init(): Promise<void> {
    const res = await fetch(this.baseUrl + 'manifest.json');
    if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status} (run npm run fetch-assets)`);
    this.manifest = (await res.json()) as Manifest;
    this.vanilla = new Set(this.manifest.vanilla);
    this.sounds = new Set(this.manifest.sounds);
    for (const p of this.manifest.packs) this.packFiles.set(p.id, new Set(p.files));
    let stored: string | null | undefined;
    try {
      stored = localStorage.getItem(PACK_KEY);
    } catch {
      stored = undefined;
    }
    if (stored === undefined || stored === null) this.selected = this.manifest.defaultPack;
    else this.selected = stored === 'default' ? null : this.packFiles.has(stored) ? stored : this.manifest.defaultPack;
  }

  /** The selected pack id, or null for the default (vanilla) textures. */
  get selectedPack(): string | null {
    return this.selected;
  }

  get packs(): PackInfo[] {
    return this.manifest.packs;
  }

  /** Switches the texture pack; listeners (TextureManager, FontRenderer, ...) reload. */
  selectPack(id: string | null): void {
    if (id !== null && !this.packFiles.has(id)) id = null;
    if (id === this.selected) return;
    this.selected = id;
    this.textCache.clear();
    try {
      localStorage.setItem(PACK_KEY, id ?? 'default');
    } catch {
      /* storage unavailable */
    }
    for (const l of this.listeners) l();
  }

  onPackChanged(listener: PackListener): void {
    this.listeners.push(listener);
  }

  /** Which layer serves `path`: 'pack', 'vanilla', or null when missing. */
  layerOf(path: string): 'pack' | 'vanilla' | null {
    const p = norm(path);
    if (this.selected && this.packFiles.get(this.selected)?.has(p)) return 'pack';
    if (this.vanilla.has(p) || this.sounds.has(p)) return 'vanilla';
    return null;
  }

  has(path: string): boolean {
    return this.layerOf(path) !== null;
  }

  /** True if `path` exists in the given layer specifically. */
  hasIn(layer: 'pack' | 'vanilla', path: string): boolean {
    const p = norm(path);
    if (layer === 'pack') return !!this.selected && !!this.packFiles.get(this.selected)?.has(p);
    return this.vanilla.has(p) || this.sounds.has(p);
  }

  /** URL of `path` in a specific layer (or the first layer that has it). */
  resolve(path: string, layer?: 'pack' | 'vanilla'): string | null {
    const p = norm(path);
    const l = layer ?? this.layerOf(p);
    if (l === 'pack' && this.selected && this.packFiles.get(this.selected)?.has(p)) {
      return `${this.baseUrl}packs/${this.selected}/${encodePath(p)}`;
    }
    if ((l === 'vanilla' || l === undefined) && (this.vanilla.has(p) || this.sounds.has(p))) {
      return `${this.baseUrl}vanilla/${encodePath(p)}`;
    }
    return null;
  }

  /** All sound files (paths like "sound3/step/grass1.ogg"). */
  listSounds(): string[] {
    return this.manifest.sounds;
  }

  /** All known files under a directory prefix in the active layers (e.g. "textures/blocks/"). */
  list(prefix: string): string[] {
    const p = norm(prefix);
    const out = new Set<string>();
    for (const f of this.vanilla) if (f.startsWith(p)) out.add(f);
    if (this.selected) for (const f of this.packFiles.get(this.selected) ?? []) if (f.startsWith(p)) out.add(f);
    return [...out].sort();
  }

  async getText(path: string, layer?: 'pack' | 'vanilla'): Promise<string | null> {
    const key = (layer ?? '') + ':' + norm(path);
    let pr = this.textCache.get(key);
    if (!pr) {
      pr = (async () => {
        const url = this.resolve(path, layer);
        if (!url) return null;
        const res = await fetch(url);
        return res.ok ? await res.text() : null;
      })();
      this.textCache.set(key, pr);
    }
    return pr;
  }

  async getArrayBuffer(path: string, layer?: 'pack' | 'vanilla'): Promise<ArrayBuffer | null> {
    const url = this.resolve(path, layer);
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  }

  async getImageBitmap(path: string, layer?: 'pack' | 'vanilla'): Promise<ImageBitmap | null> {
    const url = this.resolve(path, layer);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }

  /** Decodes an image to RGBA pixels. */
  async getImage(path: string, layer?: 'pack' | 'vanilla'): Promise<RGBAImage | null> {
    const bmp = await this.getImageBitmap(path, layer);
    if (!bmp) return null;
    const img = bitmapToRGBA(bmp);
    bmp.close();
    return img;
  }
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;

/** Reads the pixels of a bitmap through a 2D canvas. */
export function bitmapToRGBA(bmp: ImageBitmap): RGBAImage {
  const w = bmp.width;
  const h = bmp.height;
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  }
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return { width: w, height: h, data };
}

/** Nearest-neighbour rescale of an RGBA region. */
export function scaleNearest(src: RGBAImage, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): RGBAImage {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const yy = sy + Math.floor((y * sh) / dh);
    for (let x = 0; x < dw; x++) {
      const xx = sx + Math.floor((x * sw) / dw);
      const si = (yy * src.width + xx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: dw, height: dh, data: out };
}

export let resources: ResourceManager;

export function setResourceManager(rm: ResourceManager): void {
  resources = rm;
}
