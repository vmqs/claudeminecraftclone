import { ItemIds } from '../block/BlockIds';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { Biomes } from '../world/biome/BiomeGenBase';
import type { Chunk } from '../world/Chunk';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { EntityLiving } from './EntityLiving';
import type { EntityPlayer } from './EntityPlayer';
import { tagNumber } from './HostileMobUtil';

const f = Math.fround;

/** Swamp spawning chance by moon phase (full moon 1, new moon 0). */
const SPAWN_CHANCES = [1, f(0.75), f(0.5), f(0.25), 0, f(0.25), f(0.5), f(0.75)];

/**
 * Chunk.getRandomWithSeed: the per-chunk random used by the slime-chunk rule, seeded from the
 * world seed and the chunk coordinates (with the original's int overflow) xor `salt`.
 */
export function chunkRandomWithSeed(seed: bigint, cx: number, cz: number, salt: bigint): JavaRandom {
  const a = BigInt(Math.imul(Math.imul(cx, cx), 4987142));
  const b = BigInt(Math.imul(cx, 5947611));
  const c = BigInt(Math.imul(cz, cz)) * 4392871n;
  const d = BigInt(Math.imul(cz, 389711));
  const sum = BigInt.asIntN(64, seed + a + b + c + d);
  return new JavaRandom(BigInt.asIntN(64, sum ^ salt));
}

/** Whether slimes may spawn in this chunk below y 40 (one chunk in ten). */
export function isSlimeChunk(w: World, chunk: Chunk): boolean {
  return chunkRandomWithSeed(w.getSeed(), chunk.xPosition, chunk.zPosition, 987234911n).nextInt(10) === 0;
}

/**
 * A slime (EntitySlime, IMob): sizes 1, 2 and 4 (health size^2), hops towards the closest
 * vulnerable player within 16 blocks (three times as often when one is near), squishes on
 * jumping and landing, hurts players it touches (size > 1) for `size` damage, splits into 2-4
 * half-size slimes on death and drops slimeballs at size 1. Spawns in slime chunks below y 40
 * or in swamps between y 50 and 70 by moon phase.
 */
