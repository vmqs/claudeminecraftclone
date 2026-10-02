import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import { offsetBySide } from './ItemBlock';
import { dyeColorNames } from './ItemBlockVariants';
import { ItemStack } from './ItemStack';

/**
 * What bone meal calls on the block it is used on. These are the 1.5.2 method names of
 * BlockSapling, BlockMushroom, BlockStem and BlockCrops; the block classes implement them.
 * `fertilize` also serves as the general hook for any block that can be bone-mealed.
 */
interface Fertilizable {
  markOrGrowMarked?(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void;
  fertilizeMushroom?(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): boolean;
  fertilizeStem?(w: IWorld, x: number, y: number, z: number): void;
  fertilize?(w: IWorld, x: number, y: number, z: number): void;
}

/** What dyeing a sheep needs (EntitySheep). */
interface Dyeable {
  getSheared?(): boolean;
  getFleeceColor?(): number;
  setFleeceColor?(c: number): void;
}

/** BlockCloth.getBlockFromDye / getDyeFromBlock: wool metadata is the inverted dye index. */
export function getBlockFromDye(dye: number): number {
  return ~dye & 15;
}

/**
 * Dyes and bone meal (ItemDye, 16 colours). Bone meal (15) grows plants, cocoa beans (3) are
 * planted on the side of jungle logs, and any dye recolours an unsheared sheep.
 */
export class ItemDye extends Item {
  static readonly dyeColorNames = dyeColorNames;
  static readonly iconNames = dyeColorNames.map((n) => 'dyePowder_' + n);
  /** The firework colours of the 16 dyes (ItemDye.dyeColors). */
  static readonly dyeColors = [1973019, 11743532, 3887386, 5320730, 2437522, 8073150, 2651799, 11250603, 4408131, 14188952, 4312372, 14602026, 6719955, 12801229, 15435844, 15790320];
  private icons: (Icon | null)[] = [];

  constructor(index: number) {
    super(index);
    this.setHasSubtypes(true);
    this.setMaxDamage(0);
    this.setCreativeTab(CreativeTabs.tabMaterials);
  }

  override getIconFromDamage(damage: number): Icon | null {
    return this.icons[MathHelper.clamp_int(damage, 0, 15)] ?? null;
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    const d = MathHelper.clamp_int(stack ? stack.getItemDamage() : 0, 0, 15);
    return super.getUnlocalizedName() + '.' + dyeColorNames[d];
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (stack.getItemDamage() === 15) {
      if (ItemDye.applyBonemeal(stack, w, x, y, z)) {
        if (!w.isRemote) w.playAuxSFX(2005, x, y, z, 0);
        return true;
      }
    } else if (stack.getItemDamage() === 3) {
      const id = w.getBlockId(x, y, z);
      const meta = w.getBlockMetadata(x, y, z);
      // A jungle log (BlockLog.limitToValidMetadata(meta) == 3) takes cocoa on its sides.
      if (id === BlockIds.wood && (meta & 3) === 3) {
        if (side === 0 || side === 1) return false;
        [x, y, z] = offsetBySide(side, x, y, z);
        const cocoa = Block.blocksList[BlockIds.cocoaPlant];
        if (w.isAirBlock(x, y, z) && cocoa) {
          const m = cocoa.onBlockPlaced(w, x, y, z, side, hx, hy, hz, 0);
          w.setBlock(x, y, z, BlockIds.cocoaPlant, m, 2);
          if (!player.capabilities.isCreativeMode) stack.stackSize--;
        }
        return true;
      }
    }
    return false;
  }

