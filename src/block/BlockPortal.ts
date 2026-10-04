import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { EntityList } from '../entity/EntityList';
import type { EntityLiving } from '../entity/EntityLiving';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { BlockBreakable } from './BlockBreakable';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

const fround = Math.fround;

/**
 * Nether portal (90): the purple sheet inside a lit obsidian frame. Translucent (pass 1), no
 * collision, a thin slab along its plane; breaks when the frame is broken. Entities inside
 * get `setInPortal()`, which takes them to the Nether (or back) after Entity.getMaxInPortalTime.
 */
export class BlockPortal extends BlockBreakable {
  constructor(id: number) {
    super(id, 'portal', Material.portal, false);
    this.setTickRandomly(true);
  }

  /** Now and then a zombie pigman steps out (more often on harder difficulties). */
  override updateTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    super.updateTick(w, x, y, z, rand);
    const difficulty = (w as { difficultySetting?: number }).difficultySetting ?? 0;
    const surface = (w.provider as { isSurfaceWorld?(): boolean }).isSurfaceWorld?.() ?? w.provider.dimensionId === 0;
    if (surface && rand.nextInt(2000) < difficulty) {
      let gy = y;
      while (!w.doesBlockHaveSolidTopSurface(x, gy, z) && gy > 0) gy--;
      if (gy > 0 && !w.isBlockNormalCube(x, gy + 1, z)) {
        const e = BlockPortal.spawnCreature(w, 57, x + 0.5, gy + 1.1, z + 0.5);
        if (e) e.timeUntilPortal = (e as { getPortalCooldown?(): number }).getPortalCooldown?.() ?? 900;
      }
    }
  }

  /** ItemMonsterPlacer.spawnCreature: a mob with an egg, facing a random way. */
  static spawnCreature(w: IWorld, id: number, x: number, y: number, z: number): Entity | null {
    if (!EntityList.entityEggs.has(id)) return null;
    const e = EntityList.createEntityByID(id, w as unknown as World);
    if (e && e.isLivingEntity) {
      const l = e as EntityLiving;
      e.setLocationAndAngles(x, y, z, MathHelper.wrapAngleTo180_float(fround(w.rand.nextFloat() * 360)), 0);
      l.rotationYawHead = l.rotationYaw;
      l.renderYawOffset = l.rotationYaw;
      l.initCreature();
      w.spawnEntityInWorld(e);
      l.playLivingSound();
    }
    return e;
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  /** A quarter-block thick sheet along the X or the Z axis. */
  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    if (w.getBlockId(x - 1, y, z) !== this.blockID && w.getBlockId(x + 1, y, z) !== this.blockID) {
      this.setBlockBounds(0.375, 0, 0, 0.625, 1, 1);
    } else {
      this.setBlockBounds(0, 0, 0.375, 1, 1, 0.625);
    }
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  /**
   * Fills a 2 x 3 opening in an obsidian frame (4 x 5 with the corners optional) with portal,
   * when (x, y, z) is in its bottom row; fire inside the opening is replaced.
   */
  tryToCreatePortal(w: IWorld, x: number, y: number, z: number): boolean {
    const obsidian = BlockIds.obsidian;
    let dx = 0;
    let dz = 0;
    if (w.getBlockId(x - 1, y, z) === obsidian || w.getBlockId(x + 1, y, z) === obsidian) dx = 1;
    if (w.getBlockId(x, y, z - 1) === obsidian || w.getBlockId(x, y, z + 1) === obsidian) dz = 1;
    if (dx === dz) return false;
    if (w.getBlockId(x - dx, y, z - dz) === 0) {
      x -= dx;
      z -= dz;
    }
    for (let i = -1; i <= 2; i++) {
      for (let j = -1; j <= 3; j++) {
        const frame = i === -1 || i === 2 || j === -1 || j === 3;
        if ((i !== -1 && i !== 2) || (j !== -1 && j !== 3)) {
          const id = w.getBlockId(x + dx * i, y + j, z + dz * i);
          if (frame) {
            if (id !== obsidian) return false;
          } else if (id !== 0 && id !== BlockIds.fire) {
            return false;
          }
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) w.setBlock(x + dx * i, y + j, z + dz * i, BlockIds.portal, 0, 2);
    }
    return true;
  }

  /** Breaks unless the column is exactly three portal blocks between obsidian, inside a frame. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    let ax = 0;
    let az = 1;
    if (w.getBlockId(x - 1, y, z) === this.blockID || w.getBlockId(x + 1, y, z) === this.blockID) {
      ax = 1;
      az = 0;
    }
    let by = y;
    while (w.getBlockId(x, by - 1, z) === this.blockID) by--;
    if (w.getBlockId(x, by - 1, z) !== BlockIds.obsidian) {
      w.setBlockToAir(x, y, z);
      return;
    }
    let h = 1;
    while (h < 4 && w.getBlockId(x, by + h, z) === this.blockID) h++;
    if (h !== 3 || w.getBlockId(x, by + h, z) !== BlockIds.obsidian) {
      w.setBlockToAir(x, y, z);
      return;
    }
    const alongX = w.getBlockId(x - 1, y, z) === this.blockID || w.getBlockId(x + 1, y, z) === this.blockID;
    const alongZ = w.getBlockId(x, y, z - 1) === this.blockID || w.getBlockId(x, y, z + 1) === this.blockID;
    if (alongX && alongZ) {
      w.setBlockToAir(x, y, z);
      return;
    }
    if (
      (w.getBlockId(x + ax, y, z + az) !== BlockIds.obsidian || w.getBlockId(x - ax, y, z - az) !== this.blockID) &&
      (w.getBlockId(x - ax, y, z - az) !== BlockIds.obsidian || w.getBlockId(x + ax, y, z + az) !== this.blockID)
    ) {
      w.setBlockToAir(x, y, z);
    }
  }

  /** Only the two broad faces of the sheet, and never between portal blocks. */
  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    if (w.getBlockId(x, y, z) === this.blockID) return false;
    const id = this.blockID;
    const xn = w.getBlockId(x - 1, y, z) === id && w.getBlockId(x - 2, y, z) !== id;
    const xp = w.getBlockId(x + 1, y, z) === id && w.getBlockId(x + 2, y, z) !== id;
    const zn = w.getBlockId(x, y, z - 1) === id && w.getBlockId(x, y, z - 2) !== id;
    const zp = w.getBlockId(x, y, z + 1) === id && w.getBlockId(x, y, z + 2) !== id;
    const onX = xn || xp;
    const onZ = zn || zp;
    if (onX && side === 4) return true;
    if (onX && side === 5) return true;
    return (onZ && side === 2) || (onZ && side === 3);
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override getRenderBlockPass(): number {
    return 1;
  }

  override onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, e: Entity): void {
    if (e.ridingEntity === null && e.riddenByEntity === null) (e as { setInPortal?(): void }).setInPortal?.();
  }

  /** The portal hum and swirling particles drifting out of the sheet. */
  override randomDisplayTick(w: IWorld, x: number, y: number, z: number, rand: JavaRandom): void {
    if (rand.nextInt(100) === 0) {
      w.playSound(x + 0.5, y + 0.5, z + 0.5, 'portal.portal', 0.5, fround(fround(rand.nextFloat() * fround(0.4)) + fround(0.8)), false);
    }
    for (let i = 0; i < 4; i++) {
      let px = fround(x + rand.nextFloat());
      const py = fround(y + rand.nextFloat());
      let pz = fround(z + rand.nextFloat());
      const dir = rand.nextInt(2) * 2 - 1;
      let vx = (rand.nextFloat() - 0.5) * 0.5;
      const vy = (rand.nextFloat() - 0.5) * 0.5;
      let vz = (rand.nextFloat() - 0.5) * 0.5;
      if (w.getBlockId(x - 1, y, z) !== this.blockID && w.getBlockId(x + 1, y, z) !== this.blockID) {
        px = x + 0.5 + 0.25 * dir;
        vx = fround(fround(rand.nextFloat() * 2) * dir);
      } else {
        pz = z + 0.5 + 0.25 * dir;
        vz = fround(fround(rand.nextFloat() * 2) * dir);
      }
      w.spawnParticle('portal', px, py, pz, vx, vy, vz);
    }
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }
}
