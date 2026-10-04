import type { JavaRandom } from '../core/JavaRandom';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityMobSpawner } from '../world/tileentity/TileEntityMobSpawner';
import { BlockContainer } from './BlockContainer';
import { Material } from './Material';

/** Monster spawner (52): a see-through cage (the spinning mob comes from its tile-entity renderer). */
export class BlockMobSpawner extends BlockContainer {
  constructor(id: number) {
    super(id, Material.rock);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityMobSpawner();
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  /** 15-43 experience in survival (none in creative). */
  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, fortune);
    const xp = 15 + w.rand.nextInt(15) + w.rand.nextInt(15);
    this.dropXpOnBlockBreak(w, x, y, z, xp);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }
}
