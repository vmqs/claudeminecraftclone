import { BlockMiningSounds } from '../audio/BlockSounds';
import type { SoundManager } from '../audio/SoundManager';
import { Block } from '../block/Block';
import type { Vec3 } from '../core/Vec3';
import { EntityPlayer } from '../entity/EntityPlayer';
import { ItemBlock } from '../item/ItemBlock';
import { ItemStack } from '../item/ItemStack';
import { EnumGameType } from '../world/EnumGameType';
import type { World } from '../world/World';
import { type ControllerClient, PlayerControllerCreative } from './PlayerControllerCreative';

const f = Math.fround;

/** What the full controller needs from the client on top of the creative one. */
export interface MPControllerClient extends ControllerClient {
  readonly sndManager: SoundManager;
}

/**
 * PlayerControllerMP with every game mode. Single player had this client controller talking to
 * the integrated server's ItemInWorldManager; here both halves act on the one world, so each
 * action does the client's part (crack overlay, mining sounds, prediction) and the server's part
 * (onBlockClicked, onBlockHarvested, tool wear, drops) exactly once:
 * - Creative: instant breaking with a 5-tick repeat, placement keeps the stack, reach 5.
 * - Survival / Adventure: the block takes getPlayerRelativeBlockHardness per tick until the
 *   damage reaches 1 (the crack overlay follows it), then breaks, wearing the held tool and,
 *   when the player can harvest it, dropping its items; 5 ticks pass before the next block;
 *   reach 4.5. Adventure players only break what their tool can.
 */
export class PlayerControllerMP extends PlayerControllerCreative {
  private curBlockX = -1;
  private curBlockY = -1;
  private curBlockZ = -1;
  /** The held stack when the current block was first hit (field_85183_f). */
  private currentItemHittingBlock: ItemStack | null = null;
  private curBlockDamageMP = 0;
  private readonly miningSounds = new BlockMiningSounds();
  private hitDelay = 0;
  private isHittingBlock = false;
  private currentGameType = EnumGameType.SURVIVAL;

  constructor(private readonly client: MPControllerClient) {
    super(client);
    this.activate();
  }

  /** Becomes the client's controller: game-mode changes of the local player reach it. */
  activate(): void {
    // Packet70GameEvent 3: the server changed the local player's mode (/gamemode).
    EntityPlayer.gameTypeListener = (player, type) => {
      if (player === this.client.thePlayer) this.setGameType(type);
    };
  }

  /** The current mode (EnumGameType). */
  getCurrentGameType(): EnumGameType {
    return this.currentGameType;
  }

  override setPlayerCapabilities(p: EntityPlayer): void {
    this.currentGameType.configurePlayerCapabilities(p.capabilities);
  }

  /** Switches the mode and the local player's capabilities with it. */
  setGameType(type: EnumGameType): void {
    this.currentGameType = type;
    const p = this.client.thePlayer;
    if (p) type.configurePlayerCapabilities(p.capabilities);
  }

  override shouldDrawHUD(): boolean {
    return this.currentGameType.isSurvivalOrAdventure();
  }

  /** Damage progress of the block being mined, 0..1 (curBlockDamageMP). */
  getCurBlockDamage(): number {
    return this.curBlockDamageMP;
  }

  /** Whether a block is being mined right now. */
  isHitting(): boolean {
    return this.isHittingBlock;
  }

  /** Ticks left before the next block can be damaged (blockHitDelay). */
  getBlockHitDelay(): number {
    return this.hitDelay;
  }

