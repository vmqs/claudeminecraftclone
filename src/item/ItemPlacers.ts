import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { Direction, Facing } from '../core/Facing';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import type { World } from '../world/World';
import { I18n } from '../core/I18n';
import { CreativeTabs } from './CreativeTabs';
import { EnumAction, Item } from './Item';
import { offsetBySide } from './ItemBlock';
import { createBoat, createHanging, createMinecart, isOnValidSurface } from './ItemEntitySpawning';
import { ItemStack } from './ItemStack';
import { clearPotionEffects } from '../potion/PotionEffect';

const f = Math.fround;

/** World.canMineBlock: spawn protection is a multiplayer-server feature, so always true here. */
function canMineBlock(_w: IWorld, _p: EntityPlayer, _x: number, _y: number, _z: number): boolean {
  return true;
}

/** The facing of a player as 0 south, 1 west, 2 north, 3 east (floor(yaw * 4 / 360 + 0.5) & 3). */
function playerDirection(p: EntityPlayer): number {
  return MathHelper.floor_double(f(f(p.rotationYaw * 4) / 360) + 0.5) & 3;
}

/**
 * Buckets (ItemBucket): an empty bucket scoops a still source (water or lava), a full one pours
 * it on the face it is pointed at. Creative keeps the bucket as it is either way.
 */
export class ItemBucket extends Item {
  constructor(
    index: number,
    private readonly isFull: number,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabMisc);
  }

  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const world = w as World;
    const px = player.prevPosX + (player.posX - player.prevPosX);
    const py = player.prevPosY + (player.posY - player.prevPosY) + 1.62 - player.yOffset;
    const pz = player.prevPosZ + (player.posZ - player.prevPosZ);
    const hit = this.getMovingObjectPositionFromPlayer(world, player, this.isFull === 0);
    if (!hit) return stack;
    if (hit.typeOfHit !== EnumMovingObjectType.TILE) {
      if (this.isFull === 0 && hit.entityHit && EntityList.getEntityString(hit.entityHit) === 'Cow') return new ItemStack(ItemIds.bucketMilk);
      return stack;
    }
    let x = hit.blockX;
    let y = hit.blockY;
    let z = hit.blockZ;
    if (!canMineBlock(w, player, x, y, z)) return stack;
    if (this.isFull === 0) {
      if (!player.canPlayerEdit(x, y, z, hit.sideHit, stack)) return stack;
      const material = w.getBlockMaterial(x, y, z);
      const filled = material === Material.water ? ItemIds.bucketWater : material === Material.lava ? ItemIds.bucketLava : 0;
      if (filled !== 0 && w.getBlockMetadata(x, y, z) === 0) {
        w.setBlockToAir(x, y, z);
        if (player.capabilities.isCreativeMode) return stack;
        if (--stack.stackSize <= 0) return new ItemStack(filled);
        if (!player.inventory.addItemStackToInventory(new ItemStack(filled))) player.dropPlayerItem(new ItemStack(filled, 1, 0));
        return stack;
      }
      return stack;
    }
    if (this.isFull < 0) return new ItemStack(ItemIds.bucketEmpty);
    [x, y, z] = offsetBySide(hit.sideHit, x, y, z);
    if (!player.canPlayerEdit(x, y, z, hit.sideHit, stack)) return stack;
    if (this.tryPlaceContainedLiquid(w, px, py, pz, x, y, z) && !player.capabilities.isCreativeMode) return new ItemStack(ItemIds.bucketEmpty);
    return stack;
  }

  /** Pours the liquid into air or a non-solid block (water fizzes away in the Nether). */
  tryPlaceContainedLiquid(w: IWorld, px: number, py: number, pz: number, x: number, y: number, z: number): boolean {
    if (this.isFull <= 0) return false;
    if (!w.isAirBlock(x, y, z) && w.getBlockMaterial(x, y, z).isSolid()) return false;
    if (w.provider.isHellWorld && this.isFull === BlockIds.waterMoving) {
      w.playSoundEffect(px + 0.5, py + 0.5, pz + 0.5, 'random.fizz', 0.5, f(f(2.6) + f(f(w.rand.nextFloat() - w.rand.nextFloat()) * f(0.8))));
      for (let i = 0; i < 8; i++) w.spawnParticle('largesmoke', x + Math.random(), y + Math.random(), z + Math.random(), 0, 0, 0);
    } else {
      w.setBlock(x, y, z, this.isFull, 0, 3);
    }
    return true;
  }
}

