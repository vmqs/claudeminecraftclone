import { BlockMiningSounds } from '../../audio/BlockSounds';
import { Block } from '../../block/Block';
import { PlayerControllerMP, type MPControllerClient } from '../../client/PlayerControllerMP';
import type { Vec3 } from '../../core/Vec3';
import type { Entity } from '../../entity/Entity';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ICrafting, Container } from '../../gui/inventory/Container';
import { ItemBlock } from '../../item/ItemBlock';
import { ItemStack } from '../../item/ItemStack';
import type { World } from '../../world/World';
import type { Packet } from '../protocol/Packets';

const f = Math.fround;

/** Where the controller's packets go. */
export interface ControllerPacketSink {
  addToSendQueue(p: Packet): void;
}

/**
 * The guest's PlayerControllerMP: every action is a packet to the host plus the client's own
 * prediction, as the 1.5.2 client did when it talked to a server. Mining runs the same timer
 * locally for the crack overlay and sends start / abort / finish (Packet14); the host times it
 * again and has the last word. Placing and using items predict the result on the guest's world
 * and send Packet15; the host's block changes and slot updates correct any difference. Entity
 * clicks are only sent: the host's packets show the outcome (no local damage or interaction).
 * Window clicks are applied locally and sent with the stack seen (Packet102).
 */
export class PlayerControllerGuest extends PlayerControllerMP {
  private gCurBlockX = -1;
  private gCurBlockY = -1;
  private gCurBlockZ = -1;
  private gItemHittingBlock: ItemStack | null = null;
  private gBlockDamage = 0;
  private gHitDelay = 0;
  private gHitting = false;
  private gCurrentPlayerItem = 0;
  private readonly gSounds = new BlockMiningSounds();
  private creativeListener: ICrafting | null = null;

  constructor(
    private readonly guestClient: MPControllerClient,
    private readonly net: ControllerPacketSink,
  ) {
    super(guestClient);
  }

  private send(p: Packet): void {
    this.net.addToSendQueue(p);
  }

  private get player(): EntityPlayer {
    return this.guestClient.thePlayer!;
  }

  private get world(): World {
    return this.guestClient.theWorld!;
  }

  /** syncCurrentPlayItem: Packet16 when the selected hotbar slot changed. */
  syncCurrentPlayItem(): void {
    const p = this.guestClient.thePlayer;
    if (!p) return;
    if (this.gCurrentPlayerItem !== p.inventory.currentItem) {
      this.gCurrentPlayerItem = p.inventory.currentItem;
      this.send({ type: 'BlockItemSwitch', slot: this.gCurrentPlayerItem });
    }
  }

  /** The host set the slot (Packet16 from the server): no need to echo it. */
  setCurrentPlayItem(slot: number): void {
    this.gCurrentPlayerItem = slot;
  }

  override getCurBlockDamage(): number {
    return this.gBlockDamage;
  }

  override isHitting(): boolean {
    return this.gHitting;
  }

  override getBlockHitDelay(): number {
    return this.gHitDelay;
  }

