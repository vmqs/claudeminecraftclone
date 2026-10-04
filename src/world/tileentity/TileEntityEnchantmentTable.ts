import { JavaRandom } from '../../core/JavaRandom';
import type { TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

const f = Math.fround;
const PI = f(Math.PI);
const TWO_PI = f(Math.PI * 2);

/** An enchanting table (TileEntityEnchantmentTable): the floating book's animation. */
export class TileEntityEnchantmentTable extends TileEntity {
  private static readonly rand = new JavaRandom();
  tickCount = 0;
  pageFlip = 0;
  pageFlipPrev = 0;
  /** Where the pages are flipping to (field_70373_d). */
  flipTarget = 0;
  /** Page flip speed (field_70374_e). */
  flipSpeed = 0;
  bookSpread = 0;
  bookSpreadPrev = 0;
  bookRotation2 = 0;
  bookRotationPrev = 0;
  bookRotation = 0;
  private customName: string | null = null;

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    if (this.hasCustomName()) tag.CustomName = this.customName;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    if (nbt.hasKey(tag, 'CustomName')) this.customName = nbt.getString(tag, 'CustomName');
  }

  override updateEntity(): void {
    super.updateEntity();
    const w = this.worldObj!;
    const rand = TileEntityEnchantmentTable.rand;
    this.bookSpreadPrev = this.bookSpread;
    this.bookRotationPrev = this.bookRotation2;
    const p = w.getClosestPlayer?.(f(this.xCoord + 0.5), f(this.yCoord + 0.5), f(this.zCoord + 0.5), 3) ?? null;
    if (p) {
      const dx = p.posX - f(this.xCoord + 0.5);
      const dz = p.posZ - f(this.zCoord + 0.5);
      this.bookRotation = f(Math.atan2(dz, dx));
      this.bookSpread = f(this.bookSpread + f(0.1));
      if (this.bookSpread < 0.5 || rand.nextInt(40) === 0) {
        const old = this.flipTarget;
        do this.flipTarget = f(this.flipTarget + (rand.nextInt(4) - rand.nextInt(4)));
        while (old === this.flipTarget);
      }
    } else {
      this.bookRotation = f(this.bookRotation + f(0.02));
      this.bookSpread = f(this.bookSpread - f(0.1));
    }
    while (this.bookRotation2 >= PI) this.bookRotation2 = f(this.bookRotation2 - TWO_PI);
    while (this.bookRotation2 < -PI) this.bookRotation2 = f(this.bookRotation2 + TWO_PI);
    while (this.bookRotation >= PI) this.bookRotation = f(this.bookRotation - TWO_PI);
    while (this.bookRotation < -PI) this.bookRotation = f(this.bookRotation + TWO_PI);
    let d = f(this.bookRotation - this.bookRotation2);
    while (d >= PI) d = f(d - TWO_PI);
    while (d < -PI) d = f(d + TWO_PI);
    this.bookRotation2 = f(this.bookRotation2 + f(d * f(0.4)));
    if (this.bookSpread < 0) this.bookSpread = 0;
    if (this.bookSpread > 1) this.bookSpread = 1;
    this.tickCount++;
    this.pageFlipPrev = this.pageFlip;
    let speed = f(f(this.flipTarget - this.pageFlip) * f(0.4));
    const max = f(0.2);
    if (speed < -max) speed = -max;
    if (speed > max) speed = max;
    this.flipSpeed = f(this.flipSpeed + f(f(speed - this.flipSpeed) * f(0.9)));
    this.pageFlip = f(this.pageFlip + this.flipSpeed);
  }

  /** func_94133_a: the GUI title. */
  getInvName(): string {
    return this.hasCustomName() ? this.customName! : 'container.enchant';
  }

  /** func_94135_b */
  hasCustomName(): boolean {
    return this.customName !== null && this.customName.length > 0;
  }

  /** func_94134_a */
  setCustomName(name: string): void {
    this.customName = name;
  }
}