/** Milk: drunk in 32 ticks, clears every potion effect; Creative keeps the bucket full. */
export class ItemBucketMilk extends Item {
  constructor(index: number) {
    super(index);
    this.setMaxStackSize(1);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }
  override onEaten(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    if (!w.isRemote) clearPotionEffects(player);
    return stack.stackSize <= 0 ? new ItemStack(ItemIds.bucketEmpty) : stack;
  }
  override getMaxItemUseDuration(_stack: ItemStack): number {
    return 32;
  }
  override getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.drink;
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    player.setItemInUse(stack, this.getMaxItemUseDuration(stack));
    return stack;
  }
}

/** BlockRailBase.isRailBlock */
export function isRailBlock(id: number): boolean {
  return id === BlockIds.rail || id === BlockIds.railPowered || id === BlockIds.railDetector || id === BlockIds.railActivator;
}

/** Minecarts: placed on a rail (type 0 rideable, 1 chest, 2 furnace, 3 TNT, 5 hopper). */
export class ItemMinecart extends Item {
  constructor(
    index: number,
    readonly minecartType: number,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabTransport);
  }
  override onItemUse(stack: ItemStack, _player: EntityPlayer, w: IWorld, x: number, y: number, z: number): boolean {
    if (!isRailBlock(w.getBlockId(x, y, z))) return false;
    if (!w.isRemote) {
      const cart = createMinecart(w as World, f(x + 0.5), f(y + 0.5), f(z + 0.5), this.minecartType);
      if (cart) {
        if (stack.hasDisplayName()) (cart as Entity & { setMinecartName?(n: string): void }).setMinecartName?.(stack.getDisplayName());
        w.spawnEntityInWorld(cart);
      }
    }
    stack.stackSize--;
    return true;
  }
}

/** The boat: placed on the block (or water) under the crosshair, facing away from the player. */
export class ItemBoat extends Item {
  constructor(index: number) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabTransport);
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const world = w as World;
    const pitch = player.prevRotationPitch + (player.rotationPitch - player.prevRotationPitch);
    const yaw = player.prevRotationYaw + (player.rotationYaw - player.prevRotationYaw);
    const start = new Vec3(player.prevPosX + (player.posX - player.prevPosX), player.prevPosY + (player.posY - player.prevPosY) + 1.62 - player.yOffset, player.prevPosZ + (player.posZ - player.prevPosZ));
    const deg = f(Math.PI / 180);
    const c = MathHelper.cos(f(f(-yaw * deg) - f(Math.PI)));
    const s = MathHelper.sin(f(f(-yaw * deg) - f(Math.PI)));
    const cp = -MathHelper.cos(f(-pitch * deg));
    const sp = MathHelper.sin(f(-pitch * deg));
    const reach = 5;
    const end = start.addVector(f(s * cp) * reach, sp * reach, f(c * cp) * reach);
    const hit = world.rayTraceBlocks_do(start, end, true);
    if (!hit) return stack;
    const look = player.getLook(1);
    let blocked = false;
    const near = world.getEntitiesWithinAABBExcludingEntity(player, player.boundingBox.addCoord(look.xCoord * reach, look.yCoord * reach, look.zCoord * reach).expand(1, 1, 1));
    for (const e of near) {
      if (!e.canBeCollidedWith()) continue;
      const border = e.getCollisionBorderSize();
      if (e.boundingBox.expand(border, border, border).isVecInside(start)) blocked = true;
    }
    if (blocked) return stack;
    if (hit.typeOfHit === EnumMovingObjectType.TILE) {
      const x = hit.blockX;
      let y = hit.blockY;
      const z = hit.blockZ;
      if (w.getBlockId(x, y, z) === BlockIds.snow) y--;
      const boat = createBoat(world, f(x + 0.5), f(y + 1), f(z + 0.5));
      if (!boat) return stack;
      boat.rotationYaw = (((MathHelper.floor_double(f(f(player.rotationYaw * 4) / 360) + 0.5) & 3) - 1) * 90);
      if (world.getCollidingBoundingBoxes(boat, boat.boundingBox.expand(-0.1, -0.1, -0.1)).length > 0) return stack;
      if (!w.isRemote) w.spawnEntityInWorld(boat);
      if (!player.capabilities.isCreativeMode) stack.stackSize--;
    }
    return stack;
  }
}