  /**
   * Breaks a block as the player. The client's half plays the break effect (2001); the
   * server's half (ItemInWorldManager.tryHarvestBlock) runs onBlockHarvested, removes the block
   * and, outside Creative, wears the held tool and drops the block's items if the player could
   * harvest it (decided before the wear, so a tool breaking on its last block still drops).
   */
  override onPlayerDestroyBlock(x: number, y: number, z: number, _side: number): boolean {
    const p = this.client.thePlayer!;
    const w = this.client.theWorld!;
    if (this.currentGameType.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return false;
    const id = w.getBlockId(x, y, z);
    const block = Block.blocksList[id];
    if (!block) return false;
    const meta = w.getBlockMetadata(x, y, z);
    w.playAuxSFX(2001, x, y, z, id + (meta << 12));
    block.onBlockHarvested(w, x, y, z, meta, p);
    const removed = w.setBlockToAir(x, y, z);
    if (removed) block.onBlockDestroyedByPlayer(w, x, y, z, meta);
    this.curBlockY = -1;
    if (!this.currentGameType.isCreative()) {
      const held = p.getCurrentEquippedItem();
      const canHarvest = p.canHarvestBlock(block);
      if (held) {
        held.getItem().onBlockDestroyed(held, w, id, x, y, z, p);
        if (held.stackSize === 0) p.destroyCurrentEquippedItem();
      }
      if (removed && canHarvest) block.harvestBlock(w, p, x, y, z, meta);
    }
    return removed;
  }

  /** Creative's click: put out fire on the clicked face, otherwise break the block. */
  private clickBlockInCreative(x: number, y: number, z: number, side: number): void {
    if (!this.client.theWorld!.extinguishFire(this.client.thePlayer!, x, y, z, side)) this.onPlayerDestroyBlock(x, y, z, side);
  }

  /** Left click on a block: break it (Creative, or blocks that break at once) or start mining. */
  override clickBlock(x: number, y: number, z: number, side: number): void {
    const p = this.client.thePlayer!;
    const w = this.client.theWorld!;
    if (this.currentGameType.isAdventure() && !p.canCurrentToolHarvestBlock(x, y, z)) return;
    if (this.currentGameType.isCreative()) {
      this.clickBlockInCreative(x, y, z, side);
      this.hitDelay = 5;
      return;
    }
    if (this.isHittingBlock && this.sameToolAndBlock(x, y, z)) return;
    // The server's half (ItemInWorldManager.onBlockClicked): fire on the face goes out, the block hears the click.
    w.extinguishFire(null, x, y, z, side);
    const id = w.getBlockId(x, y, z);
    if (id > 0) Block.blocksList[id]?.onBlockClicked(w, x, y, z, p);
    const now = w.getBlockId(x, y, z);
    const block = now > 0 ? Block.blocksList[now] : null;
    if (block && block.getPlayerRelativeBlockHardness(p, w, x, y, z) >= 1) {
      this.onPlayerDestroyBlock(x, y, z, side);
    } else {
      this.isHittingBlock = true;
      this.curBlockX = x;
      this.curBlockY = y;
      this.curBlockZ = z;
      this.currentItemHittingBlock = p.getHeldItem();
      this.curBlockDamageMP = 0;
      this.miningSounds.reset();
      w.destroyBlockInWorldPartially(p.entityId, x, y, z, Math.trunc(f(this.curBlockDamageMP * 10)) - 1);
    }
  }

  /** The attack button was released or the crosshair left the block: the cracks go away. */
  override resetBlockRemoving(): void {
    this.isHittingBlock = false;
    this.curBlockDamageMP = 0;
    const p = this.client.thePlayer;
    const w = this.client.theWorld;
    if (p && w) w.destroyBlockInWorldPartially(p.entityId, this.curBlockX, this.curBlockY, this.curBlockZ, -1);
  }

  /** Every tick the attack button stays down on a block. */
  override onPlayerDamageBlock(x: number, y: number, z: number, side: number): void {
    if (this.hitDelay > 0) {
      this.hitDelay--;
      return;
    }
    if (this.currentGameType.isCreative()) {
      this.hitDelay = 5;
      this.clickBlockInCreative(x, y, z, side);
      return;
    }
    if (!this.sameToolAndBlock(x, y, z)) {
      this.clickBlock(x, y, z, side);
      return;
    }
    const p = this.client.thePlayer!;
    const w = this.client.theWorld!;
    const id = w.getBlockId(x, y, z);
    if (id === 0) {
      this.isHittingBlock = false;
      return;
    }
    const block = Block.blocksList[id];
    if (!block) return;
    this.curBlockDamageMP = f(this.curBlockDamageMP + block.getPlayerRelativeBlockHardness(p, w, x, y, z));
    this.miningSounds.onDamageTick(this.client.sndManager, block.stepSound, x, y, z);
    if (this.curBlockDamageMP >= 1) {
      this.isHittingBlock = false;
      this.onPlayerDestroyBlock(x, y, z, side);
      this.curBlockDamageMP = 0;
      this.miningSounds.reset();
      this.hitDelay = 5;
    }
    w.destroyBlockInWorldPartially(p.entityId, this.curBlockX, this.curBlockY, this.curBlockZ, Math.trunc(f(this.curBlockDamageMP * 10)) - 1);
  }

  override getBlockReachDistance(): number {
    return this.currentGameType.isCreative() ? 5 : f(4.5);
  }

  /** Still hitting the same block with the same held item (a damageable tool may wear meanwhile). */
  private sameToolAndBlock(x: number, y: number, z: number): boolean {
    const held = this.client.thePlayer!.getHeldItem();
    const was = this.currentItemHittingBlock;
    let same = was === null && held === null;
    if (was !== null && held !== null) {
      same = held.itemID === was.itemID && ItemStack.areItemStackTagsEqual(held, was) && (held.isItemStackDamageable() || held.getItemDamage() === was.getItemDamage());
    }
    return x === this.curBlockX && y === this.curBlockY && z === this.curBlockZ && same;
  }

  /**
   * Right click on a block: activate it, otherwise use the held item on it. Creative keeps the
   * stack's size and damage (activateBlockOrUseItem); the other modes spend it.
   */
  override onPlayerRightClick(p: EntityPlayer, w: World, stack: ItemStack | null, x: number, y: number, z: number, side: number, hit: Vec3): boolean {
    if (this.currentGameType.isCreative()) return super.onPlayerRightClick(p, w, stack, x, y, z, side, hit);
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
    if (activated) return true;
    if (!stack) return false;
    return stack.tryPlaceItemIntoWorld(p, w, x, y, z, side, hx, hy, hz);
  }

  override isNotCreative(): boolean {
    return !this.currentGameType.isCreative();
  }

  override isInCreativeMode(): boolean {
    return this.currentGameType.isCreative();
  }

  override extendedReach(): boolean {
    return this.currentGameType.isCreative();
  }
}
