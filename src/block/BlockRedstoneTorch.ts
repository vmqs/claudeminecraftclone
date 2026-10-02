import type { JavaRandom } from '../core/JavaRandom';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockTorch } from './BlockTorch';

interface RedstoneUpdateInfo {
  x: number;
  y: number;
  z: number;
  updateTime: number;
}

/**
 * Redstone torches (75 off, 76 on): a torch that inverts the power of the block it is on.
 * The inversion needs redstone (out of scope), so torches stay as placed.
 */
export class BlockRedstoneTorch extends BlockTorch {
  private static readonly redstoneUpdateInfoCache = new WeakMap<IWorld, RedstoneUpdateInfo[]>();

  constructor(
    id: number,
    private readonly torchActive: boolean,
  ) {
    super(id);
    this.setTickRandomly(true);
    this.setCreativeTab(null);
  }

  /** Burns out after 8 toggles within 60 ticks. */
  private checkForBurnout(w: IWorld, x: number, y: number, z: number, add: boolean): boolean {
    let list = BlockRedstoneTorch.redstoneUpdateInfoCache.get(w);
    if (!list) BlockRedstoneTorch.redstoneUpdateInfoCache.set(w, (list = []));
    if (add) list.push({ x, y, z, updateTime: w.getTotalWorldTime() });
    let n = 0;
    for (const u of list) if (u.x === x && u.y === y && u.z === z && ++n >= 8) return true;
    return false;
  }

  override tickRate(_w: IWorld): number {
    return 2;
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockMetadata(x, y, z) === 0) super.onBlockAdded(w, x, y, z);
    if (this.torchActive) this.notifyAll(w, x, y, z);
  }

  private notifyAll(w: IWorld, x: number, y: number, z: number): void {
    w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, _id: number, _meta: number): void {
    if (this.torchActive) this.notifyAll(w, x, y, z);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    if (!this.torchActive) return 0;
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta === 5 && side === 1) || (meta === 3 && side === 3) || (meta === 4 && side === 2) || (meta === 1 && side === 5) || (meta === 2 && side === 4)) return 0;
    return 15;
  }

  /** Whether the block it is attached to is powered. */
  private isIndirectlyPowered(w: IWorld, x: number, y: number, z: number): boolean {
    const out = w.getIndirectPowerOutput;
    if (!out) return false;
    const meta = w.getBlockMetadata(x, y, z);
    if (meta === 5 && out.call(w, x, y - 1, z, 0)) return true;
    if (meta === 3 && out.call(w, x, y, z - 1, 2)) return true;
    if (meta === 4 && out.call(w, x, y, z + 1, 3)) return true;
    if (meta === 1 && out.call(w, x - 1, y, z, 4)) return true;
    return meta === 2 && out.call(w, x + 1, y, z, 5);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (!Block.hasRedstone(w)) return;
    const powered = this.isIndirectlyPowered(w, x, y, z);
    const list = BlockRedstoneTorch.redstoneUpdateInfoCache.get(w);
    while (list && list.length > 0 && w.getTotalWorldTime() - list[0].updateTime > 60) list.shift();
    if (this.torchActive) {
      if (powered) {
        w.setBlock(x, y, z, BlockIds.torchRedstoneIdle, w.getBlockMetadata(x, y, z), 3);
        if (this.checkForBurnout(w, x, y, z, true)) {
          const f = Math.fround;
          w.playSoundEffect(f(x + 0.5), f(y + 0.5), f(z + 0.5), 'random.fizz', 0.5, 2.6 + (w.rand.nextFloat() - w.rand.nextFloat()) * 0.8);
          for (let i = 0; i < 5; i++) w.spawnParticle('smoke', x + rand.nextDouble() * 0.6 + 0.2, y + rand.nextDouble() * 0.6 + 0.2, z + rand.nextDouble() * 0.6 + 0.2, 0, 0, 0);
        }
      }
    } else if (!powered && !this.checkForBurnout(w, x, y, z, false)) {
      w.setBlock(x, y, z, BlockIds.torchRedstoneActive, w.getBlockMetadata(x, y, z), 3);
    }
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (this.checkTorchAttachment(w, x, y, z, id)) return;
    if (!Block.hasRedstone(w)) return;
    const powered = this.isIndirectlyPowered(w, x, y, z);
    if ((this.torchActive && powered) || (!this.torchActive && !powered)) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    return side === 0 ? this.isProvidingWeakPower(w, x, y, z, side) : 0;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.torchRedstoneActive;
  }

  override canProvidePower(): boolean {
    return true;
  }

  /** Red dust instead of flames, only when lit. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (!this.torchActive) return;
    const f = Math.fround;
    const meta = w.getBlockMetadata(x, y, z);
    const px = f(x + 0.5) + f(rand.nextFloat() - 0.5) * 0.2;
    const py = f(y + 0.7) + f(rand.nextFloat() - 0.5) * 0.2;
    const pz = f(z + 0.5) + f(rand.nextFloat() - 0.5) * 0.2;
    const up = f(0.22);
    const off = f(0.27);
    if (meta === 1) w.spawnParticle('reddust', px - off, py + up, pz, 0, 0, 0);
    else if (meta === 2) w.spawnParticle('reddust', px + off, py + up, pz, 0, 0, 0);
    else if (meta === 3) w.spawnParticle('reddust', px, py + up, pz - off, 0, 0, 0);
    else if (meta === 4) w.spawnParticle('reddust', px, py + up, pz + off, 0, 0, 0);
    else w.spawnParticle('reddust', px, py, pz, 0, 0, 0);
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return BlockIds.torchRedstoneActive;
  }

  override isAssociatedBlockID(id: number): boolean {
    return id === BlockIds.torchRedstoneIdle || id === BlockIds.torchRedstoneActive;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.torchActive ? 'redtorch_lit' : 'redtorch');
  }
}
