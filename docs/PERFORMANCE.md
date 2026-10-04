# Performance

How fast the game loads and runs, how it was measured, and what changed. Everything listed here
keeps the output identical: world generation and section meshes are held to hashes recorded
before the work (`tests/worldgen-golden.test.ts`, `tests/mesher-golden.test.ts`), and frozen
scenes are compared pixel for pixel with a baseline build (`scripts/scenarios/perf.json`).

## Where the time goes

Creating a world is mostly world generation in the worker: the spawn search, then the 25x25
spawn area in the original order (`MinecraftServer.initialWorldChunkLoad`), whose populations
must run one after the other because neighbouring features overlap. Raw terrain is a pure
function of the seed and can be made in parallel; population cannot. After that the client
receives finalized chunks, copies padded section snapshots and meshes them in workers, then
uploads the meshes.

## Measuring

| Tool | What |
|---|---|
| `node scripts/perf/bench.mjs worldgen [seed] [type] [radius]` | Node: spawn search, spawn area (terrain / structures / population split), finalization per chunk |
| `node scripts/perf/bench.mjs popul [seed]` | Node: the population critical path alone (terrain made beforehand, as the terrain workers do) |
| `node scripts/perf/bench.mjs mesher [seed] [radius] [ao] [fancy]` | Node: snapshot copy and meshing per section, plus a hash of all mesh bytes |
| `node scripts/perf/bench.mjs tick [seed] [radius] [ticks]` | Node: world ticks with ~170 mobs (unseeded randoms pinned so runs compare) |
| `node scripts/perf/load-bench.mjs` | Headless Chromium: from Create New World to playable and to the area meshed, chunks and meshes over time, long tasks, frame times standing and flying, heap |
| `node scripts/shot.mjs perf` | A/B pixel comparison with a baseline build, `mc.dev.perf` checks, a timed default world |

The browser numbers come from the development container: 4 cores shared with other jobs (load
average 2 to 8 during the runs) and SwiftShader, a CPU renderer that makes a frame take over a
second. They show what is bound to the frame rate and what is not; on a real GPU frames are
~100 times faster. The Node numbers are steadier.

## Results

Seed `claude`, default world type, Far render distance (27x27 chunks loaded), Faithful pack.

### World load (headless Chromium, SwiftShader, 4 shared cores)

Default world from the title screen (ms after Create New World). "Before" and "after (run 2)"
are `load-bench.mjs` runs on a busy machine (load average up to 7-8); "after (final)" is
`perf.json` on a quiet one (load average ~1).

| Milestone | Before (d0e00fc) | After (run 2) | After (final) |
|---|---|---|---|
| Building terrain done (player placed) | 8274 | 6510 | 5016 |
| Downloading terrain closed (playable) | 45922 | 8197 | 7704 |
| Every section within 2 chunks meshed | 52426 ¹ | 34586 ¹ | 11504 |
| Every section within 8 chunks meshed | ~130000 ² | ~27000 ² | 17518 |
| All 729 chunks received | ~87000 | ~24500 | - |
| Main-thread JS per frame, standing | 67 ms | 74 ms | - |
| JS heap allocation, standing | 8.2 MB/s | 3.3 MB/s | - |

¹ "no section within the radius waiting for a mesh", which world ticks keep re-arming in a
forest (leaf decay, water); ² when the count of sections with geometry stops growing. The final
run uses `mc.dev.perf.areaShown(r)` (every section meshed once), which is what the eye sees.

The same `perf.json` run timed a Superflat world (Normal distance) on both builds from page
load to playable: **94776 ms before, 3583 ms after**, and rendered the same frozen scenes on both
(a palette of ~80 block types with smooth lighting, an overhang's shadows, a line-up of 12 mobs,
the creative inventory): pixel-identical (`compare -metric AE` = 0) except 32 pixels of the
compass icon's needle in the inventory, which follows the game clock.

### Components (Node, one core)

