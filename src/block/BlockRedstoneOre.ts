import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemStack } from '../item/ItemStack';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Redstone ore (73) and its glowing form (74); touching it makes it glow. */
export class BlockRedstoneOre extends Block {
  constructor(
    id: number,
    private readonly glowing: boolean,
  ) {
    super(id, Material.rock);
    if (glowing) this.setTickRandomly(true);
  }

  override tickRate(_w: IWorld): number {
    return 30;
  }

  override onBlockClicked(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): void {
    this.glow(w, x, y, z);
    super.onBlockClicked(w, x, y, z, p);
  }

  override onEntityWalking(w: IWorld, x: number, y: number, z: number, e: Entity): void {
    this.glow(w, x, y, z);
    super.onEntityWalking(w, x, y, z, e);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer, side: number, hx: number, hy: number, hz: number): boolean {
    this.glow(w, x, y, z);
    return super.onBlockActivated(w, x, y, z, p, side, hx, hy, hz);
  }

  private glow(w: IWorld, x: number, y: number, z: number): void {
    this.sparkle(w, x, y, z);
    if (this.blockID === BlockIds.oreRedstone) w.setBlock(x, y, z, BlockIds.oreRedstoneGlowing);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (this.blockID === BlockIds.oreRedstoneGlowing) w.setBlock(x, y, z, BlockIds.oreRedstone);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.redstone;
  }

  override quantityDroppedWithBonus(fortune: number, rand: JavaRandom): number {
    return this.quantityDropped(rand) + rand.nextInt(fortune + 1);
  }

  override quantityDropped(rand: JavaRandom): number {
    return 4 + rand.nextInt(2);
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (this.glowing) this.sparkle(w, x, y, z);
  }

  private sparkle(w: IWorld, x: number, y: number, z: number): void {
    const r = w.rand;
    const d = 0.0625;
    for (let i = 0; i < 6; i++) {
      let px = x + r.nextFloat();
      let py = y + r.nextFloat();
      let pz = z + r.nextFloat();
      if (i === 0 && !w.isBlockOpaqueCube(x, y + 1, z)) py = y + 1 + d;
      if (i === 1 && !w.isBlockOpaqueCube(x, y - 1, z)) py = y - d;
      if (i === 2 && !w.isBlockOpaqueCube(x, y, z + 1)) pz = z + 1 + d;
      if (i === 3 && !w.isBlockOpaqueCube(x, y, z - 1)) pz = z - d;
      if (i === 4 && !w.isBlockOpaqueCube(x + 1, y, z)) px = x + 1 + d;
      if (i === 5 && !w.isBlockOpaqueCube(x - 1, y, z)) px = x - d;
      if (px < x || px > x + 1 || py < 0 || py > y + 1 || pz < z || pz > z + 1) {
        w.spawnParticle('reddust', px, py, pz, 0, 0, 0);
      }
    }
  }

  protected override createStackedBlock(_meta: number): ItemStack {
    return new ItemStack(BlockIds.oreRedstone, 1, 0);
  }
}
