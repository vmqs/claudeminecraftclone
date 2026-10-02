import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityBeacon } from '../world/tileentity/TileEntityBeacon';
import { BlockContainer } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { Material } from './Material';

/** Beacon (138, render type 34): glass shell, obsidian base, the beacon core; light 15. */
export class BlockBeacon extends BlockContainer {
  private iconBeacon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.glass);
    this.setHardness(3);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityBeacon();
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityBeacon) BlockGuiHooks.open({ kind: 'beacon', player: p, world: w, x, y, z, inventory: te, tileEntity: te });
    return true;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 34;
  }

  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.iconBeacon = reg.registerIcon('beacon');
  }

  getBeaconIcon(): Icon | null {
    return this.iconBeacon;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, stack: ItemStack): void {
    super.onBlockPlacedBy(w, x, y, z, e, stack);
    if (!stack.hasDisplayName()) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityBeacon) te.setCustomName(stack.getDisplayName());
  }
}
