import { BlockIds } from '../block/BlockIds';
import type { Minecraft } from './Minecraft';

/**
 * `mc.dev.dims`: the Nether and the End for automation (scripts/scenarios/dimensions.json).
 * state() reports the player's dimension, the loaded worlds and any trip under way;
 * frame(x, y, z, alongX) builds an empty 4x5 obsidian frame with its bottom-left corner at
 * (x, y, z); light(x, y, z) sets fire in it (which lights the portal, as flint and steel does);
 * travel(dim) sends the player through (Entity.travelToDimension); arrived() is true once a trip
 * is over and no screen is open.
 */
export class DimensionDevTools {
  constructor(private readonly mc: Minecraft) {}

  state(): {
    dimension: number | null;
    world: string | null;
    loaded: { dim: number; chunks: number; provider: boolean }[];
    busy: boolean;
    transfers: number;
    pos: [number, number, number] | null;
    timeUntilPortal: number;
    timeInPortal: number;
    screen: string | null;
  } {
    const mc = this.mc;
    const p = mc.thePlayer;
    const m = mc.dimensions;
    return {
      dimension: p?.dimension ?? null,
      world: mc.theWorld?.provider.getDimensionName() ?? null,
      loaded: m ? [...m.dims.values()].map((d) => ({ dim: d.id, chunks: d.world.loadedChunkCount, provider: d.provider !== null })) : [],
      busy: mc.travel.busy,
      transfers: m?.pendingTransfers ?? 0,
      pos: p ? [p.posX, p.posY - p.yOffset, p.posZ] : null,
      timeUntilPortal: p?.timeUntilPortal ?? 0,
      timeInPortal: p?.timeInPortal ?? 0,
      screen: mc.currentScreen?.constructor.name ?? null,
    };
  }

  /** An empty obsidian frame (4 wide, 5 high) in the player's world. */
  frame(x: number, y: number, z: number, alongX = true): void {
    const w = this.mc.theWorld!;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const bx = alongX ? x + i : x;
        const bz = alongX ? z : z + i;
        const edge = i === 0 || i === 3 || j === 0 || j === 4;
        w.setBlock(bx, y + j, bz, edge ? BlockIds.obsidian : 0, 0, 3);
      }
    }
  }

  /** Fire inside the frame's bottom row: BlockFire.onBlockAdded lights the portal. */
  light(x: number, y: number, z: number): boolean {
    const w = this.mc.theWorld!;
    w.setBlock(x, y, z, BlockIds.fire, 0, 3);
    return w.getBlockId(x, y, z) === BlockIds.portal;
  }

  /** Entity.travelToDimension for the player. */
  travel(dim: number): void {
    this.mc.thePlayer?.travelToDimension(dim);
  }

  arrived(): boolean {
    return !this.mc.travel.busy && this.mc.currentScreen === null && this.mc.thePlayer !== null && !this.mc.thePlayer.isDead;
  }

  /** Blocks of `id` within `r` of the player (portal checks). */
  count(id: number, r = 8): number {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return 0;
    const x0 = Math.floor(p.posX);
    const y0 = Math.floor(p.posY);
    const z0 = Math.floor(p.posZ);
    let n = 0;
    for (let x = x0 - r; x <= x0 + r; x++) for (let y = Math.max(0, y0 - r); y <= y0 + r; y++) for (let z = z0 - r; z <= z0 + r; z++) if (w.getBlockId(x, y, z) === id) n++;
    return n;
  }
}
