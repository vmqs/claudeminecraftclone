# World generation progress (wave 1, worldgen agent)

Branch `w1/worldgen`. Each step is committed; this file lists what is done and what is next.

## Done
- GenLayer stack (`src/world/gen/layer/`) with a bit-exact 64-bit LCG in 32-bit halves, and
  `WorldChunkManager` (Default and Large Biomes). Biomes at every reference position and the
  spawn biome positions of seeds "claude" (176, 236) and 123456789 (-204, 248) match 1.5.2.
- `MapGenCaves`, `MapGenRavine` (per-chunk seeding without BigInt). Reference cave, pond and
  spawn columns of both seeds match.
- Complete `BiomeDecoration`: all tree generators (big oak with its persistent height, birch,
  spruces, swamp oak, jungle giant and bush), huge mushrooms, lilies, pumpkins, vines, desert
  wells, emeralds, silverfish stone; dungeons (loot and spawner NBT); bonus chest.
- `WorldGenServer` (worker logic): generate-once with a compressed `GenStore`, the original
  spawn search and 25x25 spawn-area population order. The spawn view of seed "claude" matches
  the reference capture tree for tree.
- Structures (`src/world/gen/structure/`): framework, villages, desert/jungle temples, witch
  huts, mineshafts, strongholds; HashMap iteration order of structure starts.
- Superflat: preset structures, 256-high layers, `toString`, `FLAT_PRESETS`; superflat spawn of
  "claude" matches (-392, 4, -528).
- Client hooks: world options (preset, bonus chest), `findClosestStructure` /
  `StructureLocator`, entity descriptor data; docs and `scripts/scenarios/worldgen.json`.

- Light during population (`GenWorld.updateLightByType`, gated on loaded chunks like the
  original): a flower under the canopy in the "claude" open-south reference view was missing
  with column-only sky light and is now placed.
- Visual comparison (scenario `worldgen`, against the 854x480 Faithful references): the spawn,
  open-south, cave and underwater views of "claude" and the spawn, open-south and cave views of
  123456789 match block for block, including every flower and grass tuft. Remaining pixel
  differences are clouds, flowing water in the 123456789 ravine (fluid ticks) and shaded areas
  under canopies rendering about 15% darker than the reference; the client's light there equals
  the worker's computed light, so that needs a vanilla light dump to settle.

## Next
- Cascading population (a feature reading an unloaded chunk loads and populates it in the
  original) is not emulated; it only matters for features reaching more than 8 blocks out.
