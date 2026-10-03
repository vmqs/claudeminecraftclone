/** Side indices: 0 down (-Y), 1 up (+Y), 2 north (-Z), 3 south (+Z), 4 west (-X), 5 east (+X). */
export const Facing = {
  oppositeSide: [1, 0, 3, 2, 5, 4] as const,
  offsetsXForSide: [0, 0, 0, 0, -1, 1] as const,
  offsetsYForSide: [-1, 1, 0, 0, 0, 0] as const,
  offsetsZForSide: [0, 0, -1, 1, 0, 0] as const,
  facings: ['DOWN', 'UP', 'NORTH', 'SOUTH', 'WEST', 'EAST'] as const,
};

/** Horizontal directions as used by beds, doors, etc. (0 south, 1 west, 2 north, 3 east). */
export const Direction = {
  offsetX: [0, -1, 0, 1] as const,
  offsetZ: [1, 0, -1, 0] as const,
  directionToFacing: [3, 4, 2, 5] as const,
  facingToDirection: [-1, -1, 2, 0, 1, 3] as const,
  rotateOpposite: [2, 3, 0, 1] as const,
  rotateRight: [1, 2, 3, 0] as const,
  rotateLeft: [3, 0, 1, 2] as const,
  directions: ['SOUTH', 'WEST', 'NORTH', 'EAST'] as const,
  bedDirection: [
    [1, 0, 3, 2, 5, 4],
    [1, 0, 5, 4, 2, 3],
    [1, 0, 2, 3, 4, 5],
    [1, 0, 4, 5, 3, 2],
  ] as const,
  getMovementDirection(dx: number, dz: number): number {
    if (Math.abs(Math.fround(dx)) > Math.abs(Math.fround(dz))) return dx > 0 ? 1 : 3;
    return dz > 0 ? 2 : 0;
  },
};
