import type { BedSleepStatus } from '../block/BlockBed';
import { MathHelper } from '../core/MathHelper';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { ChunkCoordinates } from './EntityLiving';
import { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * Another player as a client sees it (EntityOtherPlayerMP): its position and rotation come from
 * the network and are approached over `increments` ticks, its feet are at posY (yOffset 0), it
 * takes no damage locally, walks its limbs from the distance moved, and shows its item use from
 * the synced eating flag. For the multiplayer code, and for dev scenes that show players from
 * outside (scripts/scenarios/player.json).
 */
export class EntityOtherPlayerMP extends EntityPlayer {
  private isItemInUse = false;
  private otherPlayerMPPosRotationIncrements = 0;
  private otherPlayerMPX = 0;
  private otherPlayerMPY = 0;
  private otherPlayerMPZ = 0;
  private otherPlayerMPYaw = 0;
  private otherPlayerMPPitch = 0;

  constructor(world: World, name: string) {
    super(world);
    this.username = name;
    this.yOffset = 0;
    this.stepHeight = 0;
    this.noClip = true;
    // Until its first update a player spawned asleep lies a quarter block higher (field_71082_cx).
    this.sleepOffsetY = f(0.25);
    this.renderDistanceWeight = 10;
  }

  /**
   * Always a client's copy, also when shown in a world that is not remote (dev scenes): its
   * hunger, item use, spawn protection and sleep are the owning side's business.
   */
  override isClientSide(): boolean {
    return true;
  }

  /** Its effects live on its owner's side: the swirl colour and invisibility come with its metadata. */
  protected override hasSyncedPotionState(): boolean {
    return true;
  }

  /** Packet17Sleep: the player's own side already checked the bed, so this copy just lies down. */
  override sleepInBedAt(x: number, y: number, z: number): BedSleepStatus {
    this.lieDownInBed(x, y, z);
    return 'OK';
  }

  protected override resetHeight(): void {
    this.yOffset = 0;
  }

  /** The server decides about damage; the client copy ignores hits. */
  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    return true;
  }

  override setPositionAndRotation2(x: number, y: number, z: number, yaw: number, pitch: number, increments: number): void {
    this.otherPlayerMPX = x;
    this.otherPlayerMPY = y;
    this.otherPlayerMPZ = z;
    this.otherPlayerMPYaw = yaw;
    this.otherPlayerMPPitch = pitch;
    this.otherPlayerMPPosRotationIncrements = increments;
  }

  override onUpdate(): void {
    this.sleepOffsetY = 0;
    super.onUpdate();
    this.prevLimbYaw = this.limbYaw;
    const dx = this.posX - this.prevPosX;
    const dz = this.posZ - this.prevPosZ;
    let speed = f(MathHelper.sqrt_double(dx * dx + dz * dz) * 4);
    if (speed > 1) speed = 1;
    this.limbYaw = f(this.limbYaw + f(f(speed - this.limbYaw) * f(0.4)));
    this.limbSwing = f(this.limbSwing + this.limbYaw);
    const held = this.inventory.mainInventory[this.inventory.currentItem];
    if (!this.isItemInUse && this.isEating() && held) {
      this.setItemInUse(held, held.getMaxItemUseDuration());
      this.isItemInUse = true;
    } else if (this.isItemInUse && !this.isEating()) {
      this.clearItemInUse();
      this.isItemInUse = false;
    }
  }

  override getShadowSize(): number {
    return 0;
  }

  /** No physics: glide towards the last network position, and bob the cape like a walking player. */
  override onLivingUpdate(): void {
    this.updateArmSwingProgress();
    if (this.otherPlayerMPPosRotationIncrements > 0) {
      const n = this.otherPlayerMPPosRotationIncrements;
      const x = this.posX + (this.otherPlayerMPX - this.posX) / n;
      const y = this.posY + (this.otherPlayerMPY - this.posY) / n;
      const z = this.posZ + (this.otherPlayerMPZ - this.posZ) / n;
      let dyaw = this.otherPlayerMPYaw - this.rotationYaw;
      while (dyaw < -180) dyaw += 360;
      while (dyaw >= 180) dyaw -= 360;
      this.rotationYaw = f(this.rotationYaw + dyaw / n);
      this.rotationPitch = f(this.rotationPitch + (this.otherPlayerMPPitch - this.rotationPitch) / n);
      this.otherPlayerMPPosRotationIncrements--;
      this.setPosition(x, y, z);
      this.setRotation(this.rotationYaw, this.rotationPitch);
    }
    this.prevCameraYaw = this.cameraYaw;
    let bob = f(MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ));
    let tilt = f(f(Math.atan(-this.motionY * f(0.2))) * 15);
    if (bob > f(0.1)) bob = f(0.1);
    if (!this.onGround || this.getHealth() <= 0) bob = 0;
    if (this.onGround || this.getHealth() <= 0) tilt = 0;
    this.cameraYaw = f(this.cameraYaw + f(f(bob - this.cameraYaw) * f(0.4)));
    this.cameraPitch = f(this.cameraPitch + f(f(tilt - this.cameraPitch) * f(0.8)));
  }

  /** Equipment packets: slot 0 is the held item, 1-4 the armour (boots first). */
  override setCurrentItemOrArmor(slot: number, stack: ItemStack | null): void {
    if (slot === 0) this.inventory.mainInventory[this.inventory.currentItem] = stack;
    else this.inventory.armorInventory[slot - 1] = stack;
  }

  override getEyeHeight(): number {
    return f(1.82);
  }

  override canCommandSenderUseCommand(_level: number, _command: string): boolean {
    return false;
  }

  override getPlayerCoordinates(): ChunkCoordinates {
    return new ChunkCoordinates(MathHelper.floor_double(this.posX + 0.5), MathHelper.floor_double(this.posY + 0.5), MathHelper.floor_double(this.posZ + 0.5));
  }
}
