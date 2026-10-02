import type { JavaRandom } from '../core/JavaRandom';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { BlockFluid } from './BlockFluid';
import { Material } from './Material';

/** Flowing water (8) / lava (10): spreads, then turns into the stationary block (id + 1). */
export class BlockFlowing extends BlockFluid {
  private numAdjacentSources = 0;
  private isOptimalFlowDirection = [false, false, false, false];
  private flowCost = [0, 0, 0, 0];

  private updateFlow(w: IWorld, x: number, y: number, z: number): void {
    const m = w.getBlockMetadata(x, y, z);
    w.setBlock(x, y, z, this.blockID + 1, m, 2);
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    let decay = this.getFlowDecay(w, x, y, z);
    let step = 1;
    if (this.blockMaterial === Material.lava && !w.provider.isHellWorld) step = 2;
    let changed = true;
    if (decay > 0) {
      let smallest = -100;
      this.numAdjacentSources = 0;
      smallest = this.getSmallestFlowDecay(w, x - 1, y, z, smallest);
      smallest = this.getSmallestFlowDecay(w, x + 1, y, z, smallest);
      smallest = this.getSmallestFlowDecay(w, x, y, z - 1, smallest);
      smallest = this.getSmallestFlowDecay(w, x, y, z + 1, smallest);
      let next = smallest + step;
      if (next >= 8 || smallest < 0) next = -1;
      if (this.getFlowDecay(w, x, y + 1, z) >= 0) {
        const above = this.getFlowDecay(w, x, y + 1, z);
        next = above >= 8 ? above : above + 8;
      }
      if (this.numAdjacentSources >= 2 && this.blockMaterial === Material.water) {
        if (w.getBlockMaterial(x, y - 1, z).isSolid()) next = 0;
        else if (w.getBlockMaterial(x, y - 1, z) === this.blockMaterial && w.getBlockMetadata(x, y - 1, z) === 0) next = 0;
      }
      if (this.blockMaterial === Material.lava && decay < 8 && next < 8 && next > decay && rand.nextInt(4) !== 0) {
        next = decay;
        changed = false;
      }
      if (next === decay) {
        if (changed) this.updateFlow(w, x, y, z);
      } else {
        decay = next;
        if (next < 0) {
          w.setBlockToAir(x, y, z);
        } else {
          w.setBlockMetadataWithNotify(x, y, z, next, 2);
          w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
          w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
        }
      }
    } else {
      this.updateFlow(w, x, y, z);
    }

    if (this.liquidCanDisplaceBlock(w, x, y - 1, z)) {
      if (this.blockMaterial === Material.lava && w.getBlockMaterial(x, y - 1, z) === Material.water) {
        w.setBlock(x, y - 1, z, BlockIds.stone);
        this.triggerLavaMixEffects(w, x, y - 1, z);
        return;
      }
      this.flowIntoBlock(w, x, y - 1, z, decay >= 8 ? decay : decay + 8);
    } else if (decay >= 0 && (decay === 0 || this.blockBlocksFlow(w, x, y - 1, z))) {
      const dirs = this.getOptimalFlowDirections(w, x, y, z);
      let spread = decay + step;
      if (decay >= 8) spread = 1;
      if (spread >= 8) return;
      if (dirs[0]) this.flowIntoBlock(w, x - 1, y, z, spread);
      if (dirs[1]) this.flowIntoBlock(w, x + 1, y, z, spread);
      if (dirs[2]) this.flowIntoBlock(w, x, y, z - 1, spread);
      if (dirs[3]) this.flowIntoBlock(w, x, y, z + 1, spread);
    }
  }

  private flowIntoBlock(w: IWorld, x: number, y: number, z: number, decay: number): void {
    if (!this.liquidCanDisplaceBlock(w, x, y, z)) return;
    const id = w.getBlockId(x, y, z);
    if (id > 0) {
      if (this.blockMaterial === Material.lava) this.triggerLavaMixEffects(w, x, y, z);
      else Block.blocksList[id]!.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
    }
    w.setBlock(x, y, z, this.blockID, decay, 3);
  }

  private calculateFlowCost(w: IWorld, x: number, y: number, z: number, depth: number, from: number): number {
    let best = 1000;
    for (let i = 0; i < 4; i++) {
      if ((i === 0 && from === 1) || (i === 1 && from === 0) || (i === 2 && from === 3) || (i === 3 && from === 2)) continue;
      let nx = x;
      let nz = z;
      if (i === 0) nx = x - 1;
      if (i === 1) nx++;
      if (i === 2) nz = z - 1;
      if (i === 3) nz++;
      if (!this.blockBlocksFlow(w, nx, y, nz) && (w.getBlockMaterial(nx, y, nz) !== this.blockMaterial || w.getBlockMetadata(nx, y, nz) !== 0)) {
        if (!this.blockBlocksFlow(w, nx, y - 1, nz)) return depth;
        if (depth < 4) {
          const c = this.calculateFlowCost(w, nx, y, nz, depth + 1, i);
          if (c < best) best = c;
        }
      }
    }
    return best;
  }

  private getOptimalFlowDirections(w: IWorld, x: number, y: number, z: number): boolean[] {
    for (let i = 0; i < 4; i++) {
      this.flowCost[i] = 1000;
      let nx = x;
      let nz = z;
      if (i === 0) nx = x - 1;
      if (i === 1) nx++;
      if (i === 2) nz = z - 1;
      if (i === 3) nz++;
      if (!this.blockBlocksFlow(w, nx, y, nz) && (w.getBlockMaterial(nx, y, nz) !== this.blockMaterial || w.getBlockMetadata(nx, y, nz) !== 0)) {
        this.flowCost[i] = this.blockBlocksFlow(w, nx, y - 1, nz) ? this.calculateFlowCost(w, nx, y, nz, 1, i) : 0;
      }
    }
    let min = this.flowCost[0];
    for (let i = 1; i < 4; i++) if (this.flowCost[i] < min) min = this.flowCost[i];
    for (let i = 0; i < 4; i++) this.isOptimalFlowDirection[i] = this.flowCost[i] === min;
    return this.isOptimalFlowDirection;
  }

  private blockBlocksFlow(w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    if (id === BlockIds.doorWood || id === BlockIds.doorIron || id === BlockIds.signPost || id === BlockIds.ladder || id === BlockIds.reed) return true;
    if (id === 0) return false;
    const m = Block.blocksList[id]!.blockMaterial;
    return m === Material.portal ? true : m.blocksMovement();
  }

  protected getSmallestFlowDecay(w: IWorld, x: number, y: number, z: number, current: number): number {
    let d = this.getFlowDecay(w, x, y, z);
    if (d < 0) return current;
    if (d === 0) this.numAdjacentSources++;
    if (d >= 8) d = 0;
    return current >= 0 && d >= current ? current : d;
  }

  private liquidCanDisplaceBlock(w: IWorld, x: number, y: number, z: number): boolean {
    const m = w.getBlockMaterial(x, y, z);
    if (m === this.blockMaterial) return false;
    return m === Material.lava ? false : !this.blockBlocksFlow(w, x, y, z);
  }

  override onBlockAdded(w: IWorld, x: number, y: number, z: number): void {
    super.onBlockAdded(w, x, y, z);
    if (w.getBlockId(x, y, z) === this.blockID) w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
  }

  override isUpdateTickImmediate(): boolean {
    return false;
  }
}
