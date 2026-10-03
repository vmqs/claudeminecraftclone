import { BlockIds, ItemIds } from '../../block/BlockIds';
import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { IInventory } from '../../gui/inventory/IInventory';
import { ItemStack, type TagCompound } from '../../item/ItemStack';
import { isUseableByPlayerAt, nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** Gives a player a beacon effect (new PotionEffect(id, 180, amplifier, true)); set by the potion code. */
export type BeaconEffectHook = (player: EntityPlayer, potionId: number, duration: number, amplifier: number, ambient: boolean) => void;

/**
 * A beacon (TileEntityBeacon): pyramid levels (checked every 80 ticks), the chosen effects and
 * the payment slot.
 */
export class TileEntityBeacon extends TileEntity implements IInventory {
  /** Potion ids per pyramid level: speed, haste / resistance, jump boost / strength / regeneration. */
  static readonly effectsList: readonly (readonly number[])[] = [[1, 3], [11, 8], [5], [10]];
  static applyEffect: BeaconEffectHook | null = null;

  private lastBeamTime = 0;
  private beamStrength = 0;
  private isBeaconActive = false;
  private levels = -1;
  private primaryEffect = 0;
  private secondaryEffect = 0;
  private payment: ItemStack | null = null;
  private customName: string | null = null;

  override updateEntity(): void {
    if (this.worldObj!.getTotalWorldTime() % 80 === 0) {
      this.updateState();
      this.addEffectsToPlayers();
    }
  }

  private addEffectsToPlayers(): void {
    const w = this.worldObj!;
    if (!this.isBeaconActive || this.levels <= 0 || w.isRemote || this.primaryEffect <= 0) return;
    const range = this.levels * 10 + 10;
    const amp = this.levels >= 4 && this.primaryEffect === this.secondaryEffect ? 1 : 0;
    const box = AxisAlignedBB.getBoundingBox(this.xCoord, this.yCoord, this.zCoord, this.xCoord + 1, this.yCoord + 1, this.zCoord + 1).expand(range, range, range);
    box.maxY = w.getHeight();
    const players = w.getEntitiesWithinAABBExcludingEntity(null, box).filter((e) => e.isPlayerEntity) as unknown as EntityPlayer[];
    const apply = TileEntityBeacon.applyEffect;
    if (!apply) return;
    for (const p of players) apply(p, this.primaryEffect, 180, amp, true);
    if (this.levels >= 4 && this.primaryEffect !== this.secondaryEffect && this.secondaryEffect > 0) {
      for (const p of players) apply(p, this.secondaryEffect, 180, 0, true);
    }
  }

  /** Counts the complete layers of iron, gold, emerald and diamond blocks below (up to 4). */
  private updateState(): void {
    const w = this.worldObj!;
    if (!w.canBlockSeeTheSky(this.xCoord, this.yCoord + 1, this.zCoord)) {
      this.isBeaconActive = false;
      this.levels = 0;
      return;
    }
    this.isBeaconActive = true;
    this.levels = 0;
    for (let level = 1; level <= 4; this.levels = level++) {
      const y = this.yCoord - level;
      if (y < 0) break;
      let complete = true;
      for (let x = this.xCoord - level; x <= this.xCoord + level && complete; x++) {
        for (let z = this.zCoord - level; z <= this.zCoord + level; z++) {
          const id = w.getBlockId(x, y, z);
          if (id !== BlockIds.blockEmerald && id !== BlockIds.blockGold && id !== BlockIds.blockDiamond && id !== BlockIds.blockIron) {
            complete = false;
            break;
          }
        }
      }
      if (!complete) break;
    }
    if (this.levels === 0) this.isBeaconActive = false;
  }

  /** func_82125_v_: the beam brightness for the renderer (fades in over 40 ticks). */
  getBeamStrength(): number {
    if (!this.isBeaconActive) return 0;
    const now = this.worldObj!.getTotalWorldTime();
    const dt = now - this.lastBeamTime;
    this.lastBeamTime = now;
    if (dt > 1) {
      this.beamStrength = Math.fround(this.beamStrength - dt / 40);
      if (this.beamStrength < 0) this.beamStrength = 0;
    }
    this.beamStrength = Math.fround(this.beamStrength + Math.fround(0.025));
    if (this.beamStrength > 1) this.beamStrength = 1;
    return this.beamStrength;
  }

  getPrimaryEffect(): number {
    return this.primaryEffect;
  }

  getSecondaryEffect(): number {
    return this.secondaryEffect;
  }

  getLevels(): number {
    return this.levels;
  }

  setLevels(n: number): void {
    this.levels = n;
  }

  setPrimaryEffect(id: number): void {
    this.primaryEffect = 0;
    for (let i = 0; i < this.levels && i < 3; i++) {
      if (TileEntityBeacon.effectsList[i].includes(id)) {
        this.primaryEffect = id;
        return;
      }
    }
  }

  setSecondaryEffect(id: number): void {
    this.secondaryEffect = 0;
    if (this.levels < 4) return;
    for (let i = 0; i < 4; i++) {
      if (TileEntityBeacon.effectsList[i].includes(id)) {
        this.secondaryEffect = id;
        return;
      }
    }
  }

  override getMaxRenderDistanceSquared(): number {
    return 65536;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.primaryEffect = nbt.getInt(tag, 'Primary');
    this.secondaryEffect = nbt.getInt(tag, 'Secondary');
    this.levels = nbt.getInt(tag, 'Levels');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    tag.Primary = this.primaryEffect;
    tag.Secondary = this.secondaryEffect;
    tag.Levels = this.levels;
  }

  getSizeInventory(): number {
    return 1;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return slot === 0 ? this.payment : null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    if (slot !== 0 || !this.payment) return null;
    if (n >= this.payment.stackSize) {
      const s = this.payment;
      this.payment = null;
      return s;
    }
    this.payment.stackSize -= n;
    return new ItemStack(this.payment.itemID, n, this.payment.getItemDamage());
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    if (slot !== 0 || !this.payment) return null;
    const s = this.payment;
    this.payment = null;
    return s;
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    if (slot === 0) this.payment = stack;
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.beacon';
  }

  isInvNameLocalized(): boolean {
    return this.customName !== null && this.customName.length > 0;
  }

  /** func_94047_a */
  setCustomName(name: string): void {
    this.customName = name;
  }

  getInventoryStackLimit(): number {
    return 1;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, stack: ItemStack): boolean {
    const id = stack.itemID;
    return id === ItemIds.emerald || id === ItemIds.diamond || id === ItemIds.ingotGold || id === ItemIds.ingotIron;
  }
}
