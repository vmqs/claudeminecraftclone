import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import { DamageSource } from '../entity/DamageSource';
import { blastProtectedKnockback } from '../entity/EnchantmentHooks';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { World } from './World';

const f = Math.fround;

/**
 * An explosion (Explosion): 16x16x16 rays from the centre lose strength through block
 * resistance and mark the blocks they reach (doExplosionA, which also hurts and pushes
 * entities by exposure); doExplosionB plays the sound and particles, drops 1/size of the
 * blocks and removes them, and lights fires for flaming explosions.
 */
export class Explosion {
  isFlaming = false;
  isSmoking = true;
  private readonly rayCount = 16;
  private readonly explosionRNG = new JavaRandom();
  /** Blocks the rays reached (to destroy in doExplosionB). */
  readonly affectedBlockPositions: [number, number, number][] = [];
  /** Knockback each player received (sent to clients by the original server). */
  readonly playerKnockback = new Map<EntityPlayer, Vec3>();

  constructor(
    private readonly worldObj: World,
    readonly exploder: Entity | null,
    readonly explosionX: number,
    readonly explosionY: number,
    readonly explosionZ: number,
    public explosionSize: number,
  ) {}

  /** Finds the affected blocks and damages and pushes entities within 2 x size. */
  doExplosionA(): void {
    const size = this.explosionSize;
    const found = new Map<string, [number, number, number]>();
    const n = this.rayCount;
    const w = this.worldObj;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          if (i !== 0 && i !== n - 1 && j !== 0 && j !== n - 1 && k !== 0 && k !== n - 1) continue;
          let dx = f(f(f(i / f(n - 1)) * 2) - 1);
          let dy = f(f(f(j / f(n - 1)) * 2) - 1);
          let dz = f(f(f(k / f(n - 1)) * 2) - 1);
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          dx /= len;
          dy /= len;
          dz /= len;
          let strength = f(this.explosionSize * f(f(0.7) + f(w.rand.nextFloat() * f(0.6))));
          let x = this.explosionX;
          let y = this.explosionY;
          let z = this.explosionZ;
          const step = f(0.3);
          for (; strength > 0; strength = f(strength - f(step * f(0.75)))) {
            const bx = MathHelper.floor_double(x);
            const by = MathHelper.floor_double(y);
            const bz = MathHelper.floor_double(z);
            const id = w.getBlockId(bx, by, bz);
            if (id > 0) {
              const block = Block.blocksList[id]!;
              const resistance = this.exploder ? this.exploder.getBlockExplosionResistance(this, w, bx, by, bz, block) : block.getExplosionResistance(this.exploder);
              strength = f(strength - f(f(resistance + f(0.3)) * step));
            }
            if (strength > 0 && (!this.exploder || this.exploder.canExplosionDestroyBlock(this, w, bx, by, bz, id, strength))) {
              found.set(`${bx},${by},${bz}`, [bx, by, bz]);
            }
            x += dx * step;
            y += dy * step;
            z += dz * step;
          }
        }
      }
    }
    this.affectedBlockPositions.push(...found.values());
    this.explosionSize = f(this.explosionSize * 2);
    const r = this.explosionSize;
    const box = AxisAlignedBB.getBoundingBox(
      MathHelper.floor_double(this.explosionX - r - 1),
      MathHelper.floor_double(this.explosionY - r - 1),
      MathHelper.floor_double(this.explosionZ - r - 1),
      MathHelper.floor_double(this.explosionX + r + 1),
      MathHelper.floor_double(this.explosionY + r + 1),
      MathHelper.floor_double(this.explosionZ + r + 1),
    );
    const centre = new Vec3(this.explosionX, this.explosionY, this.explosionZ);
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this.exploder, box)) {
      const dist = e.getDistance(this.explosionX, this.explosionY, this.explosionZ) / this.explosionSize;
      if (dist > 1) continue;
      let dx = e.posX - this.explosionX;
      let dy = e.posY + e.getEyeHeight() - this.explosionY;
      let dz = e.posZ - this.explosionZ;
      const len = MathHelper.sqrt_double(dx * dx + dy * dy + dz * dz);
      if (len === 0) continue;
      dx /= len;
      dy /= len;
      dz /= len;
      const exposure = w.getBlockDensity(centre, e.boundingBox);
      const impact = (1 - dist) * exposure;
      e.attackEntityFrom(DamageSource.setExplosionSource(this), Math.trunc(((impact * impact + impact) / 2) * 8 * this.explosionSize + 1));
      const push = blastProtectedKnockback(e, impact);
      e.motionX += dx * push;
      e.motionY += dy * push;
      e.motionZ += dz * push;
      if (e.isPlayerEntity) this.playerKnockback.set(e as EntityPlayer, new Vec3(dx * impact, dy * impact, dz * impact));
    }
    this.explosionSize = size;
  }

  /**
   * Sound, particles, block removal with 1/size drop chance, and fires when flaming. In single
   * player both the integrated server and the client's copy of the explosion (Packet60) play
   * the sound, so it is heard twice at two random pitches; the particles only exist once.
   */
  doExplosionB(spawnParticles: boolean): void {
    const w = this.worldObj;
    const rounds = spawnParticles ? 2 : 1;
    for (let i = 0; i < rounds; i++) {
      w.playSoundEffect(this.explosionX, this.explosionY, this.explosionZ, 'random.explode', 4, f(f(1 + f(f(w.rand.nextFloat() - w.rand.nextFloat()) * f(0.2))) * f(0.7)));
    }
    w.spawnParticle(this.explosionSize >= 2 && this.isSmoking ? 'hugeexplosion' : 'largeexplode', this.explosionX, this.explosionY, this.explosionZ, 1, 0, 0);
    if (this.isSmoking) {
      for (const [x, y, z] of this.affectedBlockPositions) {
        const id = w.getBlockId(x, y, z);
        if (spawnParticles) {
          const px = f(x + w.rand.nextFloat());
          const py = f(y + w.rand.nextFloat());
          const pz = f(z + w.rand.nextFloat());
          let vx = px - this.explosionX;
          let vy = py - this.explosionY;
          let vz = pz - this.explosionZ;
          const len = MathHelper.sqrt_double(vx * vx + vy * vy + vz * vz);
          vx /= len;
          vy /= len;
          vz /= len;
          let speed = 0.5 / (len / this.explosionSize + 0.1);
          speed *= f(f(w.rand.nextFloat() * w.rand.nextFloat()) + f(0.3));
          vx *= speed;
          vy *= speed;
          vz *= speed;
          w.spawnParticle('explode', (px + this.explosionX) / 2, (py + this.explosionY) / 2, (pz + this.explosionZ) / 2, vx, vy, vz);
          w.spawnParticle('smoke', px, py, pz, vx, vy, vz);
        }
        if (id > 0) {
          const block = Block.blocksList[id]!;
          if (block.canDropFromExplosion(this)) block.dropBlockAsItemWithChance(w, x, y, z, w.getBlockMetadata(x, y, z), f(1 / this.explosionSize), 0);
          w.setBlock(x, y, z, 0, 0, 3);
          block.onBlockDestroyedByExplosion(w, x, y, z, this);
        }
      }
    }
    if (this.isFlaming) {
      for (const [x, y, z] of this.affectedBlockPositions) {
        if (w.getBlockId(x, y, z) === 0 && Block.opaqueCubeLookup[w.getBlockId(x, y - 1, z)] && this.explosionRNG.nextInt(3) === 0) w.setBlock(x, y, z, BlockIds.fire);
      }
    }
  }

  /** func_77277_b */
  getPlayerKnockbackMap(): Map<EntityPlayer, Vec3> {
    return this.playerKnockback;
  }

  /** func_94613_c: who to blame (the TNT's igniter, or the exploding mob). */
  getExplosivePlacedBy(): EntityLiving | null {
    const e = this.exploder;
    if (!e) return null;
    const placer = (e as { getTntPlacedBy?(): EntityLiving | null }).getTntPlacedBy;
    if (placer) return placer.call(e);
    return e.isLivingEntity ? (e as EntityLiving) : null;
  }
}
