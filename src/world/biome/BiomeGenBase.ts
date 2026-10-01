import { MathHelper } from '../../core/MathHelper';
import { ColorizerFoliage, ColorizerGrass } from './Colorizer';

/**
 * Biome data of 1.5.2 (ids 0-22). Worker-safe and data-only: the world-generation code
 * (decorators, terrain shaping per biome, spawn lists) lives in world/gen and is keyed
 * by `biomeID`.
 */
export class BiomeGenBase {
  static readonly biomeList: (BiomeGenBase | null)[] = new Array(256).fill(null);

  biomeName = '';
  color = 0;
  /** Block ids (byte) placed on top and below by replaceBlocksForBiome. */
  topBlock = 2;
  fillerBlock = 3;
  /** field_76754_C in MCP: tint used by maps for some biomes. */
  field_76754_C = 0x4ee031;
  minHeight = 0.1;
  maxHeight = 0.3;
  temperature = 0.5;
  rainfall = 0.5;
  waterColorMultiplier = 0xffffff;
  enableSnow = false;
  enableRain = true;
  /** BiomeDecorator counts (the world-gen agent reads these). */
  decorator = {
    waterlilyPerChunk: 0,
    treesPerChunk: 0,
    flowersPerChunk: 2,
    grassPerChunk: 1,
    deadBushPerChunk: 0,
    mushroomsPerChunk: 0,
    reedsPerChunk: 0,
    cactiPerChunk: 0,
    sandPerChunk: 1,
    sandPerChunk2: 3,
    clayPerChunk: 1,
    bigMushroomsPerChunk: 0,
    generateLakes: true,
  };

  constructor(readonly biomeID: number) {
    BiomeGenBase.biomeList[biomeID] = this;
  }

  setColor(c: number): this {
    this.color = c;
    return this;
  }
  setBiomeName(n: string): this {
    this.biomeName = n;
    return this;
  }
  setTemperatureRainfall(t: number, r: number): this {
    if (t > 0.1 && t < 0.2) throw new Error('Please avoid temperatures in the range 0.1 - 0.2 because of snow');
    this.temperature = Math.fround(t);
    this.rainfall = Math.fround(r);
    return this;
  }
  setMinMaxHeight(min: number, max: number): this {
    this.minHeight = Math.fround(min);
    this.maxHeight = Math.fround(max);
    return this;
  }
  setDisableRain(): this {
    this.enableRain = false;
    return this;
  }
  setEnableSnow(): this {
    this.enableSnow = true;
    return this;
  }
  func_76733_a(c: number): this {
    this.field_76754_C = c;
    return this;
  }

  getFloatTemperature(): number {
    return this.temperature;
  }
  getFloatRainfall(): number {
    return this.rainfall;
  }
  getIntTemperature(): number {
    return (this.temperature * 65536) | 0;
  }
  getIntRainfall(): number {
    return (this.rainfall * 65536) | 0;
  }
  getEnableSnow(): boolean {
    return this.enableSnow;
  }
  canSpawnLightningBolt(): boolean {
    return this.enableSnow ? false : this.enableRain;
  }
  isHighHumidity(): boolean {
    return this.rainfall > 0.85;
  }
  getSpawningChance(): number {
    return 0.1;
  }

  getBiomeGrassColor(): number {
    const t = MathHelper.clamp_float(this.getFloatTemperature(), 0, 1);
    const r = MathHelper.clamp_float(this.getFloatRainfall(), 0, 1);
    return ColorizerGrass.getGrassColor(t, r);
  }

  getBiomeFoliageColor(): number {
    const t = MathHelper.clamp_float(this.getFloatTemperature(), 0, 1);
    const r = MathHelper.clamp_float(this.getFloatRainfall(), 0, 1);
    return ColorizerFoliage.getFoliageColor(t, r);
  }

  getSkyColorByTemp(temp: number): number {
    temp = Math.fround(temp / 3);
    if (temp < -1) temp = -1;
    if (temp > 1) temp = 1;
    return hsbToRgb(Math.fround(0.62222224 - temp * 0.05), Math.fround(0.5 + temp * 0.1), 1);
  }
}

