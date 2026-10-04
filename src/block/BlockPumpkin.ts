import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { Block } from './Block';
import { BlockDirectional } from './BlockDirectional';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Pumpkin (86) and jack-o'-lantern (91). Meta 0-3 is the face (0 south, 1 west, 2 north,
 * 3 east), set from the placer's yaw. Placed on two snow blocks it builds a snow golem; on a
 * T of iron blocks an iron golem.
 */
export class BlockPumpkin extends BlockDirectional {
  private iconTop: Icon | null = null;
  private iconFace: Icon | null = null;

  constructor(
    id: number,
    private readonly lit: boolean,
  ) {
    super(id, Material.pumpkin);
    this.setTickRandomly(true);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 1 || side === 0) return this.iconTop;
    if (meta === 2 && side === 2) return this.iconFace;
    if (meta === 3 && side === 5) return this.iconFace;
    if (meta === 0 && side === 3) return this.iconFace;
    return meta === 1 && side === 4 ? this.iconFace : this.blockIcon;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    const snow = BlockIds.blockSnow;
    const iron = BlockIds.blockIron;
    if (w.getBlockId(x, y - 1, z) === snow && w.getBlockId(x, y - 2, z) === snow) {
      if (!w.isRemote) {
        w.setBlock(x, y, z, 0, 0, 2);
        w.setBlock(x, y - 1, z, 0, 0, 2);
        w.setBlock(x, y - 2, z, 0, 0, 2);
        const golem = EntityList.createEntityByName('SnowMan', w as unknown as World);
        if (golem) {
          golem.setLocationAndAngles(x + 0.5, y - 1.95, z + 0.5, 0, 0);
          w.spawnEntityInWorld(golem);
        }
        w.notifyBlocksOfNeighborChange(x, y, z, 0);
        w.notifyBlocksOfNeighborChange(x, y - 1, z, 0);
        w.notifyBlocksOfNeighborChange(x, y - 2, z, 0);
      }
      for (let i = 0; i < 120; i++) w.spawnParticle('snowshovel', x + w.rand.nextDouble(), y - 2 + w.rand.nextDouble() * 2.5, z + w.rand.nextDouble(), 0, 0, 0);
    } else if (w.getBlockId(x, y - 1, z) === iron && w.getBlockId(x, y - 2, z) === iron) {
      const alongX = w.getBlockId(x - 1, y - 1, z) === iron && w.getBlockId(x + 1, y - 1, z) === iron;
      const alongZ = w.getBlockId(x, y - 1, z - 1) === iron && w.getBlockId(x, y - 1, z + 1) === iron;
      if (!alongX && !alongZ) return;
      w.setBlock(x, y, z, 0, 0, 2);
      w.setBlock(x, y - 1, z, 0, 0, 2);
      w.setBlock(x, y - 2, z, 0, 0, 2);
      if (alongX) {
        w.setBlock(x - 1, y - 1, z, 0, 0, 2);
        w.setBlock(x + 1, y - 1, z, 0, 0, 2);
      } else {
        w.setBlock(x, y - 1, z - 1, 0, 0, 2);
        w.setBlock(x, y - 1, z + 1, 0, 0, 2);
      }
      const golem = EntityList.createEntityByName('VillagerGolem', w as unknown as World);
      if (golem) {
        (golem as unknown as { setPlayerCreated?: (v: boolean) => void }).setPlayerCreated?.(true);
        golem.setLocationAndAngles(x + 0.5, y - 1.95, z + 0.5, 0, 0);
        w.spawnEntityInWorld(golem);
      }
      for (let i = 0; i < 120; i++) w.spawnParticle('snowballpoof', x + w.rand.nextDouble(), y - 2 + w.rand.nextDouble() * 3.9, z + w.rand.nextDouble(), 0, 0, 0);
      w.notifyBlocksOfNeighborChange(x, y, z, 0);
      w.notifyBlocksOfNeighborChange(x, y - 1, z, 0);
      w.notifyBlocksOfNeighborChange(x, y - 2, z, 0);
      if (alongX) {
        w.notifyBlocksOfNeighborChange(x - 1, y - 1, z, 0);
        w.notifyBlocksOfNeighborChange(x + 1, y - 1, z, 0);
      } else {
        w.notifyBlocksOfNeighborChange(x, y - 1, z - 1, 0);
        w.notifyBlocksOfNeighborChange(x, y - 1, z + 1, 0);
      }
    }
  }

  /** Needs a solid top surface below (pumpkins cannot float). */
  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    return (id === 0 || Block.blocksList[id]!.blockMaterial.isReplaceable()) && w.doesBlockHaveSolidTopSurface(x, y - 1, z);
  }

  /** The face looks back at the placer. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, Block.yawToDirection(e, 2.5), 2);
  }

  override registerIcons(reg: IconRegister): void {
    this.iconFace = reg.registerIcon(this.lit ? 'pumpkin_jack' : 'pumpkin_face');
    this.iconTop = reg.registerIcon('pumpkin_top');
    this.blockIcon = reg.registerIcon('pumpkin_side');
  }
}
