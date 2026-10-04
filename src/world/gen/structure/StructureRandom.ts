import { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { Long64 } from '../Long64';

const A = Long64.split(341873128712n);
const B = Long64.split(132897987541n);
const shared = new JavaRandom(0n);
let lastSeed: bigint | null = null;
let seedH = 0;
let seedL = 0;

/**
 * World.setRandomSeed: the world's Random reseeded with
 * x * 341873128712 + z * 132897987541 + worldSeed + salt (one shared instance, as in the original).
 */
export function worldRandomSeed(worldSeed: bigint, x: number, z: number, salt: number): JavaRandom {
  if (worldSeed !== lastSeed) {
    lastSeed = worldSeed;
    [seedH, seedL] = Long64.split(worldSeed);
  }
  Long64.mul(x >> 31, x | 0, A[0], A[1]);
  const xh = Long64.hi;
  const xl = Long64.lo;
  Long64.mul(z >> 31, z | 0, B[0], B[1]);
  Long64.add(xh, xl, Long64.hi, Long64.lo);
  Long64.add(Long64.hi, Long64.lo, seedH, seedL);
  Long64.add(Long64.hi, Long64.lo, salt >> 31, salt | 0);
  shared.setSeedHiLo(Long64.hi, Long64.lo);
  return shared;
}

/** WorldProvider.getAverageGroundLevel of the world being generated (64, or 4 for superflat). */
export function averageGroundLevel(w: IWorld): number {
  return (w as IWorld & { averageGroundLevel?: number }).averageGroundLevel ?? 64;
}