class BiomeGenSwamp extends BiomeGenBase {
  constructor(id: number) {
    super(id);
    this.decorator.treesPerChunk = 2;
    this.decorator.flowersPerChunk = -999;
    this.decorator.deadBushPerChunk = 1;
    this.decorator.mushroomsPerChunk = 8;
    this.decorator.reedsPerChunk = 10;
    this.decorator.clayPerChunk = 1;
    this.decorator.waterlilyPerChunk = 4;
    this.waterColorMultiplier = 0xe0ffae;
  }
  override getBiomeGrassColor(): number {
    return (((super.getBiomeGrassColor() & 0xfefefe) + 0x4e0e4e) / 2) | 0;
  }
  override getBiomeFoliageColor(): number {
    return (((super.getBiomeFoliageColor() & 0xfefefe) + 0x4e0e4e) / 2) | 0;
  }
}

/** java.awt.Color.HSBtoRGB (without the alpha byte). */
export function hsbToRgb(hue: number, sat: number, bri: number): number {
  const f = Math.fround;
  let r = 0;
  let g = 0;
  let b = 0;
  const c = (v: number) => (f(v * 255 + 0.5) | 0) & 255;
  if (sat === 0) {
    r = g = b = c(bri);
  } else {
    const h = f(f(hue - Math.floor(hue)) * 6);
    const fr = f(h - Math.floor(h));
    const p = f(bri * f(1 - sat));
    const q = f(bri * f(1 - f(sat * fr)));
    const t = f(bri * f(1 - f(sat * f(1 - fr))));
    switch (h | 0) {
      case 0:
        [r, g, b] = [c(bri), c(t), c(p)];
        break;
      case 1:
        [r, g, b] = [c(q), c(bri), c(p)];
        break;
      case 2:
        [r, g, b] = [c(p), c(bri), c(t)];
        break;
      case 3:
        [r, g, b] = [c(p), c(q), c(bri)];
        break;
      case 4:
        [r, g, b] = [c(t), c(p), c(bri)];
        break;
      case 5:
        [r, g, b] = [c(bri), c(p), c(q)];
        break;
    }
  }
  return (r << 16) | (g << 8) | b;
}

const B = (id: number) => new BiomeGenBase(id);
const SAND = 12;
const MYCELIUM = 110;

function decorate(b: BiomeGenBase, d: Partial<BiomeGenBase['decorator']>): BiomeGenBase {
  Object.assign(b.decorator, d);
  return b;
}

