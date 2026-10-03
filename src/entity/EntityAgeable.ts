import { ItemIds } from '../block/BlockIds';
import type { World } from '../world/World';
import { EntityCreature } from './EntityCreature';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A creature with a growing age (EntityAgeable): negative = baby (half size, grows up at 0),
 * positive = breeding cooldown. Using its own spawn egg on it spawns a baby.
 */
export abstract class EntityAgeable extends EntityCreature {
  private growingAge = 0;
  private baseWidth = -1;
  private baseHeight = 0;

  constructor(world: World) {
    super(world);
  }

  /** The baby made with `mate` (null when this kind cannot breed). */
  abstract createChild(mate: EntityAgeable): EntityAgeable | null;

  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && held.itemID === ItemIds.monsterPlacer) {
      const cls = EntityList.getClassFromID(held.getItemDamage());
      if (cls && this instanceof cls) {
        const child = this.createChild(this);
        if (child) {
          child.setGrowingAge(-24000);
          child.setLocationAndAngles(this.posX, this.posY, this.posZ, 0, 0);
          this.worldObj.spawnEntityInWorld(child);
          if (held.hasDisplayName()) child.setCustomNameTag(held.getDisplayName());
          if (!player.capabilities.isCreativeMode && --held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
        }
      }
    }
    return super.interact(player);
  }

  getGrowingAge(): number {
    return this.growingAge;
  }

  setGrowingAge(age: number): void {
    this.growingAge = age;
    this.setScaleForAge(this.isChild());
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    if (this.growingAge < 0) this.setGrowingAge(this.growingAge + 1);
    else if (this.growingAge > 0) this.setGrowingAge(this.growingAge - 1);
  }

  override isChild(): boolean {
    return this.growingAge < 0;
  }

  /** func_98054_a: babies are half size. */
  setScaleForAge(child: boolean): void {
    this.setScale(child ? 0.5 : 1);
  }

  /** Remembers the adult size; the actual box follows the age scale. */
  protected override setSize(w: number, h: number): void {
    const known = this.baseWidth > 0;
    this.baseWidth = w;
    this.baseHeight = h;
    if (!known) this.setScale(1);
  }

  private setScale(scale: number): void {
    super.setSize(f(this.baseWidth * scale), f(this.baseHeight * scale));
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'Age', this.getGrowingAge());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setGrowingAge(NBT.getInteger(tag, 'Age'));
  }
}