  /**
   * func_96604_a: bone meal on saplings (45% to grow a stage), mushrooms (40% to grow), stems,
   * crops, cocoa and grass (scatters tall grass and flowers). Returns whether it was used.
   */
  static applyBonemeal(stack: ItemStack, w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    const block = Block.blocksList[id] as (Block & Fertilizable) | null;
    if (id === BlockIds.sapling) {
      if (!w.isRemote) {
        if (w.rand.nextFloat() < 0.45) block?.markOrGrowMarked?.(w, x, y, z, w.rand);
        stack.stackSize--;
      }
      return true;
    }
    if (id === BlockIds.mushroomBrown || id === BlockIds.mushroomRed) {
      if (!w.isRemote) {
        if (w.rand.nextFloat() < 0.4) block?.fertilizeMushroom?.(w, x, y, z, w.rand);
        stack.stackSize--;
      }
      return true;
    }
    if (id === BlockIds.melonStem || id === BlockIds.pumpkinStem) {
      if (w.getBlockMetadata(x, y, z) === 7) return false;
      if (!w.isRemote) {
        (block?.fertilizeStem ?? block?.fertilize)?.call(block, w, x, y, z);
        stack.stackSize--;
      }
      return true;
    }
    if (id === BlockIds.crops || id === BlockIds.carrot || id === BlockIds.potato) {
      if (w.getBlockMetadata(x, y, z) === 7) return false;
      if (!w.isRemote) {
        block?.fertilize?.(w, x, y, z);
        stack.stackSize--;
      }
      return true;
    }
    if (id === BlockIds.cocoaPlant) {
      const meta = w.getBlockMetadata(x, y, z);
      const dir = meta & 3;
      let age = (meta & 12) >> 2;
      if (age >= 2) return false;
      if (!w.isRemote) {
        w.setBlockMetadataWithNotify(x, y, z, (++age << 2) | dir, 2);
        stack.stackSize--;
      }
      return true;
    }
    if (id !== BlockIds.grass) return false;
    if (!w.isRemote) {
      stack.stackSize--;
      const rand = Item.itemRand;
      const tallGrass = Block.blocksList[BlockIds.tallGrass];
      const yellow = Block.blocksList[BlockIds.plantYellow];
      const red = Block.blocksList[BlockIds.plantRed];
      outer: for (let i = 0; i < 128; i++) {
        let bx = x;
        let by = y + 1;
        let bz = z;
        for (let j = 0; j < Math.trunc(i / 16); j++) {
          bx += rand.nextInt(3) - 1;
          by += Math.trunc(((rand.nextInt(3) - 1) * rand.nextInt(3)) / 2);
          bz += rand.nextInt(3) - 1;
          if (w.getBlockId(bx, by - 1, bz) !== BlockIds.grass || w.isBlockNormalCube(bx, by, bz)) continue outer;
        }
        if (w.getBlockId(bx, by, bz) !== 0) continue;
        if (rand.nextInt(10) !== 0) {
          if (tallGrass?.canBlockStay(w, bx, by, bz)) w.setBlock(bx, by, bz, BlockIds.tallGrass, 1, 3);
        } else if (rand.nextInt(3) !== 0) {
          if (yellow?.canBlockStay(w, bx, by, bz)) w.setBlock(bx, by, bz, BlockIds.plantYellow);
        } else if (red?.canBlockStay(w, bx, by, bz)) {
          w.setBlock(bx, by, bz, BlockIds.plantRed);
        }
      }
    }
    return true;
  }

  /** Dye on a sheep: recolours its fleece unless sheared or already that colour. */
  override itemInteractionForEntity(stack: ItemStack, e: EntityLiving): boolean {
    if (EntityList.getEntityString(e) !== 'Sheep') return false;
    const sheep = e as EntityLiving & Dyeable;
    const color = getBlockFromDye(stack.getItemDamage());
    if (!sheep.getSheared?.() && sheep.getFleeceColor?.() !== color && sheep.setFleeceColor) {
      sheep.setFleeceColor(color);
      stack.stackSize--;
    }
    return true;
  }

  override getSubItems(id: number, _tab: CreativeTabs | null, out: ItemStack[]): void {
    for (let i = 0; i < 16; i++) out.push(new ItemStack(id, 1, i));
  }
  override registerIcons(reg: IconRegister): void {
    this.icons = ItemDye.iconNames.map((n) => reg.registerIcon(n));
  }
}

