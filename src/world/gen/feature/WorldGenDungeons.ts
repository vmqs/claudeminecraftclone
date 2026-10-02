import { BlockIds, ItemIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { GenInventory, putTileEntityTag, randomEnchantedBook, placeSpawner, type ItemStackData } from '../ChestLoot';
import { WorldGenerator } from '../WorldGenerator';

const stack = (id: number, count = 1, damage = 0): ItemStackData => ({ id, Count: count, Damage: damage });

/**
 * Dungeons (WorldGenDungeons): a cobblestone room with a mossy floor in solid ground with one to
 * five openings, up to two loot chests against single walls and a spawner in the middle.
 */
export class WorldGenDungeons extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const h = 3;
    const rx = rand.nextInt(2) + 2;
    const rz = rand.nextInt(2) + 2;
    let openings = 0;
    for (let xx = x - rx - 1; xx <= x + rx + 1; xx++) {
      for (let yy = y - 1; yy <= y + h + 1; yy++) {
        for (let zz = z - rz - 1; zz <= z + rz + 1; zz++) {
          const m = w.getBlockMaterial(xx, yy, zz);
          if (yy === y - 1 && !m.isSolid()) return false;
          if (yy === y + h + 1 && !m.isSolid()) return false;
          if ((xx === x - rx - 1 || xx === x + rx + 1 || zz === z - rz - 1 || zz === z + rz + 1) && yy === y && w.isAirBlock(xx, yy, zz) && w.isAirBlock(xx, yy + 1, zz)) {
            openings++;
          }
        }
      }
    }
    if (openings < 1 || openings > 5) return false;
    for (let xx = x - rx - 1; xx <= x + rx + 1; xx++) {
      for (let yy = y + h; yy >= y - 1; yy--) {
        for (let zz = z - rz - 1; zz <= z + rz + 1; zz++) {
          if (xx !== x - rx - 1 && yy !== y - 1 && zz !== z - rz - 1 && xx !== x + rx + 1 && yy !== y + h + 1 && zz !== z + rz + 1) {
            w.setBlockToAir(xx, yy, zz);
          } else if (yy >= 0 && !w.getBlockMaterial(xx, yy - 1, zz).isSolid()) {
            w.setBlockToAir(xx, yy, zz);
          } else if (w.getBlockMaterial(xx, yy, zz).isSolid()) {
            if (yy === y - 1 && rand.nextInt(4) !== 0) w.setBlock(xx, yy, zz, BlockIds.cobblestoneMossy, 0, 2);
            else w.setBlock(xx, yy, zz, BlockIds.cobblestone, 0, 2);
          }
        }
      }
    }
    for (let n = 0; n < 2; n++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const cx = x + rand.nextInt(rx * 2 + 1) - rx;
        const cz = z + rand.nextInt(rz * 2 + 1) - rz;
        if (!w.isAirBlock(cx, y, cz)) continue;
        let walls = 0;
        if (w.getBlockMaterial(cx - 1, y, cz).isSolid()) walls++;
        if (w.getBlockMaterial(cx + 1, y, cz).isSolid()) walls++;
        if (w.getBlockMaterial(cx, y, cz - 1).isSolid()) walls++;
        if (w.getBlockMaterial(cx, y, cz + 1).isSolid()) walls++;
        if (walls !== 1) continue;
        w.setBlock(cx, y, cz, BlockIds.chest, 0, 2);
        const inv = new GenInventory(27);
        for (let i = 0; i < 8; i++) {
          const s = this.pickCheckLootItem(rand);
          if (s) inv.setInventorySlotContents(rand.nextInt(inv.getSizeInventory()), s);
        }
        putTileEntityTag(w, cx, y, cz, { id: 'Chest', Items: inv.toItemsTag() });
        break;
      }
    }
    w.setBlock(x, y, z, BlockIds.mobSpawner, 0, 2);
    placeSpawner(w, x, y, z, this.pickMobSpawner(rand));
    return true;
  }

  private pickCheckLootItem(rand: JavaRandom): ItemStackData | null {
    const r = rand.nextInt(12);
    if (r === 0) return stack(ItemIds.saddle);
    if (r === 1) return stack(ItemIds.ingotIron, rand.nextInt(4) + 1);
    if (r === 2) return stack(ItemIds.bread);
    if (r === 3) return stack(ItemIds.wheat, rand.nextInt(4) + 1);
    if (r === 4) return stack(ItemIds.gunpowder, rand.nextInt(4) + 1);
    if (r === 5) return stack(ItemIds.silk, rand.nextInt(4) + 1);
    if (r === 6) return stack(ItemIds.bucketEmpty);
    if (r === 7 && rand.nextInt(100) === 0) return stack(ItemIds.appleGold);
    if (r === 8 && rand.nextInt(2) === 0) return stack(ItemIds.redstone, rand.nextInt(4) + 1);
    if (r === 9 && rand.nextInt(10) === 0) return stack(ItemIds.record13 + rand.nextInt(2));
    if (r === 10) return stack(ItemIds.dyePowder, 1, 3);
    return r === 11 ? randomEnchantedBook(rand) : null;
  }

  private pickMobSpawner(rand: JavaRandom): string {
    const r = rand.nextInt(4);
    return r === 0 ? 'Skeleton' : r === 1 || r === 2 ? 'Zombie' : r === 3 ? 'Spider' : '';
  }
}
