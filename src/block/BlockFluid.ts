import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Water and lava base. Metadata = flow decay (0 = source, 1-7 = spreading, >= 8 = falling).
 */
export abstract class BlockFluid extends Block {
  private theIcon: (Icon | null)[] = [null, null];

  constructor(id: number, material: Material) {
    super(id, material);
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
    this.setTickRandomly(true);
  }

  override getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return this.blockMaterial !== Material.lava;
  }

  override getBlockColor(): number {
    return 0xffffff;
  }

  /** Water: 3x3 average of the biome water colour multipliers. */
  override colorMultiplier(w: IBlockAccess, x: number, _y: number, z: number): number {
    if (this.blockMaterial !== Material.water) return 0xffffff;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = w.getBiomeGenForCoords(x + dx, z + dz).waterColorMultiplier;
        r += (c & 0xff0000) >> 16;
        g += (c & 0xff00) >> 8;
        b += c & 0xff;
      }
    }
    return ((((r / 9) | 0) & 255) << 16) | ((((g / 9) | 0) & 255) << 8) | (((b / 9) | 0) & 255);
  }

  /** Fraction of the block that is *empty* above the fluid for a decay value. */
  static getFluidHeightPercent(meta: number): number {
    if (meta >= 8) meta = 0;
    return Math.fround((meta + 1) / 9);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side !== 0 && side !== 1 ? this.theIcon[1] : this.theIcon[0];
  }

  protected getFlowDecay(w: IBlockAccess, x: number, y: number, z: number): number {
    return w.getBlockMaterial(x, y, z) === this.blockMaterial ? w.getBlockMetadata(x, y, z) : -1;
  }

  protected getEffectiveFlowDecay(w: IBlockAccess, x: number, y: number, z: number): number {
    if (w.getBlockMaterial(x, y, z) !== this.blockMaterial) return -1;
    const m = w.getBlockMetadata(x, y, z);
    return m >= 8 ? 0 : m;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override canCollideCheck(meta: number, hitLiquids: boolean): boolean {
    return hitLiquids && meta === 0;
  }

  override isBlockSolid(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    const m = w.getBlockMaterial(x, y, z);
    if (m === this.blockMaterial) return false;
    if (side === 1) return true;
    return m === Material.ice ? false : super.isBlockSolid(w, x, y, z, side);
  }

  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    const m = w.getBlockMaterial(x, y, z);
    if (m === this.blockMaterial) return false;
    if (side === 1) return true;
    return m === Material.ice ? false : super.shouldSideBeRendered(w, x, y, z, side);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override getRenderType(): number {
    return 4;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  getFlowVector(w: IBlockAccess, x: number, y: number, z: number): Vec3 {
    let v = new Vec3(0, 0, 0);
    const decay = this.getEffectiveFlowDecay(w, x, y, z);
    for (let i = 0; i < 4; i++) {
      let nx = x;
      let nz = z;
      if (i === 0) nx = x - 1;
      if (i === 1) nz = z - 1;
      if (i === 2) nx++;
      if (i === 3) nz++;
      let nd = this.getEffectiveFlowDecay(w, nx, y, nz);
      if (nd < 0) {
        if (!w.getBlockMaterial(nx, y, nz).blocksMovement()) {
          nd = this.getEffectiveFlowDecay(w, nx, y - 1, nz);
          if (nd >= 0) {
            const d = nd - (decay - 8);
            v = v.addVector((nx - x) * d, 0, (nz - z) * d);
          }
        }
      } else {
        const d = nd - decay;
        v = v.addVector((nx - x) * d, 0, (nz - z) * d);
      }
    }
    if (w.getBlockMetadata(x, y, z) >= 8) {
      const solid =
        this.isBlockSolid(w, x, y, z - 1, 2) ||
        this.isBlockSolid(w, x, y, z + 1, 3) ||
        this.isBlockSolid(w, x - 1, y, z, 4) ||
        this.isBlockSolid(w, x + 1, y, z, 5) ||
        this.isBlockSolid(w, x, y + 1, z - 1, 2) ||
        this.isBlockSolid(w, x, y + 1, z + 1, 3) ||
        this.isBlockSolid(w, x - 1, y + 1, z, 4) ||
        this.isBlockSolid(w, x + 1, y + 1, z, 5);
      if (solid) v = v.normalize().addVector(0, -6, 0);
    }
    return v.normalize();
  }

  override velocityToAddToEntity(w: IWorld, x: number, y: number, z: number, _e: Entity, v: Vec3): void {
    const f = this.getFlowVector(w, x, y, z);
    v.xCoord += f.xCoord;
    v.yCoord += f.yCoord;
    v.zCoord += f.zCoord;
  }

  override tickRate(w: IWorld): number {
    if (this.blockMaterial === Material.water) return 5;
    if (this.blockMaterial === Material.lava) return w.provider.hasNoSky ? 10 : 30;
    return 0;
  }

  override getMixedBrightnessForBlock(w: IBlockAccess, x: number, y: number, z: number): number {
    const a = w.getLightBrightnessForSkyBlocks(x, y, z, 0);
    const b = w.getLightBrightnessForSkyBlocks(x, y + 1, z, 0);
    const al = a & 255;
    const bl = b & 255;
    const as = (a >> 16) & 255;
    const bs = (b >> 16) & 255;
    return (al > bl ? al : bl) | ((as > bs ? as : bs) << 16);
  }

  override getBlockBrightness(w: IBlockAccess, x: number, y: number, z: number): number {
    const a = w.getLightBrightness(x, y, z);
    const b = w.getLightBrightness(x, y + 1, z);
    return a > b ? a : b;
  }

  override getRenderBlockPass(): number {
    return this.blockMaterial === Material.water ? 1 : 0;
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (this.blockMaterial === Material.water) {
      if (rand.nextInt(10) === 0) {
        const m = w.getBlockMetadata(x, y, z);
        if (m <= 0 || m >= 8) w.spawnParticle('suspended', x + rand.nextFloat(), y + rand.nextFloat(), z + rand.nextFloat(), 0, 0, 0);
      }
      if (rand.nextInt(64) === 0) {
        const m = w.getBlockMetadata(x, y, z);
        if (m > 0 && m < 8) w.playSound(x + 0.5, y + 0.5, z + 0.5, 'liquid.water', rand.nextFloat() * 0.25 + 0.75, rand.nextFloat() + 0.5, false);
      }
    }
    if (this.blockMaterial === Material.lava && w.getBlockMaterial(x, y + 1, z) === Material.air && !w.isBlockOpaqueCube(x, y + 1, z)) {
      if (rand.nextInt(100) === 0) {
        const px = x + rand.nextFloat();
        const py = y + this.maxY;
        const pz = z + rand.nextFloat();
        w.spawnParticle('lava', px, py, pz, 0, 0, 0);
        w.playSound(px, py, pz, 'liquid.lavapop', 0.2 + rand.nextFloat() * 0.2, 0.9 + rand.nextFloat() * 0.15, false);
      }
      if (rand.nextInt(200) === 0) w.playSound(x, y, z, 'liquid.lava', 0.2 + rand.nextFloat() * 0.2, 0.9 + rand.nextFloat() * 0.15, false);
    }
    if (rand.nextInt(10) === 0 && w.doesBlockHaveSolidTopSurface(x, y - 1, z) && !w.getBlockMaterial(x, y - 2, z).blocksMovement()) {
      const px = x + rand.nextFloat();
      const pz = z + rand.nextFloat();
      w.spawnParticle(this.blockMaterial === Material.water ? 'dripWater' : 'dripLava', px, y - 1.05, pz, 0, 0, 0);
    }
  }

  /** Angle of the flow for the top texture, or -1000 for still fluid. */
  static getFlowDirection(w: IBlockAccess, x: number, y: number, z: number, material: Material): number {
    const fluid = Block.blocksList[material === Material.water ? BlockIds.waterMoving : BlockIds.lavaMoving] as BlockFluid;
    const v = fluid.getFlowVector(w, x, y, z);
    return v.xCoord === 0 && v.zCoord === 0 ? -1000 : Math.atan2(v.zCoord, v.xCoord) - Math.PI / 2;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    this.checkForHarden(w, x, y, z);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    this.checkForHarden(w, x, y, z);
  }

  /** Lava next to water turns into obsidian (source) or cobblestone. */
  private checkForHarden(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockId(x, y, z) !== this.blockID || this.blockMaterial !== Material.lava) return;
    const touches =
      w.getBlockMaterial(x, y, z - 1) === Material.water ||
      w.getBlockMaterial(x, y, z + 1) === Material.water ||
      w.getBlockMaterial(x - 1, y, z) === Material.water ||
      w.getBlockMaterial(x + 1, y, z) === Material.water ||
      w.getBlockMaterial(x, y + 1, z) === Material.water;
    if (touches) {
      const m = w.getBlockMetadata(x, y, z);
      if (m === 0) w.setBlock(x, y, z, BlockIds.obsidian);
      else if (m <= 4) w.setBlock(x, y, z, BlockIds.cobblestone);
      this.triggerLavaMixEffects(w, x, y, z);
    }
  }

  protected triggerLavaMixEffects(w: IWorld, x: number, y: number, z: number): void {
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.fizz', 0.5, 2.6 + (w.rand.nextFloat() - w.rand.nextFloat()) * 0.8);
    for (let i = 0; i < 8; i++) w.spawnParticle('largesmoke', x + Math.random(), y + 1.2, z + Math.random(), 0, 0, 0);
  }

  override registerIcons(reg: IconRegister): void {
    this.theIcon =
      this.blockMaterial === Material.lava ? [reg.registerIcon('lava'), reg.registerIcon('lava_flow')] : [reg.registerIcon('water'), reg.registerIcon('water_flow')];
  }

  /** Icon by name, used by item renderers (func_94424_b). */
  static getFluidIcon(name: string): Icon | null {
    const water = Block.blocksList[BlockIds.waterMoving] as BlockFluid;
    const lava = Block.blocksList[BlockIds.lavaMoving] as BlockFluid;
    if (name === 'water') return water.theIcon[0];
    if (name === 'water_flow') return water.theIcon[1];
    if (name === 'lava') return lava.theIcon[0];
    return name === 'lava_flow' ? lava.theIcon[1] : null;
  }
}

