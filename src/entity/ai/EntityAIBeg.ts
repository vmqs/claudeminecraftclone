import { ItemIds } from '../../block/BlockIds';
import type { ItemStack } from '../../item/ItemStack';
import type { EntityLiving } from '../EntityLiving';
import type { EntityPlayer } from '../EntityPlayer';
import { EntityAIBase } from './EntityAIBase';

/** What begging needs from a wolf (EntityWolf). */
export interface Beggar extends EntityLiving {
  isTamed(): boolean;
  isBreedingItem(stack: ItemStack): boolean;
  /** func_70918_i: the head-tilt flag (DataWatcher 19). */
  setBegging(v: boolean): void;
}

/**
 * Wolves tilt their head at a player within `minPlayerDistance` holding a bone (while wild) or
 * their breeding meat, for 2-4 seconds at a time.
 */
export class EntityAIBeg extends EntityAIBase {
  private thePlayer: EntityPlayer | null = null;
  private lookTime = 0;

  constructor(
    private readonly theWolf: Beggar,
    private readonly minPlayerDistance: number,
  ) {
    super();
    this.setMutexBits(2);
  }

  shouldExecute(): boolean {
    this.thePlayer = this.theWolf.worldObj.getClosestPlayerToEntity(this.theWolf, this.minPlayerDistance);
    return this.thePlayer ? this.hasPlayerGotBoneInHand(this.thePlayer) : false;
  }

  override continueExecuting(): boolean {
    const p = this.thePlayer!;
    if (!p.isEntityAlive()) return false;
    if (this.theWolf.getDistanceSqToEntity(p) > this.minPlayerDistance * this.minPlayerDistance) return false;
    return this.lookTime > 0 && this.hasPlayerGotBoneInHand(p);
  }

  override startExecuting(): void {
    this.theWolf.setBegging(true);
    this.lookTime = 40 + this.theWolf.getRNG().nextInt(40);
  }

  override resetTask(): void {
    this.theWolf.setBegging(false);
    this.thePlayer = null;
  }

  override updateTask(): void {
    const p = this.thePlayer!;
    this.theWolf.getLookHelper().setLookPosition(p.posX, p.posY + p.getEyeHeight(), p.posZ, 10, this.theWolf.getVerticalFaceSpeed());
    this.lookTime--;
  }

  private hasPlayerGotBoneInHand(p: EntityPlayer): boolean {
    const held = p.inventory.getCurrentItem();
    if (!held) return false;
    return !this.theWolf.isTamed() && held.itemID === ItemIds.bone ? true : this.theWolf.isBreedingItem(held);
  }
}