export class EntitySlime extends EntityLiving {
  /** Squish target (field_70813_a), current squish (field_70811_b) and last tick's (field_70812_c). */
  squishAmount = 0;
  squishFactor = 0;
  prevSquishFactor = 0;
  private slimeJumpDelay = 0;
  /** DataWatcher 16: size. */
  private slimeSize = 1;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/slime.png';
    const size = 1 << this.rand.nextInt(3);
    this.yOffset = 0;
    this.slimeJumpDelay = this.rand.nextInt(20) + 10;
    this.setSlimeSize(size);
  }

  override get isIMob(): boolean {
    return true;
  }

  setSlimeSize(size: number): void {
    this.slimeSize = size;
    this.setSize(f(f(0.6) * size), f(f(0.6) * size));
    this.setPosition(this.posX, this.posY, this.posZ);
    this.setEntityHealth(this.getMaxHealth());
    this.experienceValue = size;
  }

  getMaxHealth(): number {
    const s = this.getSlimeSize();
    return s * s;
  }

  getSlimeSize(): number {
    return this.slimeSize;
  }

  readEntityFromNBT(tag: Record<string, unknown>): void {
    this.setSlimeSize((tagNumber(tag, 'Size') ?? 0) + 1);
  }

  writeEntityToNBT(tag: Record<string, unknown>): void {
    tag.Size = this.getSlimeSize() - 1;
  }

  protected getSlimeParticle(): string {
    return 'slime';
  }

  protected getJumpSound(): string {
    return 'mob.slime.' + (this.getSlimeSize() > 1 ? 'big' : 'small');
  }

  override onUpdate(): void {
    if (this.worldObj.difficultySetting === 0 && this.getSlimeSize() > 0) this.isDead = true;
    this.squishFactor = f(this.squishFactor + f(f(this.squishAmount - this.squishFactor) * f(0.5)));
    this.prevSquishFactor = this.squishFactor;
    const wasOnGround = this.onGround;
    super.onUpdate();
    if (this.onGround && !wasOnGround) {
      const s = this.getSlimeSize();
      for (let i = 0; i < s * 8; i++) {
        const a = f(f(this.rand.nextFloat() * f(Math.PI)) * 2);
        const r = f(f(this.rand.nextFloat() * f(0.5)) + f(0.5));
        const dx = f(f(f(MathHelper.sin(a) * s) * f(0.5)) * r);
        const dz = f(f(f(MathHelper.cos(a) * s) * f(0.5)) * r);
        this.worldObj.spawnParticle(this.getSlimeParticle(), this.posX + dx, this.boundingBox.minY, this.posZ + dz, 0, 0, 0);
      }
      if (this.makesSoundOnLand()) this.playSound(this.getJumpSound(), this.getSoundVolume(), f(f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1) / f(0.8)));
      this.squishAmount = f(-0.5);
    } else if (!this.onGround && wasOnGround) {
      this.squishAmount = 1;
    }
    this.alterSquishAmount();
  }

  /** Hops: faces the player, then jumps forward `size` blocks per jump after the delay. */
  protected override updateEntityActionState(): void {
    this.despawnEntity();
    const p = this.worldObj.getClosestVulnerablePlayerToEntity(this, 16);
    if (p) this.faceEntity(p, 10, 20);
    if (this.onGround && this.slimeJumpDelay-- <= 0) {
      this.slimeJumpDelay = this.getJumpDelay();
      if (p) this.slimeJumpDelay = Math.trunc(this.slimeJumpDelay / 3);
      this.isJumping = true;
      if (this.makesSoundOnJump()) this.playSound(this.getJumpSound(), this.getSoundVolume(), f(f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1) * f(0.8)));
      this.moveStrafing = f(1 - f(this.rand.nextFloat() * 2));
      this.moveForward = this.getSlimeSize();
    } else {
      this.isJumping = false;
      if (this.onGround) this.moveStrafing = this.moveForward = 0;
    }
  }

  /** func_70808_l: the squish relaxes by 0.6 per tick (magma cubes 0.9). */
  protected alterSquishAmount(): void {
    this.squishAmount = f(this.squishAmount * f(0.6));
  }

  protected getJumpDelay(): number {
    return this.rand.nextInt(20) + 10;
  }

  protected createInstance(): EntitySlime {
    return new EntitySlime(this.worldObj);
  }

  /** Dying slimes bigger than 1 split into 2-4 slimes of half the size. */
  override setDead(): void {
    const s = this.getSlimeSize();
    if (s > 1 && this.getHealth() <= 0) {
      const n = 2 + this.rand.nextInt(3);
      for (let i = 0; i < n; i++) {
        const dx = f(f(f((i % 2) - f(0.5)) * s) / 4);
        const dz = f(f(f(Math.trunc(i / 2) - f(0.5)) * s) / 4);
        const child = this.createInstance();
        child.setSlimeSize(Math.trunc(s / 2));
        child.setLocationAndAngles(this.posX + dx, this.posY + 0.5, this.posZ + dz, f(this.rand.nextFloat() * 360), 0);
        this.worldObj.spawnEntityInWorld(child);
      }
    }
    super.setDead();
  }

  /** Touching a player it can see within 0.6 x size hurts them (attack sound on a hit). */
  override onCollideWithPlayer(player: EntityPlayer): void {
    if (!this.canDamagePlayer()) return;
    const s = this.getSlimeSize();
    if (
      this.canEntityBeSeen(player) &&
      this.getDistanceSqToEntity(player) < 0.6 * s * 0.6 * s &&
      player.attackEntityFrom(DamageSource.causeMobDamage(this), this.getAttackStrength())
    ) {
      this.playSound('mob.attack', 1, f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
    }
  }

  protected canDamagePlayer(): boolean {
    return this.getSlimeSize() > 1;
  }

  protected getAttackStrength(): number {
    return this.getSlimeSize();
  }

  protected override getHurtSound(): string | null {
    return 'mob.slime.' + (this.getSlimeSize() > 1 ? 'big' : 'small');
  }

  protected override getDeathSound(): string | null {
    return 'mob.slime.' + (this.getSlimeSize() > 1 ? 'big' : 'small');
  }

  protected override getDropItemId(): number {
    return this.getSlimeSize() === 1 ? ItemIds.slimeBall : 0;
  }

  override getCanSpawnHere(): boolean {
    const w = this.worldObj;
    const chunk = w.getChunkFromBlockCoords(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posZ));
    if (w.worldInfo.terrainType === 'flat' && this.rand.nextInt(4) !== 1) return false;
    if (this.getSlimeSize() === 1 || w.difficultySetting > 0) {
      const biome = w.getBiomeGenForCoords(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posZ));
      if (
        biome === Biomes.swampland &&
        this.posY > 50 &&
        this.posY < 70 &&
        this.rand.nextFloat() < f(0.5) &&
        this.rand.nextFloat() < SPAWN_CHANCES[w.getMoonPhase()] &&
        w.getBlockLightValue(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ)) <= this.rand.nextInt(8)
      ) {
        return super.getCanSpawnHere();
      }
      if (this.rand.nextInt(10) === 0 && isSlimeChunk(w, chunk) && this.posY < 40) return super.getCanSpawnHere();
    }
    return false;
  }

  protected override getSoundVolume(): number {
    return f(f(0.4) * this.getSlimeSize());
  }

  override getVerticalFaceSpeed(): number {
    return 0;
  }

  protected makesSoundOnJump(): boolean {
    return this.getSlimeSize() > 0;
  }

  protected makesSoundOnLand(): boolean {
    return this.getSlimeSize() > 2;
  }
}
