import { Block } from '../../block/Block';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import { EnumGameType } from '../../world/EnumGameType';
import type { World } from '../../world/World';
import type { EntityPlayerMP } from './EntityPlayerMP';

const f = Math.fround;

/**
 * The server's rules for one guest's digging and item use (ItemInWorldManager): survival
 * mining is timed on the host from the start-digging packet (a finish packet that comes too
 * early is held until the block has really taken enough damage), creative breaks at once,
 * adventure only breaks what the tool can, and placing / using items follows the game mode.
 */
export class ItemInWorldManager {
  private gameType = EnumGameType.NOT_SET;
  private isDestroyingBlock = false;
  private initialDamage = 0;
  private partiallyDestroyedBlockX = 0;
  private partiallyDestroyedBlockY = 0;
  private partiallyDestroyedBlockZ = 0;
  private curblockDamage = 0;
  private receivedFinishDiggingPacket = false;
  private posX = 0;
  private posY = 0;
  private posZ = 0;
  private finishStartDamage = 0;
  private durabilityRemainingOnBlock = -1;

  constructor(
    readonly theWorld: World,
    readonly thisPlayerMP: EntityPlayerMP,
  ) {}

  setGameType(type: EnumGameType): void {
    this.gameType = type;
    this.thisPlayerMP.gameType = type;
    type.configurePlayerCapabilities(this.thisPlayerMP.capabilities);
    this.thisPlayerMP.sendPlayerAbilities();
  }

  getGameType(): EnumGameType {
    return this.gameType;
  }

  isCreative(): boolean {
    return this.gameType.isCreative();
  }

  initializeGameType(type: EnumGameType): void {
    if (this.gameType === EnumGameType.NOT_SET) this.gameType = type;
    this.setGameType(this.gameType);
  }

  /** Every tick: the crack overlay others see, and a held-back finish once the block is ready. */
  updateBlockRemoving(): void {
    this.curblockDamage++;
    const p = this.thisPlayerMP;
    const w = this.theWorld;
    if (this.receivedFinishDiggingPacket) {
      const ticks = this.curblockDamage - this.finishStartDamage;
      const id = w.getBlockId(this.posX, this.posY, this.posZ);
      if (id === 0) {
        this.receivedFinishDiggingPacket = false;
        return;
      }
      const block = Block.blocksList[id]!;
      const progress = f(block.getPlayerRelativeBlockHardness(p, w, this.posX, this.posY, this.posZ) * (ticks + 1));
      const stage = Math.trunc(f(progress * 10));
      if (stage !== this.durabilityRemainingOnBlock) {
        w.destroyBlockInWorldPartially(p.entityId, this.posX, this.posY, this.posZ, stage);
        this.durabilityRemainingOnBlock = stage;
      }
      if (progress >= 1) {
        this.receivedFinishDiggingPacket = false;
        this.tryHarvestBlock(this.posX, this.posY, this.posZ);
      }
    } else if (this.isDestroyingBlock) {
      const x = this.partiallyDestroyedBlockX;
      const y = this.partiallyDestroyedBlockY;
      const z = this.partiallyDestroyedBlockZ;
      const block = Block.blocksList[w.getBlockId(x, y, z)];
      if (!block) {
        w.destroyBlockInWorldPartially(p.entityId, x, y, z, -1);
        this.durabilityRemainingOnBlock = -1;
        this.isDestroyingBlock = false;
      } else {
        const ticks = this.curblockDamage - this.initialDamage;
        const progress = f(block.getPlayerRelativeBlockHardness(p, w, x, y, z) * (ticks + 1));
        const stage = Math.trunc(f(progress * 10));
        if (stage !== this.durabilityRemainingOnBlock) {
          w.destroyBlockInWorldPartially(p.entityId, x, y, z, stage);
          this.durabilityRemainingOnBlock = stage;
        }
      }
    }
  }

