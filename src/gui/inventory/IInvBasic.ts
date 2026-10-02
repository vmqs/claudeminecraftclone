import type { InventoryBasic } from './InventoryBasic';

/** Told when an InventoryBasic changes (IInvBasic). */
export interface IInvBasic {
  onInventoryChanged(inv: InventoryBasic): void;
}
