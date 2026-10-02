import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { BlockSilverfish } from '../block/BlockSilverfish';
import { Facing } from '../core/Facing';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { type DamageSource, DamageSource as Sources, EntityDamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EnumCreatureAttribute } from './EntityLiving';
import { EntityMob } from './EntityMob';

const f = Math.fround;

/**
 * A silverfish (EntitySilverfish): old-AI mob that chases vulnerable players within 8 blocks,
 * bites from 1.2 blocks for 1 damage, and 20 ticks after being hurt wakes the silverfish
 * hiding in monster egg blocks within 10 blocks (searching outwards, stopping at random).
 * Idle, it burrows into a neighbouring stone, cobblestone or stone brick block. Spawns in any
 * light (monster spawners in strongholds), never with a player within 5 blocks.
 */
export class EntitySilverfish extends EntityMob {
  private allySummonCooldown = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/silverfish.png';
    this.setSize(f(0.3), f(0.7));
    this.moveSpeed = f(0.6);
  }

  getMaxHealth(): number {
    return 8;
  }

  protected override canTriggerWalking(): boolean {
    return false;
  }

  protected override findPlayerToAttack(): Entity | null {
    return this.worldObj.getClosestVulnerablePlayerToEntity(this, 8);
  }

  protected override getLivingSound(): string | null {
    return 'mob.silverfish.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.silverfish.hit';
  }

  protected override getDeathSound(): string | null {
    return 'mob.silverfish.kill';
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.allySummonCooldown <= 0 && (src instanceof EntityDamageSource || src === Sources.magic)) this.allySummonCooldown = 20;
    return super.attackEntityFrom(src, amount);
  }

  protected override attackEntity(target: Entity, dist: number): void {
    if (this.attackTime <= 0 && dist < f(1.2) && target.boundingBox.maxY > this.boundingBox.minY && target.boundingBox.minY < this.boundingBox.maxY) {
      this.attackTime = 20;
      this.attackEntityAsMob(target);
    }
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.silverfish.step', f(0.15), 1);
  }

  protected override getDropItemId(): number {
    return 0;
  }

  override onUpdate(): void {
    this.renderYawOffset = this.rotationYaw;
    super.onUpdate();
  }

  protected override updateEntityActionState(): void {
    super.updateEntityActionState();
    const w = this.worldObj;
    if (this.allySummonCooldown > 0) {
      this.allySummonCooldown--;
      if (this.allySummonCooldown === 0) this.callAllies();
    }
    if (this.entityToAttack === null && !this.hasPath()) {
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.posY + 0.5);
      const z = MathHelper.floor_double(this.posZ);
      const side = this.rand.nextInt(6);
      const nx = x + Facing.offsetsXForSide[side];
      const ny = y + Facing.offsetsYForSide[side];
      const nz = z + Facing.offsetsZForSide[side];
      const id = w.getBlockId(nx, ny, nz);
      if (BlockSilverfish.getPosingIdByMetadata(id)) {
        w.setBlock(nx, ny, nz, BlockIds.silverfish, BlockSilverfish.getMetadataForBlockType(id), 3);
        this.spawnExplosionParticle();
        this.setDead();
      } else {
        this.updateWanderPath();
      }
    } else if (this.entityToAttack !== null && !this.hasPath()) {
      this.entityToAttack = null;
    }
  }

  /** Breaks monster eggs around it (y within 5, x/z within 10, nearest layers first). */
  private callAllies(): void {
    const w = this.worldObj;
    const x0 = MathHelper.floor_double(this.posX);
    const y0 = MathHelper.floor_double(this.posY);
    const z0 = MathHelper.floor_double(this.posZ);
    const egg = Block.blocksList[BlockIds.silverfish];
    let done = false;
    for (let dy = 0; !done && dy <= 5 && dy >= -5; dy = dy <= 0 ? 1 - dy : -dy) {
      for (let dx = 0; !done && dx <= 10 && dx >= -10; dx = dx <= 0 ? 1 - dx : -dx) {
        for (let dz = 0; !done && dz <= 10 && dz >= -10; dz = dz <= 0 ? 1 - dz : -dz) {
          if (w.getBlockId(x0 + dx, y0 + dy, z0 + dz) !== BlockIds.silverfish) continue;
          w.destroyBlock(x0 + dx, y0 + dy, z0 + dz, false);
          egg?.onBlockDestroyedByPlayer(w, x0 + dx, y0 + dy, z0 + dz, 0);
          if (this.rand.nextBoolean()) {
            done = true;
            break;
          }
        }
      }
    }
  }

  /** Prefers standing on stone. */
  override getBlockPathWeight(x: number, y: number, z: number): number {
    return this.worldObj.getBlockId(x, y - 1, z) === BlockIds.stone ? 10 : super.getBlockPathWeight(x, y, z);
  }

  protected override isValidLightLevel(): boolean {
    return true;
  }

  override getCanSpawnHere(): boolean {
    return super.getCanSpawnHere() && this.worldObj.getClosestPlayerToEntity(this, 5) === null;
  }

  override getAttackStrength(_target: Entity): number {
    return 1;
  }

  override getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.ARTHROPOD;
  }
}
