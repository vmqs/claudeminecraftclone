import { Minecraft } from '../../client/Minecraft';
import { EntityLiving } from '../../entity/EntityLiving';
import { EntityPickupFX } from '../particle/EntityPickupFX';

/**
 * The client half of an item, arrow or orb pickup (NetClientHandler.handleCollect): the item
 * flying into the collector. The pop (or orb) sound is the server's (the collected entity's
 * onCollideWithPlayer); the client's copy of it was silent in 1.5.2. Installed once on the main
 * thread.
 */
EntityLiving.collectEffect = (item, collector) => {
  const mc = Minecraft.instance;
  const w = item.worldObj;
  if (!mc || !w) return;
  mc.effectRenderer.addEffect(new EntityPickupFX(w, item, collector, -0.5));
};
