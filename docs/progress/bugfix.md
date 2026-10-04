# Wave 6 bugfix progress

Branch `w6/bugfix`. Two user-reported bugs: sounds heard twice, hostile mobs aggroing on Creative
players.

## Findings (sound doubling)

1.5.2's client `RenderGlobal.playSound` is empty: `World.playSoundEffect` / `playSoundAtEntity`
on the client are silent, only `WorldClient.playSound` (client-only) and the server's
Packet62 reach the speakers. The "client echo" rule of the core (handleHealthUpdate hurt/death,
collectEffect pop, doExplosionB x2, playSoundEchoed) therefore doubled sounds that 1.5.2 played
once.

## Steps

- [ ] sounds test (tests/sounds.test.ts) single player + host/guest
- [ ] fixes
- [ ] creative aggro fixes + tests/creativeaggro.test.ts
- [ ] browser scenario scripts/scenarios/bugfix.json
- [ ] docs
