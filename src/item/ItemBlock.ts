import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import type { ItemStack } from './ItemStack';

/** Offsets (x, y, z) by a face, like the placement code in ItemBlock.onItemUse. */
export function offsetBySide(side: number, x: number, y: number, z: number): [number, number, number] {
  if (side === 0) y--;
  if (side === 1) y++;
  if (side === 2) z--;
  if (side === 3) z++;
  if (side === 4) x--;
  if (side === 5) x++;
  return [x, y, z];
}

/** The item form of a block: placing it follows the 1.5.2 rules. */
export class ItemBlock extends Item {
  private readonly blockID: number;
  private itemIconOverride: Icon | null = null;

  constructor(index: number) {
    super(index);
    this.blockID = index + 256;
  }

  getBlockID(): number {
    return this.blockID;
  }

  protected get block(): Block {
    return Block.blocksList[this.blockID]!;
  }

  override getSpriteNumber(): number {
    return this.block.getItemIconName() !== null ? 1 : 0;
  }

  override getIconFromDamage(_damage: number): Icon | null {
    return this.itemIconOverride ?? this.block.getBlockTextureFromSide(1);
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    const target = w.getBlockId(x, y, z);
    if (target === BlockIds.snow && (w.getBlockMetadata(x, y, z) & 7) < 1) {
      side = 1;
    } else if (target !== BlockIds.vine && target !== BlockIds.tallGrass && target !== BlockIds.deadBush) {
      [x, y, z] = offsetBySide(side, x, y, z);
    }
    if (stack.stackSize === 0) return false;
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (y === 255 && this.block.blockMaterial.isSolid()) return false;
    if (!w.canPlaceEntityOnSide(this.blockID, x, y, z, false, side, player, stack)) return false;
    const block = this.block;
    const itemMeta = this.getMetadata(stack.getItemDamage());
    const meta = block.onBlockPlaced(w, x, y, z, side, hx, hy, hz, itemMeta);
    if (w.setBlock(x, y, z, this.blockID, meta, 3)) {
      if (w.getBlockId(x, y, z) === this.blockID) {
        block.onBlockPlacedBy(w, x, y, z, player, stack);
        block.onPostBlockPlaced(w, x, y, z, meta);
      }
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, block.stepSound.getPlaceSound(), (block.stepSound.getVolume() + 1) / 2, block.stepSound.getPitch() * 0.8);
      stack.stackSize--;
    }
    return true;
  }

  /** Client-side pre-check done by PlayerControllerMP before placing. */
  canPlaceItemBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number, _player: EntityPlayer | null, stack: ItemStack): boolean {
    const target = w.getBlockId(x, y, z);
    if (target === BlockIds.snow) side = 1;
    else if (target !== BlockIds.vine && target !== BlockIds.tallGrass && target !== BlockIds.deadBush) [x, y, z] = offsetBySide(side, x, y, z);
    return w.canPlaceEntityOnSide(this.getBlockID(), x, y, z, false, side, null, stack);
  }

  override getUnlocalizedName(_stack?: ItemStack): string {
    return this.block.getUnlocalizedName();
  }

  override getCreativeTab(): CreativeTabs | null {
    return this.block.getCreativeTabToDisplayOn();
  }

  override getSubItems(id: number, tab: CreativeTabs, out: ItemStack[]): void {
    this.block.getSubBlocks(id, tab, out);
  }

  override registerIcons(reg: IconRegister): void {
    const name = this.block.getItemIconName();
    if (name !== null) this.itemIconOverride = reg.registerIcon(name);
  }
}
