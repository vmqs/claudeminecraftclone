import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import type { BlockPortal } from './BlockPortal';
import { Material } from './Material';

const fround = Math.fround;

/**
 * Fire (51): no collision, needs a solid block below or something flammable next to it, and
 * lights a nether portal when placed on an obsidian frame. Spreading and burning out are
 * random ticks (not run here yet).
 */
export class BlockFire extends Block {
  /** How readily each block id lets fire appear next to it (0 = not flammable). */
  readonly chanceToEncourageFire = new Int32Array(256);
  /** How readily each block id burns away. */
  readonly abilityToCatchFire = new Int32Array(256);
  private iconArray: (Icon | null)[] = [null, null];

  constructor(id: number) {
    super(id, Material.fire);
    this.setTickRandomly(true);
  }

  /** The flammable blocks (Block.fire is created before them, so this runs after all blocks exist). */
  override initializeBlock(): void {
    this.setBurnRate(BlockIds.planks, 5, 20);
    this.setBurnRate(BlockIds.woodDoubleSlab, 5, 20);
    this.setBurnRate(BlockIds.woodSingleSlab, 5, 20);
    this.setBurnRate(BlockIds.fence, 5, 20);
    this.setBurnRate(BlockIds.stairsWoodOak, 5, 20);
    this.setBurnRate(BlockIds.stairsWoodBirch, 5, 20);
    this.setBurnRate(BlockIds.stairsWoodSpruce, 5, 20);
    this.setBurnRate(BlockIds.stairsWoodJungle, 5, 20);
    this.setBurnRate(BlockIds.wood, 5, 5);
    this.setBurnRate(BlockIds.leaves, 30, 60);
    this.setBurnRate(BlockIds.bookShelf, 30, 20);
    this.setBurnRate(BlockIds.tnt, 15, 100);
    this.setBurnRate(BlockIds.tallGrass, 60, 100);
    this.setBurnRate(BlockIds.cloth, 30, 60);
    this.setBurnRate(BlockIds.vine, 15, 100);
  }

  private setBurnRate(id: number, encourage: number, flammability: number): void {
    this.chanceToEncourageFire[id] = encourage;
    this.abilityToCatchFire[id] = flammability;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 3;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override tickRate(_w: IWorld): number {
    return 30;
  }

  override updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {
    // TODO(block-dynamics): with the doFireTick game rule: age the fire (metadata), go out in
    // rain or without fuel, burn neighbours away (abilityToCatchFire, TNT primes via
    // BlockTNT.onBlockDestroyedByPlayer with meta 1) and spread to air next to flammable blocks
    // (chanceToEncourageFire, difficulty, humidity). Netherrack below burns forever.
  }

  /** func_82506_l */
  override isUpdateTickImmediate(): boolean {
    return false;
  }

  override isCollidable(): boolean {
    return false;
  }

  /** Whether the block at (x, y, z) is flammable. */
  canBlockCatchFire(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return this.chanceToEncourageFire[w.getBlockId(x, y, z)] > 0;
  }

  getChanceToEncourageFire(w: IBlockAccess, x: number, y: number, z: number, current: number): number {
    const c = this.chanceToEncourageFire[w.getBlockId(x, y, z)];
    return c > current ? c : current;
  }

  /** Whether any of the six neighbours is flammable. */
  canNeighborBurn(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return (
      this.canBlockCatchFire(w, x + 1, y, z) ||
      this.canBlockCatchFire(w, x - 1, y, z) ||
      this.canBlockCatchFire(w, x, y - 1, z) ||
      this.canBlockCatchFire(w, x, y + 1, z) ||
      this.canBlockCatchFire(w, x, y, z - 1) ||
      this.canBlockCatchFire(w, x, y, z + 1)
    );
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return w.doesBlockHaveSolidTopSurface(x, y - 1, z) || this.canNeighborBurn(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && !this.canNeighborBurn(w, x, y, z)) w.setBlockToAir(x, y, z);
  }

  /** Lights a nether portal inside an obsidian frame; otherwise stays if supported. */
  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (w.provider.dimensionId <= 0 && w.getBlockId(x, y - 1, z) === BlockIds.obsidian) {
      const portal = Block.blocksList[BlockIds.portal] as BlockPortal | null;
      if (portal && portal.tryToCreatePortal(w, x, y, z)) return;
    }
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && !this.canNeighborBurn(w, x, y, z)) {
      w.setBlockToAir(x, y, z);
    } else {
      w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w) + w.rand.nextInt(10));
    }
  }

  /** Crackling, and smoke from the burning block (or from the top when standing on the ground). */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (rand.nextInt(24) === 0) {
      w.playSound(x + 0.5, y + 0.5, z + 0.5, 'fire.fire', fround(1 + rand.nextFloat()), fround(fround(rand.nextFloat() * fround(0.7)) + fround(0.3)), false);
    }
    const smoke = (px: number, py: number, pz: number): void => w.spawnParticle('largesmoke', px, py, pz, 0, 0, 0);
    const edge = (v: number): number => fround(v - fround(rand.nextFloat() * fround(0.1)));
    const near = (v: number): number => fround(v + fround(rand.nextFloat() * fround(0.1)));
    const any = (v: number): number => fround(v + rand.nextFloat());
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && !this.canBlockCatchFire(w, x, y - 1, z)) {
      if (this.canBlockCatchFire(w, x - 1, y, z)) {
        for (let i = 0; i < 2; i++) {
          const px = near(x);
          const py = any(y);
          smoke(px, py, any(z));
        }
      }
      if (this.canBlockCatchFire(w, x + 1, y, z)) {
        for (let i = 0; i < 2; i++) {
          const px = edge(x + 1);
          const py = any(y);
          smoke(px, py, any(z));
        }
      }
      if (this.canBlockCatchFire(w, x, y, z - 1)) {
        for (let i = 0; i < 2; i++) {
          const px = any(x);
          const py = any(y);
          smoke(px, py, near(z));
        }
      }
      if (this.canBlockCatchFire(w, x, y, z + 1)) {
        for (let i = 0; i < 2; i++) {
          const px = any(x);
          const py = any(y);
          smoke(px, py, edge(z + 1));
        }
      }
      if (this.canBlockCatchFire(w, x, y + 1, z)) {
        for (let i = 0; i < 2; i++) {
          const px = any(x);
          const py = edge(y + 1);
          smoke(px, py, any(z));
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const px = any(x);
        const py = fround(fround(y + fround(rand.nextFloat() * 0.5)) + 0.5);
        smoke(px, py, any(z));
      }
    }
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [reg.registerIcon('fire_0'), reg.registerIcon('fire_1')];
  }

  /** func_94438_c: the two fire layers (fire_0, fire_1) for the fire renderer. */
  func_94438_c(layer: number): Icon | null {
    return this.iconArray[layer];
  }

  getFireIcon(layer: number): Icon | null {
    return this.iconArray[layer];
  }

  override getIcon(_side: number, _meta: number): Icon | null {
    return this.iconArray[0];
  }
}
