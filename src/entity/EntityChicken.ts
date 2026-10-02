import { ItemIds } from '../block/BlockIds';
import { ItemSeeds } from '../item/ItemFood';
import type { ItemStack } from '../item/ItemStack';
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

const f = Math.fround;

/**
 * The chicken (EntityChicken): 4 health, bred with seeds, flaps its wings and falls slowly in
 * the air (no fall damage), lays an egg every 6000-12000 ticks, drops 0-2 feathers and one
 * (cooked when burning) chicken.
 */
export class EntityChicken extends EntityAnimal {
  /** field_70886_e / field_70888_h: wing flap phase (and previous). */
  wingRotation = 0;
  prevWingRotation = 0;
  /** destPos / field_70884_g: how far the wings are spread (0 on the ground, 1 in the air). */
  destPos = 0;
  prevDestPos = 0;
  /** field_70889_i: wing flap speed. */
  wingRotDelta = 1;
  timeUntilNextEgg: number;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/chicken.png';
    this.setSize(f(0.3), f(0.7));
    this.timeUntilNextEgg = this.rand.nextInt(6000) + 6000;
    const speed = f(0.25);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIPanic(this, f(0.38)));
    this.tasks.addTask(2, new EntityAIMate(this, speed));
    this.tasks.addTask(3, new EntityAITempt(this, f(0.25), ItemIds.seeds, false));
    this.tasks.addTask(4, new EntityAIFollowParent(this, f(0.28)));
    this.tasks.addTask(5, new EntityAIWander(this, speed));
    this.tasks.addTask(6, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(7, new EntityAILookIdle(this));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 4;
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    this.prevWingRotation = this.wingRotation;
    this.prevDestPos = this.destPos;
    this.destPos = f(this.destPos + (this.onGround ? -1 : 4) * 0.3);
    if (this.destPos < 0) this.destPos = 0;
    if (this.destPos > 1) this.destPos = 1;
    if (!this.onGround && this.wingRotDelta < 1) this.wingRotDelta = 1;
    this.wingRotDelta = f(this.wingRotDelta * 0.9);
    if (!this.onGround && this.motionY < 0) this.motionY *= 0.6;
    this.wingRotation = f(this.wingRotation + f(this.wingRotDelta * 2));
    if (!this.isChild() && --this.timeUntilNextEgg <= 0) {
      this.playSound('mob.chicken.plop', 1, f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
      this.dropItem(ItemIds.egg, 1);
      this.timeUntilNextEgg = this.rand.nextInt(6000) + 6000;
    }
  }

  protected override fall(_dist: number): void {}

  protected override getLivingSound(): string | null {
    return 'mob.chicken.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.chicken.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.chicken.hurt';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.chicken.step', f(0.15), 1);
  }

  protected override getDropItemId(): number {
    return ItemIds.feather;
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const n = this.rand.nextInt(3) + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.feather, 1);
    this.dropItem(this.isBurning() ? ItemIds.chickenCooked : ItemIds.chickenRaw, 1);
  }

  createChild(_mate: EntityAgeable): EntityAgeable {
    return new EntityChicken(this.worldObj);
  }

  /** Any seeds (wheat, pumpkin, melon, nether wart). */
  override isBreedingItem(stack: ItemStack): boolean {
    return stack != null && stack.getItem() instanceof ItemSeeds;
  }
}
