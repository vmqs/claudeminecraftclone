import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * A quarter-sized crumb of an item icon, drawn from the item atlas: "iconcrack_<id>" (eating,
 * breaking tools, splash potions, eyes of ender), "snowballpoof" and "slime".
 */
export class EntityBreakingFX extends EntityFX {
  /**
   * Without a velocity the crumb keeps the random burst of EntityFX; with one (iconcrack) that
   * burst is damped to a tenth and the velocity is added.
   */
  constructor(w: World, x: number, y: number, z: number, item: Item, vx?: number, vy?: number, vz?: number) {
    super(w, x, y, z, 0, 0, 0);
    this.setParticleIcon(item.getIconFromDamage(0));
    this.particleRed = this.particleGreen = this.particleBlue = 1;
    this.particleGravity = Block.blocksList[BlockIds.blockSnow]?.blockParticleGravity ?? 1;
    this.particleScale = f(this.particleScale / 2);
    if (vx !== undefined && vy !== undefined && vz !== undefined) {
      this.motionX *= f(0.1);
      this.motionY *= f(0.1);
      this.motionZ *= f(0.1);
      this.motionX += vx;
      this.motionY += vy;
      this.motionZ += vz;
    }
  }

  override getFXLayer(): number {
    return 2;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.renderIconCrumb(t, pt, rx, rxz, rz, ryz, rxy);
  }
}