/** The bed: two blocks (foot at the clicked spot, head in the facing direction) on solid ground. */
export class ItemBed extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (w.isRemote) return true;
    if (side !== 1 || !Block.blocksList[BlockIds.bed]) return false;
    y++;
    const dir = playerDirection(player);
    const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0;
    const dz = dir === 0 ? 1 : dir === 2 ? -1 : 0;
    if (!player.canPlayerEdit(x, y, z, side, stack) || !player.canPlayerEdit(x + dx, y, z + dz, side, stack)) return false;
    if (w.isAirBlock(x, y, z) && w.isAirBlock(x + dx, y, z + dz) && w.doesBlockHaveSolidTopSurface(x, y - 1, z) && w.doesBlockHaveSolidTopSurface(x + dx, y - 1, z + dz)) {
      w.setBlock(x, y, z, BlockIds.bed, dir, 3);
      if (w.getBlockId(x, y, z) === BlockIds.bed) w.setBlock(x + dx, y, z + dz, BlockIds.bed, dir + 8, 3);
      stack.stackSize--;
      return true;
    }
    return false;
  }
}

/** Doors: a two-block door on top of the clicked block; the hinge follows neighbouring doors and walls. */
export class ItemDoor extends Item {
  constructor(
    index: number,
    private readonly doorMaterial: Material,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side !== 1) return false;
    y++;
    const door = Block.blocksList[this.doorMaterial === Material.wood ? BlockIds.doorWood : BlockIds.doorIron];
    if (!player.canPlayerEdit(x, y, z, side, stack) || !player.canPlayerEdit(x, y + 1, z, side, stack)) return false;
    if (!door || !door.canPlaceBlockAt(w, x, y, z)) return false;
    const dir = MathHelper.floor_double(f(f(f(player.rotationYaw + 180) * 4) / 360) - 0.5) & 3;
    ItemDoor.placeDoorBlock(w, x, y, z, dir, door);
    stack.stackSize--;
    return true;
  }

  /** Places both halves; the top half's hinge bit (1) mirrors the door next to an existing one. */
  static placeDoorBlock(w: IWorld, x: number, y: number, z: number, dir: number, door: Block): void {
    const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0;
    const dz = dir === 0 ? 1 : dir === 2 ? -1 : 0;
    const solid = (bx: number, by: number, bz: number) => (w.isBlockNormalCube(bx, by, bz) ? 1 : 0);
    const left = solid(x - dx, y, z - dz) + solid(x - dx, y + 1, z - dz);
    const right = solid(x + dx, y, z + dz) + solid(x + dx, y + 1, z + dz);
    const doorLeft = w.getBlockId(x - dx, y, z - dz) === door.blockID || w.getBlockId(x - dx, y + 1, z - dz) === door.blockID;
    const doorRight = w.getBlockId(x + dx, y, z + dz) === door.blockID || w.getBlockId(x + dx, y + 1, z + dz) === door.blockID;
    let mirrored = false;
    if (doorLeft && !doorRight) mirrored = true;
    else if (right > left) mirrored = true;
    w.setBlock(x, y, z, door.blockID, dir, 2);
    w.setBlock(x, y + 1, z, door.blockID, 8 | (mirrored ? 1 : 0), 2);
    w.notifyBlocksOfNeighborChange(x, y, z, door.blockID);
    w.notifyBlocksOfNeighborChange(x, y + 1, z, door.blockID);
  }
}

/**
 * Signs: a standing sign (16 rotations) on top of a block, a wall sign on its sides; then the
 * sign editor opens through EntityPlayer.displayGUIEditSign.
 */
export class ItemSign extends Item {
  constructor(index: number) {
    super(index);
    this.maxStackSize = 16;
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 0) return false;
    if (!w.getBlockMaterial(x, y, z).isSolid()) return false;
    [x, y, z] = offsetBySide(side, x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const post = Block.blocksList[BlockIds.signPost];
    if (!post || !post.canPlaceBlockAt(w, x, y, z)) return false;
    if (side === 1) {
      const rot = MathHelper.floor_double(f(f(f(player.rotationYaw + 180) * 16) / 360) + 0.5) & 15;
      w.setBlock(x, y, z, BlockIds.signPost, rot, 2);
    } else {
      w.setBlock(x, y, z, BlockIds.signWall, side, 2);
    }
    stack.stackSize--;
    const te = w.getBlockTileEntity(x, y, z);
    if (te) player.displayGUIEditSign(te);
    return true;
  }
}

