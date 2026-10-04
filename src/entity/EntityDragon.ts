import { BlockEndPortal } from '../block/BlockEndPortal';
import { BlockIds } from '../block/BlockIds';
import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityDragonPart, type IEntityMultiPart } from './EntityDragonPart';
import { EntityEnderCrystal } from './EntityEnderCrystal';
import { EntityLiving } from './EntityLiving';
import { EntityXPOrb } from './EntityXPOrb';

const f = Math.fround;
const PI_F = f(Math.PI);

/** Ender crystals (getEntitiesWithinAABB(EntityEnderCrystal.class, ...)). */
const isCrystal = (e: Entity): e is EntityEnderCrystal => e instanceof EntityEnderCrystal;

/**
 * The Ender Dragon (EntityDragon, a boss with 200 health): seven hit boxes (EntityDragonPart),
 * a 64-entry ring buffer of yaw and height that bends the neck and tail, and the 1.5.2 flight:
 * it steers towards a target point (a random player half the time, otherwise a random point
 * 70-120 high within 60 blocks of the origin), heals 1 every 10 ticks from the nearest ender
 * crystal within 32 blocks (and takes 10 from its head when that crystal is destroyed), knocks
 * back living things under its wings, bites for 10 with its head and destroys every block but
 * obsidian, end stone and bedrock it flies through (slowing down where it cannot). It only
 * takes damage through its parts, from players and explosions; other parts than the head take a
 * quarter. Dying, it rises for 200 ticks shedding 12000 experience and leaves the exit portal
 * with the dragon egg on top.
 *
 * Single player ran this class twice (the integrated server's copy with the flight AI, the
 * client's for wing sounds and animation); here one copy does both, and a guest's copy only
 * the client half (`updateClientState` from RemoteEntityVisuals).
 */
export class EntityDragon extends EntityLiving implements IEntityMultiPart {
  targetX = 0;
  targetY = 100;
  targetZ = 0;
  /** ringBuffer[64][3]: yaw, posY and an unused zero per tick. */
  readonly ringBuffer: Float64Array[] = Array.from({ length: 64 }, () => new Float64Array(3));
  ringBufferIndex = -1;
  readonly dragonPartArray: EntityDragonPart[];
  readonly dragonPartHead: EntityDragonPart;
  readonly dragonPartBody: EntityDragonPart;
  readonly dragonPartTail1: EntityDragonPart;
  readonly dragonPartTail2: EntityDragonPart;
  readonly dragonPartTail3: EntityDragonPart;
  readonly dragonPartWing1: EntityDragonPart;
  readonly dragonPartWing2: EntityDragonPart;
  prevAnimTime = 0;
  animTime = 0;
  forceNewTarget = false;
  slowed = false;
  private target: Entity | null = null;
  deathTicks = 0;
  healingEnderCrystal: EntityEnderCrystal | null = null;
  /** DataWatcher 16: the health the boss bar shows. */
  bossHealth = 200;

  constructor(world: World) {
    super(world);
    this.dragonPartArray = [
      (this.dragonPartHead = new EntityDragonPart(this, 'head', 6, 6)),
      (this.dragonPartBody = new EntityDragonPart(this, 'body', 8, 8)),
      (this.dragonPartTail1 = new EntityDragonPart(this, 'tail', 4, 4)),
      (this.dragonPartTail2 = new EntityDragonPart(this, 'tail', 4, 4)),
      (this.dragonPartTail3 = new EntityDragonPart(this, 'tail', 4, 4)),
      (this.dragonPartWing1 = new EntityDragonPart(this, 'wing', 4, 4)),
      (this.dragonPartWing2 = new EntityDragonPart(this, 'wing', 4, 4)),
    ];
    this.setEntityHealth(this.getMaxHealth());
    this.bossHealth = this.getMaxHealth();
    this.texture = '/mob/enderdragon/ender.png';
    this.setSize(16, 8);
    this.noClip = true;
    this.isImmuneToFire_ = true;
    this.targetY = 100;
    this.ignoreFrustumCheck = true;
  }

  getMaxHealth(): number {
    return 200;
  }

  /** IBossDisplayData.getBossHealth (DataWatcher 16). */
  getBossHealth(): number {
    return this.bossHealth;
  }

  getWorld(): World {
    return this.worldObj;
  }

  override getParts(): Entity[] {
    return this.dragonPartArray;
  }

