# Wave 5 — nether (generation, fortresses, spawning)

Branch `w5/nether`, worktree `/home/user/wt/nether`, base 074d554.

## Plan
- [ ] ChunkProviderHell (terrain noise, lava sea y<32, bedrock floor/ceiling, soul sand/gravel), MapGenCavesHell
- [ ] populate: hell lava springs, fire, glowstone x2, mushrooms, quartz, hidden lava
- [ ] MapGenNetherBridge + every StructureNetherBridgePieces piece (1.5.2 has no fortress chests)
- [ ] DimensionGenerators registry (dimension -1 -> ChunkProviderHell) + worker hook
- [ ] fortress spawn list on the main thread (getPossibleCreatures)
- [ ] vanilla comparison (Java dumper in scratchpad) + golden Node test
- [ ] scenario scripts/scenarios/nether.json

## Notes