  /** The client's half of breaking: the effect, the block gone locally, the held tool's wear. */
  override onPlayerDestroyBlock(x: number, y: number, z: number, _side: number): boolean {
    const p = this.player;
    const w = this.world;
    const type = this.getCurrentGameType();
    if (type.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return false;
    const id = w.getBlockId(x, y, z);
    const block = Block.blocksList[id];
    if (!block) return false;
    w.playAuxSFX(2001, x, y, z, id + (w.getBlockMetadata(x, y, z) << 12));
    const meta = w.getBlockMetadata(x, y, z);
    const removed = w.setBlockToAir(x, y, z);
    if (removed) block.onBlockDestroyedByPlayer(w, x, y, z, meta);
    this.gCurBlockY = -1;
    if (!type.isCreative()) {
      const held = p.getCurrentEquippedItem();
      if (held) {
        held.onBlockDestroyed(w, id, x, y, z, p);
        if (held.stackSize === 0) p.destroyCurrentEquippedItem();
      }
    }
    return removed;
  }

  private clickBlockCreativeGuest(x: number, y: number, z: number, side: number): void {
    if (!this.world.extinguishFire(this.player, x, y, z, side)) this.onPlayerDestroyBlock(x, y, z, side);
  }

  override clickBlock(x: number, y: number, z: number, side: number): void {
    const p = this.player;
    const w = this.world;
    const type = this.getCurrentGameType();
    if (type.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return;
    if (type.isCreative()) {
      this.send({ type: 'BlockDig', status: 0, x, y, z, face: side });
      this.clickBlockCreativeGuest(x, y, z, side);
      this.gHitDelay = 5;
      return;
    }
    if (this.gHitting && this.sameToolAndBlockGuest(x, y, z)) return;
    if (this.gHitting) this.send({ type: 'BlockDig', status: 1, x: this.gCurBlockX, y: this.gCurBlockY, z: this.gCurBlockZ, face: side });
    this.send({ type: 'BlockDig', status: 0, x, y, z, face: side });
    const id = w.getBlockId(x, y, z);
    if (id > 0 && this.gBlockDamage === 0) Block.blocksList[id]?.onBlockClicked(w, x, y, z, p);
    if (id > 0 && (Block.blocksList[id]?.getPlayerRelativeBlockHardness(p, w, x, y, z) ?? 0) >= 1) {
      this.onPlayerDestroyBlock(x, y, z, side);
    } else {
      this.gHitting = true;
      this.gCurBlockX = x;
      this.gCurBlockY = y;
      this.gCurBlockZ = z;
      this.gItemHittingBlock = p.getHeldItem();
      this.gBlockDamage = 0;
      this.gSounds.reset();
      w.destroyBlockInWorldPartially(p.entityId, x, y, z, Math.trunc(f(this.gBlockDamage * 10)) - 1);
    }
  }

  override resetBlockRemoving(): void {
    if (this.gHitting) this.send({ type: 'BlockDig', status: 1, x: this.gCurBlockX, y: this.gCurBlockY, z: this.gCurBlockZ, face: 255 });
    this.gHitting = false;
    this.gBlockDamage = 0;
    const p = this.guestClient.thePlayer;
    const w = this.guestClient.theWorld;
    if (p && w) w.destroyBlockInWorldPartially(p.entityId, this.gCurBlockX, this.gCurBlockY, this.gCurBlockZ, -1);
  }

  override onPlayerDamageBlock(x: number, y: number, z: number, side: number): void {
    this.syncCurrentPlayItem();
    if (this.gHitDelay > 0) {
      this.gHitDelay--;
      return;
    }
    if (this.getCurrentGameType().isCreative()) {
      this.gHitDelay = 5;
      this.send({ type: 'BlockDig', status: 0, x, y, z, face: side });
      this.clickBlockCreativeGuest(x, y, z, side);
      return;
    }
    if (!this.sameToolAndBlockGuest(x, y, z)) {
      this.clickBlock(x, y, z, side);
      return;
    }
    const p = this.player;
    const w = this.world;
    const id = w.getBlockId(x, y, z);
    if (id === 0) {
      this.gHitting = false;
      return;
    }
    const block = Block.blocksList[id];
    if (!block) return;
    this.gBlockDamage = f(this.gBlockDamage + block.getPlayerRelativeBlockHardness(p, w, x, y, z));
    this.gSounds.onDamageTick(this.guestClient.sndManager, block.stepSound, x, y, z);
    if (this.gBlockDamage >= 1) {
      this.gHitting = false;
      this.send({ type: 'BlockDig', status: 2, x, y, z, face: side });
      this.onPlayerDestroyBlock(x, y, z, side);
      this.gBlockDamage = 0;
      this.gSounds.reset();
      this.gHitDelay = 5;
    }
    w.destroyBlockInWorldPartially(p.entityId, this.gCurBlockX, this.gCurBlockY, this.gCurBlockZ, Math.trunc(f(this.gBlockDamage * 10)) - 1);
  }

  private sameToolAndBlockGuest(x: number, y: number, z: number): boolean {
    const held = this.player.getHeldItem();
    const was = this.gItemHittingBlock;
    let same = was === null && held === null;
    if (was !== null && held !== null) {
      same = held.itemID === was.itemID && ItemStack.areItemStackTagsEqual(held, was) && (held.isItemStackDamageable() || held.getItemDamage() === was.getItemDamage());
    }
    return x === this.gCurBlockX && y === this.gCurBlockY && z === this.gCurBlockZ && same;
  }

  override updateController(): void {
    this.syncCurrentPlayItem();
    super.updateController();
  }

  /** Right click on a block: the local activation or placement, and Packet15 for the host. */
  override onPlayerRightClick(p: EntityPlayer, w: World, stack: ItemStack | null, x: number, y: number, z: number, side: number, hit: Vec3): boolean {
    this.syncCurrentPlayItem();
    const hx = f(f(hit.xCoord) - x);
    const hy = f(f(hit.yCoord) - y);
    const hz = f(f(hit.zCoord) - z);
    let activated = false;
    if (!p.isSneaking() || p.getHeldItem() === null) {
      const id = w.getBlockId(x, y, z);
      if (id > 0 && Block.blocksList[id]?.onBlockActivated(w, x, y, z, p, side, hx, hy, hz)) activated = true;
    }
    if (!activated && stack && stack.getItem() instanceof ItemBlock) {
      if (!(stack.getItem() as ItemBlock).canPlaceItemBlockOnSide(w, x, y, z, side, p, stack)) return false;
    }
    this.send({ type: 'Place', x, y, z, direction: side, item: p.inventory.getCurrentItem(), hitX: Math.trunc(hx * 16), hitY: Math.trunc(hy * 16), hitZ: Math.trunc(hz * 16) });
    if (activated) return true;
    if (!stack) return false;
    if (this.getCurrentGameType().isCreative()) {
      const damage = stack.getItemDamage();
      const size = stack.stackSize;
      const placed = stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
      stack.setItemDamage(damage);
      stack.stackSize = size;
      return placed;
    }
    return stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
  }

  /** Right click in the air: Packet15 with direction 255, and the item's use locally. */
  override sendUseItem(p: EntityPlayer, w: World, stack: ItemStack): boolean {
    this.syncCurrentPlayItem();
    this.send({ type: 'Place', x: -1, y: -1, z: -1, direction: 255, item: p.inventory.getCurrentItem(), hitX: 0, hitY: 0, hitZ: 0 });
    const size = stack.stackSize;
    const result = stack.useItemRightClick(w, p);
    if (result === stack && result.stackSize === size) return false;
    p.inventory.mainInventory[p.inventory.currentItem] = result;
    if (result.stackSize === 0) p.inventory.mainInventory[p.inventory.currentItem] = null;
    return true;
  }

  /** Attacks are the host's: Packet7 only (its hurt animation and sounds come back). */
  override attackEntity(_p: EntityPlayer, e: Entity): void {
    this.syncCurrentPlayItem();
    this.send({ type: 'UseEntity', targetEntity: e.entityId, leftClick: true });
  }

  /**
   * Interactions are the host's too (taming, shearing, mounting, trading): Packet7, and the click
   * counts as used for anything an interaction could apply to.
   */
  override interactWithEntity(_p: EntityPlayer, e: Entity): boolean {
    this.syncCurrentPlayItem();
    this.send({ type: 'UseEntity', targetEntity: e.entityId, leftClick: false });
    return e.isLivingEntity || e.canBeCollidedWith();
  }

  override onStoppedUsingItem(p: EntityPlayer): void {
    this.syncCurrentPlayItem();
    this.send({ type: 'BlockDig', status: 5, x: 0, y: 0, z: 0, face: 255 });
    p.stopUsingItem();
  }

  /** A window click: applied locally and sent with the stack seen (Packet102). */
  override windowClick(windowId: number, slotId: number, button: number, mode: number, p: EntityPlayer): ItemStack | null {
    const c = p.openContainer;
    const action = c.getNextTransactionID() & 0xffff;
    const stack = c.slotClick(slotId, button, mode, p);
    this.send({ type: 'WindowClick', windowId, slot: slotId, button, action, mode, item: stack });
    return stack;
  }

  override sendEnchantPacket(windowId: number, button: number): void {
    this.send({ type: 'EnchantItem', windowId, enchantment: button });
  }

  /** The creative inventory sets a slot of the player's window (Packet107); Creative only. */
  override sendSlotPacket(stack: ItemStack | null, slotId: number): void {
    if (this.getCurrentGameType().isCreative()) this.send({ type: 'CreativeSetSlot', slot: slotId, item: stack });
  }

  /** func_78752_a: a creative drop out of the inventory window (Packet107 with slot -1). */
  override sendPacketDropItem(stack: ItemStack | null): void {
    if (this.getCurrentGameType().isCreative() && stack) this.send({ type: 'CreativeSetSlot', slot: -1, item: stack });
  }

  /** CreativeCrafting: changes made in the creative inventory go to the host slot by slot. */
  override creativeCrafter(): ICrafting {
    this.creativeListener ??= {
      sendContainerAndContentsToPlayer: (_c: Container, _items: (ItemStack | null)[]) => undefined,
      sendSlotContents: (_c: Container, slot: number, stack: ItemStack | null) => this.sendSlotPacket(stack, slot),
      sendProgressBarUpdate: () => undefined,
    };
    return this.creativeListener;
  }
}
