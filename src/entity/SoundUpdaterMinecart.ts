import { MathHelper } from '../core/MathHelper';
import type { Entity } from './Entity';
import type { EntityMinecart } from './EntityMinecart';

/** The looping entity-sound calls of the SoundManager this uses. */
export interface EntitySoundSink {
  playEntitySound(name: string, e: Entity, volume: number, pitch: number, priority?: boolean): void;
  isEntitySoundPlaying(e: Entity): boolean;
  stopEntitySound(e: Entity): void;
  setEntitySoundVolume(e: Entity, volume: number): void;
  setEntitySoundPitch(e: Entity, pitch: number): void;
  /** Moves e's looping sound to `at` (defaults to e itself). */
  updateSoundLocation(e: Entity, at?: Entity): void;
}

const f = Math.fround;

/**
 * The rolling sound of a minecart (SoundUpdaterMinecart): "minecart.base" loops on the cart
 * with its pitch ramping up to 1 while it moves and its volume following the speed, and
 * "minecart.inside" loops on the local player while riding it. Both stop when the cart halts.
 */
export class SoundUpdaterMinecart {
  private riding = false;
  private dead = false;
  private moving = false;
  private silent = false;
  private pitch = 0;
  private moveVolume = 0;
  private rideVolume = 0;
  private speed = 0;

  constructor(
    private readonly sounds: EntitySoundSink,
    private readonly cart: EntityMinecart,
    private readonly getPlayer: () => Entity | null,
  ) {}

  update(): void {
    const player = this.getPlayer();
    let started = false;
    const wasRiding = this.riding;
    const wasDead = this.dead;
    const wasMoving = this.moving;
    const oldMove = this.moveVolume;
    const oldPitch = this.pitch;
    const oldRide = this.rideVolume;
    this.riding = player !== null && this.cart.riddenByEntity === player;
    this.dead = this.cart.isDead;
    this.speed = MathHelper.sqrt_double(this.cart.motionX * this.cart.motionX + this.cart.motionZ * this.cart.motionZ);
    this.moving = this.speed >= 0.01;
    if (wasRiding && !this.riding && player) this.sounds.stopEntitySound(player);
    if (this.dead || (!this.silent && this.moveVolume === 0 && this.rideVolume === 0)) {
      if (!wasDead) {
        this.sounds.stopEntitySound(this.cart);
        if ((wasRiding || this.riding) && player) this.sounds.stopEntitySound(player);
      }
      this.silent = true;
      if (this.dead) return;
    }
    if (!this.sounds.isEntitySoundPlaying(this.cart) && this.moveVolume > 0) {
      this.sounds.playEntitySound('minecart.base', this.cart, this.moveVolume, this.pitch, false);
      this.silent = false;
      started = true;
    }
    if (this.riding && player && !this.sounds.isEntitySoundPlaying(player) && this.rideVolume > 0) {
      this.sounds.playEntitySound('minecart.inside', player, this.rideVolume, 1, true);
      this.silent = false;
      started = true;
    }
    if (this.moving) {
      if (this.pitch < 1) this.pitch = f(this.pitch + f(0.0025));
      if (this.pitch > 1) this.pitch = 1;
      let k = f(MathHelper.clamp_float(f(this.speed), 0, 4) / 4);
      this.rideVolume = f(k * f(0.75));
      k = MathHelper.clamp_float(f(k * 2), 0, 1);
      this.moveVolume = f(k * f(0.7));
    } else if (wasMoving) {
      this.moveVolume = 0;
      this.pitch = 0;
      this.rideVolume = 0;
    }
    if (!this.silent) {
      if (this.pitch !== oldPitch) this.sounds.setEntitySoundPitch(this.cart, this.pitch);
      if (this.moveVolume !== oldMove) this.sounds.setEntitySoundVolume(this.cart, this.moveVolume);
      if (this.rideVolume !== oldRide && player) this.sounds.setEntitySoundVolume(player, this.rideVolume);
    }
    if (!started && (this.moveVolume > 0 || this.rideVolume > 0)) {
      this.sounds.updateSoundLocation(this.cart);
      if (this.riding && player) this.sounds.updateSoundLocation(player, this.cart);
    } else {
      if (this.sounds.isEntitySoundPlaying(this.cart)) this.sounds.stopEntitySound(this.cart);
      if (this.riding && player && this.sounds.isEntitySoundPlaying(player)) this.sounds.stopEntitySound(player);
    }
  }
}
