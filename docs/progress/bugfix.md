# Wave 6 bugfix progress

Branch `w6/bugfix`. Two user-reported bugs: sounds heard twice, hostile mobs aggroing on Creative
players. Both done; checks: `tests/sounds.test.ts`, `tests/creativeaggro.test.ts`,
`scripts/scenarios/bugfix.json` (passes in the browser).

## Sound doubling

1.5.2's client `RenderGlobal.playSound` is empty: `World.playSoundEffect` / `playSoundAtEntity`
on the client are silent, only `WorldClient.playSound` (client-only) and the server's Packet62
reach the speakers. The core's "client echo" rule (handleHealthUpdate hurt/death, collectEffect
pop, doExplosionB x2, playSoundEchoed) therefore doubled sounds that 1.5.2 played once.

Fixed paths (single player, LAN host, LAN guest):
- mob/player hurt and death: handleHealthUpdate plays only on a guest's copy (its own player)
- item/orb/arrow pickup pop: collectEffect has no sound
- explosions: one sound; the host sends it with the explosion packet
- arrow thud, lava fizz, firework launch, wolf shake: once
- iron golem throw: once (attackEntityAsMob only)
- guest: WorldClient drops world sounds (predicted placements, chest lids, buttons, status
  echoes, lightning, mood sounds were doubled with the host's packets)
- host: World.playSound (doors and other level events, the host's own steps/eating/hurt, rain,
  zombie cure) no longer leaks to guests a second time through LanWorld
- guest's own hurt/death sound was missing (now heard once)
- particles: status effects, level events (spawner 2004, bone meal), player updates (sprint dust,
  potion swirls, eating), tile entities (spawner flames) and block events (note particles) are
  no longer forwarded on top of the guest's own copies; the host's crits now reach guests;
  guests' copies of other players keep their synced potion swirl/invisibility

## Creative aggro

Creative players are never a target: EntityLiving.setAttackTarget / getAttackTarget,
EntityCreature.entityToAttack (accessor), EntityAITarget.isSuitableTarget (revenge and tamed
included), cached task targets (arrow attack, creeper swell, move-towards, ocelot attack),
pigman anger, enderman provocation, silverfish allies, slime collision, ghast, dragon and wither
head targets. A switch to Creative drops existing aggro at once (path cleared, wild wolves calm).
`tests/mobshostile.test.ts` expectation updated (no revenge on Creative attackers).

## Other observations from the browser session

None blocking. Single player shows the 'explode' poof of spawner-spawned mobs, which 1.5.2's
integrated server never sent (left as is).