  /** Start digging (Packet14 status 0). */
  onBlockClicked(x: number, y: number, z: number, side: number): void {
    const p = this.thisPlayerMP;
    const w = this.theWorld;
    if (this.gameType.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return;
    if (this.isCreative()) {
      if (!w.extinguishFire(null, x, y, z, side)) this.tryHarvestBlock(x, y, z);
      return;
    }
    w.extinguishFire(null, x, y, z, side);
    this.initialDamage = this.curblockDamage;
    let hardness = 1;
    const id = w.getBlockId(x, y, z);
    if (id > 0) {
      Block.blocksList[id]?.onBlockClicked(w, x, y, z, p);
      hardness = Block.blocksList[id]?.getPlayerRelativeBlockHardness(p, w, x, y, z) ?? 1;
    }
    if (id > 0 && hardness >= 1) {
      this.tryHarvestBlock(x, y, z);
    } else {
      this.isDestroyingBlock = true;
      this.partiallyDestroyedBlockX = x;
      this.partiallyDestroyedBlockY = y;
      this.partiallyDestroyedBlockZ = z;
      const stage = Math.trunc(f(hardness * 10));
      w.destroyBlockInWorldPartially(p.entityId, x, y, z, stage);
      this.durabilityRemainingOnBlock = stage;
    }
  }

  /** Finish digging (Packet14 status 2): breaks now if at least 70% done, else when it is done. */
  uncheckedTryHarvestBlock(x: number, y: number, z: number): void {
    if (x !== this.partiallyDestroyedBlockX || y !== this.partiallyDestroyedBlockY || z !== this.partiallyDestroyedBlockZ) return;
    const p = this.thisPlayerMP;
    const w = this.theWorld;
    const ticks = this.curblockDamage - this.initialDamage;
    const id = w.getBlockId(x, y, z);
    if (id === 0) return;
    const block = Block.blocksList[id]!;
    const progress = f(block.getPlayerRelativeBlockHardness(p, w, x, y, z) * (ticks + 1));
    if (progress >= f(0.7)) {
      this.isDestroyingBlock = false;
      w.destroyBlockInWorldPartially(p.entityId, x, y, z, -1);
      this.tryHarvestBlock(x, y, z);
    } else if (!this.receivedFinishDiggingPacket) {
      this.isDestroyingBlock = false;
      this.receivedFinishDiggingPacket = true;
      this.posX = x;
      this.posY = y;
      this.posZ = z;
      this.finishStartDamage = this.initialDamage;
    }
  }

  /** Abort digging (Packet14 status 1). */
  cancelDestroyingBlock(_x: number, _y: number, _z: number): void {
    this.isDestroyingBlock = false;
    this.theWorld.destroyBlockInWorldPartially(this.thisPlayerMP.entityId, this.partiallyDestroyedBlockX, this.partiallyDestroyedBlockY, this.partiallyDestroyedBlockZ, -1);
  }

  private removeBlock(x: number, y: number, z: number): boolean {
    const w = this.theWorld;
    const block = Block.blocksList[w.getBlockId(x, y, z)];
    const meta = w.getBlockMetadata(x, y, z);
    block?.onBlockHarvested(w, x, y, z, meta, this.thisPlayerMP);
    const removed = w.setBlockToAir(x, y, z);
    if (block && removed) block.onBlockDestroyedByPlayer(w, x, y, z, meta);
    return removed;
  }

  /** Breaks the block as this player: effects for the others, tool wear and drops outside Creative. */
  tryHarvestBlock(x: number, y: number, z: number): boolean {
    const p = this.thisPlayerMP;
    const w = this.theWorld;
    if (this.gameType.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return false;
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    w.playAuxSFXAtEntity(p, 2001, x, y, z, id + (meta << 12));
    const removed = this.removeBlock(x, y, z);
    if (this.isCreative()) {
      p.handler?.sendBlockChange(x, y, z);
    } else {
      const held = p.getCurrentEquippedItem();
      const block = Block.blocksList[id];
      const canHarvest = block ? p.canHarvestBlock(block) : false;
      if (held) {
        held.getItem().onBlockDestroyed(held, w, id, x, y, z, p);
        if (held.stackSize === 0) p.destroyCurrentEquippedItem();
      }
      if (removed && canHarvest && block) block.harvestBlock(w, p, x, y, z, meta);
    }
    return removed;
  }

  /** Right click with an item in the air (direction 255). */
  tryUseItem(p: EntityPlayer, w: World, stack: ItemStack): boolean {
    const size = stack.stackSize;
    const damage = stack.getItemDamage();
    const result = stack.useItemRightClick(w, p);
    if (result === stack && result.stackSize === size && result.getMaxItemUseDuration() <= 0 && result.getItemDamage() === damage) return false;
    p.inventory.mainInventory[p.inventory.currentItem] = result;
    if (this.isCreative()) {
      result.stackSize = size;
      if (result.isItemStackDamageable()) result.setItemDamage(damage);
    }
    if (result.stackSize === 0) p.inventory.mainInventory[p.inventory.currentItem] = null;
    if (!p.isUsingItem()) this.thisPlayerMP.sendContainerToPlayer(p.inventoryContainer);
    return true;
  }

  /** Right click on a block: activate it unless sneaking with an item, else use the item on it. */
  activateBlockOrUseItem(p: EntityPlayer, w: World, stack: ItemStack | null, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    if (!p.isSneaking() || p.getHeldItem() === null) {
      const id = w.getBlockId(x, y, z);
      if (id > 0 && Block.blocksList[id]?.onBlockActivated(w, x, y, z, p, side, hx, hy, hz)) return true;
    }
    if (!stack) return false;
    if (this.isCreative()) {
      const damage = stack.getItemDamage();
      const size = stack.stackSize;
      const placed = stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
      stack.setItemDamage(damage);
      stack.stackSize = size;
      return placed;
    }
    return stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
  }
}
