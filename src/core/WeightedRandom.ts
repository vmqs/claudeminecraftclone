import type { JavaRandom } from './JavaRandom';

/** An entry chosen with probability weight / total weight (WeightedRandomItem). */
export interface WeightedRandomItem {
  readonly itemWeight: number;
}

function getTotalWeight(items: readonly WeightedRandomItem[]): number {
  let total = 0;
  for (const i of items) total += i.itemWeight;
  return total;
}

/** WeightedRandom: one nextInt(totalWeight) roll walked down the list. */
export const WeightedRandom = {
  getTotalWeight,

  getRandomItem<T extends WeightedRandomItem>(rand: JavaRandom, items: readonly T[], total: number = getTotalWeight(items)): T | null {
    if (total <= 0) throw new Error('WeightedRandom: total weight must be positive');
    let r = rand.nextInt(total);
    for (const i of items) {
      r -= i.itemWeight;
      if (r < 0) return i;
    }
    return null;
  },
};
