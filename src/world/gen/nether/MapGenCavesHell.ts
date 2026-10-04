import { BlockIds } from '../../../block/BlockIds';
import { MathHelper } from '../../../core/MathHelper';
import { MapGenCaves } from '../MapGenCaves';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * MapGenCavesHell: the Nether's tunnels. They walk like the overworld's, but are rarer and
 * flatter (half the vertical radius), start anywhere below 128, carve netherrack (and dirt or
 * grass) into plain air without lava floors, and stop wherever they would touch lava.
 */
export class MapGenCavesHell extends MapGenCaves {
  protected override generateLargeCaveNode(seed: bigint, cx: number, cz: number, blocks: Uint8Array, x: number, y: number, z: number): void {
    this.generateCaveNode(seed, cx, cz, blocks, x, y, z, f(1 + f(this.rand.nextFloat() * 6)), 0, 0, -1, -1, 0.5);
  }

  /** Clears the ellipsoid unless lava is in or around it; returns whether it carved. */
  protected override carve(cx: number, cz: number, blocks: Uint8Array, x: number, y: number, z: number, radH: number, radV: number): boolean {
    let minX = MathHelper.floor_double(x - radH) - cx * 16 - 1;
    let maxX = MathHelper.floor_double(x + radH) - cx * 16 + 1;
    let minY = MathHelper.floor_double(y - radV) - 1;
    let maxY = MathHelper.floor_double(y + radV) + 1;
    let minZ = MathHelper.floor_double(z - radH) - cz * 16 - 1;
    let maxZ = MathHelper.floor_double(z + radH) - cz * 16 + 1;
    if (minX < 0) minX = 0;
    if (maxX > 16) maxX = 16;
    if (minY < 1) minY = 1;
    if (maxY > 120) maxY = 120;
    if (minZ < 0) minZ = 0;
    if (maxZ > 16) maxZ = 16;
    // The shell of the box (and one layer below and above) is checked for lava.
    for (let xx = minX; xx < maxX; xx++) {
      for (let zz = minZ; zz < maxZ; zz++) {
        for (let yy = maxY + 1; yy >= minY - 1; yy--) {
          if (yy < 0 || yy >= 128) continue;
          const id = blocks[(xx * 16 + zz) * 128 + yy];
          if (id === BlockIds.lavaMoving || id === BlockIds.lavaStill) return false;
          if (yy !== minY - 1 && xx !== minX && xx !== maxX - 1 && zz !== minZ && zz !== maxZ - 1) yy = minY;
        }
      }
    }
    for (let xx = minX; xx < maxX; xx++) {
      const nx = (xx + cx * 16 + 0.5 - x) / radH;
      for (let zz = minZ; zz < maxZ; zz++) {
        const nz = (zz + cz * 16 + 0.5 - z) / radH;
        // As in the original, the block written is one above the position tested.
        let idx = (xx * 16 + zz) * 128 + maxY;
        for (let yy = maxY - 1; yy >= minY; yy--) {
          const ny = (yy + 0.5 - y) / radV;
          if (ny > -0.7 && nx * nx + ny * ny + nz * nz < 1) {
            const id = blocks[idx];
            if (id === BlockIds.netherrack || id === BlockIds.dirt || id === BlockIds.grass) blocks[idx] = 0;
          }
          idx--;
        }
      }
    }
    return true;
  }

  protected override recursiveGenerate(x: number, z: number, cx: number, cz: number, blocks: Uint8Array | null): void {
    if (!blocks) return;
    const rand = this.rand;
    let n = rand.nextInt(rand.nextInt(rand.nextInt(10) + 1) + 1);
    if (rand.nextInt(5) !== 0) n = 0;
    for (let i = 0; i < n; i++) {
      const px = x * 16 + rand.nextInt(16);
      const py = rand.nextInt(128);
      const pz = z * 16 + rand.nextInt(16);
      let tunnels = 1;
      if (rand.nextInt(4) === 0) {
        this.generateLargeCaveNode(rand.nextLong(), cx, cz, blocks, px, py, pz);
        tunnels += rand.nextInt(4);
      }
      for (let j = 0; j < tunnels; j++) {
        const yaw = f(f(rand.nextFloat() * PI_F) * 2);
        const pitch = f(f(f(rand.nextFloat() - 0.5) * 2) / 8);
        const width = f(f(rand.nextFloat() * 2) + rand.nextFloat());
        this.generateCaveNode(rand.nextLong(), cx, cz, blocks, px, py, pz, f(width * 2), yaw, pitch, 0, 0, 0.5);
      }
    }
  }
}