  override canBeCollidedWith(): boolean {
    return false;
  }

  /** The yaw (0), height (1) and zero (2) of `back` ticks ago, interpolated by `pt`. */
  getMovementOffsets(back: number, pt: number): [number, number, number] {
    if (this.getHealth() <= 0) pt = 0;
    pt = f(1 - pt);
    const i = (this.ringBufferIndex - back) & 63;
    const j = (this.ringBufferIndex - back - 1) & 63;
    const a = this.ringBuffer[i];
    const b = this.ringBuffer[j];
    const yaw = a[0] + MathHelper.wrapAngleTo180_double(b[0] - a[0]) * pt;
    const y = a[1] + (b[1] - a[1]) * pt;
    return [yaw, y, a[2] + (b[2] - a[2]) * pt];
  }

  override onLivingUpdate(): void {
    const server = !this.worldObj.isRemote;
    if (server) this.bossHealth = this.getHealth();
    this.playWingSound();
    this.prevAnimTime = this.animTime;
    if (this.getHealth() <= 0) {
      this.deathParticle('largeexplode');
      return;
    }
    this.updateDragonEnderCrystal();
    this.advanceAnimation();
    this.rotationYaw = MathHelper.wrapAngleTo180_float(this.rotationYaw);
    this.pushRingBuffer();
    if (server) this.updateFlight();
    this.renderYawOffset = this.rotationYaw;
    this.layOutParts(server && this.hurtTime === 0);
    if (server) {
      const headBlocked = this.destroyBlocksInAABB(this.dragonPartHead.boundingBox);
      const bodyBlocked = this.destroyBlocksInAABB(this.dragonPartBody.boundingBox);
      this.slowed = headBlocked || bodyBlocked;
    }
  }

  /**
   * The client half of onLivingUpdate for a guest's copy (positions come from the host): wing
   * sounds, the wing beat, the ring buffer, the parts and the healing beam's crystal.
   */
  updateClientState(): void {
    this.playWingSound();
    this.prevAnimTime = this.animTime;
    if (this.getHealth() <= 0) {
      this.deathParticle('largeexplode');
      return;
    }
    this.updateDragonEnderCrystal();
    this.advanceAnimation();
    this.rotationYaw = MathHelper.wrapAngleTo180_float(this.rotationYaw);
    this.pushRingBuffer();
    this.renderYawOffset = this.rotationYaw;
    this.layOutParts(false);
  }

  /** A guest's tick of the dragon (RemoteEntityVisuals): the client half, and the death's ticks. */
  updateRemote(): void {
    this.updateClientState();
    if (this.getHealth() <= 0) {
      // The dragon's own death never advances deathTime (no tipping over, no red death tint).
      this.deathTime = 0;
      this.deathTicks++;
      if (this.deathTicks >= 180 && this.deathTicks <= 200) this.deathParticle('hugeexplosion');
    }
  }

  /** The client's wing flap: mob.enderdragon.wings each time the beat passes its low point. */
  private playWingSound(): void {
    const now = MathHelper.cos(f(f(this.animTime * PI_F) * 2));
    const before = MathHelper.cos(f(f(this.prevAnimTime * PI_F) * 2));
    if (before <= f(-0.3) && now >= f(-0.3)) {
      const pitch = f(f(0.8) + f(this.rand.nextFloat() * f(0.3)));
      this.clientEffect(() => this.worldObj.playSound(this.posX, this.posY, this.posZ, 'mob.enderdragon.wings', 5, pitch, false));
    }
  }

  /** A particle around the body (only clients drew the original's; guests make their own). */
  private deathParticle(name: string): void {
    const dx = f(f(this.rand.nextFloat() - f(0.5)) * 8);
    const dy = f(f(this.rand.nextFloat() - f(0.5)) * 4);
    const dz = f(f(this.rand.nextFloat() - f(0.5)) * 8);
    this.clientEffect(() => this.worldObj.spawnParticle(name, this.posX + dx, this.posY + 2 + dy, this.posZ + dz, 0, 0, 0));
  }

  /** Runs a client-side effect that a LAN host does not forward (guests replay it themselves). */
  private clientEffect(fn: () => void): void {
    const w = this.worldObj;
    const was = w.localEffectsOnly;
    w.localEffectsOnly = true;
    try {
      fn();
    } finally {
      w.localEffectsOnly = was;
    }
  }

