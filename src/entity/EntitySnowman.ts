import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { EntityAIArrowAttack } from './ai/EntityAIArrowAttack';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { anyLiving, EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { IRangedAttackMob } from './ai/IRangedAttackMob';
import { DamageSource } from './DamageSource';
import { EntityGolem } from './EntityGolem';
import type { EntityLiving } from './EntityLiving';
import { EntitySnowball } from './EntitySnowball';
import { mobSelector } from './IMob';

const f = Math.fround;

/**
 * The snow golem (EntitySnowman): 4 health, throws snowballs at monsters within 16 blocks
 * (every 20 ticks within 10 blocks), leaves a trail of snow in cold biomes, melts in water,
 * rain and hot biomes (temperature above 1), drops 0-15 snowballs.
 */
export class EntitySnowman extends EntityGolem implements IRangedAttackMob {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/snowman.png';
    this.setSize(f(0.4), f(1.8));
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(1, new EntityAIArrowAttack(this, f(0.25), 20, 10));
    this.tasks.addTask(2, new EntityAIWander(this, f(0.2)));
    this.tasks.addTask(3, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(4, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAINearestAttackableTarget(this, anyLiving, 16, 0, true, false, mobSelector));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 4;
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    const w = this.worldObj;
    if (this.isWet()) this.attackEntityFrom(DamageSource.drown, 1);
    let x = MathHelper.floor_double(this.posX);
    let z = MathHelper.floor_double(this.posZ);
    if (w.getBiomeGenForCoords(x, z).getFloatTemperature() > 1) this.attackEntityFrom(DamageSource.onFire, 1);
    const snow = Block.blocksList[BlockIds.snow]!;
    for (let i = 0; i < 4; i++) {
      x = MathHelper.floor_double(this.posX + f(f(((i % 2) * 2 - 1)) * f(0.25)));
      const y = MathHelper.floor_double(this.posY);
      z = MathHelper.floor_double(this.posZ + f(f((((i / 2) | 0) % 2) * 2 - 1) * f(0.25)));
      if (w.getBlockId(x, y, z) === 0 && w.getBiomeGenForCoords(x, z).getFloatTemperature() < f(0.8) && snow.canPlaceBlockAt(w, x, y, z)) {
        const bx = x;
        const bz = z;
        w.runNaturally(() => w.setBlock(bx, y, bz, BlockIds.snow));
      }
    }
  }

  protected override getDropItemId(): number {
    return ItemIds.snowball;
  }

  protected override dropFewItems(_recentlyHit: boolean, _looting: number): void {
    const n = this.rand.nextInt(16);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.snowball, 1);
  }

  attackEntityWithRangedAttack(target: EntityLiving, _power: number): void {
    const ball = new EntitySnowball(this.worldObj, this);
    const dx = target.posX - this.posX;
    const dy = target.posY + target.getEyeHeight() - f(1.1) - ball.posY;
    const dz = target.posZ - this.posZ;
    const lift = f(MathHelper.sqrt_double(dx * dx + dz * dz) * f(0.2));
    ball.setThrowableHeading(dx, dy + lift, dz, f(1.6), 12);
    this.playSound('random.bow', 1, f(1 / f(f(this.getRNG().nextFloat() * f(0.4)) + f(0.8))));
    this.worldObj.spawnEntityInWorld(ball);
  }
}
