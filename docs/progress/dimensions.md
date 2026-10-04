# Dimensions slice progress (w5/dimensions)

Owner: WorldProvider/Hell/End + registry, dimension manager (one World per loaded dimension),
Teleporter, portal blocks (nether portal travel, end portal entry), DIM-1/DIM1 saving,
dimension-aware multiplayer, per-provider sky/fog/light.

Plan (commit after each step):
1. [x] Providers (Surface/Hell/End, getProviderForDimension), World per dimension (derived
       WorldInfo: time and weather only from the overworld, getActualHeight), End sky, XZ fog,
       End lightmap
2. [x] Worldgen per dimension: `dimension` in the worker/terrain protocol, DimensionGenerators
       registry (glob finds nether/ChunkProviderHell, end/ChunkProviderEnd), fallback
       netherrack / end-stone generators, no sky light for hasNoSky worlds
3. [x] Teleporter (placeInPortal / placeInExistingPortal / makePortal / End platform) + tests
4. [x] Travel: Entity portal timer + travelToDimension, player (80 ticks / creative 0, cooldown
       10), client overlay flag, DimensionManager + Minecraft switch (Downloading terrain),
       end portal entry, respawn to the overworld, achievements
5. [x] Saving: DIM-1/DIM1 chunk folders, player Dimension, resume into it, export/import/delete
6. [x] Multiplayer: Respawn with dimension, per-dimension streaming/tracking on the host
7. [x] Scenario scripts/scenarios/dimensions.json, docs (ARCHITECTURE, TESTING)

Notes:
- 1.5.2 bytecode (EntityPlayerMP.travelToDimension): "The End?" is only triggered for
  dimension 1 -> 0, entering the End from the overworld triggers "We Need to Go Deeper"
  (AchievementList.portal), the exit portal in the End triggers "The End." and the win screen.
- Browser run 1 (scripts/scenarios/dimensions.json, Short render distance): every assertion passes
  (portal lit, swirl, Nether arrival with a portal built, back to the same portal, end portal to
  the platform at y 48, Save and Quit + reopen in the End, death in the End -> overworld).
  Shots in scratchpad/shots-dimensions. At Short/Tiny 1.5.2 draws no sky at all, so the End's
  tunnel sky needs Normal/Far (the scenario switches for dim_7).
- Compass and clock had no game-state animation at all (the atlas cycled their frames): added
  TextureCompassClock (spawn needle / sun dial with 1.5.2's easing, random outside surface worlds).
- Multiplayer: LanWorld per host world, protocol 3 (Login and Respawn carry the dimension),
  tests/netdimensions.test.ts.
- Browser run 3 (final, 3 of 3): every assertion passes, now also the compass spinning in the
  Nether (17 frames in 40 ticks) and settled in the overworld, an item thrown into the Nether
  portal carried back to the overworld portal (picked up there on return), and the End's tunnel
  sky at Normal render distance. Shots in scratchpad/shots-dimensions3.
- Node: tests/dimensions.test.ts (66), tests/netdimensions.test.ts (15); the existing net,
  survival, player, persistence, stats, dynamics, containers, mobs, worldgen, controls and items
  tests pass unchanged.
- Done. Hooks for the Nether/End slices: DimensionGenerators (register or the ChunkProviderHell /
  ChunkProviderEnd classes by file name), PlayerTravel.winGameScreen or src/gui/GuiWinGame.ts,
  BlockEndPortal.bossDefeated, Entity.travelToDimension, mc.respawnPlayer(keepEverything).
