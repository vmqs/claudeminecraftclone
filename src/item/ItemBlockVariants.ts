import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { EnumMovingObjectType } from '../core/MovingObjectPosition';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon } from '../render/texture/Icon';
import { ColorizerFoliage } from '../world/biome/Colorizer';
import type { IWorld } from '../world/IWorld';
import type { RayTracer } from './Item';
import { ItemBlock, offsetBySide } from './ItemBlock';
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

/** What a half slab block offers (BlockHalfSlab.getFullSlabName). */
interface HalfSlab {
  getFullSlabName?(meta: number): string;
}

/** Stone and wood slab type names (BlockStep.blockStepTypes, BlockWoodSlab.woodType). */
const SLAB_TYPE_NAMES: Record<number, readonly [string, readonly string[]]> = {
  [BlockIds.stoneSingleSlab]: ['tile.stoneSlab', ['stone', 'sand', 'wood', 'cobble', 'brick', 'smoothStoneBrick', 'netherBrick', 'quartz']],
  [BlockIds.stoneDoubleSlab]: ['tile.stoneSlab', ['stone', 'sand', 'wood', 'cobble', 'brick', 'smoothStoneBrick', 'netherBrick', 'quartz']],
  [BlockIds.woodSingleSlab]: ['tile.woodSlab', ['oak', 'spruce', 'birch', 'jungle']],
  [BlockIds.woodDoubleSlab]: ['tile.woodSlab', ['oak', 'spruce', 'birch', 'jungle']],
};

/**
 * Slabs (ItemSlab): a half slab placed onto the matching half of the same type (top face of a
 * bottom slab, bottom face of a top slab, or the slab beside the clicked face) merges into the
 * double slab.
 */
export class ItemSlab extends ItemBlock {
  constructor(
    index: number,
    private readonly halfSlabID: number,
    private readonly doubleSlabID: number,
    private readonly isFullBlock: boolean,
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
    const half = Block.blocksList[this.halfSlabID] as (Block & HalfSlab) | null;
    const meta = stack.getItemDamage();
    if (half?.getFullSlabName) return half.getFullSlabName(meta);
    const [base, names] = SLAB_TYPE_NAMES[this.halfSlabID] ?? [super.getUnlocalizedName(), ['']];
    return base + '.' + names[meta >= 0 && meta < names.length ? meta : 0];
  }
  private mergeInto(stack: ItemStack, w: IWorld, x: number, y: number, z: number, meta: number): void {
    const double = Block.blocksList[this.doubleSlabID];
    if (!double) return;
    const box = double.getCollisionBoundingBoxFromPool(w, x, y, z);
    if ((!box || w.checkNoEntityCollision(box)) && w.setBlock(x, y, z, this.doubleSlabID, meta, 3)) {
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, double.stepSound.getPlaceSound(), (double.stepSound.getVolume() + 1) / 2, double.stepSound.getPitch() * 0.8);
      stack.stackSize--;
    }
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    if (this.isFullBlock) return super.onItemUse(stack, player, w, x, y, z, side, hx, hy, hz);
    if (stack.stackSize === 0) return false;
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    const type = meta & 7;
    const top = (meta & 8) !== 0;
    if (((side === 1 && !top) || (side === 0 && top)) && id === this.halfSlabID && type === stack.getItemDamage()) {
      this.mergeInto(stack, w, x, y, z, type);
      return true;
    }
    return this.mergeBeside(stack, w, x, y, z, side) ? true : super.onItemUse(stack, player, w, x, y, z, side, hx, hy, hz);
  }
  /** func_77888_a: the slab next to the clicked face merges too. */
  private mergeBeside(stack: ItemStack, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    [x, y, z] = offsetBySide(side, x, y, z);
    const id = w.getBlockId(x, y, z);
    const type = w.getBlockMetadata(x, y, z) & 7;
    if (id !== this.halfSlabID || type !== stack.getItemDamage()) return false;
    this.mergeInto(stack, w, x, y, z, type);
    return true;
  }
  override canPlaceItemBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number, player: EntityPlayer | null, stack: ItemStack): boolean {
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    const top = (meta & 8) !== 0;
    if (((side === 1 && !top) || (side === 0 && top)) && id === this.halfSlabID && (meta & 7) === stack.getItemDamage()) return true;
    const [nx, ny, nz] = offsetBySide(side, x, y, z);
    if (w.getBlockId(nx, ny, nz) === this.halfSlabID && (w.getBlockMetadata(nx, ny, nz) & 7) === stack.getItemDamage()) return true;
    return super.canPlaceItemBlockOnSide(w, x, y, z, side, player, stack);
  }
}

/** Lily pad (ItemLilyPad): placed on still water by aiming at it (the ray trace hits liquids). */
export class ItemLilyPad extends ItemColored {
  constructor(index: number) {
    super(index, false);
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const hit = this.getMovingObjectPositionFromPlayer(w as unknown as RayTracer, player, true);
    if (!hit || hit.typeOfHit !== EnumMovingObjectType.TILE) return stack;
    const { blockX: x, blockY: y, blockZ: z } = hit;
    if (!player.canPlayerEdit(x, y, z, hit.sideHit, stack)) return stack;
    if (w.getBlockMaterial(x, y, z) === Material.water && w.getBlockMetadata(x, y, z) === 0 && w.isAirBlock(x, y + 1, z)) {
      w.setBlock(x, y + 1, z, BlockIds.waterlily);
      if (!player.capabilities.isCreativeMode) stack.stackSize--;
    }
    return stack;
  }
  override getColorFromItemStack(stack: ItemStack, _pass: number): number {
    return Block.blocksList[BlockIds.waterlily]!.getRenderColor(stack.getItemDamage());
  }
}

/** Pistons (ItemPiston): placed with metadata 7 so onBlockPlacedBy sets the real facing. */
export class ItemPiston extends ItemBlock {
  override getMetadata(_damage: number): number {
    return 7;
  }
}

/** Anvil (ItemAnvilBlock): damage 0-2 is the wear, stored in metadata bits 2-3. */
export class ItemAnvilBlock extends ItemMultiTextureTile {
  override getMetadata(damage: number): number {
    return damage << 2;
  }
}
