import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { EntityPlayer } from '../entity/EntityPlayer';
import type { DamageSource } from '../entity/DamageSource';
import { PotionId } from '../entity/PotionEffects';
import { handleChat } from '../command/CommandServer';
import type { GuiNewChat } from '../gui/GuiNewChat';
import type { GuiScreen } from '../gui/GuiScreen';
import { GuiChest } from '../gui/inventory/GuiChest';
import { GuiCrafting } from '../gui/inventory/GuiCrafting';
import { GuiBeacon } from '../gui/inventory/GuiBeacon';
import { GuiBrewingStand } from '../gui/inventory/GuiBrewingStand';
import { GuiDispenser } from '../gui/inventory/GuiDispenser';
import { GuiEnchantment } from '../gui/inventory/GuiEnchantment';
import { GuiFurnace } from '../gui/inventory/GuiFurnace';
import { GuiHopper } from '../gui/inventory/GuiHopper';
import { GuiRepair } from '../gui/inventory/GuiRepair';
import type { TileEntityBeacon } from '../world/tileentity/TileEntityBeacon';
import type { TileEntityBrewingStand } from '../world/tileentity/TileEntityBrewingStand';
import type { TileEntityFurnace } from '../world/tileentity/TileEntityFurnace';
import { GuiEditSign } from '../gui/GuiEditSign';
import { GuiCommandBlock, isCommandBlock } from '../gui/GuiCommandBlock';
import type { TileEntity } from '../world/tileentity/TileEntity';
import type { IInventory } from '../gui/inventory/IInventory';
import { EntityCrit2FX } from '../render/particle/EntityCrit2FX';
import type { EntityFX } from '../render/particle/EntityFX';
import type { World } from '../world/World';
import { MovementInput } from './MovementInput';

const f = Math.fround;

/** What the local player needs from the game client. */
export interface PlayerClient {
  displayGuiScreen(screen: GuiScreen | null): void;
  playSoundFX(name: string, volume: number, pitch: number): void;
  readonly effectRenderer: { addEffect(fx: EntityFX): void };
  readonly ingameGUI: { getChatGUI(): GuiNewChat };
  readonly gameSettings: { chatVisibility: number };
  respawnPlayer(): void;
}

/** The local player: input-driven movement, sprint/fly double-taps, FOV modifier. */
export class EntityPlayerSP extends EntityPlayer {
  movementInput: MovementInput = new MovementInput();
  protected sprintToggleTimer = 0;
  sprintingTicksLeft = 0;
  renderArmYaw = 0;
  renderArmPitch = 0;
  prevRenderArmYaw = 0;
  prevRenderArmPitch = 0;
  timeInPortal = 0;
  prevTimeInPortal = 0;

  constructor(
    readonly mc: PlayerClient,
    world: World,
    username: string,
  ) {
    super(world);
    this.username = username;
  }

  protected override updateEntityActionState(): void {
    super.updateEntityActionState();
    this.moveStrafing = this.movementInput.moveStrafe;
    this.moveForward = this.movementInput.moveForward;
    this.isJumping = this.movementInput.jump;
    this.prevRenderArmYaw = this.renderArmYaw;
    this.prevRenderArmPitch = this.renderArmPitch;
    this.renderArmPitch = f(this.renderArmPitch + (this.rotationPitch - this.renderArmPitch) * 0.5);
    this.renderArmYaw = f(this.renderArmYaw + (this.rotationYaw - this.renderArmYaw) * 0.5);
  }

  protected override isClientWorld(): boolean {
    return true;
  }

  override onCriticalHit(target: Entity): void {
    this.mc.effectRenderer.addEffect(new EntityCrit2FX(this.worldObj, target));
  }

  override onEnchantmentCritical(target: Entity): void {
    this.mc.effectRenderer.addEffect(new EntityCrit2FX(this.worldObj, target, 'magicCrit'));
  }

  /** EntityClientPlayerMP.sendChatMessage: goes to the integrated server's chat handler. */
  sendChatMessage(msg: string): void {
    handleChat(this, msg);
  }

  override addChatMessage(key: string): void {
    this.mc.ingameGUI.getChatGUI().addTranslatedMessage(key);
  }

  override sendChatToPlayer(msg: string): void {
    this.mc.ingameGUI.getChatGUI().printChatMessage(msg);
  }

  override getChatVisibility(): number {
    return this.mc.gameSettings.chatVisibility;
  }

  override respawnPlayer(): void {
    this.mc.respawnPlayer();
  }

