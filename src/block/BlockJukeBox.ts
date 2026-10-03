import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityRecordPlayer } from '../world/tileentity/TileEntityRecordPlayer';
import { BlockContainer } from './BlockContainer';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/**
 * Jukebox (84): meta 1 while it holds a record. A record item inserts itself
 * (`insertRecord`, with level event 1005 and the record id, which starts the music); right
 * click ejects it again.
 */
export class BlockJukeBox extends BlockContainer {
  private iconTop: Icon | null = null;

  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side === 1 ? this.iconTop : this.blockIcon;
  }

  /** Empty: not used (the record item handles the click); playing: ejects. */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    if (w.getBlockMetadata(x, y, z) === 0) return false;
    this.ejectRecord(w, x, y, z);
    return true;
  }

  /**
   * ItemRecord.onItemUse calls this after playAuxSFX(1005, x, y, z, record id). Also usable
   * directly: `insertRecord(w, x, y, z, stack, true)` plays the record too.
   */
  insertRecord(w: IWorld, x: number, y: number, z: number, stack: ItemStack, play = false): void {
    if (w.isRemote) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (!(te instanceof TileEntityRecordPlayer)) return;
    if (play) w.playAuxSFX(1005, x, y, z, stack.itemID);
    te.setRecord(stack.copy());
    w.setBlockMetadataWithNotify(x, y, z, 1, 2);
  }

  /** Stops the music and pops the record out above the jukebox. */
  ejectRecord(w: IWorld, x: number, y: number, z: number): void {
    if (w.isRemote) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (!(te instanceof TileEntityRecordPlayer)) return;
    const record = te.getRecord();
    if (!record) return;
    w.playAuxSFX(1005, x, y, z, 0);
    w.playRecord?.(null, x, y, z);
    te.setRecord(null);
    w.setBlockMetadataWithNotify(x, y, z, 0, 2);
    const s = f(0.7);
    const dx = f(w.rand.nextFloat() * s) + f(1 - s) * 0.5;
    const dy = f(w.rand.nextFloat() * s) + f(1 - s) * 0.2 + 0.6;
    const dz = f(w.rand.nextFloat() * s) + f(1 - s) * 0.5;
    const e = w.createItemEntity?.(x + dx, y + dy, z + dz, record.copy()) ?? null;
    if (e) {
      (e as unknown as { delayBeforeCanPickup: number }).delayBeforeCanPickup = 10;
      w.spawnEntityInWorld(e);
    } else {
      w.dropItemStack(x + dx, y + dy, z + dz, record.copy());
    }
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    this.ejectRecord(w, x, y, z);
    super.breakBlock(w, x, y, z, id, meta);
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, _fortune: number): void {
    if (!w.isRemote) super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, 0);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityRecordPlayer();
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('musicBlock');
    this.iconTop = reg.registerIcon('jukebox_top');
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    const r = te instanceof TileEntityRecordPlayer ? te.getRecord() : null;
    return r ? r.itemID + 1 - ItemIds.record13 : 0;
  }
}
