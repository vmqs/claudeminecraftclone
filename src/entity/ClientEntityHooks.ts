import type { Entity } from './Entity';
import { EntityMinecart } from './EntityMinecart';
import { installItemHooks } from './ItemHooksInstall';
import { type EntitySoundSink, SoundUpdaterMinecart } from './SoundUpdaterMinecart';

/** The parts of Minecraft the entity layer's client hooks use. */
export interface EntityHookHost {
  readonly sndManager: EntitySoundSink;
  readonly thePlayer: Entity | null;
}

/**
 * Main-thread set-up of the entity layer (called once by Minecraft): connects the item,
 * enchantment and potion code, and gives minecarts their rolling sound (the original's
 * WorldClient.func_82735_a).
 */
export function installEntityClientHooks(mc: EntityHookHost): void {
  installItemHooks();
  EntityMinecart.soundUpdaterFactory = (cart) => new SoundUpdaterMinecart(mc.sndManager, cart, () => mc.thePlayer);
}
