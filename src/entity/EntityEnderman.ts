import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { World } from '../world/World';
import { type DamageSource, EntityDamageSource, EntityDamageSourceIndirect } from './DamageSource';
import { DamageSource as Sources } from './DamageSource';
import type { Entity } from './Entity';
import { EntityMob } from './EntityMob';
import type { EntityPlayer } from './EntityPlayer';
import { tagNumber } from './HostileMobUtil';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/** Blocks an enderman picks up (EntityEnderman.carriableBlocks). */
const CARRIABLE = new Set<number>([
  BlockIds.grass,
  BlockIds.dirt,
  BlockIds.sand,
  BlockIds.gravel,
  BlockIds.plantYellow,
  BlockIds.plantRed,
  BlockIds.mushroomBrown,
  BlockIds.mushroomRed,
  BlockIds.tnt,
  BlockIds.cactus,
  BlockIds.blockClay,
  BlockIds.pumpkin,
  BlockIds.melon,
  BlockIds.mycelium,
]);

/** A signed byte, as the DataWatcher stores the carried block (byte)(id & 255). */
const toByte = (v: number): number => ((v & 255) << 24) >> 24;

/**
 * An enderman (EntityEnderman): old-AI mob that turns hostile when a vulnerable player within
 * 64 blocks stares at its head for 5 checks (not through a pumpkin; Creative players never
 * count, as in 1.5.2), then screams and teleports towards them; picks up and puts down the
 * carriable blocks (mobGriefing), is hurt by water and teleports away from it, from fire and
 * from daylight, and dodges every projectile by teleporting.
 */
