import { EntityPlayerSP } from '../../client/EntityPlayerSP';
import type { IMerchant } from '../../entity/merchant/IMerchant';
import { GuiMerchant } from './GuiMerchant';

/**
 * Opens the trading window for the local player (EntityPlayerSP.displayGUIMerchant). Installed
 * from this module instead of the player class so the GUI stays out of the simulation code;
 * imported once by src/render/entity/PassiveMobRenderers.ts.
 */
EntityPlayerSP.prototype.displayGUIMerchant = function (this: EntityPlayerSP, merchant: object, customName: string | null): void {
  this.mc.displayGuiScreen(new GuiMerchant(this.inventory, merchant as IMerchant, this.worldObj, customName));
};
