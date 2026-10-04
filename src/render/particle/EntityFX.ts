import { MathHelper } from '../../core/MathHelper';
import { Entity } from '../../entity/Entity';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import type { Icon } from '../texture/Icon';

const f = Math.fround;

/**
 * Base particle (EntityFX): a camera-facing quad on one of the four EffectRenderer layers.
 * Layer 0 samples particles.png in 16x16 cells (setParticleTextureIndex), layers 1 and 2 an icon
 * of the terrain or item atlas, and layer 3 draws itself (lit particles).
 */
export class EntityFX extends Entity {
  /** The camera position (interpolated) the particles are drawn relative to. */
  static interpPosX = 0;
  static interpPosY = 0;
  static interpPosZ = 0;
  protected particleTextureIndexX = 0;
  protected particleTextureIndexY = 0;
  protected particleTextureJitterX: number;
  protected particleTextureJitterY: number;
  protected particleAge = 0;
  protected particleMaxAge: number;
  protected particleScale: number;
  protected particleGravity = 0;
  protected particleRed = 1;
  protected particleGreen = 1;
  protected particleBlue = 1;
  protected particleAlpha = 1;
  protected particleIcon: Icon | null = null;

  /**
   * Without a velocity the particle starts at rest (the protected 4-argument constructor). With
   * one, the velocity gets a random kick of up to 0.4 per axis and is then rescaled to a random
   * speed of 0.06-0.18 plus 0.1 upwards, as every 7-argument EntityFX does.
   */
  constructor(w: World, x: number, y: number, z: number, vx?: number, vy?: number, vz?: number) {
    super(w);
    this.setSize(f(0.2), f(0.2));
    this.yOffset = f(this.height / 2);
    this.setPosition(x, y, z);
    this.lastTickPosX = x;
    this.lastTickPosY = y;
    this.lastTickPosZ = z;
    this.particleTextureJitterX = f(this.rand.nextFloat() * 3);
    this.particleTextureJitterY = f(this.rand.nextFloat() * 3);
    this.particleScale = f(f(f(this.rand.nextFloat() * f(0.5)) + f(0.5)) * 2);
    this.particleMaxAge = Math.trunc(f(4 / f(f(this.rand.nextFloat() * f(0.9)) + f(0.1))));
    if (vx !== undefined && vy !== undefined && vz !== undefined) {
      this.motionX = vx + f(f(Math.random() * 2 - 1) * f(0.4));
      this.motionY = vy + f(f(Math.random() * 2 - 1) * f(0.4));
      this.motionZ = vz + f(f(Math.random() * 2 - 1) * f(0.4));
      const speed = f(f(Math.random() + Math.random() + 1) * f(0.15));
      const len = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionY * this.motionY + this.motionZ * this.motionZ);
      this.motionX = (this.motionX / len) * speed * f(0.4);
      this.motionY = (this.motionY / len) * speed * f(0.4) + f(0.1);
      this.motionZ = (this.motionZ / len) * speed * f(0.4);
    }
  }

  multiplyVelocity(m: number): this {
    this.motionX *= m;
    this.motionY = (this.motionY - f(0.1)) * m + f(0.1);
    this.motionZ *= m;
    return this;
  }

  multipleParticleScaleBy(m: number): this {
    this.setSize(f(0.2 * m), f(0.2 * m));
    this.particleScale = f(this.particleScale * m);
    return this;
  }

  setRBGColorF(r: number, g: number, b: number): void {
    this.particleRed = r;
    this.particleGreen = g;
    this.particleBlue = b;
  }

  setAlphaF(a: number): void {
    this.particleAlpha = a;
  }

  getRedColorF(): number {
    return this.particleRed;
  }

  getGreenColorF(): number {
    return this.particleGreen;
  }

  getBlueColorF(): number {
    return this.particleBlue;
  }

  protected override canTriggerWalking(): boolean {
    return false;
  }

  protected entityInit(): void {}

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.motionY -= 0.04 * this.particleGravity;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.98);
    this.motionY *= f(0.98);
    this.motionZ *= f(0.98);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }

  /**
   * Arguments after the partial tick are the billboard axes (ActiveRenderInfo rotationX,
   * rotationXZ, rotationZ, rotationYZ, rotationXY): the quad spans
   * (+-rx +-ryz, +-rxz, +-rz +-rxy) * size around the interpolated position.
   */
  renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    let u0 = f(this.particleTextureIndexX / 16);
    let u1 = f(u0 + f(0.0624375));
    let v0 = f(this.particleTextureIndexY / 16);
    let v1 = f(v0 + f(0.0624375));
    const s = f(0.1 * this.particleScale);
    if (this.particleIcon) {
      u0 = this.particleIcon.getMinU();
      u1 = this.particleIcon.getMaxU();
      v0 = this.particleIcon.getMinV();
      v1 = this.particleIcon.getMaxV();
    }
    const x = f(this.prevPosX + (this.posX - this.prevPosX) * pt - EntityFX.interpPosX);
    const y = f(this.prevPosY + (this.posY - this.prevPosY) * pt - EntityFX.interpPosY);
    const z = f(this.prevPosZ + (this.posZ - this.prevPosZ) * pt - EntityFX.interpPosZ);
    t.setColorRGBA_F(this.particleRed, this.particleGreen, this.particleBlue, this.particleAlpha);
    EntityFX.billboard(t, x, y, z, s, rx, rxz, rz, ryz, rxy, u1, u0, v0, v1);
  }

  /**
   * The quad of EntityDiggingFX and EntityBreakingFX: a quarter of the icon picked by the
   * texture jitter, in the opaque particle colour.
   */
  protected renderIconCrumb(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    let u0 = f(f(this.particleTextureIndexX + f(this.particleTextureJitterX / 4)) / 16);
    let u1 = f(u0 + f(0.015609375));
    let v0 = f(f(this.particleTextureIndexY + f(this.particleTextureJitterY / 4)) / 16);
    let v1 = f(v0 + f(0.015609375));
    const s = f(0.1 * this.particleScale);
    const icon = this.particleIcon;
    if (icon) {
      u0 = icon.getInterpolatedU(f(f(this.particleTextureJitterX / 4) * 16));
      u1 = icon.getInterpolatedU(f(f(f(this.particleTextureJitterX + 1) / 4) * 16));
      v0 = icon.getInterpolatedV(f(f(this.particleTextureJitterY / 4) * 16));
      v1 = icon.getInterpolatedV(f(f(f(this.particleTextureJitterY + 1) / 4) * 16));
    }
    const x = f(this.prevPosX + (this.posX - this.prevPosX) * pt - EntityFX.interpPosX);
    const y = f(this.prevPosY + (this.posY - this.prevPosY) * pt - EntityFX.interpPosY);
    const z = f(this.prevPosZ + (this.posZ - this.prevPosZ) * pt - EntityFX.interpPosZ);
    t.setColorOpaque_F(this.particleRed, this.particleGreen, this.particleBlue);
    EntityFX.billboard(t, x, y, z, s, rx, rxz, rz, ryz, rxy, u0, u1, v0, v1);
  }

  /**
   * Emits the four billboard corners; `uLeft` goes with the -rx side (the default particles
   * mirror their cell this way, crumbs do not).
   */
  static billboard(
    t: Tessellator,
    x: number,
    y: number,
    z: number,
    s: number,
    rx: number,
    rxz: number,
    rz: number,
    ryz: number,
    rxy: number,
    uLeft: number,
    uRight: number,
    vTop: number,
    vBottom: number,
  ): void {
    t.addVertexWithUV(f(x - rx * s - ryz * s), f(y - rxz * s), f(z - rz * s - rxy * s), uLeft, vBottom);
    t.addVertexWithUV(f(x - rx * s + ryz * s), f(y + rxz * s), f(z - rz * s + rxy * s), uLeft, vTop);
    t.addVertexWithUV(f(x + rx * s + ryz * s), f(y + rxz * s), f(z + rz * s + rxy * s), uRight, vTop);
    t.addVertexWithUV(f(x + rx * s - ryz * s), f(y - rxz * s), f(z + rz * s - rxy * s), uRight, vBottom);
  }

  /** 0 = particles.png, 1 = terrain atlas, 2 = item atlas, 3 = lit (draws itself). */
  getFXLayer(): number {
    return 0;
  }

  setParticleIcon(icon: Icon | null): void {
    this.particleIcon = icon;
  }

  /** A 16x16 cell of particles.png (layer 0 only). */
  setParticleTextureIndex(i: number): void {
    this.particleTextureIndexX = i % 16;
    this.particleTextureIndexY = Math.trunc(i / 16);
  }

  nextTextureIndexX(): void {
    this.particleTextureIndexX++;
  }

  override canAttackWithItem(): boolean {
    return false;
  }

  override toString(): string {
    return `${this.constructor.name}, Pos (${this.posX},${this.posY},${this.posZ}), RGBA (${this.particleRed},${this.particleGreen},${this.particleBlue},${this.particleAlpha}), Age ${this.particleAge}`;
  }
}
