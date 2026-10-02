import { ItemIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAIFollowParent } from './ai/EntityAIFollowParent';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAIMate } from './ai/EntityAIMate';
import { EntityAIPanic } from './ai/EntityAIPanic';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAITempt } from './ai/EntityAITempt';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { EntityAgeable } from './EntityAgeable';
import { EntityAnimal } from './EntityAnimal';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/** The cow (EntityCow): 10 health, milked with a bucket, drops 0-2 leather and 1-3 beef. */
export class EntityCow extends EntityAnimal {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/cow.png';
    this.setSize(f(0.9), f(1.3));
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIPanic(this, f(0.38)));
    this.tasks.addTask(2, new EntityAIMate(this, f(0.2)));
    this.tasks.addTask(3, new EntityAITempt(this, f(0.25), ItemIds.wheat, false));
    this.tasks.addTask(4, new EntityAIFollowParent(this, f(0.25)));
    this.tasks.addTask(5, new EntityAIWander(this, f(0.2)));
    this.tasks.addTask(6, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(7, new EntityAILookIdle(this));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 10;
  }

  protected override getLivingSound(): string | null {
    return 'mob.cow.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.cow.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.cow.hurt';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.cow.step', f(0.15), 1);
  }

  protected override getSoundVolume(): number {
    return f(0.4);
  }

  protected override getDropItemId(): number {
    return ItemIds.leather;
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    let n = this.rand.nextInt(3) + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.leather, 1);
    n = this.rand.nextInt(3) + 1 + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(this.isBurning() ? ItemIds.beefCooked : ItemIds.beefRaw, 1);
  }

  /** An empty bucket becomes a milk bucket (also in Creative, as in 1.5.2). */
  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && held.itemID === ItemIds.bucketEmpty) {
      if (--held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, new ItemStack(ItemIds.bucketMilk));
      else if (!player.inventory.addItemStackToInventory(new ItemStack(ItemIds.bucketMilk))) player.dropPlayerItem(new ItemStack(ItemIds.bucketMilk, 1, 0));
      return true;
    }
    return super.interact(player);
  }

  createChild(_mate: EntityAgeable): EntityAgeable {
    return new EntityCow(this.worldObj);
  }
}
