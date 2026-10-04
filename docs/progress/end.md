# End slice progress (w5/end)

Owner: End generation, Ender Dragon, ender crystals, end portal activation, GuiWinGame, Wither.

## Done (all committed)
1. [x] ChunkProviderEnd + WorldGenSpikes + BiomeEndDecorator (dragon descriptor at chunk 0,0);
   DimensionGenerators registry by dimension id; worker init carries `dimension`.
   Terrain = vanilla byte for byte (SHA-256 vs the real classes, tests/end.test.ts).
2. [x] EntityDragon + EntityDragonPart + ModelDragon + RenderDragon (beam, eyes, death rays,
   dissolve, hurt flash), boss bar, death (12000 XP), exit portal + egg.
3. [x] EntityEnderCrystal: explodes only on the authoritative world.
4. [x] GuiWinGame (win.txt + credits.txt), exit portal hook -> The End. achievement, credits,
   respawn keeping everything (SP and LAN guests).
5. [x] EntityWither + ModelWither + RenderWither (charge-up, explosion, heads, skulls, armour).
6. [x] Node tests (tests/end.test.ts), scenario scripts/scenarios/end.json (3 browser runs used),
   vanilla references captured in scratchpad ref/extra/end (dragon_side, wither_front, wither_turned).
7. [x] Docs: ARCHITECTURE §13 row "The End and bosses", TESTING (?dim=1, mc.dev.end, end scenario/test).

## Notes for the merge with dimensions
- `?dim=1` dev path: WorldSettings.dimension -> world.provider.dimensionId -> ChunkProviderClient
  init.dimension -> WorldGenServer -> DimensionGenerators.create(1). The dimensions slice should
  keep `init.dimension = world.provider.dimensionId` (or call DimensionGenerators.create) so
  ChunkProviderEnd lights up for its WorldProviderEnd world.
- After the credits, `mc.respawnPlayer()` runs with `old.playerConqueredTheEnd` set: the
  dimension-aware respawn must put the player in dimension 0 (End.canRespawnHere is false).
- BlockEndPortal.onEntityCollidedWithBlock: dimension 1 + player -> EndPortalHooks.enterExitPortal;
  everything else is travelToDimension(1) (dimensions slice).
