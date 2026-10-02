import { noteHarvest } from './HarvestModifiers';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { ColorizerFoliage } from '../world/biome/Colorizer';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { BlockLeavesBase } from './BlockLeavesBase';
import { Material } from './Material';

/** Leaves: meta & 3 = type, bit 4 = no decay (player placed), bit 8 = check decay. */
export class BlockLeaves extends BlockLeavesBase {
  static readonly LEAF_TYPES = ['oak', 'spruce', 'birch', 'jungle'];
  static readonly textureNames = [
    ['leaves', 'leaves_spruce', 'leaves', 'leaves_jungle'],
    ['leaves_opaque', 'leaves_spruce_opaque', 'leaves_opaque', 'leaves_jungle_opaque'],
  ];
  /** 0 = fancy textures, 1 = fast (opaque) textures. */
  private iconSet = 0;
  private iconArray: (Icon | null)[][] = [[], []];
  private adjacentTreeBlocks: Int32Array | null = null;

  constructor(id: number) {
    super(id, Material.leaves, false);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabDecorations);
  }

  override getBlockColor(): number {
    return ColorizerFoliage.getFoliageColor(0.5, 1.0);
  }

  override getRenderColor(meta: number): number {
    if ((meta & 3) === 1) return ColorizerFoliage.getFoliageColorPine();
    return (meta & 3) === 2 ? ColorizerFoliage.getFoliageColorBirch() : ColorizerFoliage.getFoliageColorBasic();
  }

  override colorMultiplier(w: IBlockAccess, x: number, y: number, z: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 3) === 1) return ColorizerFoliage.getFoliageColorPine();
    if ((meta & 3) === 2) return ColorizerFoliage.getFoliageColorBirch();
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = w.getBiomeGenForCoords(x + dx, z + dz).getBiomeFoliageColor();
        r += (c & 0xff0000) >> 16;
        g += (c & 0xff00) >> 8;
        b += c & 0xff;
      }
    }
    return ((((r / 9) | 0) & 255) << 16) | ((((g / 9) | 0) & 255) << 8) | (((b / 9) | 0) & 255);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, _id: number, _meta: number): void {
    const r = 1;
    const k = r + 1;
    if (!w.checkChunksExist(x - k, y - k, z - k, x + k, y + k, z + k)) return;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (w.getBlockId(x + dx, y + dy, z + dz) === BlockIds.leaves) {
            const m = w.getBlockMetadata(x + dx, y + dy, z + dz);
            w.setBlockMetadataWithNotify(x + dx, y + dy, z + dz, m | 8, 4);
          }
        }
      }
    }
  }

  /** Leaf decay: leaves more than 4 steps (through leaves) from a log disappear. */
  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0 || (meta & 4) !== 0) return;
    const r = 4;
    const k = r + 1;
    const size = 32;
    const sq = size * size;
    const half = size / 2;
    const a = (this.adjacentTreeBlocks ??= new Int32Array(size * size * size));
    const idx = (dx: number, dy: number, dz: number) => (dx + half) * sq + (dy + half) * size + dz + half;
    if (w.checkChunksExist(x - k, y - k, z - k, x + k, y + k, z + k)) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            const id = w.getBlockId(x + dx, y + dy, z + dz);
            a[idx(dx, dy, dz)] = id === BlockIds.wood ? 0 : id === BlockIds.leaves ? -2 : -1;
          }
        }
      }
      for (let step = 1; step <= 4; step++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              if (a[idx(dx, dy, dz)] !== step - 1) continue;
              if (a[idx(dx - 1, dy, dz)] === -2) a[idx(dx - 1, dy, dz)] = step;
              if (a[idx(dx + 1, dy, dz)] === -2) a[idx(dx + 1, dy, dz)] = step;
              if (a[idx(dx, dy - 1, dz)] === -2) a[idx(dx, dy - 1, dz)] = step;
              if (a[idx(dx, dy + 1, dz)] === -2) a[idx(dx, dy + 1, dz)] = step;
              if (a[idx(dx, dy, dz - 1)] === -2) a[idx(dx, dy, dz - 1)] = step;
              if (a[idx(dx, dy, dz + 1)] === -2) a[idx(dx, dy, dz + 1)] = step;
            }
          }
        }
      }
    }
    if (a[idx(0, 0, 0)] >= 0) w.setBlockMetadataWithNotify(x, y, z, meta & -9, 4);
    else this.removeLeaves(w, x, y, z);
  }

  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (w.canLightningStrikeAt(x, y + 1, z) && !w.doesBlockHaveSolidTopSurface(x, y - 1, z) && rand.nextInt(15) === 1) {
      w.spawnParticle('dripWater', x + rand.nextFloat(), y - 0.05, z + rand.nextFloat(), 0, 0, 0);
    }
  }

  private removeLeaves(w: IWorld, x: number, y: number, z: number): void {
    this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
    w.setBlockToAir(x, y, z);
  }

  override quantityDropped(rand: JavaRandom): number {
    return rand.nextInt(20) === 0 ? 1 : 0;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.sapling;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, _chance: number, fortune: number): void {
    if (w.isRemote) return;
    let n = (meta & 3) === 3 ? 40 : 20;
    if (fortune > 0) {
      n -= 2 << fortune;
      if (n < 10) n = 10;
    }
    if (w.rand.nextInt(n) === 0) {
      this.dropBlockAsItem_do(w, x, y, z, new ItemStack(this.idDropped(meta, w.rand, fortune), 1, this.damageDropped(meta)));
    }
    n = 200;
    if (fortune > 0) {
      n -= 10 << fortune;
      if (n < 40) n = 40;
    }
    if ((meta & 3) === 0 && w.rand.nextInt(n) === 0) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(ItemIds.appleRed, 1, 0));
  }

  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    const held = p.getCurrentEquippedItem();
    if (!w.isRemote && held && held.itemID === ItemIds.shears) {
      noteHarvest(p, this.blockID, false);
      this.dropBlockAsItem_do(w, x, y, z, new ItemStack(BlockIds.leaves, 1, meta & 3));
    } else {
      super.harvestBlock(w, p, x, y, z, meta);
    }
  }

  override damageDropped(meta: number): number {
    return meta & 3;
  }

  /** Mirrors the original: !graphicsLevel (also evaluated during construction, see Block). */
  override isOpaqueCube(): boolean {
    return !this.graphicsLevel;
  }

  override getIcon(_side: number, meta: number): Icon | null {
    const set = this.iconArray[this.iconSet];
    if ((meta & 3) === 1) return set[1];
    return (meta & 3) === 3 ? set[3] : set[0];
  }

  /** Called when the graphics setting changes (RenderGlobal.loadRenderers). */
  setGraphicsLevel(fancy: boolean): void {
    this.graphicsLevel = fancy;
    this.iconSet = fancy ? 0 : 1;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return new ItemStack(this.blockID, 1, meta & 3);
  }

  override registerIcons(reg: IconRegister): void {
    for (let s = 0; s < 2; s++) this.iconArray[s] = BlockLeaves.textureNames[s].map((n) => reg.registerIcon(n));
  }
}