| | Before | After |
|---|---|---|
| Spawn search | 215 ms | 210 ms |
| Spawn area: terrain (parallel in the terrain workers) | 2697 ms (4.3 ms/chunk) | same, now spread over 1-3 workers |
| Spawn area: population, structures, light (sequential) | 2.1 s (3.3-3.4 ms/chunk) | 2.0 s |
| Spawn's 5x5 ready, share of the spawn area | 100% | ~71% |
| Finalize (light + copy) per chunk | 1.9 ms | 1.9 ms |
| Snapshot copy per section | 0.18 ms | 0.10 ms |
| Meshing per forest section (smooth lighting, fancy) | 3.3-3.8 ms | 1.3-1.4 ms |
| Meshing per forest section (smooth lighting off) | 2.0-3.0 ms | 0.72-0.78 ms |
| World tick, 169 chunks, ~175 mobs | ~3.6 ms | ~3.6 ms |
| Scheduled-tick queue (68k entries): one chunk unload | ~100 ms | 1.3 ms |
| Scheduled-tick queue: 1000 polls (one tick's worth) | 3.0-3.6 ms | 1.8-1.9 ms |
| Scheduled-tick queue: adding 170k entries | 300-350 ms | 200-220 ms |

## What changed

World load:
- **Chunks while the spawn area loads.** The worker answers the spawn search at once and keeps
  loading the spawn area in the original order; a requested chunk is finalized as soon as every
  population that writes into its neighbourhood has run, with its light computed into the payload
  only, so the rest of the area generates exactly as before (ARCHITECTURE.md §5.2). The player
  enters at about 70% of the spawn area instead of 100%.
- **Terrain worker pool**, 1-3 workers started with the world-generation worker, and the
  world-generation worker itself **prewarmed** at boot and after leaving a world.
- **Frame-rate independent streaming.** Adding chunks and uploading meshes had fixed 4 ms budgets
  per frame; at one frame per second (SwiftShader, slow GPUs) that streamed a few sections per
  second. `FrameBudget` lends the time the main thread waits for the GPU to this work (never more
  than the base on a CPU-bound frame) and a share of the frame while a loading screen hides the
  world.
- **Downloading terrain no longer draws the world** behind its opaque background; it only feeds
  the meshers.
- **Empty sections** are settled without a mesher slot.
- **Mesher**: enclosed full cubes are skipped, snapshot cells' brightness is remembered while a
  section is meshed, no per-face arrays; snapshots are copied in row runs. 2.6x faster.
- **Mesher pool** up to four workers on machines with six or more cores.

Runtime:
- **Scheduled block updates** (`TickScheduler`): every new chunk brings ~480 scheduled ticks
  (gravel and sand placed by population, as in 1.5.2), so the queue holds tens of thousands of
  entries while a world streams in. Unloading a chunk rebuilt the whole heap; now its entries
  are flagged and skipped, positions are numeric keys, and a chunk's entries come back in the
  order they would run (the original's TreeSet order).
- **Uniforms** are only sent when they change (one program; matrices by their stack version):
  a terrain section draw is now the model-view matrix and the draw call instead of ~15 calls.
- The terrain pass reuses its section list and sort keys instead of allocating per frame.
- `IdleTasks`: background work in slices after each frame, the hook for incremental saving.

Already in place and kept: chunk payloads, snapshots, meshes and terrain are transferred, not
copied; empty sections are not sent; the atlases and colormaps are stitched once at start-up and
only sent to the meshers again on a texture pack change; entity models are display lists; entity
queries use the chunks' entity lists like 1.5.2.

## Still open

- Long main-thread frames while a world streams in: the final run saw 34 tasks over 50 ms in
  the first 17 s, the longest 843 ms, on SwiftShader (frames take ~1 s there, so ten catch-up
  ticks run per frame, each draining up to 1000 scheduled updates and adding new chunks' ticks).
  The tick-queue fix above landed after that run.
- Population (2 s of the spawn area on one core) is sequential by design.

## Checked and left alone

- World ticks: a direct-mapped chunk cache in `World` gave no measurable gain on the tick
  benchmark (the one-entry cache already hits), so `World.ts` was left as it was.
- Population: the ore generator dominates (46%); it is already close to the cost of the cell
  tests themselves, and the sequence of block writes must stay exactly as it is.
- Particles keep the original's list semantics (removal while iterating, the oldest dropped at
  4000 per layer).
