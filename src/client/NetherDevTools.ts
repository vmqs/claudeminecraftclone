import { Biomes } from '../world/biome/BiomeGenBase';
import { EnumCreatureType } from '../world/biome/SpawnListEntry';
import { SingleBiomeSource } from '../world/gen/ChunkProviderFlat';
import { MapGenNetherBridge } from '../world/gen/nether/MapGenNetherBridge';
import { netherBridgePieceName } from '../world/gen/nether/NetherBridgePieces';
import { PossibleCreatures } from '../world/PossibleCreatures';
import type { Minecraft } from './Minecraft';

/** A fortress piece as the helpers report it. */
export interface FortressPieceInfo {
  kind: string;
  facing: number;
  box: [number, number, number, number, number, number];
  centre: [number, number, number];
}

/**
 * Nether helpers on `mc.dev.nether` (scripts/scenarios/nether.json): the fortresses of the world's
 * seed (recomputed like the main thread's spawner does) and the spawn list at a position.
 */
export class NetherDevTools {
  private seed: bigint | null = null;
  private bridges = new MapGenNetherBridge();
  private readonly biomeSource = new SingleBiomeSource(Biomes.hell);

  constructor(private readonly mc: Minecraft) {}

  private generator(): MapGenNetherBridge {
    const s = this.mc.theWorld?.getSeed() ?? 0n;
    if (s !== this.seed) {
      this.seed = s;
      this.bridges = new MapGenNetherBridge();
    }
    return this.bridges;
  }

  /** Every fortress whose start lies within `radius` chunks of (x, z) (default: the player). */
  fortresses(radius = 16, x?: number, z?: number): { start: [number, number]; pieces: number; box: number[] }[] {
    const g = this.generator();
    const px = Math.floor(x ?? this.mc.thePlayer?.posX ?? 0) >> 4;
    const pz = Math.floor(z ?? this.mc.thePlayer?.posZ ?? 0) >> 4;
    const ctx = { seed: this.seed!, biomeSource: this.biomeSource };
    for (let cx = px - radius; cx <= px + radius; cx += 8) for (let cz = pz - radius; cz <= pz + radius; cz += 8) g.generate(ctx, cx, cz, null);
    const out: { start: [number, number]; pieces: number; box: number[] }[] = [];
    for (const s of g.structureMap.values()) {
      const b = s.getBoundingBox();
      const first = s.components[0].getBoundingBox();
      if (Math.abs((first.minX >> 4) - px) > radius || Math.abs((first.minZ >> 4) - pz) > radius) continue;
      out.push({ start: [first.minX >> 4, first.minZ >> 4], pieces: s.components.length, box: [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ] });
    }
    return out;
  }

  /** The fortress pieces of a kind ('Throne', 'Entrance', 'NetherStalkRoom', 'Crossing3'...) nearest to the player first. */
  pieces(kind?: string, radius = 16): FortressPieceInfo[] {
    this.fortresses(radius);
    const p = this.mc.thePlayer;
    const out: FortressPieceInfo[] = [];
    for (const s of this.generator().structureMap.values()) {
      for (const c of s.components) {
        const name = netherBridgePieceName(c);
        if (kind && name !== kind) continue;
        const b = c.getBoundingBox();
        out.push({ kind: name, facing: c.coordBaseMode, box: [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ], centre: c.getCenter() });
      }
    }
    const d = (i: FortressPieceInfo) => (p ? (i.centre[0] - p.posX) ** 2 + (i.centre[2] - p.posZ) ** 2 : 0);
    return out.sort((a, b) => d(a) - d(b));
  }

  /** Whether (x, y, z) is inside a fortress piece (what makes the spawner use the fortress list). */
  isInFortress(x: number, y: number, z: number): boolean {
    this.generator();
    return this.bridges.isInFortress({ seed: this.seed!, biomeSource: this.biomeSource }, Math.floor(x), Math.floor(y), Math.floor(z));
  }

  /** The monster spawn list the world's spawner uses at (x, y, z). */
  spawnList(x: number, y: number, z: number): string[] {
    const w = this.mc.theWorld;
    if (!w) return [];
    const list = PossibleCreatures.get(w, EnumCreatureType.monster, Math.floor(x), Math.floor(y), Math.floor(z)) ?? w.getBiomeGenForCoords(Math.floor(x), Math.floor(z)).getSpawnableList(EnumCreatureType.monster);
    return list.map((e) => e.entityName);
  }
}
