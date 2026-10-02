import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockGuiHooks } from './BlockGuiHooks';
import { BlockSand } from './BlockSand';
import { Material } from './Material';

/**
 * Anvil (145, render type 35): meta & 3 = facing, meta >> 2 = damage (0 intact, 1 slightly,
 * 2 very damaged). Falls like sand.
 */
export class BlockAnvil extends BlockSand {
  static readonly statuses = ['intact', 'slightlyDamaged', 'veryDamaged'];
  private static readonly anvilIconNames = ['anvil_top', 'anvil_top_damaged_1', 'anvil_top_damaged_2'];
  /** Set to 3 by the renderer while it draws the top face (field_82521_b). */
  renderSide = 0;
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.anvil);
    this.setLightOpacity(0);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (this.renderSide === 3 && side === 1) return this.iconArray[(meta >> 2) % this.iconArray.length];
    return this.blockIcon;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('anvil_base');
    this.iconArray = BlockAnvil.anvilIconNames.map((n) => reg.registerIcon(n));
  }

  /** The long side faces across the placer's view. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    const dir = (Block.yawToDirection(e) + 1) % 4;
    const damage = w.getBlockMetadata(x, y, z) >> 2;
    const facing = [2, 3, 0, 1][dir];
    w.setBlockMetadataWithNotify(x, y, z, facing | (damage << 2), 2);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    return BlockGuiHooks.open({ kind: 'anvil', player: p, world: w, x, y, z });
  }

  override getRenderType(): number {
    return 35;
  }

  override damageDropped(meta: number): number {
    return meta >> 2;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const facing = w.getBlockMetadata(x, y, z) & 3;
    if (facing !== 3 && facing !== 1) this.setBlockBounds(0.125, 0, 0, 0.875, 1, 1);
    else this.setBlockBounds(0, 0, 0.125, 1, 1, 0.875);
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0), new ItemStack(id, 1, 1), new ItemStack(id, 1, 2));
  }

  protected override onStartFalling(e: Entity): void {
    (e as unknown as { setIsAnvil?: (v: boolean) => void }).setIsAnvil?.(true);
  }

  override onFinishFalling(w: IWorld, x: number, y: number, z: number, _meta: number): void {
    w.playAuxSFX(1022, x, y, z, 0);
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): boolean {
    return true;
  }
}
