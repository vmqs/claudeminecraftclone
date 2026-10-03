import { ItemIds } from '../block/BlockIds';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAIControlledByPlayer } from './ai/EntityAIControlledByPlayer';
import { EntityAIFollowParent } from './ai/EntityAIFollowParent';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAIMate } from './ai/EntityAIMate';
import { EntityAIPanic } from './ai/EntityAIPanic';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAITempt } from './ai/EntityAITempt';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { Entity } from './Entity';
import type { EntityAgeable } from './EntityAgeable';
import { EntityAnimal } from './EntityAnimal';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import { AchievementIds } from '../stats/StatIds';

const f = Math.fround;

/**
 * The pig (EntityPig): 10 health, bred and tempted with carrots, tempted by a carrot on a stick,
 * can be saddled and ridden (steered with a carrot on a stick), drops 1-3 porkchops (cooked when
 * burning) plus its saddle, and turns into a zombie pigman when struck by lightning.
 */
export class EntityPig extends EntityAnimal {
  private saddled = false;
  private readonly aiControlledByPlayer: EntityAIControlledByPlayer;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/pig.png';
    this.setSize(f(0.9), f(0.9));
    this.getNavigator().setAvoidsWater(true);
    const speed = f(0.25);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIPanic(this, f(0.38)));
    this.tasks.addTask(2, (this.aiControlledByPlayer = new EntityAIControlledByPlayer(this, f(0.34))));
    this.tasks.addTask(3, new EntityAIMate(this, speed));
    this.tasks.addTask(4, new EntityAITempt(this, f(0.3), ItemIds.carrotOnAStick, false));
    this.tasks.addTask(4, new EntityAITempt(this, f(0.3), ItemIds.carrot, false));
    this.tasks.addTask(5, new EntityAIFollowParent(this, f(0.28)));
    this.tasks.addTask(6, new EntityAIWander(this, speed));
    this.tasks.addTask(7, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(8, new EntityAILookIdle(this));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 10;
  }

  /** Steerable while the rider holds a carrot on a stick. */
  override canBeSteered(): boolean {
    const held = (this.riddenByEntity as EntityPlayer | null)?.getHeldItem();
    return held != null && held.itemID === ItemIds.carrotOnAStick;
  }

  readEntityFromNBT(tag: Record<string, unknown>): void {
    if (tag.Saddle !== undefined) this.setSaddled(!!tag.Saddle);
  }

  protected override getLivingSound(): string | null {
    return 'mob.pig.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.pig.say';
  }

  protected override getDeathSound(): string | null {
    return 'mob.pig.death';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.pig.step', f(0.15), 1);
  }

  /** Right click on a saddled pig mounts it (after feeding and egg handling). */
  override interact(player: EntityPlayer): boolean {
    if (super.interact(player)) return true;
    if (!this.getSaddled() || (this.riddenByEntity !== null && this.riddenByEntity !== player)) return false;
    player.mountEntity(this);
    return true;
  }

  protected override getDropItemId(): number {
    return this.isBurning() ? ItemIds.porkCooked : ItemIds.porkRaw;
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const n = this.rand.nextInt(3) + 1 + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(this.isBurning() ? ItemIds.porkCooked : ItemIds.porkRaw, 1);
    if (this.getSaddled()) this.dropItem(ItemIds.saddle, 1);
  }

  getSaddled(): boolean {
    return this.saddled;
  }

  setSaddled(v: boolean): void {
    this.saddled = v;
  }

  /** Lightning turns the pig into a zombie pigman (when that mob exists). */
  override onStruckByLightning(_bolt: Entity): void {
    const pigman = EntityList.createEntityByName('PigZombie', this.worldObj);
    if (!pigman) return;
    pigman.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
    this.worldObj.spawnEntityInWorld(pigman);
    this.setDead();
  }

  /** A ridden pig falling more than 5 blocks earns its rider "When Pigs Fly". */
  protected override fall(dist: number): void {
    super.fall(dist);
    const rider = this.riddenByEntity as Entity | null;
    if (dist > 5 && rider?.isPlayerEntity) (rider as EntityPlayer).triggerAchievement(AchievementIds.flyPig);
  }

  createChild(_mate: EntityAgeable): EntityAgeable {
    return new EntityPig(this.worldObj);
  }

  override isBreedingItem(stack: ItemStack): boolean {
    return stack != null && stack.itemID === ItemIds.carrot;
  }

  getAIControlledByPlayer(): EntityAIControlledByPlayer {
    return this.aiControlledByPlayer;
  }
}
