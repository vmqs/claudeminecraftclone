import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { Explosion } from '../world/Explosion';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

const fround = Math.fround;

/** The parts of EntityTNTPrimed the block touches. */
interface PrimedTnt {
  fuse?: number;
  tntPlacedBy?: EntityLiving | null;
  setTntPlacedBy?(e: EntityLiving | null): void;
}

/**
 * TNT (46): flint and steel, a burning arrow, an explosion or (with redstone) power turns it
 * into an EntityTNTPrimed ('PrimedTnt'); never drops from explosions.
 */
export class BlockTNT extends Block {
  private topIcon: Icon | null = null;
  private bottomIcon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.tnt);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side === 0 ? this.bottomIcon : side === 1 ? this.topIcon : this.blockIcon;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    if (Block.isPowered(w, x, y, z)) {
      this.onBlockDestroyedByPlayer(w, x, y, z, 1);
      w.setBlockToAir(x, y, z);
    }
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (Block.isPowered(w, x, y, z)) {
      this.onBlockDestroyedByPlayer(w, x, y, z, 1);
      w.setBlockToAir(x, y, z);
    }
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  /** Blown up: a primed TNT with a short random fuse (10-29 ticks). */
  override onBlockDestroyedByExplosion(w: IWorld, x: number, y: number, z: number, explosion?: Explosion): void {
    if (w.isRemote) return;
    const e = BlockTNT.createPrimed(w, x + 0.5, y + 0.5, z + 0.5, explosion?.getExplosivePlacedBy() ?? null);
    if (!e) return;
    const t = e as unknown as PrimedTnt;
    const fuse = t.fuse ?? 80;
    t.fuse = w.rand.nextInt((fuse / 4) | 0) + ((fuse / 8) | 0);
    w.spawnEntityInWorld(e);
  }

  /** Broken with metadata bit 1 set (set by fire, flint and steel and power): primes. */
  override onBlockDestroyedByPlayer(w: IWorld, x: number, y: number, z: number, meta: number): void {
    this.primeTnt(w, x, y, z, meta, null);
  }

  /** func_94391_a */
  primeTnt(w: IWorld, x: number, y: number, z: number, meta: number, igniter: EntityLiving | null): void {
    if (w.isRemote || (meta & 1) !== 1) return;
    const e = BlockTNT.createPrimed(w, x + 0.5, y + 0.5, z + 0.5, igniter);
    if (!e) return;
    w.spawnEntityInWorld(e);
    const s = w as { playSoundAtEntity?(e: Entity, name: string, volume: number, pitch: number): void };
    if (s.playSoundAtEntity) s.playSoundAtEntity(e, 'random.fuse', 1, 1);
    else w.playSoundEffect(e.posX, e.posY - e.yOffset, e.posZ, 'random.fuse', 1, 1);
  }

  /**
   * new EntityTNTPrimed(world, x, y, z, placedBy): created through EntityList, then set up the
   * way that constructor does (a small random sideways hop, 80-tick fuse). Null until the
   * entity code registers 'PrimedTnt'.
   */
  static createPrimed(w: IWorld, x: number, y: number, z: number, placedBy: EntityLiving | null): Entity | null {
    const e = EntityList.createEntityByName('PrimedTnt', w as unknown as World);
    if (!e) return null;
    e.setPosition(x, y, z);
    const a = fround(Math.random() * fround(Math.PI) * 2);
    e.motionX = fround(-fround(Math.sin(a)) * fround(0.02));
    e.motionY = fround(0.2);
    e.motionZ = fround(-fround(Math.cos(a)) * fround(0.02));
    e.prevPosX = x;
    e.prevPosY = y;
    e.prevPosZ = z;
    const t = e as unknown as PrimedTnt;
    t.fuse = 80;
    if (t.setTntPlacedBy) t.setTntPlacedBy(placedBy);
    else t.tntPlacedBy = placedBy;
    return e;
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer, side: number, hx: number, hy: number, hz: number): boolean {
    const held = p.getCurrentEquippedItem();
    if (held !== null && held.itemID === ItemIds.flintAndSteel) {
      this.primeTnt(w, x, y, z, 1, p);
      w.setBlockToAir(x, y, z);
      return true;
    }
    return super.onBlockActivated(w, x, y, z, p, side, hx, hy, hz);
  }

  /** A burning arrow sets it off. */
  override onEntityCollidedWithBlock(w: IWorld, x: number, y: number, z: number, e: Entity): void {
    if (EntityList.getEntityString(e) !== 'Arrow' || w.isRemote) return;
    if (e.isBurning()) {
      const shooter = (e as unknown as { shootingEntity?: Entity | null }).shootingEntity ?? null;
      this.primeTnt(w, x, y, z, 1, shooter?.isLivingEntity ? (shooter as EntityLiving) : null);
      w.setBlockToAir(x, y, z);
    }
  }

  override canDropFromExplosion(_explosion?: Explosion): boolean {
    return false;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('tnt_side');
    this.topIcon = reg.registerIcon('tnt_top');
    this.bottomIcon = reg.registerIcon('tnt_bottom');
  }
}
