import { BlockBed } from '../../block/BlockBed';
import { BlockIds } from '../../block/BlockIds';
import type { World } from '../../world/World';
import { TileEntityChest } from '../../world/tileentity/TileEntityChest';
import type { EntityTameable } from '../EntityTameable';
import { EntityAIBase } from './EntityAIBase';

/**
 * Tamed cats now and then (0.65% of checks) walk to the nearest closed chest, lit furnace or bed
 * foot within 8 blocks at their height and sit on it for 1200-3600 ticks.
 */
export class EntityAIOcelotSit extends EntityAIBase {
  private currentTick = 0;
  private walkTicks = 0;
  private maxSittingTicks = 0;
  private sitableBlockX = 0;
  private sitableBlockY = 0;
  private sitableBlockZ = 0;

  constructor(
    private readonly theOcelot: EntityTameable,
    private readonly speed: number,
  ) {
    super();
    this.setMutexBits(5);
  }

  shouldExecute(): boolean {
    const o = this.theOcelot;
    return o.isTamed() && !o.isSitting() && o.getRNG().nextDouble() <= Math.fround(0.0065) && this.getNearbySitableBlockDistance();
  }

  override continueExecuting(): boolean {
    return this.currentTick <= this.maxSittingTicks && this.walkTicks <= 60 && this.isSittableBlock(this.theOcelot.worldObj, this.sitableBlockX, this.sitableBlockY, this.sitableBlockZ);
  }

  override startExecuting(): void {
    const o = this.theOcelot;
    o.getNavigator().tryMoveToXYZ(this.sitableBlockX + 0.5, this.sitableBlockY + 1, this.sitableBlockZ + 0.5, this.speed);
    this.currentTick = 0;
    this.walkTicks = 0;
    this.maxSittingTicks = o.getRNG().nextInt(o.getRNG().nextInt(1200) + 1200) + 1200;
    o.getAISit().setSitting(false);
  }

  override resetTask(): void {
    this.theOcelot.setSitting(false);
  }

  override updateTask(): void {
    const o = this.theOcelot;
    this.currentTick++;
    o.getAISit().setSitting(false);
    if (o.getDistanceSq(this.sitableBlockX, this.sitableBlockY + 1, this.sitableBlockZ) > 1) {
      o.setSitting(false);
      o.getNavigator().tryMoveToXYZ(this.sitableBlockX + 0.5, this.sitableBlockY + 1, this.sitableBlockZ + 0.5, this.speed);
      this.walkTicks++;
    } else if (!o.isSitting()) {
      o.setSitting(true);
    } else {
      this.walkTicks--;
    }
  }

  private getNearbySitableBlockDistance(): boolean {
    const o = this.theOcelot;
    const y = Math.trunc(o.posY);
    let best = 2.147483647e9;
    for (let x = Math.trunc(o.posX) - 8; x < o.posX + 8; x++) {
      for (let z = Math.trunc(o.posZ) - 8; z < o.posZ + 8; z++) {
        if (this.isSittableBlock(o.worldObj, x, y, z) && o.worldObj.isAirBlock(x, y + 1, z)) {
          const d = o.getDistanceSq(x, y, z);
          if (d < best) {
            this.sitableBlockX = x;
            this.sitableBlockY = y;
            this.sitableBlockZ = z;
            best = d;
          }
        }
      }
    }
    return best < 2.147483647e9;
  }

  private isSittableBlock(w: World, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === BlockIds.chest) {
      const te = w.getBlockTileEntity(x, y, z);
      return te instanceof TileEntityChest && te.numUsingPlayers < 1;
    }
    if (id === BlockIds.furnaceBurning) return true;
    return id === BlockIds.bed && !BlockBed.isBlockHeadOfBed(w.getBlockMetadata(x, y, z));
  }
}
