import { EntityPlayerSP, type PlayerClient } from '../../client/EntityPlayerSP';
import { MathHelper } from '../../core/MathHelper';
import { DamageSource } from '../../entity/DamageSource';
import type { Entity } from '../../entity/Entity';
import type { IInventory } from '../../gui/inventory/IInventory';
import type { World } from '../../world/World';
import type { Packet } from '../protocol/Packets';

const f = Math.fround;

/** Where the guest's player sends its packets (NetClientHandler.addToSendQueue). */
export interface PlayerPacketSink {
  addToSendQueue(p: Packet): void;
}

/**
 * The guest's own player (EntityClientPlayerMP): moves itself with the same physics as single
 * player and reports where it is every tick (sendMotionUpdates: position when it moved more than
 * 0.03 blocks or every 20 ticks, look when it turned), along with sneaking and sprinting. The host
 * decides about damage, death, items and windows: health arrives as Packet8, windows open only
 * when the host says so, picking things up is the host's.
 */
export class EntityClientPlayerMP extends EntityPlayerSP {
  private oldPosX = 0;
  private oldMinY = 0;
  private oldPosY = 0;
  private oldPosZ = 0;
  private oldRotationYaw = 0;
  private oldRotationPitch = 0;
  private wasSprinting = false;
  private wasSneaking = false;
  private ticksSinceMovePacket = 0;
  private hasSetHealth = false;
  /** Set while the network handler opens a window, so only the host's windows open. */
  openingFromHost = false;

  constructor(
    mc: PlayerClient,
    world: World,
    username: string,
    readonly sendQueue: PlayerPacketSink,
  ) {
    super(mc, world, username);
  }