/** Redstone dust: places redstone wire (on top of a snow layer, the layer is replaced). */
export class ItemRedstone extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (w.getBlockId(x, y, z) !== BlockIds.snow) {
      [x, y, z] = offsetBySide(side, x, y, z);
      if (!w.isAirBlock(x, y, z)) return false;
    }
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const wire = Block.blocksList[BlockIds.redstoneWire];
    if (wire && wire.canPlaceBlockAt(w, x, y, z)) {
      stack.stackSize--;
      w.setBlock(x, y, z, BlockIds.redstoneWire);
    }
    return true;
  }
}

/** Paintings and item frames (ItemHangingEntity): hung on the side of a block. */
export class ItemHangingEntity extends Item {
  constructor(
    index: number,
    private readonly entityName: 'Painting' | 'ItemFrame',
  ) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 0 || side === 1) return false;
    const direction = Direction.facingToDirection[side];
    const e = createHanging(this.entityName, w as World, x, y, z, direction);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (e && isOnValidSurface(e)) {
      if (!w.isRemote) w.spawnEntityInWorld(e);
      stack.stackSize--;
    }
    return true;
  }
}

/** What a skull tile entity and block offer (TileEntitySkull / BlockSkull.makeWither). */
interface SkullTile {
  setSkullType?(type: number, owner: string): void;
  setSkullRotation?(rot: number): void;
}

/** Mob heads (ItemSkull): skeleton, wither skeleton, zombie, player ("char"), creeper. */
export class ItemSkull extends Item {
  static readonly skullTypes = ['skeleton', 'wither', 'zombie', 'char', 'creeper'];
  static readonly iconNames = ['skull_skeleton', 'skull_wither', 'skull_zombie', 'skull_char', 'skull_creeper'];
  private icons: (Icon | null)[] = [];

  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabDecorations);
    this.setMaxDamage(0);
    this.setHasSubtypes(true);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 0) return false;
    if (!w.getBlockMaterial(x, y, z).isSolid()) return false;
    [x, y, z] = offsetBySide(side, x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    const skull = Block.blocksList[BlockIds.skull];
    if (!skull || !skull.canPlaceBlockAt(w, x, y, z)) return false;
    w.setBlock(x, y, z, BlockIds.skull, side, 2);
    const rot = side === 1 ? MathHelper.floor_double(f(f(player.rotationYaw * 16) / 360) + 0.5) & 15 : 0;
    const te = w.getBlockTileEntity(x, y, z) as (TileEntity & SkullTile) | null;
    if (te && te.setSkullType) {
      const tag = stack.getTagCompound();
      const owner = tag && typeof tag.SkullOwner === 'string' ? tag.SkullOwner : '';
      te.setSkullType(stack.getItemDamage(), owner);
      te.setSkullRotation?.(rot);
      (skull as Block & { makeWither?(w: IWorld, x: number, y: number, z: number, te: TileEntity): void }).makeWither?.(w, x, y, z, te);
    }
    stack.stackSize--;
    return true;
  }
  override getSubItems(id: number, _tab: CreativeTabs | null, out: ItemStack[]): void {
    for (let i = 0; i < ItemSkull.skullTypes.length; i++) out.push(new ItemStack(id, 1, i));
  }
  override getIconFromDamage(damage: number): Icon | null {
    if (damage < 0 || damage >= ItemSkull.skullTypes.length) damage = 0;
    return this.icons[damage] ?? null;
  }
  override getMetadata(damage: number): number {
    return damage;
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    if (!stack) return super.getUnlocalizedName();
    let d = stack.getItemDamage();
    if (d < 0 || d >= ItemSkull.skullTypes.length) d = 0;
    return super.getUnlocalizedName() + '.' + ItemSkull.skullTypes[d];
  }
  override getItemDisplayName(stack: ItemStack): string {
    const tag = stack.getTagCompound();
    if (stack.getItemDamage() === 3 && tag && typeof tag.SkullOwner === 'string') return I18n.translateToLocalFormatted('item.skull.player.name', tag.SkullOwner);
    return super.getItemDisplayName(stack);
  }
  override registerIcons(reg: IconRegister): void {
    this.icons = ItemSkull.iconNames.map((n) => reg.registerIcon(n));
  }
}

