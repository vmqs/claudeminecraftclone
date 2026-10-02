import { EnumMovingObjectType } from '../core/MovingObjectPosition';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { RayTracer } from '../item/Item';
import { offsetBySide } from '../item/ItemBlock';
import { ItemBlock } from '../item/ItemBlock';
import { ItemColored, ItemMultiTextureTile } from '../item/ItemBlockVariants';
import type { ItemStack } from '../item/ItemStack';
import type { Icon } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockAnvil } from './BlockAnvil';
import type { BlockHalfSlab } from './BlockHalfSlab';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

const fround = Math.fround;

/**
 * The block items whose placement differs from ItemBlock (registered by
 * Items.registerBlockItems): slabs, pistons, anvils and lily pads.
 */

/** Slab item: places the slab type from its damage, and completes a half slab into a double slab. */
export class ItemSlab extends ItemBlock {
  constructor(
    index: number,
    private readonly theHalfSlab: BlockHalfSlab,
    private readonly doubleSlab: BlockHalfSlab,
    private readonly isFullBlock: boolean,
  ) {
    super(index);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }

  override getIconFromDamage(damage: number): Icon | null {
    return Block.blocksList[this.itemID]!.getIcon(2, damage);
  }

  override getMetadata(damage: number): number {
    return damage;
  }

  override getUnlocalizedName(stack?: ItemStack): string {
    return stack ? this.theHalfSlab.getFullSlabName(stack.getItemDamage()) : super.getUnlocalizedName();
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    if (this.isFullBlock) return super.onItemUse(stack, player, w, x, y, z, side, hx, hy, hz);
    if (stack.stackSize === 0) return false;
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    const type = meta & 7;
    const top = (meta & 8) !== 0;
    if (((side === 1 && !top) || (side === 0 && top)) && id === this.theHalfSlab.blockID && type === stack.getItemDamage()) {
      this.placeDouble(stack, w, x, y, z, type);
      return true;
    }
    return this.completeSlabNextTo(stack, w, x, y, z, side) || super.onItemUse(stack, player, w, x, y, z, side, hx, hy, hz);
  }

  override canPlaceItemBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number, player: EntityPlayer | null, stack: ItemStack): boolean {
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    const top = (meta & 8) !== 0;
    if (((side === 1 && !top) || (side === 0 && top)) && id === this.theHalfSlab.blockID && (meta & 7) === stack.getItemDamage()) return true;
    const [nx, ny, nz] = offsetBySide(side, x, y, z);
    if (w.getBlockId(nx, ny, nz) === this.theHalfSlab.blockID && (w.getBlockMetadata(nx, ny, nz) & 7) === stack.getItemDamage()) return true;
    return super.canPlaceItemBlockOnSide(w, x, y, z, side, player, stack);
  }

  /** func_77888_a: clicking the side of a block next to a half slab of the same type fills that slab. */
  private completeSlabNextTo(stack: ItemStack, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    [x, y, z] = offsetBySide(side, x, y, z);
    const type = w.getBlockMetadata(x, y, z) & 7;
    if (w.getBlockId(x, y, z) !== this.theHalfSlab.blockID || type !== stack.getItemDamage()) return false;
    this.placeDouble(stack, w, x, y, z, type);
    return true;
  }

  private placeDouble(stack: ItemStack, w: IWorld, x: number, y: number, z: number, type: number): void {
    const d = this.doubleSlab;
    const box = d.getCollisionBoundingBoxFromPool(w, x, y, z);
    if ((!box || w.checkNoEntityCollision(box)) && w.setBlock(x, y, z, d.blockID, type, 3)) {
      const s = d.stepSound;
      w.playSoundEffect(fround(x + 0.5), fround(y + 0.5), fround(z + 0.5), s.getPlaceSound(), fround(fround(s.getVolume() + 1) / 2), fround(s.getPitch() * fround(0.8)));
      stack.stackSize--;
    }
  }
}

/** Piston item: placed with metadata 7 (the piston then turns to face the placer). */
export class ItemPiston extends ItemBlock {
  override getMetadata(_damage: number): number {
    return 7;
  }
}

/** Anvil item: the damage (intact, slightly, very damaged) goes into metadata bits 2-3. */
export class ItemAnvilBlock extends ItemMultiTextureTile {
  constructor(block: Block) {
    super(block.blockID - 256, BlockAnvil.statuses);
  }

  override getMetadata(damage: number): number {
    return damage << 2;
  }
}

/** Lily pad item: aimed at still water (through it, not past it), it floats on top. */
export class ItemLilyPad extends ItemColored {
  constructor(index: number) {
    super(index, false);
  }

  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const tracer = w as unknown as Partial<RayTracer>;
    if (!tracer.rayTraceBlocks_do_do) return stack;
    const hit = this.getMovingObjectPositionFromPlayer(tracer as RayTracer, player, true);
    if (hit === null || hit.typeOfHit !== EnumMovingObjectType.TILE) return stack;
    const { blockX: x, blockY: y, blockZ: z } = hit;
    if (!player.canPlayerEdit(x, y, z, hit.sideHit, stack)) return stack;
    if (w.getBlockMaterial(x, y, z) === Material.water && w.getBlockMetadata(x, y, z) === 0 && w.isAirBlock(x, y + 1, z)) {
      w.setBlock(x, y + 1, z, BlockIds.waterlily);
      if (!player.capabilities.isCreativeMode) stack.stackSize--;
    }
    return stack;
  }
}