  /** The host decides about damage. */
  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    return false;
  }

  override heal(_n: number): void {}

  override onUpdate(): void {
    if (this.worldObj.blockExists(MathHelper.floor_double(this.posX), 0, MathHelper.floor_double(this.posZ))) {
      super.onUpdate();
      this.sendMotionUpdates();
    }
  }

  /** sendMotionUpdates: Packet19 for sprint/sneak changes, then Packet10-13 for the move. */
  sendMotionUpdates(): void {
    const sprinting = this.isSprinting();
    if (sprinting !== this.wasSprinting) {
      this.sendQueue.addToSendQueue({ type: 'EntityAction', entityId: this.entityId, state: sprinting ? 4 : 5 });
      this.wasSprinting = sprinting;
    }
    const sneaking = this.isSneaking();
    if (sneaking !== this.wasSneaking) {
      this.sendQueue.addToSendQueue({ type: 'EntityAction', entityId: this.entityId, state: sneaking ? 1 : 2 });
      this.wasSneaking = sneaking;
    }
    const dx = this.posX - this.oldPosX;
    const dy = this.boundingBox.minY - this.oldMinY;
    const dz = this.posZ - this.oldPosZ;
    const dyaw = this.rotationYaw - this.oldRotationYaw;
    const dpitch = this.rotationPitch - this.oldRotationPitch;
    let moved = dx * dx + dy * dy + dz * dz > 9.0e-4 || this.ticksSinceMovePacket >= 20;
    const rotated = dyaw !== 0 || dpitch !== 0;
    const ground = this.onGround ? 4 : 0;
    if (this.ridingEntity) {
      // Packet13PlayerLookMove(motionX, -999, -999, motionZ): the steering of a boat or cart.
      this.sendQueue.addToSendQueue({ type: 'Flying', flags: 1 | 2 | ground, x: this.motionX, y: -999, stance: -999, z: this.motionZ, yaw: this.rotationYaw, pitch: this.rotationPitch });
      moved = false;
    } else {
      const flags = (moved ? 1 : 0) | (rotated ? 2 : 0) | ground;
      this.sendQueue.addToSendQueue({ type: 'Flying', flags, x: this.posX, y: this.boundingBox.minY, stance: this.posY, z: this.posZ, yaw: this.rotationYaw, pitch: this.rotationPitch });
    }
    this.ticksSinceMovePacket++;
    if (moved) {
      this.oldPosX = this.posX;
      this.oldMinY = this.boundingBox.minY;
      this.oldPosY = this.posY;
      this.oldPosZ = this.posZ;
      this.ticksSinceMovePacket = 0;
    }
    if (rotated) {
      this.oldRotationYaw = this.rotationYaw;
      this.oldRotationPitch = this.rotationPitch;
    }
  }

  /** Q drops through the host (Packet14 status 4 or 3); the host's inventory update follows. */
  override dropOneItem(wholeStack: boolean): Entity | null {
    this.sendQueue.addToSendQueue({ type: 'BlockDig', status: wholeStack ? 3 : 4, x: 0, y: 0, z: 0, face: 0 });
    return null;
  }

  override sendChatMessage(msg: string): void {
    this.sendQueue.addToSendQueue({ type: 'Chat', message: msg });
  }

  override swingItem(): void {
    super.swingItem();
    this.sendQueue.addToSendQueue({ type: 'Animation', entityId: this.entityId, animate: 1 });
  }

  override respawnPlayer(): void {
    this.sendQueue.addToSendQueue({ type: 'ClientCommand', payload: 1 });
  }

  protected override damageEntity(_src: DamageSource, amount: number): void {
    if (!this.isEntityInvulnerable()) this.setEntityHealth(this.getHealth() - amount);
  }

  /**
   * Packet8UpdateHealth (EntityPlayerSP.setHealth): a drop in health plays the hurt animation
   * and camera shake; the first value just sets it.
   */
  setHealthFromServer(health: number): void {
    if (!this.hasSetHealth) {
      this.setEntityHealth(health);
      this.hasSetHealth = true;
      return;
    }
    const diff = this.getHealth() - health;
    if (diff <= 0) {
      this.setEntityHealth(health);
      if (diff < 0) this.hurtResistantTime = Math.trunc(this.maxHurtResistantTime / 2);
    } else {
      this.lastDamage = diff;
      this.setEntityHealth(this.getHealth());
      this.hurtResistantTime = this.maxHurtResistantTime;
      this.damageEntity(DamageSource.generic, diff);
      this.hurtTime = this.maxHurtTime = 10;
    }
  }

  /** Closing a window tells the host (Packet101) and forgets the cursor stack. */
  override closeScreen(): void {
    this.sendQueue.addToSendQueue({ type: 'CloseWindow', windowId: this.openContainer.windowId });
    this.closeScreenFromHost();
  }

  /** The host closed the window (func_92015_f). */
  closeScreenFromHost(): void {
    this.inventory.setItemStack(null);
    super.closeScreen();
  }

  override sendPlayerAbilities(): void {
    const c = this.capabilities;
    const flags = (c.disableDamage ? 1 : 0) | (c.isFlying ? 2 : 0) | (c.allowFlying ? 4 : 0) | (c.isCreativeMode ? 8 : 0);
    this.sendQueue.addToSendQueue({ type: 'PlayerAbilities', flags, flySpeed: c.getFlySpeed(), walkSpeed: c.getWalkSpeed() });
  }

  /** Riding is the host's: only its AttachEntity packets mount and dismount. */
  override mountEntity(e: Entity | null): void {
    if (this.openingFromHost) super.mountEntity(e);
  }

  // Windows open when the host says so (NetClientHandler.handleOpenWindow sets openingFromHost).
  override displayGUIChest(inv: IInventory): void {
    if (this.openingFromHost) super.displayGUIChest(inv);
  }
  override displayGUIWorkbench(x: number, y: number, z: number): void {
    if (this.openingFromHost) super.displayGUIWorkbench(x, y, z);
  }
  override displayGUIFurnace(furnace: IInventory): void {
    if (this.openingFromHost) super.displayGUIFurnace(furnace);
  }
  override displayGUIDispenser(dispenser: IInventory): void {
    if (this.openingFromHost) super.displayGUIDispenser(dispenser);
  }
  override displayGUIHopper(hopper: IInventory): void {
    if (this.openingFromHost) super.displayGUIHopper(hopper);
  }
  override displayGUIHopperMinecart(cart: IInventory): void {
    if (this.openingFromHost) super.displayGUIHopperMinecart(cart);
  }
  override displayGUIBrewingStand(stand: IInventory): void {
    if (this.openingFromHost) super.displayGUIBrewingStand(stand);
  }
  override displayGUIEnchantment(x: number, y: number, z: number, customName: string | null): void {
    if (this.openingFromHost) super.displayGUIEnchantment(x, y, z, customName);
  }
  override displayGUIAnvil(x: number, y: number, z: number): void {
    if (this.openingFromHost) super.displayGUIAnvil(x, y, z);
  }
  override displayGUIBeacon(beacon: IInventory): void {
    if (this.openingFromHost) super.displayGUIBeacon(beacon);
  }
  override displayGUIMerchant(_merchant: object, _customName: string | null): void {}

  /** Status 9 from the host: the item in use is finished (EntityPlayer.handleHealthUpdate(9)). */
  override handleHealthUpdate(status: number): void {
    if (status === 9) this.onItemUseFinish();
    else super.handleHealthUpdate(status);
  }

  /** Field access for the network handler (Packet43Experience). */
  setXPStats(bar: number, total: number, level: number): void {
    this.experience = f(bar);
    this.experienceTotal = total;
    this.experienceLevel = level;
  }
}
