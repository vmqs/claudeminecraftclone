import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { JavaRandom } from '../core/JavaRandom';
import type { CraftingGrid } from '../item/crafting/IRecipe';
import { CraftingManager } from '../item/crafting/CraftingManager';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAIEatGrass } from './ai/EntityAIEatGrass';
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
const PI_F = f(Math.PI);

/** Two dye stacks side by side, the 2x1 crafting grid a lamb's colour is mixed in. */
class DyeMixGrid implements CraftingGrid {
  readonly slots = [new ItemStack(ItemIds.dyePowder, 1, 0), new ItemStack(ItemIds.dyePowder, 1, 0)];
  getSizeInventory(): number {
    return 2;
  }
  getStackInSlot(slot: number): ItemStack | null {
    return this.slots[slot] ?? null;
  }
  getStackInRowAndColumn(col: number, row: number): ItemStack | null {
    return row === 0 && col >= 0 && col < 2 ? this.slots[col] : null;
  }
}

/**
 * The sheep (EntitySheep): 8 health, 16 fleece colours (random natural colours at spawn), sheared
 * for 1-3 wool, regrows its wool by eating grass (head-down animation, grass turns to dirt),
 * dyed with dyes; a lamb's colour mixes its parents' dyes like the crafting table would.
 */
export class EntitySheep extends EntityAnimal {
  /** The wool colours by metadata (fleeceColorTable), used to tint the fleece layer. */
  static readonly fleeceColorTable: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [0.85, 0.5, 0.2],
    [0.7, 0.3, 0.85],
    [0.4, 0.6, 0.85],
    [0.9, 0.9, 0.2],
    [0.5, 0.8, 0.1],
    [0.95, 0.5, 0.65],
    [0.3, 0.3, 0.3],
    [0.6, 0.6, 0.6],
    [0.3, 0.5, 0.6],
    [0.5, 0.25, 0.7],
    [0.2, 0.3, 0.7],
    [0.4, 0.3, 0.2],
    [0.4, 0.5, 0.2],
    [0.6, 0.2, 0.2],
    [0.1, 0.1, 0.1],
  ].map((c) => c.map(f) as unknown as readonly [number, number, number]);

  private readonly dyeGrid = new DyeMixGrid();
  /** DataWatcher 16: colour in the low 4 bits, sheared in bit 4. */
  private woolFlags = 0;
  /** Ticks left of the grazing animation (40 .. 0). */
  private sheepTimer = 0;
  private readonly aiEatGrass: EntityAIEatGrass;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/sheep.png';
    this.setSize(f(0.9), f(1.3));
    const speed = f(0.23);
    this.aiEatGrass = new EntityAIEatGrass(this);
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIPanic(this, f(0.38)));
    this.tasks.addTask(2, new EntityAIMate(this, speed));
    this.tasks.addTask(3, new EntityAITempt(this, f(0.25), ItemIds.wheat, false));
    this.tasks.addTask(4, new EntityAIFollowParent(this, f(0.25)));
    this.tasks.addTask(5, this.aiEatGrass);
    this.tasks.addTask(6, new EntityAIWander(this, speed));
    this.tasks.addTask(7, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(8, new EntityAILookIdle(this));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  protected override updateAITasks(): void {
    this.sheepTimer = this.aiEatGrass.getEatGrassTick();
    super.updateAITasks();
  }

  getMaxHealth(): number {
    return 8;
  }

  /** One block of its wool colour unless sheared (looting does not apply). */
  protected override dropFewItems(_recentlyHit: boolean, _looting: number): void {
    if (!this.getSheared()) this.entityDropItem(new ItemStack(BlockIds.cloth, 1, this.getFleeceColor()), 0);
  }

  protected override getDropItemId(): number {
    return BlockIds.cloth;
  }

  /** Status 10: the client starts the 40-tick grazing animation. */
  override handleHealthUpdate(status: number): void {
    if (status === 10) this.sheepTimer = 40;
    else super.handleHealthUpdate(status);
  }

  /** func_70894_j: how far the head is lowered (0..1) while grazing. */
  getHeadRotationPointY(pt: number): number {
    const t = this.sheepTimer;
    if (t <= 0) return 0;
    if (t >= 4 && t <= 36) return 1;
    return t < 4 ? f(f(t - pt) / 4) : f(-f(f(t - 40) - pt) / 4);
  }

  /** func_70890_k: the head pitch, chewing while grazing. */
  getHeadRotationAngleX(pt: number): number {
    const t = this.sheepTimer;
    if (t > 4 && t <= 36) {
      const k = f(f(f(t - 4) - pt) / 32);
      return f(f(PI_F / 5) + f(f(0.21991149) * MathHelper.sin(f(k * f(28.7)))));
    }
    return t > 0 ? f(PI_F / 5) : f(this.rotationPitch / f(180 / PI_F));
  }

  /** Shears: 1-3 wool of its colour (the shears wear in survival). */
  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && held.itemID === ItemIds.shears && !this.getSheared() && !this.isChild()) {
      this.setSheared(true);
      const n = 1 + this.rand.nextInt(3);
      for (let i = 0; i < n; i++) {
        const item = this.entityDropItem(new ItemStack(BlockIds.cloth, 1, this.getFleeceColor()), 1);
        if (item) {
          item.motionY += f(this.rand.nextFloat() * f(0.05));
          item.motionX += f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.1));
          item.motionZ += f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.1));
        }
      }
      held.damageItem(1, player);
      this.playSound('mob.sheep.shear', 1, 1);
    }
    return super.interact(player);
  }

  readEntityFromNBT(tag: Record<string, unknown>): void {
    if (tag.Sheared !== undefined) this.setSheared(!!tag.Sheared);
    if (typeof tag.Color === 'number') this.setFleeceColor(tag.Color);
  }

  protected override getLivingSound(): string | null {
    return 'mob.sheep.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.sheep.say';
  }

  protected override getDeathSound(): string | null {
    return 'mob.sheep.say';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.sheep.step', f(0.15), 1);
  }

  getFleeceColor(): number {
    return this.woolFlags & 15;
  }

  setFleeceColor(c: number): void {
    this.woolFlags = (this.woolFlags & 240) | (c & 15);
  }

  getSheared(): boolean {
    return (this.woolFlags & 16) !== 0;
  }

  setSheared(v: boolean): void {
    this.woolFlags = v ? this.woolFlags | 16 : this.woolFlags & ~16;
  }

  /** Natural colours: 5% black, 5% grey, 5% light grey, 3% brown, 0.164% pink, else white. */
  static getRandomFleeceColor(rand: JavaRandom): number {
    const r = rand.nextInt(100);
    if (r < 5) return 15;
    if (r < 10) return 7;
    if (r < 15) return 8;
    if (r < 18) return 12;
    return rand.nextInt(500) === 0 ? 6 : 0;
  }

  createChild(mate: EntityAgeable): EntityAgeable {
    const lamb = new EntitySheep(this.worldObj);
    lamb.setFleeceColor(15 - this.mixDyeColor(this, mate as EntitySheep));
    return lamb;
  }

  /** Eating grass regrows the wool; lambs also grow up 1200 ticks sooner. */
  override eatGrassBonus(): void {
    this.setSheared(false);
    if (this.isChild()) {
      let age = this.getGrowingAge() + 1200;
      if (age > 0) age = 0;
      this.setGrowingAge(age);
    }
  }

  override initCreature(): void {
    this.setFleeceColor(EntitySheep.getRandomFleeceColor(this.worldObj.rand));
  }

  /** func_90014_a: the dye the two parents' dyes craft into, else one parent's at random. */
  private mixDyeColor(a: EntitySheep, b: EntitySheep): number {
    const da = 15 - a.getFleeceColor();
    const db = 15 - b.getFleeceColor();
    this.dyeGrid.slots[0].setItemDamage(da);
    this.dyeGrid.slots[1].setItemDamage(db);
    const out = CraftingManager.getInstance().findMatchingRecipe(this.dyeGrid, a.worldObj);
    if (out && out.getItem().itemID === ItemIds.dyePowder) return out.getItemDamage();
    return this.worldObj.rand.nextBoolean() ? da : db;
  }
}
