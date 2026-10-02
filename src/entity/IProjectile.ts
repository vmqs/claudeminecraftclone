/** Something a dispenser or a mob can launch in a direction (IProjectile). */
export interface IProjectile {
  /** Normalises (x, y, z), adds Gaussian spread scaled by `inaccuracy`, and scales by `velocity`. */
  setThrowableHeading(x: number, y: number, z: number, velocity: number, inaccuracy: number): void;
}
