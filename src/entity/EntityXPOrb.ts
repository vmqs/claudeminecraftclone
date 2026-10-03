import { Block } from '../block/Block';
import { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import { EntityLiving, getXPSplit } from './EntityLiving';
import type { EntityPlayer } from './EntityPlayer';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/** Orb sizes: the texture index for a value (getTextureByXP). */
const ORB_THRESHOLDS = [3, 7, 17, 37, 73, 149, 307, 617, 1237, 2477];

/**
 * An experience orb (EntityXPOrb): bounces around, drifts towards the closest player within
 * 8 blocks, and gives its value when touched (one orb every 2 ticks per player).
 */
export class EntityXPOrb extends Entity {
  /** Animation clock of the colour pulse. */
  xpColor = 0;
  xpOrbAge = 0;
  /** Pickup delay (field_70532_c). */
  pickupDelay = 0;
  private xpOrbHealth = 5;
  private xpValue = 0;
  private closestPlayer: EntityPlayer | null = null;
  private xpTargetColor = 0;

  constructor(world: World, x?: number, y?: number, z?: number, value?: number) {
    super(world);
    if (x === undefined || y === undefined || z === undefined) {
      this.setSize(0.25, 0.25);
      this.yOffset = f(this.height / 2);
      return;
    }
    this.setSize(0.5, 0.5);
    this.yOffset = f(this.height / 2);
    this.setPosition(x, y, z);
    this.rotationYaw = f(Math.random() * 360);
    this.motionX = f(f(f(Math.random() * f(0.2)) - f(0.1)) * 2);
    this.motionY = f(f(Math.random() * 0.2) * 2);
    this.motionZ = f(f(f(Math.random() * f(0.2)) - f(0.1)) * 2);
    this.xpValue = value ?? 0;
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  /** Glows: block light raised to at least 7.5 (half of full brightness). */
  override getBrightnessForRender(pt: number): number {
    const glow = f(0.5);
    const packed = super.getBrightnessForRender(pt);
    let block = packed & 255;
    const sky = (packed >> 16) & 255;
    block += Math.trunc(f(f(glow * 15) * 16));
    if (block > 240) block = 240;
    return block | (sky << 16);
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.pickupDelay > 0) this.pickupDelay--;
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY -= f(0.03);
    if (this.worldObj.getBlockMaterial(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ)) === Material.lava) {
      this.motionY = f(0.2);
      this.motionX = f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2));
      this.motionZ = f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2));
      this.playSoundEchoed('random.fizz', f(0.4), () => f(2 + f(this.rand.nextFloat() * f(0.4))));
    }
    this.pushOutOfBlocks(this.posX, (this.boundingBox.minY + this.boundingBox.maxY) / 2, this.posZ);
    const range = 8;
    if (this.xpTargetColor < this.xpColor - 20 + (this.entityId % 100)) {
      if (!this.closestPlayer || this.closestPlayer.getDistanceSqToEntity(this) > range * range) {
        this.closestPlayer = this.worldObj.getClosestPlayerToEntity(this, range);
      }
      this.xpTargetColor = this.xpColor;
    }
    const p = this.closestPlayer;
    if (p) {
      const dx = (p.posX - this.posX) / range;
      const dy = (p.posY + p.getEyeHeight() - this.posY) / range;
      const dz = (p.posZ - this.posZ) / range;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let pull = 1 - d;
      if (pull > 0) {
        pull *= pull;
        this.motionX += (dx / d) * pull * 0.1;
        this.motionY += (dy / d) * pull * 0.1;
        this.motionZ += (dz / d) * pull * 0.1;
      }
    }
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    let slip = f(0.98);
    if (this.onGround) {
      slip = f(0.58800006);
      const id = this.worldObj.getBlockId(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.boundingBox.minY) - 1, MathHelper.floor_double(this.posZ));
      const b = id > 0 ? Block.blocksList[id] : null;
      if (b) slip = f(f(b.slipperiness) * f(0.98));
    }
    this.motionX *= slip;
    this.motionY *= f(0.98);
    this.motionZ *= slip;
    if (this.onGround) this.motionY *= f(-0.9);
    this.xpColor++;
    this.xpOrbAge++;
    if (this.xpOrbAge >= 6000) this.setDead();
  }

  /** Pushed by water without splashing (like dropped items). */
  override handleWaterMovement(): boolean {
    return this.worldObj.handleMaterialAcceleration(this.boundingBox, Material.water, this);
  }

  protected override dealFireDamage(amount: number): void {
    this.attackEntityFrom(DamageSource.inFire, amount);
  }

  override attackEntityFrom(_src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.setBeenAttacked();
    this.xpOrbHealth -= amount;
    if (this.xpOrbHealth <= 0) this.setDead();
    return false;
  }

  override onCollideWithPlayer(player: EntityPlayer): void {
    if (this.pickupDelay !== 0 || player.xpCooldown !== 0) return;
    player.xpCooldown = 2;
    this.playSound('random.orb', f(0.1), f(f(0.5) * f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.7)) + f(1.8))));
    player.onItemPickup(this, 1);
    player.addExperience(this.xpValue);
    this.setDead();
  }

  getXpValue(): number {
    return this.xpValue;
  }

  /** 0 (smallest) .. 10 (largest) orb sprite. */
  getTextureByXP(): number {
    let i = 0;
    while (i < ORB_THRESHOLDS.length && this.xpValue >= ORB_THRESHOLDS[i]) i++;
    return i;
  }

  static getXPSplit(xp: number): number {
    return getXPSplit(xp);
  }

  override canAttackWithItem(): boolean {
    return false;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setShort(tag, 'Health', (this.xpOrbHealth << 24) >> 24);
    NBT.setShort(tag, 'Age', this.xpOrbAge);
    NBT.setShort(tag, 'Value', this.xpValue);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.xpOrbHealth = NBT.getShort(tag, 'Health') & 255;
    this.xpOrbAge = NBT.getShort(tag, 'Age');
    this.xpValue = NBT.getShort(tag, 'Value');
  }
}

EntityLiving.experienceOrbFactory = (w, x, y, z, value) => new EntityXPOrb(w, x, y, z, value);