  /**
   * The client's copy of the player never learns where a hit came from (its attackedAtYaw stays
   * 0), so the hurt camera always rolls the same way and the body falls the same way on death.
   */
  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    const hit = super.attackEntityFrom(src, amount);
    this.attackedAtYaw = 0;
    return hit;
  }

  override onDeath(src: DamageSource): void {
    this.attackedAtYaw = 0;
    super.onDeath(src);
  }

  override closeScreen(): void {
    super.closeScreen();
    this.mc.displayGuiScreen(null);
  }

  override displayGUIChest(inv: IInventory): void {
    this.mc.displayGuiScreen(new GuiChest(this.inventory, inv));
  }

  override displayGUIWorkbench(x: number, y: number, z: number): void {
    this.mc.displayGuiScreen(new GuiCrafting(this.inventory, this.worldObj, x, y, z));
  }

  override displayGUIFurnace(furnace: IInventory): void {
    this.mc.displayGuiScreen(new GuiFurnace(this.inventory, furnace as unknown as TileEntityFurnace));
  }

  override displayGUIDispenser(dispenser: IInventory): void {
    this.mc.displayGuiScreen(new GuiDispenser(this.inventory, dispenser));
  }

  override displayGUIHopper(hopper: IInventory): void {
    this.mc.displayGuiScreen(new GuiHopper(this.inventory, hopper));
  }

  override displayGUIHopperMinecart(cart: IInventory): void {
    this.mc.displayGuiScreen(new GuiHopper(this.inventory, cart));
  }

  override displayGUIBrewingStand(stand: IInventory): void {
    this.mc.displayGuiScreen(new GuiBrewingStand(this.inventory, stand as unknown as TileEntityBrewingStand));
  }

  override displayGUIEnchantment(x: number, y: number, z: number, customName: string | null): void {
    this.mc.displayGuiScreen(new GuiEnchantment(this.inventory, this.worldObj, x, y, z, customName));
  }

  override displayGUIAnvil(x: number, y: number, z: number): void {
    this.mc.displayGuiScreen(new GuiRepair(this.inventory, this.worldObj, x, y, z));
  }

  override displayGUIBeacon(beacon: IInventory): void {
    this.mc.displayGuiScreen(new GuiBeacon(this.inventory, beacon as unknown as TileEntityBeacon));
  }

  /** EntityClientPlayerMP.onUpdate: the player only updates once its chunk is present. */
  override onUpdate(): void {
    if (this.worldObj.blockExists(MathHelper.floor_double(this.posX), 0, MathHelper.floor_double(this.posZ))) super.onUpdate();
  }

  override onLivingUpdate(): void {
    if (this.sprintingTicksLeft > 0) {
      this.sprintingTicksLeft--;
      if (this.sprintingTicksLeft === 0) this.setSprinting(false);
    }
    if (this.sprintToggleTimer > 0) this.sprintToggleTimer--;
    this.prevTimeInPortal = this.timeInPortal;
    if (this.inPortal) {
      this.mc.displayGuiScreen(null);
      if (this.timeInPortal === 0) this.mc.playSoundFX('portal.trigger', 1, this.rand.nextFloat() * 0.4 + 0.8);
      this.timeInPortal = f(this.timeInPortal + f(0.0125));
      if (this.timeInPortal >= 1) this.timeInPortal = 1;
      this.inPortal = false;
    } else if ((this.getActivePotionEffect(PotionId.confusion)?.getDuration() ?? 0) > 60) {
      // Nausea warps the view like a portal, slowly, until its last 3 seconds.
      this.timeInPortal = f(this.timeInPortal + f(0.006666667));
      if (this.timeInPortal > 1) this.timeInPortal = 1;
    } else {
      if (this.timeInPortal > 0) this.timeInPortal = f(this.timeInPortal - f(0.05));
      if (this.timeInPortal < 0) this.timeInPortal = 0;
    }
    if (this.timeUntilPortal > 0) this.timeUntilPortal--;

    const wasJumping = this.movementInput.jump;
    const threshold = f(0.8);
    const wasForward = this.movementInput.moveForward >= threshold;
    this.movementInput.updatePlayerMoveState();
    if (this.isUsingItem()) {
      this.movementInput.moveStrafe = f(this.movementInput.moveStrafe * f(0.2));
      this.movementInput.moveForward = f(this.movementInput.moveForward * f(0.2));
      this.sprintToggleTimer = 0;
    }
    if (this.movementInput.sneak && this.ySize < f(0.2)) this.ySize = f(0.2);
    const hw = this.width * 0.35;
    this.pushOutOfBlocks(this.posX - hw, this.boundingBox.minY + 0.5, this.posZ + hw);
    this.pushOutOfBlocks(this.posX - hw, this.boundingBox.minY + 0.5, this.posZ - hw);
    this.pushOutOfBlocks(this.posX + hw, this.boundingBox.minY + 0.5, this.posZ - hw);
    this.pushOutOfBlocks(this.posX + hw, this.boundingBox.minY + 0.5, this.posZ + hw);
    // Sprinting needs more than 3 shanks of food (or the ability to fly).
    const canSprint = this.getFoodStats().getFoodLevel() > 6 || this.capabilities.allowFlying;
    if (this.onGround && !wasForward && this.movementInput.moveForward >= threshold && !this.isSprinting() && canSprint && !this.isUsingItem() && !this.isPotionActive(PotionId.blindness)) {
      if (this.sprintToggleTimer === 0) {
        this.sprintToggleTimer = 7;
      } else {
        this.setSprinting(true);
        this.sprintToggleTimer = 0;
      }
    }
    if (this.isSneaking()) this.sprintToggleTimer = 0;
    if (this.isSprinting() && (this.movementInput.moveForward < threshold || this.isCollidedHorizontally || !canSprint)) this.setSprinting(false);
    if (this.capabilities.allowFlying && !wasJumping && this.movementInput.jump) {
      if (this.flyToggleTimer === 0) {
        this.flyToggleTimer = 7;
      } else {
        this.capabilities.isFlying = !this.capabilities.isFlying;
        this.sendPlayerAbilities();
        this.flyToggleTimer = 0;
      }
    }
    if (this.capabilities.isFlying) {
      if (this.movementInput.sneak) this.motionY -= 0.15;
      if (this.movementInput.jump) this.motionY += 0.15;
    }
    super.onLivingUpdate();
    if (this.onGround && this.capabilities.isFlying) {
      this.capabilities.isFlying = false;
      this.sendPlayerAbilities();
    }
  }

  /** Flying widens the view by 10%, speed (sprint, potions) by half its gain; drawing a bow zooms in up to 15%. */
  getFOVMultiplier(): number {
    let m = 1;
    if (this.capabilities.isFlying) m = f(m * f(1.1));
    m = f(m * f(f(f(f(this.landMovementFactor * this.getSpeedModifier()) / this.speedOnGround) + 1) / 2));
    const using = this.getItemInUse();
    if (this.isUsingItem() && using && using.itemID === ItemIds.bow) {
      let k = f(this.getItemInUseDuration() / 20);
      k = k > 1 ? 1 : f(k * k);
      m = f(m * f(1 - f(k * f(0.15))));
    }
    return m;
  }

  /** Client-side push: nudges sideways out of full cubes at head/feet height. */
  protected override pushOutOfBlocks(px: number, py: number, pz: number): boolean {
    const x = MathHelper.floor_double(px);
    const y = MathHelper.floor_double(py);
    const z = MathHelper.floor_double(pz);
    const fx = px - x;
    const fz = pz - z;
    const solid = (a: number, b: number, c: number) => this.worldObj.isBlockNormalCube(a, b, c);
    if (solid(x, y, z) || solid(x, y + 1, z)) {
      const west = !solid(x - 1, y, z) && !solid(x - 1, y + 1, z);
      const east = !solid(x + 1, y, z) && !solid(x + 1, y + 1, z);
      const north = !solid(x, y, z - 1) && !solid(x, y + 1, z - 1);
      const south = !solid(x, y, z + 1) && !solid(x, y + 1, z + 1);
      let dir = -1;
      let best = 9999;
      if (west && fx < best) {
        best = fx;
        dir = 0;
      }
      if (east && 1 - fx < best) {
        best = 1 - fx;
        dir = 1;
      }
      if (north && fz < best) {
        best = fz;
        dir = 4;
      }
      if (south && 1 - fz < best) {
        best = 1 - fz;
        dir = 5;
      }
      const v = f(0.1);
      if (dir === 0) this.motionX = -v;
      if (dir === 1) this.motionX = v;
      if (dir === 4) this.motionZ = -v;
      if (dir === 5) this.motionZ = v;
    }
    return false;
  }

  override setSprinting(v: boolean): void {
    super.setSprinting(v);
    this.sprintingTicksLeft = v ? 600 : 0;
  }

  override isSneaking(): boolean {
    return this.movementInput.sneak && !this.sleeping;
  }

  /**
   * The client's copy of a sleeping player getting up (Packet18Animation 3, sent only for a
   * sleeping player -> wakeUpPlayer(false, false, false)) always lets the dark overlay fade out,
   * whatever the server's reason was.
   */
  override wakeUpPlayer(immediately: boolean, updateWorld: boolean, setSpawn: boolean): void {
    const wasSleeping = this.sleeping;
    const timer = this.sleepTimer;
    super.wakeUpPlayer(immediately, updateWorld, setSpawn);
    this.sleepTimer = wasSleeping ? 100 : timer;
  }

  override playSound(name: string, volume: number, pitch: number): void {
    this.worldObj.playSound(this.posX, this.posY - this.yOffset, this.posZ, name, volume, pitch, false);
  }

  /** EntityPlayerMP: seed, tell, help and me always work; the rest need "Allow Cheats". */
  override canCommandSenderUseCommand(_level: number, command: string): boolean {
    if (command === 'seed' || command === 'tell' || command === 'help' || command === 'me') return true;
    return this.worldObj.worldInfo.allowCommands;
  }

  /** Signs open the sign editor, command blocks the command screen (both use this hook in 1.5.2). */
  override displayGUIEditSign(te: TileEntity): void {
    if (Array.isArray((te as unknown as { signText?: unknown }).signText)) this.mc.displayGuiScreen(new GuiEditSign(te));
    else if (isCommandBlock(te)) this.mc.displayGuiScreen(new GuiCommandBlock(te));
  }
}
