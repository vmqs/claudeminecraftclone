# Dimensions slice progress (w5/dimensions)

Owner: WorldProvider/Hell/End + registry, dimension manager (one World per loaded dimension),
Teleporter, portal blocks (nether portal travel, end portal entry), DIM-1/DIM1 saving,
dimension-aware multiplayer, per-provider sky/fog/light.

Plan (commit after each step):
1. [ ] Providers (Surface/Hell/End, getProviderForDimension), World per dimension (derived
       WorldInfo: time and weather only from the overworld, getActualHeight), End sky, XZ fog,
       End lightmap
2. [ ] Worldgen per dimension: `dimension` in the worker/terrain protocol, DimensionGenerators
       registry (glob finds nether/ChunkProviderHell, end/ChunkProviderEnd), fallback
       netherrack / end-stone generators, no sky light for hasNoSky worlds
3. [ ] Teleporter (placeInPortal / placeInExistingPortal / makePortal / End platform) + tests
4. [ ] Travel: Entity portal timer + travelToDimension, player (80 ticks / creative 0, cooldown
       10), client overlay flag, DimensionManager + Minecraft switch (Downloading terrain),
       end portal entry, respawn to the overworld, achievements
5. [ ] Saving: DIM-1/DIM1 chunk folders, player Dimension, resume into it, export/import/delete
6. [ ] Multiplayer: Respawn with dimension, per-dimension streaming/tracking on the host
7. [ ] Scenario scripts/scenarios/dimensions.json, docs (ARCHITECTURE, TESTING)

Notes:
- 1.5.2 bytecode (EntityPlayerMP.travelToDimension): "The End?" is only triggered for
  dimension 1 -> 0, entering the End from the overworld triggers "We Need to Go Deeper"
  (AchievementList.portal), the exit portal in the End triggers "The End." and the win screen.
