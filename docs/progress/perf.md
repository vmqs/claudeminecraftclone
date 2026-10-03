# Perf slice progress (w4/perf)

Baseline commit d0e00fc. Numbers in docs/PERFORMANCE.md.

## Done (committed)
- scripts/perf/: worldgen, popul, mesher, tick benches (bench.mjs runner), load-bench.mjs (browser)
- tests: worldgen-golden, worldgen-worker (fake worker env), mesher-golden, frame-budget
- FrameBudget (idle-time based) for chunk ingest + mesh upload; GuiDownloadTerrain.coversWorld
- dispatch settles empty sections; GenWorld direct-mapped chunk cache + write counters
- worldgen worker: terrain worker pool, early serving during the spawn area, replace payloads
- WorldGenWorkers prewarm (main.ts one-liner)
- mesher: enclosed-cube skip, brightness memo (ChunkCache.mixedBrightness), SectionSnapshotFill
- GL uniform caching, terrain list reuse, mesher pool up to 4
- IdleTasks hook (Minecraft loop), PerfDevTools (mc.dev.perf), perf.json A/B scenario
- docs: ARCHITECTURE §5.2/§5.4/§13, TESTING, PERFORMANCE
- Browser runs used: 2 of 3 (baseline, after). Run 3 = scripts/scenarios/perf.json with baseline
  dist on :5222 (scratchpad basesrc/dist) and new dist on :4222.

## Next
- final run (perf.json), fill numbers, compare ab_base vs ab_new
