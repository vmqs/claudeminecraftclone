/**
 * ColorizerGrass / ColorizerFoliage: 256x256 colour maps from misc/grasscolor.png and
 * misc/foliagecolor.png, indexed by temperature and rainfall. Worker-safe; the buffers
 * are installed by the main thread (and sent to the mesher workers).
 */
let grassBuffer: Int32Array = new Int32Array(65536);
let foliageBuffer: Int32Array = new Int32Array(65536);

function lookup(buf: Int32Array, temperature: number, rainfall: number): number {
  rainfall *= temperature;
  const i = ((1 - temperature) * 255) | 0;
  const j = ((1 - rainfall) * 255) | 0;
  return buf[(j << 8) | i] & 0xffffff;
}

export const ColorizerGrass = {
  setGrassBiomeColorizer(buf: Int32Array): void {
    grassBuffer = buf;
  },
  getGrassColor(temperature: number, rainfall: number): number {
    return lookup(grassBuffer, temperature, rainfall);
  },
  get buffer(): Int32Array {
    return grassBuffer;
  },
};

export const ColorizerFoliage = {
  setFoliageBiomeColorizer(buf: Int32Array): void {
    foliageBuffer = buf;
  },
  getFoliageColor(temperature: number, rainfall: number): number {
    return lookup(foliageBuffer, temperature, rainfall);
  },
  getFoliageColorPine(): number {
    return 0x619961;
  },
  getFoliageColorBirch(): number {
    return 0x80a755;
  },
  getFoliageColorBasic(): number {
    return 0x48b518;
  },
  get buffer(): Int32Array {
    return foliageBuffer;
  },
};

/** Converts RGBA pixels of a colormap PNG into the 0xAARRGGBB int buffer the colorizers use. */
export function rgbaToIntBuffer(data: Uint8ClampedArray | Uint8Array): Int32Array {
  const out = new Int32Array(data.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i * 4 + 3] << 24) | (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
  }
  return out;
}
