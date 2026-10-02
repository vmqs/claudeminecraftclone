import { MathHelper } from '../../core/MathHelper';
import type { TagCompound } from '../../item/ItemStack';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFireworkOverlayFX } from './EntityFireworkOverlayFX';
import { EntityFireworkSparkFX, type FXSink } from './EntityFireworkSparkFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** Star and creeper-face outlines (x, y) of firework types 2 and 3, from the original. */
const STAR_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 1.0],
  [0.3455, 0.309],
  [0.9511, 0.309],
  [0.3795918367346939, -0.12653061224489795],
  [0.6122448979591837, -0.8040816326530612],
  [0.0, -0.35918367346938773],
];
const CREEPER_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.2],
  [0.2, 0.2],
  [0.2, 0.6],
  [0.6, 0.6],
  [0.6, 0.2],
  [0.2, 0.2],
  [0.2, 0.0],
  [0.4, 0.0],
  [0.4, -0.6],
  [0.2, -0.6],
  [0.2, -0.4],
  [0.0, -0.4],
];

/** Reads a TAG_Byte/boolean the way getBoolean does (missing = false). */
function tagBool(t: TagCompound, key: string): boolean {
  const v = t[key];
  return v === true || (typeof v === 'number' && v !== 0);
}

function tagInts(t: TagCompound, key: string): number[] {
  const v = t[key];
  if (Array.isArray(v)) return v.map((n) => Number(n) | 0);
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, (n) => n | 0);
  return [];
}

/**
 * The invisible emitter of a firework explosion (WorldClient.func_92088_a). `tag` is the
 * rocket's "Fireworks" compound; every entry of its "Explosions" list bursts on an even tick
 * with its shape (0 small ball, 1 large ball, 2 star, 3 creeper, 4 burst), colours, fade
 * colours, trail and twinkle, plus a flash in the first colour. Plays the blast sound first
 * (a large blast for three or more explosions or any large ball, "_far" beyond 16 blocks) and
 * the twinkle sound at the end if any explosion flickers.
 */
export class EntityFireworkStarterFX extends EntityFX {
  private fireworkAge = 0;
  private fireworkExplosions: TagCompound[] | null = null;
  private twinkle = false;

