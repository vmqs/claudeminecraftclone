import type { JavaRandom } from '../core/JavaRandom';
import type { IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Redstone lamp (123 off, 124 lit). Lights only through redstone, which is out of scope. */
export class BlockRedstoneLight extends Block {
  constructor(
    id: number,
    private readonly powered: boolean,
  ) {
    super(id, Material.redstoneLight);
    if (powered) this.setLightValue(1);
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.powered ? 'redstoneLight_lit' : 'redstoneLight');
  }

  private checkPower(w: IWorld, x: number, y: number, z: number): void {
    if (w.isRemote || !Block.hasRedstone(w)) return;
    const on = Block.isPowered(w, x, y, z);
    if (this.powered && !on) w.scheduleBlockUpdate(x, y, z, this.blockID, 4);
    else if (!this.powered && on) w.setBlock(x, y, z, BlockIds.redstoneLampActive, 0, 2);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    this.checkPower(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    this.checkPower(w, x, y, z);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (!w.isRemote && this.powered && Block.hasRedstone(w) && !Block.isPowered(w, x, y, z)) w.setBlock(x, y, z, BlockIds.redstoneLampIdle, 0, 2);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.redstoneLampIdle;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return BlockIds.redstoneLampIdle;
  }
}
