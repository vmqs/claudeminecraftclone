# Perf slice progress (w4/perf)

Baseline commit d0e00fc. Numbers in docs/PERFORMANCE.md.

## Done
- scripts/perf/: worldgen-bench.ts (Node), load-bench.mjs (browser), bench.mjs runner
- tests/worldgen-golden.test.ts: payload hashes recorded at the baseline (must stay equal)
- Baseline browser run (1 of 3 allowed) with shots in scratchpad shots-perf/baseline

## Next
- adaptive ingest/upload budgets, skip world render under GuiDownloadTerrain
- dispatch: empty sections without worker slots
- terrain worker pool, prewarmed worldgen worker
- terrain draw batching / uniform caching
- idle-task hook for incremental saving
