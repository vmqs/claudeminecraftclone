/**
 * A small in-memory World for the dynamics checks: flat chunks (bedrock, dirt, dirt, grass by
 * default), plains biome, a stand-in player so random ticks run around (0, 0), no mob spawning.
 */
import '../src/block/Blocks';
import { Block } from '../src/block/Block';
import { BlockIds as B } from '../src/block/BlockIds';
import { Chunk } from '../src/world/Chunk';
import { ChunkSection } from '../src/world/ChunkSection';
import { World, WorldInfo } from '../src/world/World';

export function makeWorld(radius = 2, layers: number[] = [B.bedrock, B.dirt, B.dirt, B.grass], biome = 1): World {
  const info = new WorldInfo();
  info.terrainType = 'flat';
  const w = new World(info);
  w.mobSpawner = null;
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const c = new Chunk(w, cx, cz);
      const s = new ChunkSection(0);
      for (let y = 0; y < layers.length; y++) for (let i = 0; i < 256; i++) s.blocks[(y << 8) | i] = layers[y];
      s.recount();
      c.sections[0] = s;
      c.biomes.fill(biome);
      c.generateSkylightMap();
      w.addChunk(c);
    }
  }
  return w;
}

/** A stand-in for the player so the world ticks random blocks around (x, z). */
export function addFakePlayer(w: World, x = 0, y = 4, z = 0): void {
  const p = { posX: x + 0.5, posY: y, posZ: z + 0.5, isPlayerEntity: true, getDistanceSq: () => 1e9 };
  (w.playerEntities as unknown[]).push(p);
}

/** Runs the world's scheduled updates (and random ticks when a player stand-in exists). */
export function tick(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.tick();
}

export function blockName(id: number): string {
  return Block.blocksList[id]?.getUnlocalizedName() ?? String(id);
}

/** Prints a horizontal slice (ids as one char each) for debugging. */
export function slice(w: World, y: number, x0: number, x1: number, z0: number, z1: number, chr: (id: number, meta: number) => string): string {
  const rows: string[] = [];
  for (let z = z0; z <= z1; z++) {
    let row = '';
    for (let x = x0; x <= x1; x++) row += chr(w.getBlockId(x, y, z), w.getBlockMetadata(x, y, z));
    rows.push(row);
  }
  return rows.join('\n');
}
