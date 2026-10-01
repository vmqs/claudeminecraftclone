import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon } from '../render/texture/Icon';
import { ColorizerFoliage } from '../world/biome/Colorizer';
import type { IWorld } from '../world/IWorld';
import { ItemBlock } from './ItemBlock';
import type { ItemStack } from './ItemStack';

/** ItemDye.dyeColorNames (wool names are indexed by ~meta & 15). */
export const dyeColorNames = ['black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'silver', 'gray', 'pink', 'lime', 'yellow', 'lightBlue', 'magenta', 'orange', 'white'];

/** Wool item: icon and name by colour. */
export class ItemCloth extends ItemBlock {
  constructor(index: number) {
    super(index);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }
  override getIconFromDamage(damage: number): Icon | null {
    // BlockCloth.getBlockFromDye; only used for 2D renders (wool items are drawn as cubes).
    return this.block.getIcon(2, ~damage & 15);
  }
  override getMetadata(damage: number): number {
    return damage;
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    const base = super.getUnlocalizedName();
    return stack ? base + '.' + dyeColorNames[~stack.getItemDamage() & 15] : base;
  }
}

/** Blocks whose item has one icon/name per metadata (logs, planks, saplings, sandstone). */
export class ItemMultiTextureTile extends ItemBlock {
  constructor(
    index: number,
    private readonly names: readonly string[],
  ) {
    super(index);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }
  override getIconFromDamage(damage: number): Icon | null {
    return this.block.getIcon(2, damage);
  }
  override getMetadata(damage: number): number {
    return damage;
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    if (!stack) return super.getUnlocalizedName();
    let d = stack.getItemDamage();
    if (d < 0 || d >= this.names.length) d = 0;
    return super.getUnlocalizedName() + '.' + this.names[d];
  }
}

/** Leaves item: placed leaves get the no-decay bit (4). */
export class ItemLeaves extends ItemBlock {
  static readonly LEAF_TYPES = ['oak', 'spruce', 'birch', 'jungle'];
  constructor(index: number) {
    super(index);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }
  override getMetadata(damage: number): number {
    return damage | 4;
  }
  override getIconFromDamage(damage: number): Icon | null {
    return Block.blocksList[BlockIds.leaves]!.getIcon(0, damage);
  }
  override getColorFromItemStack(stack: ItemStack, _pass: number): number {
    const d = stack.getItemDamage();
    if ((d & 1) === 1) return ColorizerFoliage.getFoliageColorPine();
    return (d & 2) === 2 ? ColorizerFoliage.getFoliageColorBirch() : ColorizerFoliage.getFoliageColorBasic();
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    if (!stack) return super.getUnlocalizedName();
    let d = stack.getItemDamage();
    if (d < 0 || d >= ItemLeaves.LEAF_TYPES.length) d = 0;
    return super.getUnlocalizedName() + '.' + ItemLeaves.LEAF_TYPES[d];
  }
}

/** Items tinted by the block's render colour (tall grass, vines). */
export class ItemColored extends ItemBlock {
  private blockNames: string[] | null = null;
  constructor(index: number, hasSubtypes: boolean) {
    super(index);
    if (hasSubtypes) {
      this.setMaxDamage(0);
      this.setHasSubtypes(true);
    }
  }
  override getColorFromItemStack(stack: ItemStack, _pass: number): number {
    return this.block.getRenderColor(stack.getItemDamage());
  }
  override getIconFromDamage(damage: number): Icon | null {
    return this.block.getIcon(0, damage);
  }
  override getMetadata(damage: number): number {
    return damage;
  }
  setBlockNames(names: string[]): this {
    this.blockNames = names;
    return this;
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    const base = super.getUnlocalizedName(stack);
    if (!this.blockNames || !stack) return base;
    const d = stack.getItemDamage();
    return d >= 0 && d < this.blockNames.length ? base + '.' + this.blockNames[d] : base;
  }
}

/** ItemBlockWithMetadata: places the item damage as block metadata. */
export class ItemBlockWithMetadata extends ItemBlock {
  constructor(index: number) {
    super(index);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }
  override getIconFromDamage(damage: number): Icon | null {
    return this.block.getIcon(2, damage);
  }
  override getMetadata(damage: number): number {
    return damage;
  }
}

/** Snow layer item: adds a layer to an existing snow layer. */
export class ItemSnow extends ItemBlockWithMetadata {
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    if (stack.stackSize === 0) return false;
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (w.getBlockId(x, y, z) === BlockIds.snow) {
      const block = this.block;
      const meta = w.getBlockMetadata(x, y, z);
      const layers = meta & 7;
      const box = block.getCollisionBoundingBoxFromPool(w, x, y, z);
      if (layers <= 6 && (!box || w.checkNoEntityCollision(box)) && w.setBlockMetadataWithNotify(x, y, z, (layers + 1) | (meta & -8), 2)) {
        w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, block.stepSound.getPlaceSound(), (block.stepSound.getVolume() + 1) / 2, block.stepSound.getPitch() * 0.8);
        stack.stackSize--;
        return true;
      }
    }
    return super.onItemUse(stack, player, w, x, y, z, side, hx, hy, hz);
  }
}