  constructor(
    w: World,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    private readonly effectRenderer: FXSink,
    tag: TagCompound | null,
    /** True when the viewer is 16 or more blocks away (func_92037_i). */
    private readonly isFar: (x: number, y: number, z: number) => boolean,
  ) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX = vx;
    this.motionY = vy;
    this.motionZ = vz;
    this.particleMaxAge = 8;
    if (tag) {
      const list = Array.isArray(tag.Explosions) ? (tag.Explosions as TagCompound[]) : [];
      if (list.length > 0) {
        this.fireworkExplosions = list;
        this.particleMaxAge = list.length * 2 - 1;
        for (const e of list) {
          if (tagBool(e, 'Flicker')) {
            this.twinkle = true;
            this.particleMaxAge += 15;
            break;
          }
        }
      }
    }
  }

  override renderParticle(_t: Tessellator, _pt: number): void {}

  override onUpdate(): void {
    const list = this.fireworkExplosions;
    if (this.fireworkAge === 0 && list) {
      const far = this.isFar(this.posX, this.posY, this.posZ);
      let large = list.length >= 3;
      if (!large) large = list.some((e) => Number(e.Type ?? 0) === 1);
      const sound = 'fireworks.' + (large ? 'largeBlast' : 'blast') + (far ? '_far' : '');
      this.worldObj.playSound(this.posX, this.posY, this.posZ, sound, 20, f(f(0.95) + f(this.rand.nextFloat() * f(0.1))), true);
    }
    if (this.fireworkAge % 2 === 0 && list && this.fireworkAge / 2 < list.length) {
      const e = list[this.fireworkAge / 2];
      const type = Number(e.Type ?? 0);
      const trail = tagBool(e, 'Trail');
      const flicker = tagBool(e, 'Flicker');
      let colours = tagInts(e, 'Colors');
      const fades = tagInts(e, 'FadeColors');
      // An explosion without colours would crash the original; draw it white instead.
      if (colours.length === 0) colours = [0xffffff];
      if (type === 1) this.createBall(0.5, 4, colours, fades, trail, flicker);
      else if (type === 2) this.createShaped(0.5, STAR_SHAPE, colours, fades, trail, flicker, false);
      else if (type === 3) this.createShaped(0.5, CREEPER_SHAPE, colours, fades, trail, flicker, true);
      else if (type === 4) this.createBurst(colours, fades, trail, flicker);
      else this.createBall(0.25, 2, colours, fades, trail, flicker);
      const c = colours[0];
      const flash = new EntityFireworkOverlayFX(this.worldObj, this.posX, this.posY, this.posZ);
      flash.setRBGColorF(f(((c & 0xff0000) >> 16) / 255), f(((c & 0xff00) >> 8) / 255), f((c & 0xff) / 255));
      this.effectRenderer.addEffect(flash);
    }
    this.fireworkAge++;
    if (this.fireworkAge > this.particleMaxAge) {
      if (this.twinkle) {
        const far = this.isFar(this.posX, this.posY, this.posZ);
        this.worldObj.playSound(this.posX, this.posY, this.posZ, far ? 'fireworks.twinkle_far' : 'fireworks.twinkle', 20, f(f(0.9) + f(this.rand.nextFloat() * f(0.15))), true);
      }
      this.setDead();
    }
  }

  private createParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, colours: number[], fades: number[], trail: boolean, flicker: boolean): void {
    const spark = new EntityFireworkSparkFX(this.worldObj, x, y, z, vx, vy, vz, this.effectRenderer);
    spark.setTrail(trail);
    spark.setTwinkle(flicker);
    spark.setColour(colours[this.rand.nextInt(colours.length)]);
    if (fades.length > 0) spark.setFadeColour(fades[this.rand.nextInt(fades.length)]);
    this.effectRenderer.addEffect(spark);
  }

  /** Shapes 0 and 1: the surface of a cube of (2r+1)^3 directions normalised to `speed`. */
  private createBall(speed: number, r: number, colours: number[], fades: number[], trail: boolean, flicker: boolean): void {
    const x = this.posX;
    const y = this.posY;
    const z = this.posZ;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        for (let k = -r; k <= r; k++) {
          const dx = i + (this.rand.nextDouble() - this.rand.nextDouble()) * 0.5;
          const dy = j + (this.rand.nextDouble() - this.rand.nextDouble()) * 0.5;
          const dz = k + (this.rand.nextDouble() - this.rand.nextDouble()) * 0.5;
          const len = MathHelper.sqrt_double(dx * dx + dy * dy + dz * dz) / speed + this.rand.nextGaussian() * 0.05;
          this.createParticle(x, y, z, dx / len, dy / len, dz / len, colours, fades, trail, flicker);
          if (j !== -r && j !== r && i !== -r && i !== r) k += r * 2 - 1;
        }
      }
    }
  }

  /** Shapes 2 and 3: the outline swept around three random angles (creeper nearly flat). */
  private createShaped(
    speed: number,
    shape: ReadonlyArray<readonly [number, number]>,
    colours: number[],
    fades: number[],
    trail: boolean,
    flicker: boolean,
    flat: boolean,
  ): void {
    const [x0, y0] = shape[0];
    this.createParticle(this.posX, this.posY, this.posZ, x0 * speed, y0 * speed, 0, colours, fades, trail, flicker);
    const start = f(this.rand.nextFloat() * f(Math.PI));
    const spread = flat ? 0.034 : 0.34;
    for (let n = 0; n < 3; n++) {
      const angle = start + f(n * f(Math.PI)) * spread;
      let px = x0;
      let py = y0;
      for (let p = 1; p < shape.length; p++) {
        const [nx, ny] = shape[p];
        for (let t = 0.25; t <= 1.0; t += 0.25) {
          let vx = (px + (nx - px) * t) * speed;
          const vy = (py + (ny - py) * t) * speed;
          const vz = vx * Math.sin(angle);
          vx *= Math.cos(angle);
          for (let side = -1.0; side <= 1.0; side += 2.0) {
            this.createParticle(this.posX, this.posY, this.posZ, vx * side, vy, vz * side, colours, fades, trail, flicker);
          }
        }
        px = nx;
        py = ny;
      }
    }
  }

  /** Shape 4: 70 sparks thrown upwards around the rocket's own motion. */
  private createBurst(colours: number[], fades: number[], trail: boolean, flicker: boolean): void {
    const ox = this.rand.nextGaussian() * 0.05;
    const oz = this.rand.nextGaussian() * 0.05;
    for (let i = 0; i < 70; i++) {
      const vx = this.motionX * 0.5 + this.rand.nextGaussian() * 0.15 + ox;
      const vz = this.motionZ * 0.5 + this.rand.nextGaussian() * 0.15 + oz;
      const vy = this.motionY * 0.5 + this.rand.nextDouble() * 0.5;
      this.createParticle(this.posX, this.posY, this.posZ, vx, vy, vz, colours, fades, trail, flicker);
    }
  }

  override getFXLayer(): number {
    return 0;
  }
}