export class EntityEnderman extends EntityMob {
  private teleportDelay = 0;
  /** Stare counter (field_70826_g). */
  private stareTimer = 0;
  /** A player provoked it (field_104003_g): keep screaming. */
  private isAggressive = false;
  /** DataWatcher 16-18: carried block id and metadata, screaming. */
  private carried = 0;
  private carriedData = 0;
  private screaming = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/enderman.png';
    this.moveSpeed = f(0.2);
    this.setSize(f(0.6), f(2.9));
    this.stepHeight = 1;
  }

  getMaxHealth(): number {
    return 40;
  }

  protected override findPlayerToAttack(): Entity | null {
    const p = this.worldObj.getClosestVulnerablePlayerToEntity(this, 64);
    if (!p) return null;
    if (this.shouldAttackPlayer(p)) {
      this.isAggressive = true;
      if (this.stareTimer === 0) this.worldObj.playSoundAtEntity(p, 'mob.endermen.stare', 1, 1);
      if (this.stareTimer++ === 5) {
        this.stareTimer = 0;
        this.setScreaming(true);
        return p;
      }
    } else {
      this.stareTimer = 0;
    }
    return null;
  }

  /** The player looks straight at the head (within 0.025 / distance) and can see it, without a pumpkin on. */
  private shouldAttackPlayer(p: EntityPlayer): boolean {
    const helmet = p.inventory.armorInventory[3];
    if (helmet && helmet.itemID === BlockIds.pumpkin) return false;
    const look = p.getLook(1).normalize();
    let to = new Vec3(this.posX - p.posX, this.boundingBox.minY + f(this.height / 2) - (p.posY + p.getEyeHeight()), this.posZ - p.posZ);
    const d = to.lengthVector();
    to = to.normalize();
    const dot = look.dotProduct(to);
    return dot > 1 - 0.025 / d ? p.canEntityBeSeen(this) : false;
  }

  override onLivingUpdate(): void {
    if (this.isWet()) this.attackEntityFrom(Sources.drown, 1);
    this.moveSpeed = this.entityToAttack ? f(6.5) : f(0.3);
    const w = this.worldObj;
    if (w.worldInfo.gameRules.mobGriefing) {
      if (this.getCarried() === 0) {
        if (this.rand.nextInt(20) === 0) {
          const x = MathHelper.floor_double(this.posX - 2 + this.rand.nextDouble() * 4);
          const y = MathHelper.floor_double(this.posY + this.rand.nextDouble() * 3);
          const z = MathHelper.floor_double(this.posZ - 2 + this.rand.nextDouble() * 4);
          const id = w.getBlockId(x, y, z);
          if (CARRIABLE.has(id)) {
            this.setCarried(w.getBlockId(x, y, z));
            this.setCarryingData(w.getBlockMetadata(x, y, z));
            w.setBlock(x, y, z, 0);
          }
        }
      } else if (this.rand.nextInt(2000) === 0) {
        const x = MathHelper.floor_double(this.posX - 1 + this.rand.nextDouble() * 2);
        const y = MathHelper.floor_double(this.posY + this.rand.nextDouble() * 2);
        const z = MathHelper.floor_double(this.posZ - 1 + this.rand.nextDouble() * 2);
        const id = w.getBlockId(x, y, z);
        const below = w.getBlockId(x, y - 1, z);
        if (id === 0 && below > 0 && Block.blocksList[below]?.renderAsNormalBlock()) {
          w.setBlock(x, y, z, this.getCarried(), this.getCarryingData(), 3);
          this.setCarried(0);
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      w.spawnParticle(
        'portal',
        this.posX + (this.rand.nextDouble() - 0.5) * this.width,
        this.posY + this.rand.nextDouble() * this.height - 0.25,
        this.posZ + (this.rand.nextDouble() - 0.5) * this.width,
        (this.rand.nextDouble() - 0.5) * 2,
        -this.rand.nextDouble(),
        (this.rand.nextDouble() - 0.5) * 2,
      );
    }
    if (w.isDaytime()) {
      const b = this.getBrightness(1);
      if (
        b > 0.5 &&
        w.canBlockSeeTheSky(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ)) &&
        f(this.rand.nextFloat() * 30) < f(f(b - f(0.4)) * 2)
      ) {
        this.calmDown();
        this.teleportRandomly();
      }
    }
    if (this.isWet() || this.isBurning()) {
      this.calmDown();
      this.teleportRandomly();
    }
    if (this.isScreaming() && !this.isAggressive && this.rand.nextInt(100) === 0) this.setScreaming(false);
    this.isJumping = false;
    if (this.entityToAttack) this.faceEntity(this.entityToAttack, 100, 100);
    if (this.isEntityAlive()) {
      const t = this.entityToAttack;
      if (t) {
        if (t.isPlayerEntity && this.shouldAttackPlayer(t as EntityPlayer)) {
          this.moveStrafing = this.moveForward = 0;
          this.moveSpeed = 0;
          if (t.getDistanceSqToEntity(this) < 16) this.teleportRandomly();
          this.teleportDelay = 0;
        } else if (t.getDistanceSqToEntity(this) > 256 && this.teleportDelay++ >= 30 && this.teleportToEntity(t)) {
          this.teleportDelay = 0;
        }
      } else {
        this.setScreaming(false);
        this.teleportDelay = 0;
      }
    }
    super.onLivingUpdate();
  }

  private calmDown(): void {
    this.entityToAttack = null;
    this.setScreaming(false);
    this.isAggressive = false;
  }

  /** Anywhere within 32 blocks horizontally and vertically. */
  protected teleportRandomly(): boolean {
    const x = this.posX + (this.rand.nextDouble() - 0.5) * 64;
    const y = this.posY + (this.rand.nextInt(64) - 32);
    const z = this.posZ + (this.rand.nextDouble() - 0.5) * 64;
    return this.teleportTo(x, y, z);
  }

  /** About 16 blocks closer to the entity, give or take 4 sideways and 8 vertically. */
  protected teleportToEntity(e: Entity): boolean {
    let v = new Vec3(this.posX - e.posX, this.boundingBox.minY + f(this.height / 2) - e.posY + e.getEyeHeight(), this.posZ - e.posZ);
    v = v.normalize();
    const r = 16;
    const x = this.posX + (this.rand.nextDouble() - 0.5) * 8 - v.xCoord * r;
    const y = this.posY + (this.rand.nextInt(16) - 8) - v.yCoord * r;
    const z = this.posZ + (this.rand.nextDouble() - 0.5) * 8 - v.zCoord * r;
    return this.teleportTo(x, y, z);
  }

  /**
   * Drops from (x, y, z) to the first block that blocks movement and moves there when the box
   * is free of blocks and liquid; leaves a trail of 128 portal particles and plays the sound
   * at both ends.
   */
  protected teleportTo(x: number, y: number, z: number): boolean {
    const ox = this.posX;
    const oy = this.posY;
    const oz = this.posZ;
    this.posX = x;
    this.posY = y;
    this.posZ = z;
    let ok = false;
    const bx = MathHelper.floor_double(this.posX);
    let by = MathHelper.floor_double(this.posY);
    const bz = MathHelper.floor_double(this.posZ);
    const w = this.worldObj;
    if (w.blockExists(bx, by, bz)) {
      let ground = false;
      while (!ground && by > 0) {
        const id = w.getBlockId(bx, by - 1, bz);
        if (id !== 0 && Block.blocksList[id]?.blockMaterial.blocksMovement()) {
          ground = true;
        } else {
          this.posY--;
          by--;
        }
      }
      if (ground) {
        this.setPosition(this.posX, this.posY, this.posZ);
        if (w.getCollidingBoundingBoxes(this, this.boundingBox).length === 0 && !w.isAnyLiquid(this.boundingBox)) ok = true;
      }
    }
    if (!ok) {
      this.setPosition(ox, oy, oz);
      return false;
    }
    const n = 128;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const vx = f(f(this.rand.nextFloat() - f(0.5)) * f(0.2));
      const vy = f(f(this.rand.nextFloat() - f(0.5)) * f(0.2));
      const vz = f(f(this.rand.nextFloat() - f(0.5)) * f(0.2));
      const px = ox + (this.posX - ox) * t + (this.rand.nextDouble() - 0.5) * this.width * 2;
      const py = oy + (this.posY - oy) * t + this.rand.nextDouble() * this.height;
      const pz = oz + (this.posZ - oz) * t + (this.rand.nextDouble() - 0.5) * this.width * 2;
      w.spawnParticle('portal', px, py, pz, vx, vy, vz);
    }
    w.playSoundEffect(ox, oy, oz, 'mob.endermen.portal', 1, 1);
    this.playSound('mob.endermen.portal', 1, 1);
    return true;
  }

  protected override getLivingSound(): string | null {
    return this.isScreaming() ? 'mob.endermen.scream' : 'mob.endermen.idle';
  }

  protected override getHurtSound(): string | null {
    return 'mob.endermen.hit';
  }

  protected override getDeathSound(): string | null {
    return 'mob.endermen.death';
  }

  protected override getDropItemId(): number {
    return ItemIds.enderPearl;
  }

  /** 0-1 ender pearls (more with looting). */
  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const id = this.getDropItemId();
    if (id <= 0) return;
    const n = this.rand.nextInt(2 + looting);
    for (let i = 0; i < n; i++) this.dropItem(id, 1);
  }

  setCarried(id: number): void {
    this.carried = toByte(id);
  }

  getCarried(): number {
    return this.carried;
  }

  setCarryingData(meta: number): void {
    this.carriedData = toByte(meta);
  }

  getCarryingData(): number {
    return this.carriedData;
  }

  /** Any hit makes it scream; a player's hit keeps it angry; projectiles make it teleport away instead. */
  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    // A Creative player's hit does not provoke it (it still teleports away from projectiles).
    const creative = src.getEntity()?.isCreativeInvulnerable() ?? false;
    if (!creative) this.setScreaming(true);
    if (src instanceof EntityDamageSource && src.getEntity()?.isPlayerEntity && !creative) this.isAggressive = true;
    if (src instanceof EntityDamageSourceIndirect) {
      this.isAggressive = false;
      for (let i = 0; i < 64; i++) if (this.teleportRandomly()) return true;
      return false;
    }
    return super.attackEntityFrom(src, amount);
  }

  isScreaming(): boolean {
    return this.screaming;
  }

  setScreaming(v: boolean): void {
    this.screaming = v;
  }

  override getAttackStrength(_target: Entity): number {
    return 7;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setShort(tag, 'carried', this.getCarried());
    NBT.setShort(tag, 'carriedData', this.getCarryingData());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setCarried(NBT.getShort(tag, 'carried'));
    this.setCarryingData(NBT.getShort(tag, 'carriedData'));
  }
}