export const Biomes = {
  ocean: B(0).setColor(112).setBiomeName('Ocean').setMinMaxHeight(-1.0, 0.4),
  plains: decorate(B(1).setColor(9286496).setBiomeName('Plains').setTemperatureRainfall(0.8, 0.4), {
    treesPerChunk: -999,
    flowersPerChunk: 4,
    grassPerChunk: 10,
  }),
  desert: (() => {
    const b = B(2).setColor(16421912).setBiomeName('Desert').setDisableRain().setTemperatureRainfall(2.0, 0.0).setMinMaxHeight(0.1, 0.2);
    b.topBlock = SAND;
    b.fillerBlock = SAND;
    return decorate(b, { treesPerChunk: -999, deadBushPerChunk: 2, reedsPerChunk: 50, cactiPerChunk: 10 });
  })(),
  extremeHills: B(3).setColor(6316128).setBiomeName('Extreme Hills').setMinMaxHeight(0.3, 1.5).setTemperatureRainfall(0.2, 0.3),
  forest: decorate(B(4).setColor(353825).setBiomeName('Forest').func_76733_a(5159473).setTemperatureRainfall(0.7, 0.8), {
    treesPerChunk: 10,
    grassPerChunk: 2,
  }),
  taiga: decorate(
    B(5).setColor(747097).setBiomeName('Taiga').func_76733_a(5159473).setEnableSnow().setTemperatureRainfall(0.05, 0.8).setMinMaxHeight(0.1, 0.4),
    { treesPerChunk: 10, grassPerChunk: 1 },
  ),
  swampland: new BiomeGenSwamp(6).setColor(522674).setBiomeName('Swampland').func_76733_a(9154376).setMinMaxHeight(-0.2, 0.1).setTemperatureRainfall(0.8, 0.9),
  river: B(7).setColor(255).setBiomeName('River').setMinMaxHeight(-0.5, 0.0),
  hell: B(8).setColor(16711680).setBiomeName('Hell').setDisableRain().setTemperatureRainfall(2.0, 0.0),
  sky: B(9).setColor(8421631).setBiomeName('Sky').setDisableRain(),
  frozenOcean: B(10).setColor(9474208).setBiomeName('FrozenOcean').setEnableSnow().setMinMaxHeight(-1.0, 0.5).setTemperatureRainfall(0.0, 0.5),
  frozenRiver: B(11).setColor(10526975).setBiomeName('FrozenRiver').setEnableSnow().setMinMaxHeight(-0.5, 0.0).setTemperatureRainfall(0.0, 0.5),
  icePlains: B(12).setColor(16777215).setBiomeName('Ice Plains').setEnableSnow().setTemperatureRainfall(0.0, 0.5),
  iceMountains: B(13).setColor(10526880).setBiomeName('Ice Mountains').setEnableSnow().setMinMaxHeight(0.3, 1.3).setTemperatureRainfall(0.0, 0.5),
  mushroomIsland: (() => {
    const b = B(14).setColor(16711935).setBiomeName('MushroomIsland').setTemperatureRainfall(0.9, 1.0).setMinMaxHeight(0.2, 1.0);
    b.topBlock = MYCELIUM;
    return decorate(b, { treesPerChunk: -100, flowersPerChunk: -100, grassPerChunk: -100, mushroomsPerChunk: 1, bigMushroomsPerChunk: 1 });
  })(),
  mushroomIslandShore: (() => {
    const b = B(15).setColor(10486015).setBiomeName('MushroomIslandShore').setTemperatureRainfall(0.9, 1.0).setMinMaxHeight(-1.0, 0.1);
    b.topBlock = MYCELIUM;
    return decorate(b, { treesPerChunk: -100, flowersPerChunk: -100, grassPerChunk: -100, mushroomsPerChunk: 1, bigMushroomsPerChunk: 1 });
  })(),
  beach: (() => {
    const b = B(16).setColor(16440917).setBiomeName('Beach').setTemperatureRainfall(0.8, 0.4).setMinMaxHeight(0.0, 0.1);
    b.topBlock = SAND;
    b.fillerBlock = SAND;
    return decorate(b, { treesPerChunk: -999, deadBushPerChunk: 0, reedsPerChunk: 0, cactiPerChunk: 0 });
  })(),
  desertHills: (() => {
    const b = B(17).setColor(13786898).setBiomeName('DesertHills').setDisableRain().setTemperatureRainfall(2.0, 0.0).setMinMaxHeight(0.3, 0.8);
    b.topBlock = SAND;
    b.fillerBlock = SAND;
    return decorate(b, { treesPerChunk: -999, deadBushPerChunk: 2, reedsPerChunk: 50, cactiPerChunk: 10 });
  })(),
  forestHills: decorate(B(18).setColor(2250012).setBiomeName('ForestHills').func_76733_a(5159473).setTemperatureRainfall(0.7, 0.8).setMinMaxHeight(0.3, 0.7), {
    treesPerChunk: 10,
    grassPerChunk: 2,
  }),
  taigaHills: decorate(
    B(19).setColor(1456435).setBiomeName('TaigaHills').setEnableSnow().func_76733_a(5159473).setTemperatureRainfall(0.05, 0.8).setMinMaxHeight(0.3, 0.8),
    { treesPerChunk: 10, grassPerChunk: 1 },
  ),
  extremeHillsEdge: B(20).setColor(7501978).setBiomeName('Extreme Hills Edge').setMinMaxHeight(0.2, 0.8).setTemperatureRainfall(0.2, 0.3),
  jungle: decorate(B(21).setColor(5470985).setBiomeName('Jungle').func_76733_a(5470985).setTemperatureRainfall(1.2, 0.9).setMinMaxHeight(0.2, 0.4), {
    treesPerChunk: 50,
    grassPerChunk: 25,
    flowersPerChunk: 4,
  }),
  jungleHills: decorate(B(22).setColor(2900485).setBiomeName('JungleHills').func_76733_a(5470985).setTemperatureRainfall(1.2, 0.9).setMinMaxHeight(1.8, 0.5), {
    treesPerChunk: 50,
    grassPerChunk: 25,
    flowersPerChunk: 4,
  }),
};

/** Biome for an id, falling back to plains like Chunk.getBiomeGenForWorldCoords. */
export function getBiome(id: number): BiomeGenBase {
  return BiomeGenBase.biomeList[id & 255] ?? Biomes.plains;
}
