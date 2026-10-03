import type { Entity } from './Entity';

/**
 * IMob.mobSelector: hostile mobs (monsters, slimes, ghasts...), what iron and snow golems
 * attack. Monster classes mark themselves with Entity.isIMob.
 */
export const mobSelector = (e: Entity): boolean => e.isIMob;
