import { MathHelper } from '../../core/MathHelper';
import type { DamageSource } from '../../entity/DamageSource';
import type { Entity } from '../../entity/Entity';
import { ChunkCoordinates } from '../../entity/EntityLiving';
import { EntityPlayer } from '../../entity/EntityPlayer';
import type { PotionEffectLike } from '../../entity/PotionEffects';
import { ContainerBeacon } from '../../gui/inventory/ContainerBeacon';
import { ContainerBrewingStand } from '../../gui/inventory/ContainerBrewingStand';
import { ContainerChest } from '../../gui/inventory/ContainerChest';
import { ContainerDispenser } from '../../gui/inventory/ContainerDispenser';
import { ContainerEnchantment } from '../../gui/inventory/ContainerEnchantment';
import { ContainerFurnace } from '../../gui/inventory/ContainerFurnace';
import { ContainerHopper } from '../../gui/inventory/ContainerHopper';
import { ContainerRepair } from '../../gui/inventory/ContainerRepair';
import { ContainerWorkbench } from '../../gui/inventory/ContainerWorkbench';
import type { Container, ICrafting } from '../../gui/inventory/Container';
import type { IInventory } from '../../gui/inventory/IInventory';
import { SlotCrafting } from '../../gui/inventory/SlotCrafting';
import { I18n } from '../../core/I18n';
import type { ItemStack } from '../../item/ItemStack';
import type { EnumGameType } from '../../world/EnumGameType';
import type { World } from '../../world/World';
import { TileEntity, type TileEntityConstructor } from '../../world/tileentity/TileEntity';
import type { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import type { TileEntityBrewingStand } from '../../world/tileentity/TileEntityBrewingStand';
import type { TileEntityFurnace } from '../../world/tileentity/TileEntityFurnace';
import { ItemInWorldManager } from './ItemInWorldManager';
import type { NetServerHandler } from './NetServerHandler';
import { WindowType } from '../WindowTypes';
import { StatList } from '../../stats/StatList';

const f = Math.fround;

/** Commands a guest never gets, even with "Allow Cheats". */
const HOST_ONLY_COMMANDS = new Set(['publish', 'kick', 'ban', 'pardon', 'banlist', 'whitelist']);

/** The server half of a LAN host: what EntityPlayerMP asked of MinecraftServer. */
export interface PlayerServer {
  /** ServerConfigurationManager.sendChatMsg: one line for everyone. */
  sendChatMsg(msg: string): void;
  /** areCommandsAllowed: "Allow Cheats" of the Open to LAN screen. */
  readonly commandsAllowedForAll: boolean;
  /** Packets to everyone tracking `e` (and to `e` itself when `self`). */
  sendToTracking(e: Entity, packet: import('../protocol/Packets').Packet, self: boolean): void;
}

/**
 * A guest's player on the host (EntityPlayerMP): a full server player in the host's world
 * (damage, hunger, inventory, windows, game mode) that its guest moves. Its feet are at posY
 * (yOffset 0). The world ticks it once per game tick: its living update runs first, then the
 * guest's next movement packet is applied (NetServerHandler.handleFlying's order), then health,
 * experience and window contents go out.
 */
export class EntityPlayerMP extends EntityPlayer implements ICrafting {
  handler!: NetServerHandler;
  readonly theItemInWorldManager: ItemInWorldManager;
  ping = 0;
  chatVisibility = 0;
  /** Went through the End's exit portal: the credits run until the guest asks to respawn. */
  playerConqueredTheEnd = false;
  /** Render distance the guest asked for, in chunks. */
  renderDistance = 8;
  private lastHealth = -99999999;
  private lastFoodLevel = -99999999;
  private wasHungry = true;
  private lastExperience = -99999999;
  private currentWindowId = 0;
  /** Set while a click is being replayed: its own slot changes are not echoed back (playerInventoryBeingManipulated). */
  playerInventoryBeingManipulated = false;
  /** Progress bar values last sent for the open window. */
  private readonly lastBars: number[] = [];

  constructor(
    world: World,
    name: string,
    readonly server: PlayerServer,
  ) {
    super(world);
    this.username = name;
    this.yOffset = 0;
    this.stepHeight = 0;
    this.theItemInWorldManager = new ItemInWorldManager(world, this);
  }

  /** The guest's client has the details; the host's own view of this player is a normal player model. */
  override getEyeHeight(): number {
    return f(1.62);
  }

  protected override resetHeight(): void {
    this.yOffset = 0;
  }

  /** The world's tick for this player (EntityPlayerMP.onUpdate + onUpdateEntity). */
  override onUpdate(): void {
    // Without physics a knockback's motion would pile up; it is only kept until it went out.
    if (!this.velocityChanged) this.motionX = this.motionY = this.motionZ = 0;
    this.theItemInWorldManager.updateBlockRemoving();
    super.onUpdate();
    this.handler?.applyQueuedMovement();
    this.openContainer.detectAndSendChanges();
    this.sendWindowProgress();
    if (this.handler) this.sendStatus();
  }

  /**
   * The guest keeps its own statistics: the host's counts (all but the independent ones, which
   * the guest's client counts itself) go out as Packet200Statistic, at most 100 at a time.
   */
  override addStat(id: number, amount: number): void {
    const stat = StatList.resolve(id);
    if (!stat || stat.isIndependent || !this.handler || amount <= 0) return;
    while (amount > 100) {
      this.handler.sendPacket({ type: 'Statistic', statisticId: stat.statId, amount: 100 });
      amount -= 100;
    }
    this.handler.sendPacket({ type: 'Statistic', statisticId: stat.statId, amount });
  }

  /** Health, food and experience when they changed (Packet8UpdateHealth, Packet43Experience). */
  private sendStatus(): void {
    const food = this.getFoodStats();
    if (this.getHealth() !== this.lastHealth || this.lastFoodLevel !== food.getFoodLevel() || (food.getSaturationLevel() === 0) !== this.wasHungry) {
      this.handler.sendPacket({ type: 'UpdateHealth', health: this.getHealth(), food: food.getFoodLevel(), saturation: food.getSaturationLevel() });
      this.lastHealth = this.getHealth();
      this.lastFoodLevel = food.getFoodLevel();
      this.wasHungry = food.getSaturationLevel() === 0;
    }
    if (this.experienceTotal !== this.lastExperience) {
      this.lastExperience = this.experienceTotal;
      this.handler.sendPacket({ type: 'Experience', experience: this.experience, level: this.experienceLevel, total: this.experienceTotal });
    }
  }

  /** Forces the next health and experience packets (respawn, mode change). */
  setPlayerHealthUpdated(): void {
    this.lastHealth = -99999999;
    this.lastFoodLevel = -99999999;
    this.lastExperience = -1;
  }

  /** No physics on the host: the guest moves the player. Only the limbs follow the movement. */
  override moveEntityWithHeading(_strafe: number, _forward: number): void {
    this.updateLimbSwing();
  }

  /** Falling is judged from the guest's movement (updateFlyingState), not from moveEntity. */
  protected override updateFallState(_dy: number, _onGround: boolean): void {}

  updateFlyingState(dy: number, onGround: boolean): void {
    super.updateFallState(dy, onGround);
  }

  /** EntityPlayer.playSound: everyone near hears it but this player, whose client played it. */
  override playSound(name: string, volume: number, pitch: number): void {
    this.worldObj.playSoundToNearExcept(this, name, volume, pitch);
  }

  // ------------------------------------------------------------------ chat and commands

  override sendChatToPlayer(msg: string): void {
    this.handler?.sendPacket({ type: 'Chat', message: msg });
  }

  override addChatMessage(key: string): void {
    this.sendChatToPlayer(I18n.translateToLocal(key));
  }

  override getChatVisibility(): number {
    return this.chatVisibility;
  }

  /**
   * seed, tell, help and me always work; the LAN game's moderation and /publish are the host's
   * alone; everything else needs "Allow Cheats" of the LAN game.
   */
  override canCommandSenderUseCommand(_level: number, command: string): boolean {
    if (command === 'seed') return true;
    if (command === 'tell' || command === 'help' || command === 'me') return true;
    if (HOST_ONLY_COMMANDS.has(command)) return false;
    return this.server.commandsAllowedForAll;
  }

  override getPlayerCoordinates(): ChunkCoordinates {
    return new ChunkCoordinates(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY + 0.5), MathHelper.floor_double(this.posZ));
  }

  // ------------------------------------------------------------------ state changes the guest must hear about

  override setGameType(type: EnumGameType): void {
    this.theItemInWorldManager.setGameType(type);
    this.handler?.sendPacket({ type: 'GameEvent', reason: 3, value: type.getID() });
    this.addChatMessage('gameMode.changed');
  }

  override sendPlayerAbilities(): void {
    if (!this.handler) return;
    const c = this.capabilities;
    const flags = (c.disableDamage ? 1 : 0) | (c.isFlying ? 2 : 0) | (c.allowFlying ? 4 : 0) | (c.isCreativeMode ? 8 : 0);
    this.handler.sendPacket({ type: 'PlayerAbilities', flags, flySpeed: c.getFlySpeed(), walkSpeed: c.getWalkSpeed() });
  }

  override setPositionAndUpdate(x: number, y: number, z: number): void {
    this.setPlayerLocation(x, y, z, this.rotationYaw, this.rotationPitch);
  }

  /** NetServerHandler.setPlayerLocation: teleports (/tp, ender pearls, beds) reach the guest. */
  override setPlayerLocation(x: number, y: number, z: number, yaw: number, pitch: number): void {
    if (this.handler) this.handler.setPlayerLocation(x, y, z, yaw, pitch);
    else super.setPlayerLocation(x, y, z, yaw, pitch);
  }

  override onDeath(src: DamageSource): void {
    super.onDeath(src);
    // The host's copy keeps standing (yOffset 0); its guest shows the death screen.
    this.yOffset = 0;
  }

  override onCriticalHit(target: Entity): void {
    this.server.sendToTracking(this, { type: 'Animation', entityId: target.entityId, animate: 6 }, true);
  }

  override onEnchantmentCritical(target: Entity): void {
    this.server.sendToTracking(this, { type: 'Animation', entityId: target.entityId, animate: 7 }, true);
  }

  /** Finishing eating or drinking: the guest finishes too (Packet38 status 9 to itself). */
  protected override onItemUseFinish(): void {
    this.handler?.sendPacket({ type: 'EntityStatus', entityId: this.entityId, status: 9 });
    super.onItemUseFinish();
  }

  override onItemPickup(e: Entity, count: number): void {
    super.onItemPickup(e, count);
    this.openContainer.detectAndSendChanges();
  }

  override mountEntity(e: Entity | null): void {
    super.mountEntity(e);
    this.handler?.sendPacket({ type: 'AttachEntity', entityId: this.entityId, vehicleEntityId: this.ridingEntity ? this.ridingEntity.entityId : -1 });
    this.handler?.setPlayerLocation(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
  }

  override wakeUpPlayer(immediately: boolean, updateWorld: boolean, setSpawn: boolean): void {
    super.wakeUpPlayer(immediately, updateWorld, setSpawn);
    this.handler?.setPlayerLocation(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
  }

  /** Potion effects of the guest's own player (Packet41/42). */
  protected override onNewPotionEffect(effect: PotionEffectLike): void {
    super.onNewPotionEffect(effect);
    this.sendEffect(effect);
  }

  protected override onChangedPotionEffect(effect: PotionEffectLike): void {
    super.onChangedPotionEffect(effect);
    this.sendEffect(effect);
  }

  protected override onFinishedPotionEffect(effect: PotionEffectLike): void {
    super.onFinishedPotionEffect(effect);
    this.handler?.sendPacket({ type: 'RemoveEntityEffect', entityId: this.entityId, effectId: effect.getPotionID() });
  }

  private sendEffect(e: PotionEffectLike): void {
    this.handler?.sendPacket({ type: 'EntityEffect', entityId: this.entityId, effectId: e.getPotionID(), amplifier: e.getAmplifier(), duration: e.getDuration(), ambient: e.getIsAmbient?.() ?? false });
  }

  // ------------------------------------------------------------------ windows

  private nextWindowId(): number {
    this.currentWindowId = (this.currentWindowId % 100) + 1;
    return this.currentWindowId;
  }

  /** Opens a container window on the guest (Packet100OpenWindow) and starts mirroring it. */
  private openWindow(container: Container, type: number, title: string, slots: number, useTitle: boolean, x = 0, y = 0, z = 0): void {
    if (this.openContainer !== this.inventoryContainer) this.closeScreen();
    const id = this.nextWindowId();
    this.handler.sendPacket({ type: 'OpenWindow', windowId: id, inventoryType: type, title, slotsCount: slots, useTitle, x, y, z });
    this.openContainer = container;
    container.windowId = id;
    this.lastBars.length = 0;
    container.addCraftingToCrafters(this);
  }

  private invTitle(inv: IInventory): [string, boolean] {
    return [inv.getInvName(), inv.isInvNameLocalized()];
  }

  override displayGUIWorkbench(x: number, y: number, z: number): void {
    this.openWindow(new ContainerWorkbench(this.inventory, this.worldObj, x, y, z), WindowType.WORKBENCH, 'Crafting', 9, true, x, y, z);
  }

  override displayGUIEnchantment(x: number, y: number, z: number, customName: string | null): void {
    this.openWindow(new ContainerEnchantment(this.inventory, this.worldObj, x, y, z), WindowType.ENCHANTMENT, customName ?? '', 9, customName !== null, x, y, z);
  }

  override displayGUIAnvil(x: number, y: number, z: number): void {
    this.openWindow(new ContainerRepair(this.inventory, this.worldObj, x, y, z, this), WindowType.ANVIL, 'Repairing', 9, true, x, y, z);
  }

  override displayGUIChest(inv: IInventory): void {
    const [t, l] = this.invTitle(inv);
    this.openWindow(new ContainerChest(this.inventory, inv), WindowType.CHEST, t, inv.getSizeInventory(), l);
  }

  override displayGUIHopper(hopper: IInventory): void {
    const [t, l] = this.invTitle(hopper);
    this.openWindow(new ContainerHopper(this.inventory, hopper), WindowType.HOPPER, t, hopper.getSizeInventory(), l);
  }

  override displayGUIHopperMinecart(cart: IInventory): void {
    this.displayGUIHopper(cart);
  }

  override displayGUIFurnace(furnace: IInventory): void {
    const [t, l] = this.invTitle(furnace);
    this.openWindow(new ContainerFurnace(this.inventory, furnace as unknown as TileEntityFurnace), WindowType.FURNACE, t, furnace.getSizeInventory(), l);
  }

  override displayGUIDispenser(dispenser: IInventory): void {
    const [t, l] = this.invTitle(dispenser);
    const te = dispenser as unknown as TileEntity;
    const dropper = TileEntity.getIdForClass(te.constructor as TileEntityConstructor) === 'Dropper';
    this.openWindow(new ContainerDispenser(this.inventory, dispenser), dropper ? WindowType.DROPPER : WindowType.DISPENSER, t, dispenser.getSizeInventory(), l);
  }

  override displayGUIBrewingStand(stand: IInventory): void {
    const [t, l] = this.invTitle(stand);
    this.openWindow(new ContainerBrewingStand(this.inventory, stand as unknown as TileEntityBrewingStand), WindowType.BREWING_STAND, t, stand.getSizeInventory(), l);
  }

  override displayGUIBeacon(beacon: IInventory): void {
    const [t, l] = this.invTitle(beacon);
    this.openWindow(new ContainerBeacon(this.inventory, beacon as unknown as TileEntityBeacon), WindowType.BEACON, t, beacon.getSizeInventory(), l);
  }

  // ICrafting

  sendContainerAndContentsToPlayer(c: Container, items: (ItemStack | null)[]): void {
    this.handler?.sendPacket({ type: 'WindowItems', windowId: c.windowId, items });
    this.handler?.sendPacket({ type: 'SetSlot', windowId: -1, slot: -1, item: this.inventory.getItemStack() });
  }

  sendSlotContents(c: Container, slot: number, stack: ItemStack | null): void {
    if (c.getSlot(slot) instanceof SlotCrafting && c !== this.inventoryContainer) return;
    if (this.playerInventoryBeingManipulated) return;
    this.handler?.sendPacket({ type: 'SetSlot', windowId: c.windowId, slot, item: stack });
  }

  sendProgressBarUpdate(c: Container, id: number, value: number): void {
    this.handler?.sendPacket({ type: 'UpdateProgressBar', windowId: c.windowId, progressBar: id, value });
  }

  /** The cursor stack (updateHeldItem). */
  updateHeldItem(): void {
    if (!this.playerInventoryBeingManipulated) this.handler?.sendPacket({ type: 'SetSlot', windowId: -1, slot: -1, item: this.inventory.getItemStack() });
  }

  /** The whole window again (sendContainerToPlayer). */
  sendContainerToPlayer(c: Container): void {
    this.sendContainerAndContentsToPlayer(c, c.getInventory());
  }

  /**
   * Furnace, brewing stand and enchanting table values (their containers' detectAndSendChanges
   * in 1.5.2): sent when they change.
   */
  private sendWindowProgress(): void {
    const c = this.openContainer;
    if (c === this.inventoryContainer || !this.handler) return;
    const bars: number[] = [];
    if (c instanceof ContainerFurnace) {
      bars.push(c.furnace.furnaceCookTime, c.furnace.furnaceBurnTime, c.furnace.currentItemBurnTime);
    } else if (c instanceof ContainerBrewingStand) {
      bars.push(c.stand.getBrewTime());
    } else if (c instanceof ContainerEnchantment) {
      bars.push(...c.enchantLevels);
    } else if (c instanceof ContainerBeacon) {
      const b = c.getBeacon();
      bars.push(b.getLevels(), b.getPrimaryEffect(), b.getSecondaryEffect());
    } else {
      return;
    }
    for (let i = 0; i < bars.length; i++) {
      if (this.lastBars[i] === bars[i]) continue;
      this.lastBars[i] = bars[i];
      this.sendProgressBarUpdate(c, i, bars[i]);
    }
  }

  override closeScreen(): void {
    this.handler?.sendPacket({ type: 'CloseWindow', windowId: this.openContainer.windowId });
    this.closeInventory();
  }

  /**
   * The guest closed its window (Packet101): drop the cursor stack, back to the inventory. The
   * player stays a crafter of its own inventoryContainer (it is never discarded), so closing the
   * inventory screen (E) does not stop slot updates; only a discarded window lets go of it.
   */
  closeInventory(): void {
    if (this.openContainer !== this.inventoryContainer) this.openContainer.removeCraftingFromCrafters(this);
    this.openContainer.onCraftGuiClosed(this);
    this.openContainer = this.inventoryContainer;
  }

  /** The player left: wake up and get off (mountEntityAndWakeUp). */
  mountEntityAndWakeUp(): void {
    if (this.riddenByEntity) this.riddenByEntity.mountEntity(this);
    if (this.isPlayerSleeping()) this.wakeUpPlayer(true, false, false);
  }

  override clonePlayer(old: EntityPlayer, wholeState: boolean): void {
    super.clonePlayer(old, wholeState);
    this.setPlayerHealthUpdated();
  }
}
