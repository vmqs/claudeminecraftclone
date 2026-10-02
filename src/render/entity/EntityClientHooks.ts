import { Minecraft } from '../../client/Minecraft';
import { JavaRandom } from '../../core/JavaRandom';
import { EntityList } from '../../entity/EntityList';
import { EntityLiving } from '../../entity/EntityLiving';
import { EntityPickupFX } from '../particle/EntityPickupFX';

const f = Math.fround;

/** NetClientHandler's own random (pickup sound pitches). */
const clientRand = new JavaRandom();

/**
 * The client half of an item, arrow or orb pickup (NetClientHandler.handleCollect): a second
 * pop (or orb) sound on top of the one the server played, and the item flying into the
 * collector. Installed once on the main thread.
 */
EntityLiving.collectEffect = (item, collector) => {
  const mc = Minecraft.instance;
  const w = item.worldObj;
  if (!mc || !w) return;
  const pitch = f(f(f(f(clientRand.nextFloat() - clientRand.nextFloat()) * f(0.7)) + 1) * 2);
  w.playSoundAtEntity(item, EntityList.getEntityString(item) === 'XPOrb' ? 'random.orb' : 'random.pop', f(0.2), pitch);
  mc.effectRenderer.addEffect(new EntityPickupFX(w, item, collector, -0.5));
};
