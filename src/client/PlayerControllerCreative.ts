import { Block } from '../block/Block';
import type { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemBlock } from '../item/ItemBlock';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { ICrafting } from '../gui/inventory/Container';

/** What the controller needs from the client. */
export interface ControllerClient {
  readonly theWorld: World | null;
  readonly thePlayer: EntityPlayer | null;
  playRandomMusicIfReady(): void;
}

/**
 * PlayerControllerMP in Creative mode: instant block breaking (5-tick repeat while held),
 * placement that never consumes items, and a 5 block reach.
 */
export class PlayerControllerCreative {
  private blockHitDelay = 0;
  private currentBlockY = -1;

  constructor(private readonly mc: ControllerClient) {}

  setPlayerCapabilities(p: EntityPlayer): void {
    p.capabilities.setCreative();
  }

  enableEverythingIsScrewedUpMode(): boolean {
    return false;
  }

  flipPlayer(p: EntityPlayer): void {
    p.rotationYaw = -180;
  }

  shouldDrawHUD(): boolean {
    return false;
  }

  /** Removes a block as the player (with the 2001 break effect); creative never drops items. */
  onPlayerDestroyBlock(x: number, y: number, z: number, _side: number): boolean {
    const w = this.mc.theWorld!;
    const block = Block.blocksList[w.getBlockId(x, y, z)];
    if (!block) return false;
    const meta = w.getBlockMetadata(x, y, z);
    w.playAuxSFX(2001, x, y, z, block.blockID + (meta << 12));
    block.onBlockHarvested(w, x, y, z, meta, this.mc.thePlayer!);
    const removed = w.setBlockToAir(x, y, z);
    if (removed) block.onBlockDestroyedByPlayer(w, x, y, z, meta);
    this.currentBlockY = -1;
    return removed;
  }

  /** clickBlockCreative: put out fire on the clicked face, otherwise break the block. */
  private clickBlockCreative(x: number, y: number, z: number, side: number): void {
    if (!this.mc.theWorld!.extinguishFire(this.mc.thePlayer!, x, y, z, side)) this.onPlayerDestroyBlock(x, y, z, side);
  }

  clickBlock(x: number, y: number, z: number, side: number): void {
    this.clickBlockCreative(x, y, z, side);
    this.blockHitDelay = 5;
  }

  resetBlockRemoving(): void {
    void this.currentBlockY;
  }

  onPlayerDamageBlock(x: number, y: number, z: number, side: number): void {
    if (this.blockHitDelay > 0) {
      this.blockHitDelay--;
    } else {
      this.blockHitDelay = 5;
      this.clickBlockCreative(x, y, z, side);
    }
  }

  getBlockReachDistance(): number {
    return 5;
  }

  updateController(): void {
    this.mc.playRandomMusicIfReady();
  }

  /** Right click on a block: activate it, else place the held item (restoring its count). */
  onPlayerRightClick(p: EntityPlayer, w: World, stack: ItemStack | null, x: number, y: number, z: number, side: number, hit: Vec3): boolean {
    const f = Math.fround;
    const hx = f(f(hit.xCoord) - x);
    const hy = f(f(hit.yCoord) - y);
    const hz = f(f(hit.zCoord) - z);
    let activated = false;
    if (!p.isSneaking() || p.getHeldItem() === null) {
      const id = w.getBlockId(x, y, z);
      if (id > 0 && Block.blocksList[id]?.onBlockActivated(w, x, y, z, p, side, hx, hy, hz)) activated = true;
    }
    if (!activated && stack && stack.getItem() instanceof ItemBlock) {
      const ib = stack.getItem() as ItemBlock;
      if (!ib.canPlaceItemBlockOnSide(w, x, y, z, side, p, stack)) return false;
    }
    if (activated) return true;
    if (!stack) return false;
    const damage = stack.getItemDamage();
    const size = stack.stackSize;
    const placed = stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
    stack.setItemDamage(damage);
    stack.stackSize = size;
    return placed;
  }

  /**
   * Right click with an item in the air (onItemRightClick), as ItemInWorldManager.tryUseItem: a
   * Creative player's stack keeps its size (and a damageable item its damage); otherwise the
   * item's own use (thrown snowballs, emptied buckets) stands.
   */
  sendUseItem(p: EntityPlayer, w: World, stack: ItemStack): boolean {
    const size = stack.stackSize;
    const damage = stack.getItemDamage();
    const result = stack.useItemRightClick(w, p);
    if (result === stack && result.stackSize === size && result.getMaxItemUseDuration() <= 0 && result.getItemDamage() === damage) return false;
    p.inventory.mainInventory[p.inventory.currentItem] = result;
    if (p.capabilities.isCreativeMode) {
      result.stackSize = size;
      if (result.isItemStackDamageable()) result.setItemDamage(damage);
    }
    if (result.stackSize === 0) p.inventory.mainInventory[p.inventory.currentItem] = null;
    return true;
  }

  attackEntity(p: EntityPlayer, e: Entity): void {
    p.attackTargetEntityWithCurrentItem(e);
  }

  interactWithEntity(p: EntityPlayer, e: Entity): boolean {
    return p.interactWith(e);
  }

  onStoppedUsingItem(p: EntityPlayer): void {
    p.stopUsingItem();
  }

  /** A click in a container window (PlayerControllerMP.windowClick); the result is the clicked stack. */
  windowClick(_windowId: number, slotId: number, button: number, mode: number, p: EntityPlayer): ItemStack | null {
    return p.openContainer.slotClick(slotId, button, mode, p);
  }

  /**
   * The creative inventory setting a slot of the player's own window (Packet107CreativeSetSlot
   * as NetServerHandler.handleCreativeSetSlot applies it): only for a Creative player, only
   * slots 1-44 (not the crafting result). Drops (slot -1) are spawned by the screen itself.
   */
  sendSlotPacket(stack: ItemStack | null, slotId: number): void {
    const p = this.mc.thePlayer;
    if (!p || !p.capabilities.isCreativeMode) return;
    if (slotId < 1 || slotId >= 45) return;
    if (stack && (stack.stackSize <= 0 || stack.stackSize > 64 || stack.getItemDamage() < 0)) return;
    p.inventoryContainer.putStackInSlot(slotId, stack);
  }

  /** sendEnchantPacket: a LAN guest tells the host which enchanting offer was clicked. */
  sendEnchantPacket(_windowId: number, _button: number): void {}

  /**
   * func_78752_a: an item thrown out of the creative inventory. Single player drops it here
   * (despawning sooner, as creative drops do); a LAN guest asks the host.
   */
  sendPacketDropItem(stack: ItemStack | null): void {
    const p = this.mc.thePlayer;
    if (!p || !stack) return;
    const e = p.dropPlayerItem(stack) as { setAgeToCreativeDespawnTime?: () => void } | null;
    e?.setAgeToCreativeDespawnTime?.();
  }

  /** CreativeCrafting: the listener the creative inventory adds to the player's window (none in single player). */
  creativeCrafter(): ICrafting | null {
    return null;
  }

  isNotCreative(): boolean {
    return false;
  }

  isInCreativeMode(): boolean {
    return true;
  }

  extendedReach(): boolean {
    return true;
  }
}
