import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IWorld } from '../world/IWorld';
import { CreativeTabs } from './CreativeTabs';
import { EnumAction, Item } from './Item';
import type { ItemStack } from './ItemStack';
import { EnumToolMaterial } from './ItemTool';

/** A sword: 4 + material damage, blocks with right click, cuts webs. */
export class ItemSword extends Item {
  private readonly weaponDamage: number;

  constructor(
    index: number,
    private readonly toolMaterial: EnumToolMaterial,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setMaxDamage(toolMaterial.getMaxUses());
    this.setCreativeTab(CreativeTabs.tabCombat);
    this.weaponDamage = 4 + toolMaterial.getDamageVsEntity();
  }

  /** func_82803_g: the material's bonus damage. */
  getMaterialDamage(): number {
    return this.toolMaterial.getDamageVsEntity();
  }
  override getStrVsBlock(_stack: ItemStack, b: Block): number {
    if (b.blockID === BlockIds.web) return 15;
    const m = b.blockMaterial;
    return m !== Material.plants && m !== Material.vine && m !== Material.coral && m !== Material.leaves && m !== Material.pumpkin ? 1 : 1.5;
  }
  override hitEntity(stack: ItemStack, _target: EntityLiving, attacker: EntityLiving): boolean {
    stack.damageItem(1, attacker);
    return true;
  }
  override onBlockDestroyed(stack: ItemStack, w: IWorld, id: number, x: number, y: number, z: number, e: EntityLiving): boolean {
    if (Block.blocksList[id]!.getBlockHardness(w, x, y, z) !== 0) stack.damageItem(2, e);
    return true;
  }
  override getDamageVsEntity(_e: Entity): number {
    return this.weaponDamage;
  }
  override isFull3D(): boolean {
    return true;
  }
  override getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.block;
  }
  override getMaxItemUseDuration(_stack: ItemStack): number {
    return 72000;
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    player.setItemInUse(stack, this.getMaxItemUseDuration(stack));
    return stack;
  }
  override canHarvestBlock(b: Block): boolean {
    return b.blockID === BlockIds.web;
  }
  override getItemEnchantability(): number {
    return this.toolMaterial.getEnchantability();
  }
  getToolMaterialName(): string {
    return this.toolMaterial.toString();
  }
  override getIsRepairable(stack: ItemStack, material: ItemStack): boolean {
    return this.toolMaterial.getToolCraftingMaterial() === material.itemID ? true : super.getIsRepairable(stack, material);
  }
  override getEnchantKind(): 'weapon' | 'digger' | 'axe' | 'bow' | null {
    return 'weapon';
  }
}

/** A hoe: tills grass (with air above) or dirt into farmland with the farmland's step sound. */
export class ItemHoe extends Item {
  constructor(
    index: number,
    protected readonly theToolMaterial: EnumToolMaterial,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setMaxDamage(theToolMaterial.getMaxUses());
    this.setCreativeTab(CreativeTabs.tabTools);
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const id = w.getBlockId(x, y, z);
    const above = w.getBlockId(x, y + 1, z);
    // The original's condition: grass needs a non-bottom face and air above; dirt always tills.
    if ((side === 0 || above !== 0 || id !== BlockIds.grass) && id !== BlockIds.dirt) return false;
    const farmland = Block.blocksList[BlockIds.tilledField];
    const sound = (farmland ?? Block.blocksList[BlockIds.gravel]!).stepSound;
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, sound.getStepSound(), (sound.getVolume() + 1) / 2, sound.getPitch() * 0.8);
    if (w.isRemote) return true;
    if (farmland) w.setBlock(x, y, z, farmland.blockID);
    stack.damageItem(1, player);
    return true;
  }
  override isFull3D(): boolean {
    return true;
  }
  getMaterialName(): string {
    return this.theToolMaterial.toString();
  }
}