/** What spawning a creature calls when the mob class has it (EntityLiving.initCreature, custom names). */
interface Spawnable {
  initCreature?(): void;
  setCustomNameTag?(name: string): void;
  func_94058_c?(name: string): void;
}

/**
 * Spawn eggs (ItemMonsterPlacer): one per EntityList egg (damage = entity id), coloured base and
 * spots from the egg colours; spawns the mob on the clicked face (half a block up on fences).
 */
export class ItemMonsterPlacer extends Item {
  private theIcon: Icon | null = null;

  constructor(index: number) {
    super(index);
    this.setHasSubtypes(true);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }
  override getItemDisplayName(stack: ItemStack): string {
    let name = I18n.translateToLocal(this.getUnlocalizedName() + '.name').trim();
    const entity = EntityList.getStringFromID(stack.getItemDamage());
    if (entity !== null) name += ' ' + I18n.translateToLocal('entity.' + entity + '.name');
    return name;
  }
  override getColorFromItemStack(stack: ItemStack, pass: number): number {
    const egg = EntityList.entityEggs.get(stack.getItemDamage());
    if (!egg) return 0xffffff;
    return pass === 0 ? egg.primaryColor : egg.secondaryColor;
  }
  override requiresMultipleRenderPasses(): boolean {
    return true;
  }
  override getIconFromDamageForRenderPass(damage: number, pass: number): Icon | null {
    return pass > 0 ? this.theIcon : super.getIconFromDamageForRenderPass(damage, pass);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (w.isRemote) return true;
    const id = w.getBlockId(x, y, z);
    x += Facing.offsetsXForSide[side];
    y += Facing.offsetsYForSide[side];
    z += Facing.offsetsZForSide[side];
    let lift = 0;
    if (side === 1 && Block.blocksList[id] && Block.blocksList[id]!.getRenderType() === 11) lift = 0.5;
    const e = ItemMonsterPlacer.spawnCreature(w as World, stack.getItemDamage(), x + 0.5, y + lift, z + 0.5);
    if (e) {
      if (e.isLivingEntity && stack.hasDisplayName()) {
        const s = e as Entity & Spawnable;
        (s.setCustomNameTag ?? s.func_94058_c)?.call(s, stack.getDisplayName());
      }
      if (!player.capabilities.isCreativeMode) stack.stackSize--;
    }
    return true;
  }
  /** Spawns the egg's mob at (x, y, z) facing a random way; null when it has no egg or class. */
  static spawnCreature(w: World, id: number, x: number, y: number, z: number): Entity | null {
    if (!EntityList.entityEggs.has(id)) return null;
    const e = EntityList.createEntityByID(id, w);
    if (e && e.isLivingEntity) {
      const living = e as EntityLiving & Spawnable;
      e.setLocationAndAngles(x, y, z, MathHelper.wrapAngleTo180_float(f(w.rand.nextFloat() * 360)), 0);
      living.rotationYawHead = living.rotationYaw;
      living.renderYawOffset = living.rotationYaw;
      living.initCreature?.();
      w.spawnEntityInWorld(e);
      living.playLivingSound();
    }
    return e;
  }
  override getSubItems(id: number, _tab: CreativeTabs | null, out: ItemStack[]): void {
    for (const egg of EntityList.entityEggs.values()) out.push(new ItemStack(id, 1, egg.spawnedID));
  }
  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.theIcon = reg.registerIcon('monsterPlacer_overlay');
  }
}

/** What saddling needs (EntityPig.getSaddled / setSaddled). */
interface Saddleable {
  getSaddled?(): boolean;
  setSaddled?(v: boolean): void;
  isChild?(): boolean;
}

/** The saddle: right click (or hit) an adult pig to saddle it. */
export class ItemSaddle extends Item {
  constructor(index: number) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabTransport);
  }
  override itemInteractionForEntity(stack: ItemStack, e: EntityLiving): boolean {
    if (EntityList.getEntityString(e) !== 'Pig') return false;
    const pig = e as EntityLiving & Saddleable;
    if (!pig.getSaddled?.() && !pig.isChild?.()) {
      pig.setSaddled?.(true);
      stack.stackSize--;
    }
    return true;
  }
  override hitEntity(stack: ItemStack, target: EntityLiving, _attacker: EntityLiving): boolean {
    this.itemInteractionForEntity(stack, target);
    return true;
  }
}
