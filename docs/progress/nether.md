# Wave 5 — nether (generation, fortresses, spawning)

Branch `w5/nether`, worktree `/home/user/wt/nether`, base 074d554.

## Plan
- [x] ChunkProviderHell (terrain noise, lava sea y<32, bedrock floor/ceiling, soul sand/gravel), MapGenCavesHell
- [x] populate: hell lava springs, fire, glowstone x2, mushrooms, quartz, hidden lava
- [x] MapGenNetherBridge + every StructureNetherBridgePieces piece (1.5.2 has no fortress chests)
- [x] DimensionGenerators registry (dimension -1 -> ChunkProviderHell) + worker hook
- [ ] fortress spawn list on the main thread (getPossibleCreatures)
- [x] vanilla comparison (Java dumper in scratchpad) + golden Node test (tests/nether-golden.test.ts)
- [ ] scenario scripts/scenarios/nether.json

## Notes
- Vanilla dumper: scratchpad/nether/java/net/minecraft/src/NetherDump.java (compiled against
  scratchpad/vanilla/jar/client-named-fixed.jar; modes terrain / fortress / populate). Terrain,
  25 fortress layouts and 3 populated areas are byte-identical to ours.
- ChunkProviderHell.populate never reseeds hellRNG in 1.5.2 (decoration depends on load order);
  ours reseeds as "chunk generated last, populated at once" (seedPopulateRandom).
