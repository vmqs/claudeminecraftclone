# Wave 5 — nether (generation, fortresses, spawning)

Branch `w5/nether`, worktree `/home/user/wt/nether`, base 074d554.

## Plan
- [x] ChunkProviderHell (terrain noise, lava sea y<32, bedrock floor/ceiling, soul sand/gravel), MapGenCavesHell
- [x] populate: hell lava springs, fire, glowstone x2, mushrooms, quartz, hidden lava
- [x] MapGenNetherBridge + every StructureNetherBridgePieces piece (1.5.2 has no fortress chests)
- [x] DimensionGenerators registry (dimension -1 -> ChunkProviderHell) + worker hook
- [x] fortress spawn list on the main thread (getPossibleCreatures -> PossibleCreatures hook)
- [x] vanilla comparison (Java dumper in scratchpad) + golden Node test (tests/nether-golden.test.ts)
- [x] scenario scripts/scenarios/nether.json (needs the dimensions slice's mc.travel; ran on a
  local throwaway merge with w5/dimensions: fortress, F3 Hell, blaze spawner, wart room all render)

## Notes
- Vanilla dumper: scratchpad/nether/java/net/minecraft/src/NetherDump.java (compiled against
  scratchpad/vanilla/jar/client-named-fixed.jar; modes terrain / fortress / populate). Terrain,
  25 fortress layouts and 3 populated areas are byte-identical to ours.
- ChunkProviderHell.populate never reseeds hellRNG in 1.5.2 (decoration depends on load order);
  ours reseeds as "chunk generated last, populated at once" (seedPopulateRandom).
- Registry API matches the dimensions slice's DimensionGenerators (register(dim, (o) => gen),
  create(dim, o), providerInfoFor); registration lives in NetherRegistration.ts because their
  registry imports nether/ChunkProviderHell.ts by glob (a self-registering module would cycle).
- Exploding beds: left to the dimensions slice (they implemented the same 1.5.2 rule).
- Observed on the throwaway merge: a Creative player arriving inside the new Nether portal is
  sent straight back (getMaxInPortalTime 0); the scenario overrides getMaxInPortalTime.