  /** The wing beat speeds up when the dragon is slow or climbing, halves while slowed. */
  private advanceAnimation(): void {
    let step = f(f(0.2) / f(f(MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ) * 10) + 1));
    step = f(step * f(Math.pow(2, this.motionY)));
    this.animTime = f(this.animTime + (this.slowed ? f(step * f(0.5)) : step));
  }

  private pushRingBuffer(): void {
    if (this.ringBufferIndex < 0) {
      for (const e of this.ringBuffer) {
        e[0] = this.rotationYaw;
        e[1] = this.posY;
      }
    }
    if (++this.ringBufferIndex === this.ringBuffer.length) this.ringBufferIndex = 0;
    this.ringBuffer[this.ringBufferIndex][0] = this.rotationYaw;
    this.ringBuffer[this.ringBufferIndex][1] = this.posY;
  }

  /** The server's steering: towards (targetX, targetY, targetZ), turning at most 50 degrees per step. */
  private updateFlight(): void {
    const dx = this.targetX - this.posX;
    let dy = this.targetY - this.posY;
    const dz = this.targetZ - this.posZ;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (this.target?.isCreativeInvulnerable()) {
      // Its player switched to Creative: pick something else.
      this.target = null;
      this.forceNewTarget = true;
    }
    if (this.target) {
      this.targetX = this.target.posX;
      this.targetZ = this.target.posZ;
      const tx = this.targetX - this.posX;
      const tz = this.targetZ - this.posZ;
      const d = Math.sqrt(tx * tx + tz * tz);
      let lift = f(0.4) + d / 80 - 1;
      if (lift > 10) lift = 10;
      this.targetY = this.target.boundingBox.minY + lift;
    } else {
      this.targetX += this.rand.nextGaussian() * 2;
      this.targetZ += this.rand.nextGaussian() * 2;
    }
    if (this.forceNewTarget || dist2 < 100 || dist2 > 22500 || this.isCollidedHorizontally || this.isCollidedVertically) this.setNewTarget();
    dy /= MathHelper.sqrt_double(dx * dx + dz * dz);
    const maxClimb = f(0.6);
    if (dy < -maxClimb) dy = -maxClimb;
    if (dy > maxClimb) dy = maxClimb;
    this.motionY += dy * f(0.1);
    this.rotationYaw = MathHelper.wrapAngleTo180_float(this.rotationYaw);
    const wanted = 180 - (Math.atan2(dx, dz) * 180) / PI_F;
    let turn = MathHelper.wrapAngleTo180_double(wanted - this.rotationYaw);
    if (turn > 50) turn = 50;
    if (turn < -50) turn = -50;
    const toTarget = new Vec3(this.targetX - this.posX, this.targetY - this.posY, this.targetZ - this.posZ).normalize();
    const yawRad = f(f(this.rotationYaw * PI_F) / 180);
    const facing = new Vec3(MathHelper.sin(yawRad), this.motionY, -MathHelper.cos(yawRad)).normalize();
    let along = f(f(facing.dotProduct(toTarget) + 0.5) / f(1.5));
    if (along < 0) along = 0;
    this.randomYawVelocity = f(this.randomYawVelocity * f(0.8));
    const speedF = f(f(MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ) * 1) + 1);
    let speed = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ) * 1 + 1;
    if (speed > 40) speed = 40;
    this.randomYawVelocity = f(this.randomYawVelocity + turn * (f(0.7) / speed / speedF));
    this.rotationYaw = f(this.rotationYaw + f(this.randomYawVelocity * f(0.1)));
    const k = f(2 / (speed + 1));
    const thrust = f(0.06);
    this.moveFlying(0, -1, f(thrust * f(f(along * k) + f(1 - k))));
    if (this.slowed) this.moveEntity(this.motionX * f(0.8), this.motionY * f(0.8), this.motionZ * f(0.8));
    else this.moveEntity(this.motionX, this.motionY, this.motionZ);
    const heading = new Vec3(this.motionX, this.motionY, this.motionZ).normalize();
    let drag = f(f(heading.dotProduct(facing) + 1) / 2);
    drag = f(f(0.8) + f(f(0.15) * drag));
    this.motionX *= drag;
    this.motionZ *= drag;
    this.motionY *= f(0.91);
  }

  /**
   * Places the seven parts around the body from the yaw and the ring buffer; with `attack` (the
   * server, not just hurt) pushes living things under the wings and bites with the head.
   */
  private layOutParts(attack: boolean): void {
    const head = this.dragonPartHead;
    const body = this.dragonPartBody;
    head.width = head.height = 3;
    this.dragonPartTail1.width = this.dragonPartTail1.height = 2;
    this.dragonPartTail2.width = this.dragonPartTail2.height = 2;
    this.dragonPartTail3.width = this.dragonPartTail3.height = 2;
    body.height = 3;
    body.width = 5;
    this.dragonPartWing1.height = 2;
    this.dragonPartWing1.width = 4;
    this.dragonPartWing2.height = 3;
    this.dragonPartWing2.width = 4;
    const pitch = f(f(f(f(this.getMovementOffsets(5, 1)[1] - this.getMovementOffsets(10, 1)[1]) * 10) / 180) * PI_F);
    const pc = MathHelper.cos(pitch);
    const ps = f(-MathHelper.sin(pitch));
    const yawRad = f(f(this.rotationYaw * PI_F) / 180);
    const ys = MathHelper.sin(yawRad);
    const yc = MathHelper.cos(yawRad);
    body.onUpdate();
    body.setLocationAndAngles(this.posX + f(ys * f(0.5)), this.posY, this.posZ - f(yc * f(0.5)), 0, 0);
    this.dragonPartWing1.onUpdate();
    this.dragonPartWing1.setLocationAndAngles(this.posX + f(yc * f(4.5)), this.posY + 2, this.posZ + f(ys * f(4.5)), 0, 0);
    this.dragonPartWing2.onUpdate();
    this.dragonPartWing2.setLocationAndAngles(this.posX - f(yc * f(4.5)), this.posY + 2, this.posZ - f(ys * f(4.5)), 0, 0);
    if (attack) {
      this.collideWithEntities(this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.dragonPartWing1.boundingBox.expand(4, 2, 4).offset(0, -2, 0)));
      this.collideWithEntities(this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.dragonPartWing2.boundingBox.expand(4, 2, 4).offset(0, -2, 0)));
      this.attackEntitiesInList(this.worldObj.getEntitiesWithinAABBExcludingEntity(this, head.boundingBox.expand(1, 1, 1)));
    }
    const back5 = this.getMovementOffsets(5, 1);
    const now = this.getMovementOffsets(0, 1);
    const headAngle = f(f(f(this.rotationYaw * PI_F) / 180) - f(this.randomYawVelocity * f(0.01)));
    const hs = MathHelper.sin(headAngle);
    const hc = MathHelper.cos(headAngle);
    head.onUpdate();
    head.setLocationAndAngles(this.posX + f(f(hs * f(5.5)) * pc), this.posY + (now[1] - back5[1]) * 1 + f(ps * f(5.5)), this.posZ - f(f(hc * f(5.5)) * pc), 0, 0);
    const tails = [this.dragonPartTail1, this.dragonPartTail2, this.dragonPartTail3];
    for (let i = 0; i < 3; i++) {
      const part = tails[i];
      const off = this.getMovementOffsets(12 + i * 2, 1);
      const bend = f(MathHelper.wrapAngleTo180_double(off[0] - back5[0]));
      const a = f(f(f(this.rotationYaw * PI_F) / 180) + f(f(f(bend * PI_F) / 180) * 1));
      const s = MathHelper.sin(a);
      const c = MathHelper.cos(a);
      const near = f(1.5);
      const far = f((i + 1) * 2);
      part.onUpdate();
      part.setLocationAndAngles(
        this.posX - f(f(f(ys * near) + f(s * far)) * pc),
        this.posY + (off[1] - back5[1]) * 1 - f(f(far + near) * ps) + 1.5,
        this.posZ + f(f(f(yc * near) + f(c * far)) * pc),
        0,
        0,
      );
    }
  }

  /** Heals from the crystal it is linked to; picks the nearest crystal within 32 blocks 1 tick in 10. */
  private updateDragonEnderCrystal(): void {
    const crystal = this.healingEnderCrystal;
    if (crystal) {
      if (crystal.isDead) {
        if (!this.worldObj.isRemote) this.attackEntityFromPart(this.dragonPartHead, DamageSource.setExplosionSource(null), 10);
        this.healingEnderCrystal = null;
      } else if (this.ticksExisted % 10 === 0 && this.getHealth() < this.getMaxHealth()) {
        this.setEntityHealth(this.getHealth() + 1);
      }
    }
    if (this.rand.nextInt(10) === 0) {
      const r = 32;
      let best: EntityEnderCrystal | null = null;
      let bestD = Number.MAX_VALUE;
      for (const c of this.worldObj.getEntitiesWithinAABB(isCrystal, this.boundingBox.expand(r, r, r))) {
        const d = c.getDistanceSqToEntity(this);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      this.healingEnderCrystal = best;
    }
  }

  /** Pushes living things away from the body's centre (4 / distance, and 0.2 up). */
  private collideWithEntities(list: Entity[]): void {
    const b = this.dragonPartBody.boundingBox;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    for (const e of list) {
      if (!e.isLivingEntity) continue;
      const dx = e.posX - cx;
      const dz = e.posZ - cz;
      const d2 = dx * dx + dz * dz;
      e.addVelocity((dx / d2) * 4, f(0.2), (dz / d2) * 4);
    }
  }

  private attackEntitiesInList(list: Entity[]): void {
    for (const e of list) if (e.isLivingEntity) e.attackEntityFrom(DamageSource.causeMobDamage(this), 10);
  }

  /** Half the time a random player (never a Creative one), otherwise a random point at least 10 blocks away. */
  private setNewTarget(): void {
    this.forceNewTarget = false;
    const players = this.worldObj.playerEntities.filter((p) => !p.isCreativeInvulnerable());
    if (this.rand.nextInt(2) === 0 && players.length > 0) {
      this.target = players[this.rand.nextInt(players.length)];
      return;
    }
    let far = false;
    do {
      this.targetX = 0;
      this.targetY = f(f(70) + f(this.rand.nextFloat() * 50));
      this.targetZ = 0;
      this.targetX += f(f(this.rand.nextFloat() * 120) - 60);
      this.targetZ += f(f(this.rand.nextFloat() * 120) - 60);
      const dx = this.posX - this.targetX;
      const dy = this.posY - this.targetY;
      const dz = this.posZ - this.targetZ;
      far = dx * dx + dy * dy + dz * dz > 100;
    } while (!far);
    this.target = null;
  }

  /**
   * Clears every block in the box but obsidian, end stone and bedrock (with mobGriefing); true
   * when one of those was in the way (the dragon slows down).
   */
  private destroyBlocksInAABB(box: AxisAlignedBB): boolean {
    const x0 = MathHelper.floor_double(box.minX);
    const y0 = MathHelper.floor_double(box.minY);
    const z0 = MathHelper.floor_double(box.minZ);
    const x1 = MathHelper.floor_double(box.maxX);
    const y1 = MathHelper.floor_double(box.maxY);
    const z1 = MathHelper.floor_double(box.maxZ);
    let blocked = false;
    let destroyed = false;
    const w = this.worldObj;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const id = w.getBlockId(x, y, z);
          if (id === 0) continue;
          if (id !== BlockIds.obsidian && id !== BlockIds.whiteStone && id !== BlockIds.bedrock && w.worldInfo.gameRules.mobGriefing) {
            destroyed = w.setBlockToAir(x, y, z) || destroyed;
          } else {
            blocked = true;
          }
        }
      }
    }
    if (destroyed) {
      const px = box.minX + (box.maxX - box.minX) * this.rand.nextFloat();
      const py = box.minY + (box.maxY - box.minY) * this.rand.nextFloat();
      const pz = box.minZ + (box.maxZ - box.minZ) * this.rand.nextFloat();
      this.clientEffect(() => w.spawnParticle('largeexplode', px, py, pz, 0, 0, 0));
    }
    return blocked;
  }

  /**
   * Damage arriving through a part: a quarter (plus one) unless it hit the head; the dragon
   * turns away to a point just ahead of it, and only player and explosion damage counts.
   */
  attackEntityFromPart(part: EntityDragonPart, src: DamageSource, amount: number): boolean {
    if (part !== this.dragonPartHead) amount = Math.trunc(amount / 4) + 1;
    const yawRad = f(f(this.rotationYaw * PI_F) / 180);
    const s = MathHelper.sin(yawRad);
    const c = MathHelper.cos(yawRad);
    this.targetX = this.posX + f(s * 5) + f(f(this.rand.nextFloat() - f(0.5)) * 2);
    this.targetY = this.posY + f(this.rand.nextFloat() * 3) + 1;
    this.targetZ = this.posZ - f(c * 5) + f(f(this.rand.nextFloat() - f(0.5)) * 2);
    this.target = null;
    const by = src.getEntity();
    if (((by !== null && by.isPlayerEntity) || src.isExplosion()) && !this.worldObj.isRemote) this.attackDragonFrom(src, amount);
    return true;
  }

  /** Never hurt directly: only through its parts. */
  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    return false;
  }

  /** func_82195_e: EntityLiving's damage. */
  protected attackDragonFrom(src: DamageSource, amount: number): boolean {
    return super.attackEntityFrom(src, amount);
  }

  /**
   * The death: 200 ticks of rising and spinning, huge explosions in the last 20, 1000 experience
   * every 5 ticks after 150 and 2000 at the end, the dragon's death sound to every player, then
   * the exit portal under where it died.
   */
  protected override onDeathUpdate(): void {
    this.deathTicks++;
    if (this.deathTicks >= 180 && this.deathTicks <= 200) this.deathParticle('hugeexplosion');
    const w = this.worldObj;
    if (!w.isRemote) {
      if (this.deathTicks > 150 && this.deathTicks % 5 === 0) this.dropExperience(1000);
      if (this.deathTicks === 1) w.broadcastSound(1018, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
    }
    this.moveEntity(0, f(0.1), 0);
    this.renderYawOffset = this.rotationYaw = f(this.rotationYaw + 20);
    if (this.deathTicks === 200 && !w.isRemote) {
      this.dropExperience(2000);
      this.createEnderPortal(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posZ));
      this.setDead();
    }
  }

  private dropExperience(total: number): void {
    while (total > 0) {
      const split = EntityXPOrb.getXPSplit(total);
      total -= split;
      this.worldObj.spawnEntityInWorld(new EntityXPOrb(this.worldObj, this.posX, this.posY, this.posZ, split));
    }
  }

  /**
   * The exit portal at (x, 64, z): a bedrock bowl of radius 4 with end portal blocks inside,
   * air above it up to 96, and a bedrock pillar with four torches and the dragon egg on top.
   */
  createEnderPortal(x: number, z: number): void {
    const y0 = 64;
    const r = 4;
    const w = this.worldObj;
    BlockEndPortal.bossDefeated = true;
    const outer = (r - 0.5) * (r - 0.5);
    const inner = (r - 1 - 0.5) * (r - 1 - 0.5);
    for (let y = y0 - 1; y <= y0 + 32; y++) {
      for (let bx = x - r; bx <= x + r; bx++) {
        for (let bz = z - r; bz <= z + r; bz++) {
          const dx = bx - x;
          const dz = bz - z;
          const d2 = dx * dx + dz * dz;
          if (d2 > outer) continue;
          if (y < y0) {
            if (!(d2 > inner)) w.setBlock(bx, y, bz, BlockIds.bedrock);
          } else if (y > y0) {
            w.setBlock(bx, y, bz, 0);
          } else if (d2 > inner) {
            w.setBlock(bx, y, bz, BlockIds.bedrock);
          } else {
            w.setBlock(bx, y, bz, BlockIds.endPortal);
          }
        }
      }
    }
    w.setBlock(x, y0, z, BlockIds.bedrock);
    w.setBlock(x, y0 + 1, z, BlockIds.bedrock);
    w.setBlock(x, y0 + 2, z, BlockIds.bedrock);
    w.setBlock(x - 1, y0 + 2, z, BlockIds.torchWood);
    w.setBlock(x + 1, y0 + 2, z, BlockIds.torchWood);
    w.setBlock(x, y0 + 2, z - 1, BlockIds.torchWood);
    w.setBlock(x, y0 + 2, z + 1, BlockIds.torchWood);
    w.setBlock(x, y0 + 3, z, BlockIds.bedrock);
    w.setBlock(x, y0 + 4, z, BlockIds.dragonEgg);
    BlockEndPortal.bossDefeated = false;
  }

  /** The dragon never despawns. */
  protected override despawnEntity(): void {}

  protected override getLivingSound(): string | null {
    return 'mob.enderdragon.growl';
  }

  protected override getHurtSound(): string | null {
    return 'mob.enderdragon.hit';
  }

  protected override getSoundVolume(): number {
    return 5;
  }
}
