# World generation progress (wave 1, worldgen agent)

Branch `w1/worldgen`. Each step is committed; this file lists what is done and what is next.

## Done
- GenLayer stack (`src/world/gen/layer/`) with a bit-exact 64-bit LCG in 32-bit halves, and
  `WorldChunkManager` (Default and Large Biomes) replacing the placeholder biome source.
  Checked: biomes at every reference position and the spawn biome position of seeds "claude"
  (176, 236) and 123456789 (-204, 248) match 1.5.2.

## Next
- Caves and ravines; decorator completeness (all trees, big mushrooms, lilies, pumpkins, vines,
  wells, emeralds, silverfish); dungeons; structures; flat presets; spawn/bonus chest; worker
  descriptors; vanilla initial population order.
