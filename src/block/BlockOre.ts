import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

export class BlockOre extends Block {
  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    switch (this.blockID) {
      case BlockIds.oreCoal:
        return ItemIds.coal;
      case BlockIds.oreDiamond:
        return ItemIds.diamond;
      case BlockIds.oreLapis:
        return ItemIds.dyePowder;
      case BlockIds.oreEmerald:
        return ItemIds.emerald;
      case BlockIds.oreNetherQuartz:
        return ItemIds.netherQuartz;
      default:
        return this.blockID;
    }
  }

  override quantityDropped(rand: JavaRandom): number {
    return this.blockID === BlockIds.oreLapis ? 4 + rand.nextInt(5) : 1;
  }

  override quantityDroppedWithBonus(fortune: number, rand: JavaRandom): number {
    if (fortune > 0 && this.blockID !== this.idDropped(0, rand, fortune)) {
      let extra = rand.nextInt(fortune + 2) - 1;
      if (extra < 0) extra = 0;
      return this.quantityDropped(rand) * (extra + 1);
    }
    return this.quantityDropped(rand);
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, fortune);
    if (this.idDropped(meta, w.rand, fortune) !== this.blockID) {
      let xp = 0;
      if (this.blockID === BlockIds.oreCoal) xp = MathHelper.getRandomIntegerInRange(w.rand, 0, 2);
      else if (this.blockID === BlockIds.oreDiamond || this.blockID === BlockIds.oreEmerald) xp = MathHelper.getRandomIntegerInRange(w.rand, 3, 7);
      else if (this.blockID === BlockIds.oreLapis || this.blockID === BlockIds.oreNetherQuartz) xp = MathHelper.getRandomIntegerInRange(w.rand, 2, 5);
      this.dropXpOnBlockBreak(w, x, y, z, xp);
    }
  }

  override damageDropped(_meta: number): number {
    return this.blockID === BlockIds.oreLapis ? 4 : 0;
  }
}
