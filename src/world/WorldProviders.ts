import { WorldProvider } from './WorldProvider';
import { WorldProviderEnd } from './WorldProviderEnd';
import { WorldProviderHell } from './WorldProviderHell';

/** Dimension ids of 1.5.2. */
export const Dimension = {
  NETHER: -1,
  OVERWORLD: 0,
  END: 1,
} as const;

/** The dimensions a world has, in MinecraftServer.worldServers order (overworld, Nether, End). */
export const DIMENSIONS: readonly number[] = [0, -1, 1];

/** WorldProvider.getProviderForDimension: the provider of dimension `id` (null for unknown ids). */
export function getProviderForDimension(id: number): WorldProvider | null {
  if (id === -1) return new WorldProviderHell();
  if (id === 0) return new WorldProvider();
  if (id === 1) return new WorldProviderEnd();
  return null;
}

/** The save folder of a dimension's regions (DimensionManager.getSaveDir: "" for the overworld). */
export function dimensionFolder(id: number): string {
  return id === 0 ? '' : `DIM${id}`;
}
