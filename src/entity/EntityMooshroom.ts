import { BlockIds, ItemIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { EntityAgeable } from './EntityAgeable';
import { EntityCow } from './EntityCow';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * The mooshroom (EntityMooshroom): a cow that fills bowls with mushroom stew and, sheared,
 * turns into a plain cow dropping five red mushrooms. Spawns on mycelium (mushroom islands).
 */
export class EntityMooshroom extends EntityCow {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/redcow.png';
    this.setSize(f(0.9), f(1.3));
  }

  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (held && held.itemID === ItemIds.bowlEmpty && this.getGrowingAge() >= 0) {
      if (held.stackSize === 1) {
        player.inventory.setInventorySlotContents(player.inventory.currentItem, new ItemStack(ItemIds.bowlSoup));
        return true;
      }
      if (player.inventory.addItemStackToInventory(new ItemStack(ItemIds.bowlSoup)) && !player.capabilities.isCreativeMode) {
        player.inventory.decrStackSize(player.inventory.currentItem, 1);
        return true;
      }
    }
    if (held && held.itemID === ItemIds.shears && this.getGrowingAge() >= 0) {
      this.setDead();
      this.worldObj.spawnParticle('largeexplode', this.posX, this.posY + f(this.height / 2), this.posZ, 0, 0, 0);
      const cow = new EntityCow(this.worldObj);
      cow.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
      cow.setEntityHealth(this.getHealth());
      cow.renderYawOffset = this.renderYawOffset;
      this.worldObj.spawnEntityInWorld(cow);
      for (let i = 0; i < 5; i++) {
        const item = this.worldObj.createItemEntity(this.posX, this.posY + this.height, this.posZ, new ItemStack(BlockIds.mushroomRed));
        if (item) this.worldObj.spawnEntityInWorld(item);
      }
      return true;
    }
    return super.interact(player);
  }

  override createChild(_mate: EntityAgeable): EntityAgeable {
    return new EntityMooshroom(this.worldObj);
  }
}
