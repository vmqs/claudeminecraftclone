import { EndPortalHooks } from '../block/EndPortalHooks';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { GuiWinGame } from '../gui/GuiWinGame';
import { AchievementIds } from '../stats/StatIds';
import type { PlayerClient } from './EntityPlayerSP';

/**
 * EntityPlayerMP.travelToDimension(1) for a player already in the End (the exit portal): "The
 * End." achievement, the conquered flag that makes the next respawn keep everything, and the
 * credits (Packet70GameEvent reason 4) on the player's own screen. A LAN guest gets the packet;
 * the local player gets GuiWinGame directly. When the credits end the client asks to respawn
 * (EntityPlayer.respawnPlayer), which brings the player back to the overworld.
 */
export function conquerTheEnd(e: Entity): void {
  const p = e as EntityPlayer;
  if (p.playerConqueredTheEnd || p.isDead) return;
  p.triggerAchievement(AchievementIds.theEnd2);
  p.playerConqueredTheEnd = true;
  const guest = p as unknown as { handler?: { sendPacket(pk: { type: 'GameEvent'; reason: number; value: number }): void } };
  const local = p as unknown as { mc?: PlayerClient };
  if (guest.handler) guest.handler.sendPacket({ type: 'GameEvent', reason: 4, value: 0 });
  else if (local.mc) local.mc.displayGuiScreen(new GuiWinGame());
}

EndPortalHooks.enterExitPortal = conquerTheEnd;
