import { MathHelper } from '../../core/MathHelper';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { EntityXPOrb } from '../../entity/EntityXPOrb';
import { FurnaceRecipes } from '../../item/crafting/FurnaceRecipes';
import type { ItemStack } from '../../item/ItemStack';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';

const f = Math.fround;

/**
 * The furnace output (SlotFurnace): nothing can be put in; taking smelted items pays out the
 * recipe's experience (fractions rounded up at random) as orbs at the player.
 */
export class SlotFurnace extends Slot {
  private amountTaken = 0;

  constructor(
    private readonly thePlayer: EntityPlayer,
    inv: IInventory,
    index: number,
    x: number,
    y: number,
  ) {
    super(inv, index, x, y);
  }

  override isItemValid(_stack: ItemStack): boolean {
    return false;
  }

  override decrStackSize(n: number): ItemStack | null {
    const s = this.getStack();
    if (s) this.amountTaken += Math.min(n, s.stackSize);
    return super.decrStackSize(n);
  }

  override onPickupFromSlot(player: EntityPlayer, stack: ItemStack | null): void {
    if (stack) this.onCrafting(stack);
    super.onPickupFromSlot(player, stack);
  }

  protected override onCrafting(stack: ItemStack, amount?: number): void {
    if (amount !== undefined) this.amountTaken += amount;
    const p = this.thePlayer;
    stack.onCrafting(p.worldObj, p, this.amountTaken);
    if (!p.worldObj.isRemote) {
      let xp = this.amountTaken;
      const per = FurnaceRecipes.smelting().getExperience(stack.itemID);
      if (per === 0) {
        xp = 0;
      } else if (per < 1) {
        const total = f(xp * per);
        let whole = MathHelper.floor_float(total);
        if (whole < MathHelper.ceiling_float_int(total) && f(Math.random()) < f(total - whole)) whole++;
        xp = whole;
      }
      while (xp > 0) {
        const orb = EntityXPOrb.getXPSplit(xp);
        xp -= orb;
        p.worldObj.spawnEntityInWorld(new EntityXPOrb(p.worldObj, p.posX, p.posY + 0.5, p.posZ + 0.5, orb));
      }
    }
    this.amountTaken = 0;
  }
}
