import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Direction } from '../core/Facing';
import { EnumMovingObjectType } from '../core/MovingObjectPosition';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import { createEnderEye, createThrowable, moveEnderEyeTowards } from './ItemEntitySpawning';
import type { ItemStack } from './ItemStack';
import { offsetBySide } from './ItemBlock';

const f = Math.fround;

/** The "random.bow" throw sound every throwable plays (pitch 0.4 / (0.8..1.2)). */
export function playThrowSound(w: IWorld, player: EntityPlayer): void {
  (w as World).playSoundAtEntity(player, 'random.bow', 0.5, f(f(0.4) / f(f(Item.itemRand.nextFloat() * f(0.4)) + f(0.8))));
}

/**
 * A thrown item (snowball, egg, bottle o' enchanting): one per throw outside Creative, the
 * projectile is the EntityList entity `entityName`.
 */
export class ItemThrowable extends Item {
  constructor(
    index: number,
    private readonly entityName: string,
    stackSize: number,
    tab: CreativeTabs,
  ) {
    super(index);
    this.maxStackSize = stackSize;
    this.setCreativeTab(tab);
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    playThrowSound(w, player);
    if (!w.isRemote) {
      const e = createThrowable(this.entityName, w as World, player, stack);
      if (e) w.spawnEntityInWorld(e);
    }
    return stack;
  }
}

/** Bottle o' enchanting: a throwable that always shows the enchantment glint. */
export class ItemExpBottle extends ItemThrowable {
  override hasEffect(_stack: ItemStack): boolean {
    return true;
  }
}

/** Ender pearl: cannot be thrown in Creative or while riding (as in 1.5.2). */
export class ItemEnderPearl extends Item {
  constructor(index: number) {
    super(index);
    this.maxStackSize = 16;
    this.setCreativeTab(CreativeTabs.tabMisc);
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    if (player.capabilities.isCreativeMode || player.ridingEntity !== null) return stack;
    stack.stackSize--;
    playThrowSound(w, player);
    if (!w.isRemote) {
      const e = createThrowable('ThrownEnderpearl', w as World, player, stack);
      if (e) w.spawnEntityInWorld(e);
    }
    return stack;
  }
}

/** What finding a stronghold needs from the world (World.findClosestStructure; world generation). */
interface StructureFinder {
  findClosestStructure?(name: string, x: number, y: number, z: number): { x: number; y: number; z: number } | null;
}

function isEnderEyeInserted(meta: number): boolean {
  return (meta & 4) !== 0;
}

/**
 * Eye of ender: fills an end portal frame (completing the portal when all 12 have eyes), or
 * flies towards the nearest stronghold.
 */
export class ItemEnderEye extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    const id = w.getBlockId(x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack) || id !== BlockIds.endPortalFrame || isEnderEyeInserted(meta)) return false;
    if (w.isRemote) return true;
    w.setBlockMetadataWithNotify(x, y, z, meta + 4, 2);
    stack.stackSize--;
    for (let i = 0; i < 16; i++) {
      const px = x + f(f(5 + f(Item.itemRand.nextFloat() * 6)) / 16);
      const py = y + f(0.8125);
      const pz = z + f(f(5 + f(Item.itemRand.nextFloat() * 6)) / 16);
      w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
    }
    this.tryCompletePortal(w, x, y, z, meta & 3);
    return true;
  }

  /** Looks for the 3x3 ring of filled frames around the clicked one and lights the portal. */
  private tryCompletePortal(w: IWorld, x: number, y: number, z: number, dir: number): void {
    const frame = BlockIds.endPortalFrame;
    const filled = (bx: number, bz: number) => w.getBlockId(bx, y, bz) === frame && isEnderEyeInserted(w.getBlockMetadata(bx, y, bz));
    const side = Direction.rotateRight[dir];
    const sx = Direction.offsetX[side];
    const sz = Direction.offsetZ[side];
    const fx = Direction.offsetX[dir];
    const fz = Direction.offsetZ[dir];
    let first = 0;
    let last = 0;
    let found = false;
    let ok = true;
    for (let i = -2; i <= 2; i++) {
      const bx = x + sx * i;
      const bz = z + sz * i;
      if (w.getBlockId(bx, y, bz) === frame) {
        if (!isEnderEyeInserted(w.getBlockMetadata(bx, y, bz))) {
          ok = false;
          break;
        }
        last = i;
        if (!found) {
          first = i;
          found = true;
        }
      }
    }
    if (!ok || last !== first + 2) return;
    for (let i = first; i <= last; i++) {
      if (!filled(x + sx * i + fx * 4, z + sz * i + fz * 4)) {
        ok = false;
        break;
      }
    }
    for (let i = first - 1; i <= last + 1; i += 4) {
      for (let d = 1; d <= 3; d++) {
        if (!filled(x + sx * i + fx * d, z + sz * i + fz * d)) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) return;
    for (let i = first; i <= last; i++) {
      for (let d = 1; d <= 3; d++) w.setBlock(x + sx * i + fx * d, y, z + sz * i + fz * d, BlockIds.endPortal, 0, 2);
    }
  }

  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const world = w as World;
    const hit = this.getMovingObjectPositionFromPlayer(world, player, false);
    if (hit && hit.typeOfHit === EnumMovingObjectType.TILE && w.getBlockId(hit.blockX, hit.blockY, hit.blockZ) === BlockIds.endPortalFrame) return stack;
    if (!w.isRemote) {
      const target = (world as World & StructureFinder).findClosestStructure?.('Stronghold', Math.trunc(player.posX), Math.trunc(player.posY), Math.trunc(player.posZ)) ?? null;
      if (target) {
        const eye = createEnderEye(world, player.posX, player.posY + 1.62 - player.yOffset, player.posZ);
        if (eye) {
          moveEnderEyeTowards(eye, target.x, target.y, target.z);
          w.spawnEntityInWorld(eye);
        }
        playThrowSound(w, player);
        world.playAuxSFXAtEntity(null, 1002, Math.trunc(player.posX), Math.trunc(player.posY), Math.trunc(player.posZ), 0);
        if (!player.capabilities.isCreativeMode) stack.stackSize--;
      }
    }
    return stack;
  }
}

/** Fire charge: right click on a block lights a fire on that face (shooting is the dispenser's). */
export class ItemFireball extends Item {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (w.isRemote) return true;
    [x, y, z] = offsetBySide(side, x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (w.getBlockId(x, y, z) === 0) {
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'fire.ignite', 1, f(f(Item.itemRand.nextFloat() * f(0.4)) + f(0.8)));
      if (Block.blocksList[BlockIds.fire]) w.setBlock(x, y, z, BlockIds.fire);
    }
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    return true;
  }
}

/** Flint and steel: lights a fire on the clicked face (TNT ignites itself through BlockTNT). */
export class ItemFlintAndSteel extends Item {
  constructor(index: number) {
    super(index);
    this.maxStackSize = 1;
    this.setMaxDamage(64);
    this.setCreativeTab(CreativeTabs.tabTools);
  }
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number): boolean {
    [x, y, z] = offsetBySide(side, x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (w.getBlockId(x, y, z) === 0) {
      w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'fire.ignite', 1, f(f(Item.itemRand.nextFloat() * f(0.4)) + f(0.8)));
      if (Block.blocksList[BlockIds.fire]) w.setBlock(x, y, z, BlockIds.fire);
    }
    stack.damageItem(1, player);
    return true;
  }
}
