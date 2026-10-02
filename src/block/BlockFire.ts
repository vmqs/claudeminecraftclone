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
 * lights a nether portal when placed on an obsidian frame. It ages, spreads and burns blocks
 * away on its scheduled ticks (every 30-39 ticks) and on random ticks.
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

  /**
   * With the doFireTick rule: the fire ages (metadata 0-15) and reschedules itself; rain puts it
   * out unless it sits on netherrack; without fuel it dies (at once off the ground, after age 3
   * on it); old fire with nothing flammable below may go out. Otherwise it burns the six
   * neighbours away (flammability against 300 sideways, 250 up/down, 50 less in humid biomes;
   * burnt TNT is primed) and spreads to air within 1 block sideways, 1 below and 4 above that
   * touches something flammable, more readily on harder difficulties.
   */
  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (!Block.getGameRule(w, 'doFireTick')) return;
    const below = w.getBlockId(x, y - 1, z);
    // The End's bedrock also burns forever; there is no End here, but keep the rule by dimension.
    const eternal = below === BlockIds.netherrack || (w.provider.dimensionId === 1 && below === BlockIds.bedrock);
    if (!this.canPlaceBlockAt(w, x, y, z)) w.setBlockToAir(x, y, z);
    if (!eternal && w.isRaining() && (this.rainReaches(w, x, y, z) || this.rainReaches(w, x - 1, y, z) || this.rainReaches(w, x + 1, y, z) || this.rainReaches(w, x, y, z - 1) || this.rainReaches(w, x, y, z + 1))) {
      w.setBlockToAir(x, y, z);
      return;
    }
    const age = w.getBlockMetadata(x, y, z);
    if (age < 15) w.setBlockMetadataWithNotify(x, y, z, age + ((rand.nextInt(3) / 2) | 0), 4);
    w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w) + rand.nextInt(10));
    if (!eternal && !this.canNeighborBurn(w, x, y, z)) {
      if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) || age > 3) w.setBlockToAir(x, y, z);
      return;
    }
    if (!eternal && !this.canBlockCatchFire(w, x, y - 1, z) && age === 15 && rand.nextInt(4) === 0) {
      w.setBlockToAir(x, y, z);
      return;
    }
    const humid = w.getBiomeGenForCoords(x, z).isHighHumidity();
    const humidity = humid ? -50 : 0;
    this.tryToCatchBlockOnFire(w, x + 1, y, z, 300 + humidity, rand, age);
    this.tryToCatchBlockOnFire(w, x - 1, y, z, 300 + humidity, rand, age);
    this.tryToCatchBlockOnFire(w, x, y - 1, z, 250 + humidity, rand, age);
    this.tryToCatchBlockOnFire(w, x, y + 1, z, 250 + humidity, rand, age);
    this.tryToCatchBlockOnFire(w, x, y, z - 1, 300 + humidity, rand, age);
    this.tryToCatchBlockOnFire(w, x, y, z + 1, 300 + humidity, rand, age);
    const difficulty = (w as { difficultySetting?: number }).difficultySetting ?? 2;
    for (let ix = x - 1; ix <= x + 1; ix++) {
      for (let iz = z - 1; iz <= z + 1; iz++) {
        for (let iy = y - 1; iy <= y + 4; iy++) {
          if (ix === x && iy === y && iz === z) continue;
          let odds = 100;
          if (iy > y + 1) odds += (iy - (y + 1)) * 100;
          const encouragement = this.getChanceOfNeighborsEncouragingFire(w, ix, iy, iz);
          if (encouragement <= 0) continue;
          let chance = ((encouragement + 40 + difficulty * 7) / (age + 30)) | 0;
          if (humid) chance = (chance / 2) | 0;
          // The x - 1 rain check uses the fire's own z, as the original does.
          if (
            chance > 0 &&
            rand.nextInt(odds) <= chance &&
            (!w.isRaining() || !w.canLightningStrikeAt(ix, iy, iz)) &&
            !w.canLightningStrikeAt(ix - 1, iy, z) &&
            !w.canLightningStrikeAt(ix + 1, iy, iz) &&
            !w.canLightningStrikeAt(ix, iy, iz - 1) &&
            !w.canLightningStrikeAt(ix, iy, iz + 1)
          ) {
            const newAge = Math.min(15, age + ((rand.nextInt(5) / 4) | 0));
            w.setBlock(ix, iy, iz, this.blockID, newAge, 3);
          }
        }
      }
    }
  }

  private rainReaches(w: IWorld, x: number, y: number, z: number): boolean {
    return w.canLightningStrikeAt(x, y, z);
  }

  /** Burns the block away (flammability out of `odds`); it may become fire itself. TNT gets primed. */
  private tryToCatchBlockOnFire(w: IWorld, x: number, y: number, z: number, odds: number, rand: JavaRandom, age: number): void {
    const flammability = this.abilityToCatchFire[w.getBlockId(x, y, z)];
    if (rand.nextInt(odds) >= flammability) return;
    const isTnt = w.getBlockId(x, y, z) === BlockIds.tnt;
    if (rand.nextInt(age + 10) < 5 && !w.canLightningStrikeAt(x, y, z)) {
      const newAge = Math.min(15, age + ((rand.nextInt(5) / 4) | 0));
      w.setBlock(x, y, z, this.blockID, newAge, 3);
    } else {
      w.setBlockToAir(x, y, z);
    }
    if (isTnt) Block.blocksList[BlockIds.tnt]?.onBlockDestroyedByPlayer(w, x, y, z, 1);
  }

  /** The best encouragement of the six blocks around an air block (0 when not air). */
  private getChanceOfNeighborsEncouragingFire(w: IWorld, x: number, y: number, z: number): number {
    if (!w.isAirBlock(x, y, z)) return 0;
    let c = 0;
    c = this.getChanceToEncourageFire(w, x + 1, y, z, c);
    c = this.getChanceToEncourageFire(w, x - 1, y, z, c);
    c = this.getChanceToEncourageFire(w, x, y - 1, z, c);
    c = this.getChanceToEncourageFire(w, x, y + 1, z, c);
    c = this.getChanceToEncourageFire(w, x, y, z - 1, c);
    return this.getChanceToEncourageFire(w, x, y, z + 1, c);
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
